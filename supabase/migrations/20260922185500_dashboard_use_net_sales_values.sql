create or replace function public.dashboard_summary(
  _from date default (date_trunc('month', now() at time zone 'America/Sao_Paulo'))::date,
  _to date default (now() at time zone 'America/Sao_Paulo')::date
)
returns table(metric text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
with params as (
  select (now() at time zone 'America/Sao_Paulo')::date as today
), net_sales as (
  select
    coalesce(sum(sp.net_amount) filter(where s.status='paid'), 0) sales_total,
    coalesce(sum(sp.net_amount) filter(
      where s.status='paid'
        and (s.sold_at at time zone 'America/Sao_Paulo')::date=(select today from params)
    ), 0) sales_today
  from public.sales s
  join public.sale_payments sp on sp.sale_id=s.id
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
  select 'sales_today'::text metric,sales_today value from net_sales
  union all select 'sales_period',sales_total from net_sales
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
