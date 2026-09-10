create unique index if not exists products_one_active_weight_idx
  on public.products ((1))
  where is_active and sale_mode = 'weight';

insert into public.products(name, category, sale_mode, unit, price, cost, stock_qty, low_stock_threshold, is_free_addon, is_active)
select 'Açaí + Gelato', 'Bases', 'weight', 'kg', 0, 0, 0, 0, false, true
where not exists (
  select 1 from public.products where is_active and sale_mode = 'weight'
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  purchase_date date not null default current_date,
  due_date date,
  total numeric not null check (total >= 0),
  status text not null check (status in ('paid','pending')),
  payment_method_id uuid references public.payment_methods(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((status = 'paid' and payment_method_id is not null) or (status = 'pending' and due_date is not null))
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  total numeric not null check (total >= 0),
  created_at timestamptz not null default now()
);

alter table public.inventory_movements
  add column if not exists reference_purchase_id uuid references public.purchases(id) on delete restrict;

alter table public.accounts_payable
  add column if not exists purchase_id uuid references public.purchases(id) on delete restrict;

alter table public.expenses
  add column if not exists purchase_id uuid references public.purchases(id) on delete restrict;

create unique index if not exists accounts_payable_purchase_uidx
  on public.accounts_payable(purchase_id)
  where purchase_id is not null;

create unique index if not exists expenses_purchase_uidx
  on public.expenses(purchase_id)
  where purchase_id is not null;

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists purchases_read on public.purchases;
create policy purchases_read on public.purchases
  for select to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]));

drop policy if exists purchase_items_read on public.purchase_items;
create policy purchase_items_read on public.purchase_items
  for select to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]));

grant select on public.purchases, public.purchase_items to authenticated;
grant all on public.purchases, public.purchase_items to service_role;

