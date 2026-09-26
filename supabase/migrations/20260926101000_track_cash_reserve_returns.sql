-- A sangria guarda dinheiro em reserva; a devolução é suprimento, não receita.
-- Devoluções antigas não são criadas automaticamente: somente lançamentos confirmados.
alter table public.cash_movements
  add column if not exists supply_source text not null default 'external';

do $check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cash_movements'::regclass
      and conname = 'cash_movements_supply_source_check'
  ) then
    alter table public.cash_movements
      add constraint cash_movements_supply_source_check
      check (
        (movement_type = 'withdrawal' and supply_source = 'external')
        or (movement_type = 'supply' and supply_source in ('external','reserve'))
      );
  end if;
end
$check$;

comment on column public.cash_movements.supply_source is
  'Supply source: external for ordinary supplies, reserve for transfers from cash withdrawn through sangria. Withdrawals always go to reserve.';

create or replace function public.cash_reserve_balance()
returns numeric
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  _balance numeric;
begin
  if not public.has_role(array['partner','admin','cashier']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;
  select coalesce(sum(
    case
      when movement_type = 'withdrawal' then amount
      when movement_type = 'supply' and supply_source = 'reserve' then -amount
      else 0
    end
  ), 0)
  into _balance
  from public.cash_movements;
  return round(_balance, 2);
end;
$function$;

create or replace function public.register_cash_reserve_return(
  _session_id uuid,
  _amount numeric,
  _reason text
)
returns public.cash_movements
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _session public.cash_sessions%rowtype;
  _movement public.cash_movements%rowtype;
  _balance numeric;
  _rounded numeric;
begin
  if not public.has_role(array['partner','admin','cashier']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  if _amount is null or _amount::text = 'NaN' or _amount <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;
  _rounded := round(_amount, 2);
  if _rounded <= 0 then
    raise exception 'Informe um valor de pelo menos R$ 0,01';
  end if;
  if nullif(trim(coalesce(_reason, '')), '') is null then
    raise exception 'Informe o motivo da devolução';
  end if;

  -- Impede lançar movimentação em caixa encerrado e serializa alterações do caixa.
  select * into _session
  from public.cash_sessions
  where id = _session_id and status = 'open'
  for update;

  if _session.id is null then
    raise exception 'Abra o caixa para registrar a devolução da reserva';
  end if;

  -- Bloqueio lógico comum a todas as devoluções, inclusive em sessões distintas.
  perform pg_catalog.pg_advisory_xact_lock(20260926, 1);
  select public.cash_reserve_balance() into _balance;
  if _rounded > _balance then
    raise exception 'Devolução maior que a reserva registrada. Disponível: R$ %',
      replace(pg_catalog.to_char(greatest(_balance, 0), 'FM999999990D00'), '.', ',');
  end if;

  insert into public.cash_movements(
    session_id, movement_type, amount, reason, created_by, supply_source
  )
  values (_session_id, 'supply', _rounded, trim(_reason), auth.uid(), 'reserve')
  returning * into _movement;

  return _movement;
end;
$function$;

revoke all on function public.cash_reserve_balance() from public, anon;
revoke all on function public.register_cash_reserve_return(uuid, numeric, text) from public, anon;
grant execute on function public.cash_reserve_balance() to authenticated;
grant execute on function public.register_cash_reserve_return(uuid, numeric, text) to authenticated;