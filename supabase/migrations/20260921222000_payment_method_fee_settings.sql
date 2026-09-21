create or replace function public.set_payment_method_fee(
  _payment_method_id uuid,
  _fee_percent numeric
)
returns public.payment_methods
language plpgsql
security definer
set search_path = ''
as $$
declare
  _method public.payment_methods%rowtype;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  if _fee_percent is null or _fee_percent < 0 or _fee_percent > 100 then
    raise exception 'A taxa deve estar entre 0 e 100%%';
  end if;

  update public.payment_methods
  set fee_percent = round(_fee_percent, 4)
  where id = _payment_method_id
    and is_active
    and kind <> 'credit_account'
  returning * into _method;

  if _method.id is null then
    raise exception 'Forma de pagamento inválida ou inativa';
  end if;

  return _method;
end;
$$;

revoke all on function public.set_payment_method_fee(uuid,numeric) from public, anon;
grant execute on function public.set_payment_method_fee(uuid,numeric) to authenticated, service_role;
