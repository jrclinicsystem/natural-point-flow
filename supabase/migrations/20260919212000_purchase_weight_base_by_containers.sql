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
as $function$
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
    if _product.sale_mode = 'weight' and _qty <> trunc(_qty) then
      raise exception 'Para Açaí + Gelato, informe a quantidade de potes inteiros';
    end if;

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
    _line_total := round(_qty * _unit_cost, 2);

    if _product.sale_mode = 'weight' then
      _old_stock := greatest(coalesce(_product.package_count,0),0);
      _old_cost := greatest(coalesce(_product.cost,0),0);
      _new_cost := case
        when (_old_stock + _qty) > 0
          then round(((_old_stock * _old_cost) + (_qty * _unit_cost)) / (_old_stock + _qty), 4)
        else _unit_cost
      end;

      update public.products
      set cost = _new_cost,
          package_count = package_count + _qty::integer,
          updated_at = now()
      where id = _pid;

      insert into public.purchase_items(purchase_id,product_id,quantity,unit_cost,total)
      values(_purchase_id,_pid,_qty,_unit_cost,_line_total);
    else
      _old_stock := greatest(coalesce(_product.stock_qty,0),0);
      _old_cost := greatest(coalesce(_product.cost,0),0);
      _new_cost := case
        when (_old_stock + _qty) > 0
          then round(((_old_stock * _old_cost) + (_qty * _unit_cost)) / (_old_stock + _qty), 4)
        else _unit_cost
      end;

      update public.products set cost = _new_cost, updated_at = now() where id = _pid;
      insert into public.purchase_items(purchase_id,product_id,quantity,unit_cost,total)
      values(_purchase_id,_pid,_qty,_unit_cost,_line_total);
      insert into public.inventory_movements(product_id,movement_type,quantity,unit_cost,reason,reference_purchase_id,created_by)
      values(_pid,'in',_qty,_unit_cost,'Compra · ' || trim(_supplier),_purchase_id,auth.uid());
    end if;
  end loop;

  select ec.id into _category_id
  from public.expense_categories ec
  where lower(ec.name) = lower('Estoque/Compras') and ec.is_active
  limit 1;

  if _status = 'paid' then
    insert into public.expenses(expense_date,description,category_id,supplier,amount,payment_method_id,status,due_date,paid_at,created_by,purchase_id)
    values(_purchase_date,'Compra de estoque',_category_id,trim(_supplier),_total,_payment_method_id,'paid',null,now(),auth.uid(),_purchase_id);
  else
    insert into public.accounts_payable(description,supplier,category_id,amount,due_date,status,is_fixed,notes,created_by,purchase_id)
    values('Compra de estoque',trim(_supplier),_category_id,_total,_due_date,'pending',false,nullif(trim(_notes),''),auth.uid(),_purchase_id);
  end if;

  return _purchase_id;
end;
$function$;

revoke all on function public.register_purchase(text,date,date,uuid,jsonb,text) from public, anon;
grant execute on function public.register_purchase(text,date,date,uuid,jsonb,text) to authenticated, service_role;
