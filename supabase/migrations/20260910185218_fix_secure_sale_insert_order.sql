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
  _weight_product_count integer := 0;
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

  if coalesce(_weight_kg, 0) > 0 then
    if _is_manager then
      _effective_price_per_kg := round(coalesce(_price_per_kg, 0), 2);
    else
      select count(*)::integer, min(p.price)
        into _weight_product_count, _effective_price_per_kg
      from public.products p
      where p.is_active and p.sale_mode = 'weight';

      if _weight_product_count <> 1 then
        raise exception 'O preço por kg precisa ter exatamente um produto por peso ativo configurado';
      end if;
      _effective_price_per_kg := round(coalesce(_effective_price_per_kg, 0), 2);
    end if;

    if _effective_price_per_kg <= 0 then
      raise exception 'Preço por kg inválido';
    end if;
    _weighted := round(_weight_kg * _effective_price_per_kg, 2);
  end if;

  if _items is null then
    _items := '[]'::jsonb;
  elsif jsonb_typeof(_items) <> 'array' then
    raise exception 'Itens da venda inválidos';
  end if;

  for _it in select * from jsonb_array_elements(_items) loop
    if nullif(_it->>'product_id', '') is null then
      raise exception 'Produto inválido';
    end if;

    _pid := (_it->>'product_id')::uuid;
    _qty := coalesce((_it->>'quantity')::numeric, 0);
    if _qty <= 0 then
      raise exception 'Quantidade de produto inválida';
    end if;

    select * into _product
    from public.products p
    where p.id = _pid and p.is_active
    for update;

    if _product.id is null then
      raise exception 'Produto não encontrado ou inativo';
    end if;
    if _product.sale_mode = 'weight' then
      raise exception 'Produtos por peso devem ser lançados no campo de peso';
    end if;
    if _qty <> trunc(_qty) then
      raise exception 'Produtos por unidade/adicional exigem quantidade inteira';
    end if;
    if _product.stock_qty < _qty then
      raise exception 'Estoque insuficiente para %', _product.name;
    end if;

    _unit := case
      when _product.sale_mode = 'addon' and _product.is_free_addon then 0
      else round(_product.price, 2)
    end;
    if _unit < 0 then
      raise exception 'Preço inválido para %', _product.name;
    end if;

    _items_total := _items_total + round(_qty * _unit, 2);
  end loop;

  _subtotal := round(_weighted + _items_total, 2);
  if _subtotal <= 0 then
    raise exception 'Adicione peso ou produto à venda';
  end if;
  if _discount_value < 0 then
    raise exception 'Desconto não pode ser negativo';
  end if;
  if not _is_manager and _discount_value <> 0 then
    raise exception 'Somente sócio ou administrador pode aplicar desconto';
  end if;
  if _discount_value > _subtotal then
    raise exception 'Desconto não pode ser maior que o subtotal';
  end if;

  _total := round(_subtotal - _discount_value, 2);
  if _total <= 0 then
    raise exception 'Total da venda precisa ser maior que zero';
  end if;

  if _payments is null or jsonb_typeof(_payments) <> 'array' then
    raise exception 'Pagamentos inválidos';
  end if;
  if jsonb_array_length(_payments) = 0 then
    raise exception 'Informe pelo menos uma forma de pagamento';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(_payments) x
    group by x->>'payment_method_id'
    having count(*) > 1
  ) then
    raise exception 'Forma de pagamento duplicada';
  end if;

  for _pm in select * from jsonb_array_elements(_payments) loop
    _amount := round(coalesce((_pm->>'amount')::numeric, 0), 2);
    if _amount <= 0 then
      raise exception 'Valor de pagamento inválido';
    end if;

    select * into _method
    from public.payment_methods pm
    where pm.id = (_pm->>'payment_method_id')::uuid
      and pm.is_active;

    if _method.id is null then
      raise exception 'Forma de pagamento inválida ou inativa';
    end if;

    if _method.kind = 'credit_account' then
      if nullif(trim(_customer_name), '') is null then
        raise exception 'Informe o cliente para venda fiada';
      end if;
      if _fiado_due_date is null then
        raise exception 'Informe o vencimento da venda fiada';
      end if;
      if _fiado_due_date < _business_date then
        raise exception 'Vencimento do fiado não pode estar no passado';
      end if;
    end if;

    _paid := _paid + _amount;
  end loop;

  _paid := round(_paid, 2);
  if abs(_paid - _total) > 0.01 then
    raise exception 'A soma dos pagamentos deve ser igual ao total da venda';
  end if;

  insert into public.sales(id,customer_name,weight_kg,price_per_kg,subtotal,discount,total,status,created_by,notes)
  values(
    _sale_id,
    nullif(trim(_customer_name),''),
    nullif(_weight_kg, 0),
    _effective_price_per_kg,
    _subtotal,
    _discount_value,
    _total,
    'paid',
    auth.uid(),
    _notes
  );

  if _weighted > 0 then
    insert into public.sale_items(sale_id,description,quantity,unit_price,total,item_type)
    values(_sale_id,'Açaí + gelato por peso',_weight_kg,_effective_price_per_kg,_weighted,'weight');
  end if;

  for _it in select * from jsonb_array_elements(_items) loop
    _pid := (_it->>'product_id')::uuid;
    _qty := (_it->>'quantity')::numeric;

    select * into _product
    from public.products p
    where p.id = _pid and p.is_active
    for update;

    _unit := case
      when _product.sale_mode = 'addon' and _product.is_free_addon then 0
      else round(_product.price, 2)
    end;
    _line_total := round(_qty * _unit, 2);

    insert into public.sale_items(sale_id,product_id,description,quantity,unit_price,total,item_type)
    values(
      _sale_id,
      _product.id,
      _product.name,
      _qty,
      _unit,
      _line_total,
      case when _product.sale_mode = 'addon' then 'addon' else 'product' end
    );

    insert into public.inventory_movements(product_id,movement_type,quantity,reason,reference_sale_id,created_by)
    values(_product.id,'sale',_qty,'Venda',_sale_id,auth.uid());
  end loop;

  for _pm in select * from jsonb_array_elements(_payments) loop
    _amount := round((_pm->>'amount')::numeric, 2);
    select * into _method
    from public.payment_methods pm
    where pm.id = (_pm->>'payment_method_id')::uuid
      and pm.is_active;

    _fee := round(_amount * coalesce(_method.fee_percent,0) / 100, 2);
    insert into public.sale_payments(sale_id,payment_method_id,amount,fee_amount,net_amount)
    values(_sale_id,_method.id,_amount,_fee,round(_amount - _fee,2));

    if _method.kind = 'credit_account' then
      insert into public.accounts_receivable(customer_name,description,amount,issue_date,due_date,status,sale_id,created_by)
      values(
        trim(_customer_name),
        'Venda fiada',
        _amount,
        _business_date,
        _fiado_due_date,
        'pending',
        _sale_id,
        auth.uid()
      );
    end if;
  end loop;

  return _sale_id;
end;
$$;

revoke all on function public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date) from public, anon;
grant execute on function public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date) to authenticated, service_role;
