create unique index if not exists cash_sessions_one_open_idx
  on public.cash_sessions ((1))
  where status = 'open';

drop policy if exists sales_all on public.sales;
drop policy if exists sales_read on public.sales;
drop policy if exists sales_manager_write on public.sales;
create policy sales_read on public.sales
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));
create policy sales_manager_write on public.sales
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

drop policy if exists sale_items_all on public.sale_items;
drop policy if exists sale_items_read on public.sale_items;
drop policy if exists sale_items_manager_write on public.sale_items;
create policy sale_items_read on public.sale_items
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));
create policy sale_items_manager_write on public.sale_items
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

drop policy if exists sale_payments_all on public.sale_payments;
drop policy if exists sale_payments_read on public.sale_payments;
drop policy if exists sale_payments_manager_write on public.sale_payments;
create policy sale_payments_read on public.sale_payments
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));
create policy sale_payments_manager_write on public.sale_payments
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

drop policy if exists receivable_write on public.accounts_receivable;
drop policy if exists receivable_read on public.accounts_receivable;
drop policy if exists receivable_manager_write on public.accounts_receivable;
create policy receivable_read on public.accounts_receivable
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));
create policy receivable_manager_write on public.accounts_receivable
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

drop policy if exists cash_all on public.cash_sessions;
drop policy if exists cash_read on public.cash_sessions;
drop policy if exists cash_manager_write on public.cash_sessions;
create policy cash_read on public.cash_sessions
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));
create policy cash_manager_write on public.cash_sessions
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

drop function if exists public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text);

create or replace function public.open_cash(_opening_cash numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare _id uuid;
begin
  if not public.has_role(array['partner','admin','cashier']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;
  if coalesce(_opening_cash, 0) < 0 then
    raise exception 'Valor inicial não pode ser negativo';
  end if;
  if exists(select 1 from public.cash_sessions where status='open') then
    raise exception 'Já existe um caixa aberto';
  end if;

  insert into public.cash_sessions(business_date,opened_by,opening_cash)
  values((now() at time zone 'America/Sao_Paulo')::date,auth.uid(),round(coalesce(_opening_cash,0),2))
  returning id into _id;
  return _id;
exception
  when unique_violation then
    raise exception 'Já existe um caixa aberto';
end;
$$;

revoke all on function public.open_cash(numeric) from public, anon;
grant execute on function public.open_cash(numeric) to authenticated, service_role;

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

  select
    _s.opening_cash
    + coalesce((select sum(sp.amount) from public.sale_payments sp join public.payment_methods pm on pm.id=sp.payment_method_id where pm.kind='cash' and sp.created_at >= _s.opened_at),0)
    + coalesce((select sum(ar.amount) from public.accounts_receivable ar join public.payment_methods pm on pm.id=ar.payment_method_id where ar.status='paid' and ar.sale_id is null and pm.kind='cash' and ar.paid_at >= _s.opened_at),0)
    - coalesce((select sum(ex.amount) from public.expenses ex join public.payment_methods pm on pm.id=ex.payment_method_id where ex.status='paid' and pm.kind='cash' and coalesce(ex.paid_at,ex.created_at) >= _s.opened_at),0)
  into _expected;

  update public.cash_sessions
  set status='closed',
      closed_at=now(),
      closed_by=auth.uid(),
      expected_cash=round(coalesce(_expected,_s.opening_cash),2),
      counted_cash=round(_counted_cash,2),
      difference=round(_counted_cash-coalesce(_expected,_s.opening_cash),2),
      notes=_notes
  where id=_session_id
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
  select
    coalesce((select cs.opening_cash from public.cash_sessions cs where cs.status='open' order by cs.opened_at desc limit 1),0)
    + coalesce((select sum(sp.amount) from public.sale_payments sp join public.payment_methods pm on pm.id=sp.payment_method_id where pm.kind='cash' and (sp.created_at at time zone 'America/Sao_Paulo')::date=(select today from params)),0)
    + coalesce((select sum(ar.amount) from public.accounts_receivable ar join public.payment_methods pm on pm.id=ar.payment_method_id where ar.status='paid' and ar.sale_id is null and pm.kind='cash' and (ar.paid_at at time zone 'America/Sao_Paulo')::date=(select today from params)),0)
    - coalesce((select sum(e.amount) from public.expenses e join public.payment_methods pm on pm.id=e.payment_method_id where pm.kind='cash' and e.status='paid' and e.expense_date=(select today from params)),0) cash_value
), ap as (select coalesce(sum(a.amount),0) v from public.accounts_payable a where a.status='pending'),
   ar as (select coalesce(sum(a.amount),0) v from public.accounts_receivable a where a.status='pending'),
   low as (select count(*)::numeric v from public.products p where p.is_active and p.stock_qty<=p.low_stock_threshold),
   realized as (select (select value from realized_sales)+(select value from manual_receipts) value),
   all_metrics as (
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
