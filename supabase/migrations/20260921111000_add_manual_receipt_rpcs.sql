create or replace function public.register_manual_receipt(
  _customer_name text,
  _description text,
  _amount numeric,
  _payment_method_id uuid,
  _entry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _id uuid;
  _date date;
  _payment_kind text;
begin
  if auth.uid() is null or not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  if nullif(btrim(coalesce(_description, '')), '') is null then
    raise exception 'Informe a descrição da entrada';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;

  select pm.kind::text
    into _payment_kind
  from public.payment_methods pm
  where pm.id = _payment_method_id
    and pm.is_active;

  if _payment_kind is null or _payment_kind = 'credit_account' then
    raise exception 'Forma de recebimento inválida';
  end if;

  _date := coalesce(_entry_date, (now() at time zone 'America/Sao_Paulo')::date);

  insert into public.accounts_receivable (
    customer_name,
    description,
    amount,
    issue_date,
    due_date,
    status,
    payment_method_id,
    paid_at,
    sale_id,
    created_by
  )
  values (
    coalesce(nullif(btrim(coalesce(_customer_name, '')), ''), 'Entrada manual'),
    btrim(_description),
    round(_amount, 2),
    _date,
    _date,
    'paid',
    _payment_method_id,
    (_date::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo',
    null,
    auth.uid()
  )
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.register_manual_receipt(text,text,numeric,uuid,date) from public, anon;
grant execute on function public.register_manual_receipt(text,text,numeric,uuid,date) to authenticated;

create or replace function public.cancel_manual_receipt(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  update public.accounts_receivable
  set status = 'cancelled'
  where id = _id
    and sale_id is null
    and status = 'paid';

  if not found then
    raise exception 'Entrada manual não encontrada ou já cancelada';
  end if;
end;
$$;

revoke all on function public.cancel_manual_receipt(uuid) from public, anon;
grant execute on function public.cancel_manual_receipt(uuid) to authenticated;
