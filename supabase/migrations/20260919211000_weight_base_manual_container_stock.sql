-- Fix the protective trigger first so product updates are safe.
create or replace function public.protect_weight_base_product()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.is_active and old.sale_mode = 'weight' then
      raise exception 'A base Açaí + Gelato não pode ser excluída. Ajuste apenas seus dados operacionais.';
    end if;
    return old;
  end if;

  if old.is_active and old.sale_mode = 'weight' then
    if new.is_active is distinct from true then
      raise exception 'A base Açaí + Gelato não pode ser desativada.';
    end if;
    if new.sale_mode is distinct from 'weight' then
      raise exception 'A base Açaí + Gelato deve permanecer como produto por peso.';
    end if;
    if new.unit is distinct from 'kg' then
      raise exception 'A base Açaí + Gelato deve permanecer em kg.';
    end if;
  end if;

  if new.is_active and new.sale_mode = 'weight' and new.unit <> 'kg' then
    raise exception 'Produtos vendidos por peso devem usar unidade kg.';
  end if;

  return new;
end;
$function$;

alter table public.products
  add column if not exists package_count integer not null default 0 check (package_count >= 0),
  add column if not exists package_volume_l numeric(10,2) not null default 0 check (package_volume_l >= 0);

update public.products
set package_count = 32,
    package_volume_l = 4.5,
    stock_qty = 0,
    low_stock_threshold = 0,
    updated_at = now()
where is_active = true
  and sale_mode = 'weight';

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
as $function$
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
  if _role is null or _role not in ('partner','admin','cashier') then
    raise exception 'Acesso insuficiente';
  end if;
  _is_manager := _role in ('partner','admin');

  if _weight_kg is not null and _weight_kg < 0 then
    raise exception 'Peso não pode ser negativo';
  end if;

  if coalesce(_weight_kg,0) > 0 then
    select * into _weight_product
    from public.products p
    where p.is_active and p.sale_mode='weight'
    for update;

    if _weight_product.id is null then
      raise exception 'Cadastre a base Açaí + Gelato antes de vender';
    end if;
    if _weight_product.unit <> 'kg' then
      raise exception 'A base por peso precisa usar unidade kg';
    end if;

    _effective_price_per_kg := case
      when _is_manager and coalesce(_price_per_kg,0) > 0 then round(_price_per_kg,2)
      else round(coalesce(_weight_product.price,0),2)
    end;

    if _effective_price_per_kg <= 0 then
      raise exception 'Configure o preço por kg de Açaí + Gelato';
    end if;

    _weighted := round(_weight_kg * _effective_price_per_kg,2);
  end if;

  if _items is null then
    _items := '[]'::jsonb;
  elsif jsonb_typeof(_items) <> 'array' then
    raise exception 'Itens da venda inválidos';
  end if;

  for _it in select * from jsonb_array_elements(_items) loop
    if nullif(_it->>'product_id','') is null then
      raise exception 'Produto inválido';
    end if;
    _pid := (_it->>'product_id')::uuid;
    _qty := coalesce((_it->>'quantity')::numeric,0);
    if _qty <= 0 or _qty <> trunc(_qty) then
      raise exception 'Quantidade de produto inválida';
    end if;

    select * into _product
    from public.products p
    where p.id=_pid and p.is_active
    for update;

    if _product.id is null then
      raise exception 'Produto não encontrado ou inativo';
    end if;
    if _product.sale_mode='weight' then
      raise exception 'Produtos por peso devem ser lançados no campo de peso';
    end if;
    if _product.stock_qty < _qty then
      raise exception 'Estoque insuficiente para %', _product.name;
    end if;

    _unit := case
      when _product.sale_mode='addon' and _product.is_free_addon then 0
      else round(_product.price,2)
    end;
    _items_total := _items_total + round(_qty * _unit,2);
  end loop;

  _subtotal := round(_weighted + _items_total,2);
  if _subtotal <= 0 then raise exception 'Adicione peso ou produto à venda'; end if;
  if _discount_value < 0 then raise exception 'Desconto não pode ser negativo'; end if;
  if not _is_manager and _discount_value <> 0 then raise exception 'Somente sócio ou administrador pode aplicar desconto'; end if;
  if _discount_value > _subtotal then raise exception 'Desconto não pode ser maior que o subtotal'; end if;

  _total := round(_subtotal - _discount_value,2);
  if _total <= 0 then raise exception 'Total da venda precisa ser maior que zero'; end if;

  if _payments is null or jsonb_typeof(_payments) <> 'array' or jsonb_array_length(_payments)=0 then
    raise exception 'Informe pelo menos uma forma de pagamento';
  end if;
  if exists (
    select 1 from jsonb_array_elements(_payments) x
    group by x->>'payment_method_id'
    having count(*) > 1
  ) then
    raise exception 'Forma de pagamento duplicada';
  end if;

  for _pm in select * from jsonb_array_elements(_payments) loop
    _amount := round(coalesce((_pm->>'amount')::numeric,0),2);
    if _amount <= 0 then raise exception 'Valor de pagamento inválido'; end if;

    select * into _method
    from public.payment_methods pm
    where pm.id=(_pm->>'payment_method_id')::uuid and pm.is_active;

    if _method.id is null then raise exception 'Forma de pagamento inválida ou inativa'; end if;
    if _method.kind='credit_account' then
      if nullif(trim(_customer_name),'') is null then raise exception 'Informe o cliente para venda fiada'; end if;
      if _fiado_due_date is null then raise exception 'Informe o vencimento da venda fiada'; end if;
      if _fiado_due_date < _business_date then raise exception 'Vencimento do fiado não pode estar no passado'; end if;
    end if;
    _paid := _paid + _amount;
  end loop;

  _paid := round(_paid,2);
  if abs(_paid - _total) > 0.01 then
    raise exception 'A soma dos pagamentos deve ser igual ao total da venda';
  end if;

  insert into public.sales(id,customer_name,weight_kg,price_per_kg,subtotal,discount,total,status,created_by,notes)
  values(_sale_id,nullif(trim(_customer_name),''),nullif(_weight_kg,0),_effective_price_per_kg,_subtotal,_discount_value,_total,'paid',auth.uid(),_notes);

  if _weighted > 0 then
    insert into public.sale_items(sale_id,product_id,description,quantity,unit_price,total,item_type)
    values(_sale_id,_weight_product.id,_weight_product.name,_weight_kg,_effective_price_per_kg,_weighted,'weight');
  end if;

  for _it in select * from jsonb_array_elements(_items) loop
    _pid := (_it->>'product_id')::uuid;
    _qty := (_it->>'quantity')::numeric;

    select * into _product
    from public.products p
    where p.id=_pid and p.is_active
    for update;

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
$function$;

