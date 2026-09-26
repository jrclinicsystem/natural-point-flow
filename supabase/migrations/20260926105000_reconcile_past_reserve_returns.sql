-- Backdated cash-reserve returns keep actual registration timestamp, with a dated session reference.
-- Closed cash counts are never fabricated or replaced.
alter table public.cash_movements
  add column if not exists is_retrospective boolean not null default false;

do $check$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.cash_movements'::regclass and conname='cash_movements_retrospective_source_check') then
    alter table public.cash_movements
      add constraint cash_movements_retrospective_source_check
      check (not is_retrospective or (movement_type='supply' and supply_source='reserve'));
  end if;
end
$check$;

comment on column public.cash_movements.is_retrospective is
  'True when a manager registered a reserve return after the referenced cash session was closed. created_at is the true registration time.';

-- The existing calculation previously ignored every movement entered after closed_at.
-- Only explicitly audited retroactive reserve returns are additionally counted.
CREATE OR REPLACE FUNCTION public.cash_session_expected(_session_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _s public.cash_sessions%rowtype;
  _until timestamptz;
  _expected numeric;
begin
  if not public.has_role(array['partner','admin','cashier']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  select * into _s
  from public.cash_sessions
  where id = _session_id;

  if _s.id is null then
    raise exception 'Caixa não encontrado';
  end if;

  _until := coalesce(_s.closed_at, now());

  select
    _s.opening_cash
    + coalesce((
        select sum(sp.amount)
        from public.sale_payments sp
        join public.payment_methods pm on pm.id = sp.payment_method_id
        where pm.kind = 'cash'
          and sp.created_at >= _s.opened_at
          and sp.created_at <= _until
      ), 0)
    + coalesce((
        select sum(ar.amount)
        from public.accounts_receivable ar
        join public.payment_methods pm on pm.id = ar.payment_method_id
        where ar.status = 'paid'
          and ar.sale_id is null
          and pm.kind = 'cash'
          and ar.paid_at >= _s.opened_at
          and ar.paid_at <= _until
      ), 0)
    - coalesce((
        select sum(ex.amount)
        from public.expenses ex
        join public.payment_methods pm on pm.id = ex.payment_method_id
        where ex.status = 'paid'
          and pm.kind = 'cash'
          and coalesce(ex.paid_at, ex.created_at) >= _s.opened_at
          and coalesce(ex.paid_at, ex.created_at) <= _until
      ), 0)
    + coalesce((
        select sum(cm.amount)
        from public.cash_movements cm
        where cm.session_id = _s.id
          and cm.movement_type = 'supply'
          and (cm.created_at <= _until or cm.is_retrospective)
      ), 0)
    - coalesce((
        select sum(cm.amount)
        from public.cash_movements cm
        where cm.session_id = _s.id
          and cm.movement_type = 'withdrawal'
          and (cm.created_at <= _until or cm.is_retrospective)
      ), 0)
  into _expected;

  return round(coalesce(_expected, _s.opening_cash), 2);
end;
$function$;

create or replace function public.register_cash_reserve_return_historical(
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
  _rounded numeric;
  _balance numeric;
  _new_expected numeric;
  _new_difference numeric;
  _actor_name text;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Somente sócios ou administradores podem regularizar caixas encerrados';
  end if;
  if _amount is null or _amount::text='NaN' or _amount <= 0 or round(_amount, 2) <= 0 then
    raise exception 'Informe um valor de pelo menos R$ 0,01';
  end if;
  _rounded := round(_amount, 2);
  if nullif(trim(coalesce(_reason,'')), '') is null then
    raise exception 'Informe o motivo da regularização';
  end if;

  select * into _session from public.cash_sessions
  where id=_session_id and status='closed'
  for update;
  if _session.id is null then
    raise exception 'Selecione o caixa encerrado ao qual o dinheiro retornou';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260926, 1);
  select public.cash_reserve_balance() into _balance;
  if _rounded > _balance then
    raise exception 'Valor superior à reserva registrada. Disponível: R$ %',
      replace(pg_catalog.to_char(greatest(_balance,0), 'FM999999990D00'), '.', ',');
  end if;

  -- Registro no caixa histórico, sem reabrir nem sobrescrever a contagem física.
  insert into public.cash_movements (
    session_id,movement_type,amount,reason,created_by,supply_source,is_retrospective
  )
  values (
    _session_id,'supply',_rounded,trim(_reason),auth.uid(),'reserve',true
  ) returning * into _movement;

  _new_expected := round(coalesce(_session.expected_cash, public.cash_session_expected(_session_id) - _rounded) + _rounded, 2);
  _new_difference := round(_session.counted_cash - _new_expected, 2);

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Usuário')
  into _actor_name from public.profiles where id=auth.uid();

  insert into public.cash_session_corrections(
    session_id,previous_counted_cash,corrected_counted_cash,
    previous_difference,corrected_difference,
    previous_notes,corrected_notes,reason,
    changed_by,changed_by_name,
    previous_opening_cash,corrected_opening_cash,
    previous_expected_cash,corrected_expected_cash
  )
  values (
    _session.id,_session.counted_cash,_session.counted_cash,
    _session.difference,_new_difference,
    _session.notes,_session.notes,
    'Regularização de devolução da reserva de ' ||
      to_char(_rounded, 'FM999999990D00') || ': ' || trim(_reason),
    auth.uid(),coalesce(_actor_name,'Usuário'),
    _session.opening_cash,_session.opening_cash,
    _session.expected_cash,_new_expected
  );

  update public.cash_sessions
  set expected_cash=_new_expected, difference=_new_difference
  where id=_session.id;

  return _movement;
end;
$function$;

revoke all on function public.register_cash_reserve_return_historical(uuid,numeric,text) from public,anon;
grant execute on function public.register_cash_reserve_return_historical(uuid,numeric,text) to authenticated;