create or replace function public.register_purchase(
  _supplier text,
  _purchase_date date,
  _due_date date,
  _payment_method_id uuid,
  _items jsonb,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _purchase_id uuid := gen_random_uuid();
  _category_id uuid;
  _status text;
  _total numeric := 0;
  _it jsonb;
  _pid uuid;
  _qty numeric;
  _unit_cost numeric;
  _line_total numeric;
  _old_stock numeric;
  _old_cost numeric;
  _new_cost numeric;
  _product public.products%rowtype;
  _method public.payment_methods%rowtype;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;
  if nullif(trim(_supplier), '') is null then
    raise exception 'Informe o fornecedor';
  end if;
  if _purchase_date is null then
    _purchase_date := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'Informe pelo menos um item da compra';
  end if;

  if _payment_method_id is null then
    _status := 'pending';
    if _due_date is null then raise exception 'Informe o vencimento da compra a prazo'; end if;
    if _due_date < _purchase_date then raise exception 'Vencimento não pode ser anterior à data da compra'; end if;
  else
    _status := 'paid';
    select * into _method from public.payment_methods pm where pm.id = _payment_method_id and pm.is_active;
    if _method.id is null or _method.kind = 'credit_account' then raise exception 'Forma de pagamento inválida'; end if;
  end if;

  if exists (
    select 1 from jsonb_array_elements(_items) x
    group by x->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'O mesmo produto não pode aparecer duas vezes na compra';
  end if;

  for _it in select * from jsonb_array_elements(_items) loop
    if nullif(_it->>'product_id','') is null then raise exception 'Produto inválido'; end if;
    _pid := (_it->>'product_id')::uuid;
    _qty := coalesce((_it->>'quantity')::numeric, 0);
    _unit_cost := round(coalesce((_it->>'unit_cost')::numeric, -1), 4);
    if _qty <= 0 then raise exception 'Quantidade de compra inválida'; end if;
    if _unit_cost < 0 then raise exception 'Custo unitário inválido'; end if;

    select * into _product from public.products p where p.id = _pid and p.is_active for update;
    if _product.id is null then raise exception 'Produto não encontrado ou inativo'; end if;
    _line_total := round(_qty * _unit_cost, 2);
    _total := _total + _line_total;
  end loop;

  _total := round(_total, 2);
  if _total <= 0 then raise exception 'Total da compra precisa ser maior que zero'; end if;

  insert into public.purchases(id,supplier,purchase_date,due_date,total,status,payment_method_id,notes,created_by)
  values(_purchase_id,trim(_supplier),_purchase_date,case when _status='pending' then _due_date else null end,_total,_status,case when _status='paid' then _payment_method_id else null end,nullif(trim(_notes),''),auth.uid());

  for _it in select * from jsonb_array_elements(_items) loop
    _pid := (_it->>'product_id')::uuid;
    _qty := (_it->>'quantity')::numeric;
    _unit_cost := round((_it->>'unit_cost')::numeric, 4);
    select * into _product from public.products p where p.id = _pid and p.is_active for update;
    _old_stock := greatest(coalesce(_product.stock_qty,0),0);
    _old_cost := greatest(coalesce(_product.cost,0),0);
    _line_total := round(_qty * _unit_cost, 2);
    _new_cost := case when (_old_stock + _qty) > 0 then round(((_old_stock * _old_cost) + (_qty * _unit_cost)) / (_old_stock + _qty), 4) else _unit_cost end;

    update public.products set cost = _new_cost, updated_at = now() where id = _pid;
    insert into public.purchase_items(purchase_id,product_id,quantity,unit_cost,total) values(_purchase_id,_pid,_qty,_unit_cost,_line_total);
    insert into public.inventory_movements(product_id,movement_type,quantity,unit_cost,reason,reference_purchase_id,created_by)
    values(_pid,'in',_qty,_unit_cost,'Compra · ' || trim(_supplier),_purchase_id,auth.uid());
  end loop;

  select ec.id into _category_id from public.expense_categories ec where lower(ec.name) = lower('Estoque/Compras') and ec.is_active limit 1;

  if _status = 'paid' then
    insert into public.expenses(expense_date,description,category_id,supplier,amount,payment_method_id,status,due_date,paid_at,created_by,purchase_id)
    values(_purchase_date,'Compra de estoque',_category_id,trim(_supplier),_total,_payment_method_id,'paid',null,now(),auth.uid(),_purchase_id);
  else
    insert into public.accounts_payable(description,supplier,category_id,amount,due_date,status,is_fixed,notes,created_by,purchase_id)
    values('Compra de estoque',trim(_supplier),_category_id,_total,_due_date,'pending',false,nullif(trim(_notes),''),auth.uid(),_purchase_id);
  end if;

  return _purchase_id;
end;
$$;

revoke all on function public.register_purchase(text,date,date,uuid,jsonb,text) from public, anon;
grant execute on function public.register_purchase(text,date,date,uuid,jsonb,text) to authenticated, service_role;

create or replace function public.pay_account_payable(_id uuid, _payment_method_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.accounts_payable%rowtype;
  e uuid;
  pm public.payment_methods%rowtype;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then raise exception 'Acesso insuficiente'; end if;
  select * into a from public.accounts_payable where id = _id for update;
  if a.id is null or a.status='paid' then raise exception 'Conta inválida ou já paga'; end if;
  select * into pm from public.payment_methods where id = _payment_method_id and is_active;
  if pm.id is null or pm.kind='credit_account' then raise exception 'Forma de pagamento inválida'; end if;

  insert into public.expenses(expense_date,description,category_id,supplier,amount,payment_method_id,status,due_date,paid_at,created_by,purchase_id)
  values((now() at time zone 'America/Sao_Paulo')::date,a.description,a.category_id,a.supplier,a.amount,_payment_method_id,'paid',a.due_date,now(),auth.uid(),a.purchase_id)
  returning id into e;

  update public.accounts_payable set status='paid',payment_method_id=_payment_method_id,paid_at=now(),expense_id=e where id=_id;
  if a.purchase_id is not null then
    update public.purchases set status='paid',payment_method_id=_payment_method_id,due_date=a.due_date where id=a.purchase_id;
  end if;
end;
$$;

revoke all on function public.pay_account_payable(uuid,uuid) from public, anon;
grant execute on function public.pay_account_payable(uuid,uuid) to authenticated, service_role;

create or replace function public.prevent_linked_financial_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.purchase_id is not null then raise exception 'Lançamento vinculado a compra não pode ser excluído'; end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_purchase_payable on public.accounts_payable;
create trigger trg_protect_purchase_payable before delete on public.accounts_payable for each row execute function public.prevent_linked_financial_delete();

drop trigger if exists trg_protect_purchase_expense on public.expenses;
create trigger trg_protect_purchase_expense before delete on public.expenses for each row execute function public.prevent_linked_financial_delete();

create or replace function public.create_sale(
  _customer_name text,
  _weight_kg numeric,
  _price_per_kg numeric,
  _discount numeric,
  _items jsonb,
  _payments jsonb,
  _notes text default null,
  _fiado_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _role public.app_role;
  _is_manager boolean;
  _sale_id uuid := gen_random_uuid();
  _business_date date := (now() at time zone 'America/Sao_Paulo')::date;
  _effective_price_per_kg numeric := null;
  _weighted numeric := 0;
  _items_total numeric := 0;
  _subtotal numeric := 0;
  _discount_value numeric := round(coalesce(_discount, 0), 2);
  _total numeric := 0;
  _paid numeric := 0;
  _it jsonb;
  _pm jsonb;
  _pid uuid;
  _qty numeric;
  _unit numeric;
  _line_total numeric;
  _amount numeric;
  _fee numeric;
  _weight_product public.products%rowtype;
  _product public.products%rowtype;
  _method public.payment_methods%rowtype;
begin
  _role := public.my_role();
  if _role is null or _role not in ('partner','admin','cashier') then raise exception 'Acesso insuficiente'; end if;
  _is_manager := _role in ('partner','admin');
  if _weight_kg is not null and _weight_kg < 0 then raise exception 'Peso não pode ser negativo'; end if;

  if coalesce(_weight_kg,0) > 0 then
    select * into _weight_product from public.products p where p.is_active and p.sale_mode='weight' for update;
    if _weight_product.id is null then raise exception 'Cadastre o produto por peso Açaí + Gelato antes de vender'; end if;
    if _weight_product.unit <> 'kg' then raise exception 'O produto por peso precisa usar unidade kg'; end if;
    if _weight_product.stock_qty < _weight_kg then raise exception 'Estoque insuficiente de Açaí + Gelato'; end if;
    _effective_price_per_kg := case when _is_manager and coalesce(_price_per_kg,0) > 0 then round(_price_per_kg,2) else round(coalesce(_weight_product.price,0),2) end;
    if _effective_price_per_kg <= 0 then raise exception 'Configure o preço por kg de Açaí + Gelato'; end if;
    _weighted := round(_weight_kg * _effective_price_per_kg,2);
  end if;

  if _items is null then _items := '[]'::jsonb; elsif jsonb_typeof(_items) <> 'array' then raise exception 'Itens da venda inválidos'; end if;

  for _it in select * from jsonb_array_elements(_items) loop
    if nullif(_it->>'product_id','') is null then raise exception 'Produto inválido'; end if;
    _pid := (_it->>'product_id')::uuid;
    _qty := coalesce((_it->>'quantity')::numeric,0);
    if _qty <= 0 or _qty <> trunc(_qty) then raise exception 'Quantidade de produto inválida'; end if;
    select * into _product from public.products p where p.id=_pid and p.is_active for update;
    if _product.id is null then raise exception 'Produto não encontrado ou inativo'; end if;
    if _product.sale_mode='weight' then raise exception 'Produtos por peso devem ser lançados no campo de peso'; end if;
    if _product.stock_qty < _qty then raise exception 'Estoque insuficiente para %', _product.name; end if;
    _unit := case when _product.sale_mode='addon' and _product.is_free_addon then 0 else round(_product.price,2) end;
    _items_total := _items_total + round(_qty * _unit,2);
  end loop;

  _subtotal := round(_weighted + _items_total,2);
  if _subtotal <= 0 then raise exception 'Adicione peso ou produto à venda'; end if;
  if _discount_value < 0 then raise exception 'Desconto não pode ser negativo'; end if;
  if not _is_manager and _discount_value <> 0 then raise exception 'Somente sócio ou administrador pode aplicar desconto'; end if;
  if _discount_value > _subtotal then raise exception 'Desconto não pode ser maior que o subtotal'; end if;
  _total := round(_subtotal - _discount_value,2);
  if _total <= 0 then raise exception 'Total da venda precisa ser maior que zero'; end if;

  if _payments is null or jsonb_typeof(_payments) <> 'array' or jsonb_array_length(_payments)=0 then raise exception 'Informe pelo menos uma forma de pagamento'; end if;
  if exists (select 1 from jsonb_array_elements(_payments) x group by x->>'payment_method_id' having count(*) > 1) then raise exception 'Forma de pagamento duplicada'; end if;

  for _pm in select * from jsonb_array_elements(_payments) loop
    _amount := round(coalesce((_pm->>'amount')::numeric,0),2);
    if _amount <= 0 then raise exception 'Valor de pagamento inválido'; end if;
    select * into _method from public.payment_methods pm where pm.id=(_pm->>'payment_method_id')::uuid and pm.is_active;
    if _method.id is null then raise exception 'Forma de pagamento inválida ou inativa'; end if;
    if _method.kind='credit_account' then
      if nullif(trim(_customer_name),'') is null then raise exception 'Informe o cliente para venda fiada'; end if;
      if _fiado_due_date is null then raise exception 'Informe o vencimento da venda fiada'; end if;
      if _fiado_due_date < _business_date then raise exception 'Vencimento do fiado não pode estar no passado'; end if;
    end if;
    _paid := _paid + _amount;
  end loop;

  _paid := round(_paid,2);
  if abs(_paid - _total) > 0.01 then raise exception 'A soma dos pagamentos deve ser igual ao total da venda'; end if;

  insert into public.sales(id,customer_name,weight_kg,price_per_kg,subtotal,discount,total,status,created_by,notes)
  values(_sale_id,nullif(trim(_customer_name),''),nullif(_weight_kg,0),_effective_price_per_kg,_subtotal,_discount_value,_total,'paid',auth.uid(),_notes);

  if _weighted > 0 then
    insert into public.sale_items(sale_id,product_id,description,quantity,unit_price,total,item_type)
    values(_sale_id,_weight_product.id,_weight_product.name,_weight_kg,_effective_price_per_kg,_weighted,'weight');
    insert into public.inventory_movements(product_id,movement_type,quantity,reason,reference_sale_id,created_by)
    values(_weight_product.id,'sale',_weight_kg,'Venda por peso',_sale_id,auth.uid());
  end if;

  for _it in select * from jsonb_array_elements(_items) loop
    _pid := (_it->>'product_id')::uuid;
    _qty := (_it->>'quantity')::numeric;
    select * into _product from public.products p where p.id=_pid and p.is_active for update;
    _unit := case when _product.sale_mode='addon' and _product.is_free_addon then 0 else round(_product.price,2) end;
    _line_total := round(_qty * _unit,2);
    insert into public.sale_items(sale_id,product_id,description,quantity,unit_price,total,item_type)
    values(_sale_id,_product.id,_product.name,_qty,_unit,_line_total,case when _product.sale_mode='addon' then 'addon' else 'product' end);
    insert into public.inventory_movements(product_id,movement_type,quantity,reason,reference_sale_id,created_by)
    values(_product.id,'sale',_qty,'Venda',_sale_id,auth.uid());
  end loop;

  for _pm in select * from jsonb_array_elements(_payments) loop
    _amount := round((_pm->>'amount')::numeric,2);
    select * into _method from public.payment_methods pm where pm.id=(_pm->>'payment_method_id')::uuid and pm.is_active;
    _fee := round(_amount * coalesce(_method.fee_percent,0) / 100,2);
    insert into public.sale_payments(sale_id,payment_method_id,amount,fee_amount,net_amount)
    values(_sale_id,_method.id,_amount,_fee,round(_amount-_fee,2));
    if _method.kind='credit_account' then
      insert into public.accounts_receivable(customer_name,description,amount,issue_date,due_date,status,sale_id,created_by)
      values(trim(_customer_name),'Venda fiada',_amount,_business_date,_fiado_due_date,'pending',_sale_id,auth.uid());
    end if;
  end loop;
  return _sale_id;
end;
$$;

revoke all on function public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date) from public, anon;
grant execute on function public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date) to authenticated, service_role;