revoke all on function public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date) from public, anon;
grant execute on function public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date) to authenticated, service_role;

create or replace function public.dashboard_summary(
  _from date default (date_trunc('month', now() at time zone 'America/Sao_Paulo'))::date,
  _to date default (now() at time zone 'America/Sao_Paulo')::date
)
returns table(metric text, value numeric)
language sql
stable
security definer
set search_path = ''
as $function$
with params as (
  select (now() at time zone 'America/Sao_Paulo')::date as today
), gross as (
  select
    coalesce(sum(s.total) filter(where s.status='paid'),0) sales_total,
    coalesce(sum(s.total) filter(where s.status='paid' and (s.sold_at at time zone 'America/Sao_Paulo')::date=(select today from params)),0) sales_today
  from public.sales s
  where (s.sold_at at time zone 'America/Sao_Paulo')::date between _from and _to
), realized_sales as (
  select coalesce(sum(sp.net_amount),0) value
  from public.sale_payments sp
  join public.payment_methods pm on pm.id=sp.payment_method_id
  where pm.kind <> 'credit_account'
    and (sp.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
), manual_receipts as (
  select coalesce(sum(ar.amount),0) value
  from public.accounts_receivable ar
  where ar.status='paid' and ar.sale_id is null
    and (ar.paid_at at time zone 'America/Sao_Paulo')::date between _from and _to
), exp as (
  select coalesce(sum(e.amount) filter(where e.status='paid'),0) expense_total
  from public.expenses e
  where e.expense_date between _from and _to
), c as (
  select
    coalesce((select cs.opening_cash from public.cash_sessions cs where cs.status='open' order by cs.opened_at desc limit 1),0)
    + coalesce((select sum(sp.amount) from public.sale_payments sp join public.payment_methods pm on pm.id=sp.payment_method_id where pm.kind='cash' and (sp.created_at at time zone 'America/Sao_Paulo')::date=(select today from params)),0)
    + coalesce((select sum(ar.amount) from public.accounts_receivable ar join public.payment_methods pm on pm.id=ar.payment_method_id where ar.status='paid' and ar.sale_id is null and pm.kind='cash' and (ar.paid_at at time zone 'America/Sao_Paulo')::date=(select today from params)),0)
    - coalesce((select sum(e.amount) from public.expenses e join public.payment_methods pm on pm.id=e.payment_method_id where pm.kind='cash' and e.status='paid' and e.expense_date=(select today from params)),0) cash_value
), ap as (
  select coalesce(sum(a.amount),0) v from public.accounts_payable a where a.status='pending'
), ar as (
  select coalesce(sum(a.amount),0) v from public.accounts_receivable a where a.status='pending'
), low as (
  select count(*)::numeric v
  from public.products p
  where p.is_active
    and p.sale_mode <> 'weight'
    and p.stock_qty <= p.low_stock_threshold
), realized as (
  select (select value from realized_sales)+(select value from manual_receipts) value
), all_metrics as (
  select 'sales_today'::text metric,sales_today value from gross
  union all select 'sales_period',sales_total from gross
  union all select 'received',value from realized
  union all select 'expenses',expense_total from exp
  union all select 'result',(select value from realized)-(select expense_total from exp)
  union all select 'cash',cash_value from c
  union all select 'payable',v from ap
  union all select 'receivable',v from ar
  union all select 'low_stock',v from low
)
select metric,value
from all_metrics
where public.my_role() in ('partner','admin')
   or metric in ('sales_today','sales_period','cash','receivable','low_stock');
$function$;

revoke all on function public.dashboard_summary(date,date) from public, anon;
grant execute on function public.dashboard_summary(date,date) to authenticated, service_role;
