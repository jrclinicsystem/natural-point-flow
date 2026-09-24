create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete restrict,
  movement_type text not null check (movement_type in ('withdrawal','supply')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_session_created_idx
  on public.cash_movements(session_id, created_at desc);

alter table public.cash_movements enable row level security;

drop policy if exists cash_movements_read on public.cash_movements;
create policy cash_movements_read on public.cash_movements
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));

revoke all on public.cash_movements from public, anon;
grant select on public.cash_movements to authenticated;
grant all on public.cash_movements to service_role;

create or replace function public.register_cash_movement(
  _session_id uuid,
  _movement_type text,
  _amount numeric,
  _reason text
)
returns public.cash_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  _session public.cash_sessions%rowtype;
  _movement public.cash_movements%rowtype;
begin
  if not public.has_role(array['partner','admin','cashier']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  if _movement_type not in ('withdrawal','supply') then
    raise exception 'Tipo de movimentação inválido';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;

  if nullif(trim(coalesce(_reason,'')), '') is null then
    raise exception 'Informe o motivo da movimentação';
  end if;

  select *
    into _session
  from public.cash_sessions
  where id = _session_id
    and status = 'open'
  for update;

  if _session.id is null then
    raise exception 'Caixa aberto não encontrado';
  end if;

  insert into public.cash_movements(session_id, movement_type, amount, reason, created_by)
  values (_session_id, _movement_type, round(_amount, 2), trim(_reason), auth.uid())
  returning * into _movement;

  return _movement;
end;
$$;

revoke all on function public.register_cash_movement(uuid,text,numeric,text) from public, anon;
grant execute on function public.register_cash_movement(uuid,text,numeric,text) to authenticated, service_role;

create or replace function public.cash_session_expected(_session_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    + coalesce((select sum(sp.amount)
        from public.sale_payments sp
        join public.payment_methods pm on pm.id = sp.payment_method_id
        where pm.kind = 'cash'
          and sp.created_at >= _s.opened_at
          and sp.created_at <= _until), 0)
    + coalesce((select sum(ar.amount)
        from public.accounts_receivable ar
        join public.payment_methods pm on pm.id = ar.payment_method_id
        where ar.status = 'paid'
          and ar.sale_id is null
          and pm.kind = 'cash'
          and ar.paid_at >= _s.opened_at
          and ar.paid_at <= _until), 0)
    - coalesce((select sum(ex.amount)
        from public.expenses ex
        join public.payment_methods pm on pm.id = ex.payment_method_id
        where ex.status = 'paid'
          and pm.kind = 'cash'
          and coalesce(ex.paid_at, ex.created_at) >= _s.opened_at
          and coalesce(ex.paid_at, ex.created_at) <= _until), 0)
    + coalesce((select sum(cm.amount)
        from public.cash_movements cm
        where cm.session_id = _s.id
          and cm.movement_type = 'supply'
          and cm.created_at <= _until), 0)
    - coalesce((select sum(cm.amount)
        from public.cash_movements cm
        where cm.session_id = _s.id
          and cm.movement_type = 'withdrawal'
          and cm.created_at <= _until), 0)
  into _expected;

  return round(coalesce(_expected, _s.opening_cash), 2);
end;
$$;

revoke all on function public.cash_session_expected(uuid) from public, anon;
grant execute on function public.cash_session_expected(uuid) to authenticated, service_role;

create or replace function public.close_cash(_session_id uuid, _counted_cash numeric, _notes text default null)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  _s public.cash_sessions%rowtype;
  _expected numeric;
begin
  if not public.has_role(array['partner','admin','cashier']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  if _counted_cash is null or _counted_cash < 0 then
    raise exception 'Valor contado não pode ser negativo';
  end if;

  select * into _s
  from public.cash_sessions
  where id = _session_id and status = 'open'
  for update;

  if _s.id is null then
    raise exception 'Caixa aberto não encontrado';
  end if;

  select public.cash_session_expected(_session_id) into _expected;

  update public.cash_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      expected_cash = round(coalesce(_expected, _s.opening_cash), 2),
      counted_cash = round(_counted_cash, 2),
      difference = round(_counted_cash - coalesce(_expected, _s.opening_cash), 2),
      notes = _notes
  where id = _session_id
  returning * into _s;

  return _s;
end;
$$;

revoke all on function public.close_cash(uuid,numeric,text) from public, anon;
grant execute on function public.close_cash(uuid,numeric,text) to authenticated, service_role;

create or replace function public.dashboard_summary(
  _from date default (date_trunc('month', (now() at time zone 'America/Sao_Paulo')))::date,
  _to date default (now() at time zone 'America/Sao_Paulo')::date
)
returns table(metric text,value numeric)
language sql
stable
security definer
set search_path = ''
as $$
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
  select coalesce((
    select
      cs.opening_cash
      + coalesce((select sum(sp.amount)
          from public.sale_payments sp
          join public.payment_methods pm on pm.id=sp.payment_method_id
          where pm.kind='cash' and sp.created_at >= cs.opened_at),0)
      + coalesce((select sum(ar.amount)
          from public.accounts_receivable ar
          join public.payment_methods pm on pm.id=ar.payment_method_id
          where ar.status='paid' and ar.sale_id is null
            and pm.kind='cash' and ar.paid_at >= cs.opened_at),0)
      - coalesce((select sum(e.amount)
          from public.expenses e
          join public.payment_methods pm on pm.id=e.payment_method_id
          where pm.kind='cash' and e.status='paid'
            and coalesce(e.paid_at,e.created_at) >= cs.opened_at),0)
      + coalesce((select sum(cm.amount)
          from public.cash_movements cm
          where cm.session_id=cs.id and cm.movement_type='supply'),0)
      - coalesce((select sum(cm.amount)
          from public.cash_movements cm
          where cm.session_id=cs.id and cm.movement_type='withdrawal'),0)
    from public.cash_sessions cs
    where cs.status='open'
    order by cs.opened_at desc
    limit 1
  ),0) cash_value
), ap as (
  select coalesce(sum(a.amount),0) v from public.accounts_payable a where a.status='pending'
), ar as (
  select coalesce(sum(a.amount),0) v from public.accounts_receivable a where a.status='pending'
), low as (
  select count(*)::numeric v from public.products p where p.is_active and p.stock_qty<=p.low_stock_threshold
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
$$;

revoke all on function public.dashboard_summary(date,date) from public, anon;
grant execute on function public.dashboard_summary(date,date) to authenticated, service_role;
