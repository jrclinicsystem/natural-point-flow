-- Cancelamento seguro de fiados pendentes, sem apagar o histórico da venda.
create or replace function public.cancel_pending_receivable(_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _ar public.accounts_receivable%rowtype;
  _sale public.sales%rowtype;
  _credit_count integer;
  _other_count integer;
  _credit_total numeric;
  _item record;
begin
  if auth.uid() is null or not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Somente sócios e administradores podem cancelar fiados';
  end if;

  select * into _ar from public.accounts_receivable
    where id = _id for update;
  if _ar.id is null or _ar.status <> 'pending' then
    raise exception 'Conta não encontrada ou já recebida/cancelada';
  end if;

  if _ar.sale_id is null then
    delete from public.accounts_receivable where id = _ar.id and status = 'pending';
    return;
  end if;

  select * into _sale from public.sales where id = _ar.sale_id for update;
  if _sale.id is null or _sale.status <> 'paid' then
    raise exception 'A venda original não está ativa; não foi possível cancelar';
  end if;

  select
    count(*) filter (where pm.kind = 'credit_account'),
    count(*) filter (where pm.kind <> 'credit_account'),
    coalesce(sum(sp.amount) filter (where pm.kind = 'credit_account'),0)
  into _credit_count, _other_count, _credit_total
  from public.sale_payments sp
  join public.payment_methods pm on pm.id = sp.payment_method_id
  where sp.sale_id = _ar.sale_id;

  if _credit_count <> 1 or _other_count <> 0
     or abs(_credit_total - _sale.total) > 0.01
     or abs(_ar.amount - _sale.total) > 0.01
     or exists (select 1 from public.accounts_receivable r
       where r.sale_id = _ar.sale_id and r.id <> _ar.id and r.status <> 'cancelled') then
    raise exception 'Esta venda tem pagamento misto ou valores divergentes. Faça a correção financeira assistida para preservar o caixa.';
  end if;

  update public.sales set status = 'cancelled' where id = _sale.id;
  update public.accounts_receivable set status = 'cancelled'
    where id = _ar.id;

  -- Reposição apenas de itens que efetivamente tiveram saída registrada.
  for _item in
    select im.product_id, sum(im.quantity) as quantity
      from public.inventory_movements im
     where im.reference_sale_id = _sale.id and im.movement_type = 'sale'
     group by im.product_id
  loop
    insert into public.inventory_movements
      (product_id, movement_type, quantity, reason, reference_sale_id, created_by)
    values
      (_item.product_id, 'in', _item.quantity,
       'Estorno por cancelamento de venda fiada', _sale.id, auth.uid());
  end loop;
end;
$function$;

revoke all on function public.cancel_pending_receivable(uuid) from public, anon;
grant execute on function public.cancel_pending_receivable(uuid) to authenticated;
