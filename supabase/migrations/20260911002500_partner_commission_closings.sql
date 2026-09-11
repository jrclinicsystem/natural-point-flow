create table if not exists public.partner_commission_closings (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  realized_revenue numeric(14,2) not null default 0,
  paid_expenses numeric(14,2) not null default 0,
  net_profit numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','partial','paid','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint partner_commission_closings_period_check check (period_end >= period_start)
);

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.partner_commission_closings(id) on delete cascade,
  partner_id uuid not null references public.partner_settings(id) on delete restrict,
  partner_name_snapshot text not null,
  share_percent numeric(7,4) not null,
  commission_amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  paid_by uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint partner_commissions_amount_check check (commission_amount >= 0 and paid_amount >= 0 and paid_amount <= commission_amount),
  constraint partner_commissions_share_check check (share_percent >= 0 and share_percent <= 100),
  constraint partner_commissions_closing_partner_unique unique (closing_id, partner_id)
);

create index if not exists partner_commission_closings_period_idx
  on public.partner_commission_closings(period_start, period_end, created_at desc);
create index if not exists partner_commissions_status_idx
  on public.partner_commissions(status, created_at desc);
create index if not exists partner_commissions_partner_idx
  on public.partner_commissions(partner_id, created_at desc);

alter table public.partner_commission_closings enable row level security;
alter table public.partner_commissions enable row level security;

drop policy if exists partner_commission_closings_read on public.partner_commission_closings;
drop policy if exists partner_commission_closings_write on public.partner_commission_closings;
create policy partner_commission_closings_read on public.partner_commission_closings
  for select to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]));
create policy partner_commission_closings_write on public.partner_commission_closings
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

drop policy if exists partner_commissions_read on public.partner_commissions;
drop policy if exists partner_commissions_write on public.partner_commissions;
create policy partner_commissions_read on public.partner_commissions
  for select to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]));
create policy partner_commissions_write on public.partner_commissions
  for all to authenticated
  using (public.has_role(array['partner','admin']::public.app_role[]))
  with check (public.has_role(array['partner','admin']::public.app_role[]));

revoke all on table public.partner_commission_closings from anon;
revoke all on table public.partner_commissions from anon;
grant select, insert, update, delete on table public.partner_commission_closings to authenticated, service_role;
grant select, insert, update, delete on table public.partner_commissions to authenticated, service_role;

create or replace function public.get_partner_commission_preview(_from date, _to date)
returns table(
  realized_revenue numeric,
  paid_expenses numeric,
  net_profit numeric,
  pending_payables_count bigint,
  pending_payables_total numeric,
  has_overlap boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;
  if _from is null or _to is null or _to < _from then
    raise exception 'Período inválido';
  end if;

  return query
  with realized_sales as (
    select coalesce(sum(sp.net_amount), 0::numeric) as value
    from public.sale_payments sp
    join public.payment_methods pm on pm.id = sp.payment_method_id
    where pm.kind <> 'credit_account'::public.payment_kind
      and (sp.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
  ), manual_receipts as (
    select coalesce(sum(ar.amount), 0::numeric) as value
    from public.accounts_receivable ar
    where ar.status = 'paid'::public.record_status
      and ar.sale_id is null
      and ar.paid_at is not null
      and (ar.paid_at at time zone 'America/Sao_Paulo')::date between _from and _to
  ), exp as (
    select coalesce(sum(e.amount), 0::numeric) as value
    from public.expenses e
    where e.status = 'paid'::public.record_status
      and e.expense_date between _from and _to
  ), payables as (
    select count(*)::bigint as qty, coalesce(sum(a.amount), 0::numeric) as value
    from public.accounts_payable a
    where a.status = 'pending'::public.record_status
      and a.due_date <= _to
  ), result as (
    select
      (select value from realized_sales) + (select value from manual_receipts) as revenue,
      (select value from exp) as expenses
  )
  select
    round(result.revenue, 2),
    round(result.expenses, 2),
    round(greatest(result.revenue - result.expenses, 0::numeric), 2),
    payables.qty,
    round(payables.value, 2),
    exists(
      select 1
      from public.partner_commission_closings c
      where c.status <> 'cancelled'
        and c.period_start <= _to
        and c.period_end >= _from
    )
  from result cross join payables;
end;
$$;

revoke all on function public.get_partner_commission_preview(date,date) from public, anon;
grant execute on function public.get_partner_commission_preview(date,date) to authenticated, service_role;

create or replace function public.generate_partner_commission_closing(_from date, _to date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _closing_id uuid;
  _revenue numeric;
  _expenses numeric;
  _profit numeric;
  _pending_count bigint;
  _pending_total numeric;
  _overlap boolean;
  _partner_count integer;
  _share_sum numeric;
  _all_half boolean;
  _partner record;
  _remaining numeric;
  _amount numeric;
  _index integer := 0;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  select p.realized_revenue, p.paid_expenses, p.net_profit, p.pending_payables_count, p.pending_payables_total, p.has_overlap
    into _revenue, _expenses, _profit, _pending_count, _pending_total, _overlap
  from public.get_partner_commission_preview(_from, _to) p;

  select count(*), coalesce(sum(share_percent),0), coalesce(bool_and(abs(share_percent - 50) < 0.001), false)
    into _partner_count, _share_sum, _all_half
  from public.partner_settings
  where is_active;

  if _partner_count <> 2 then
    raise exception 'Configure exatamente dois sócios ativos antes de gerar o fechamento';
  end if;
  if abs(_share_sum - 100) > 0.001 or not _all_half then
    raise exception 'A regra da Natural Point é 50%% para cada um dos dois sócios';
  end if;
  if _pending_count > 0 then
    raise exception 'Existem % conta(s) a pagar pendente(s), totalizando %. Quite as contas vencidas até % antes de distribuir o lucro.', _pending_count, to_char(_pending_total, 'FM999G999G990D00'), to_char(_to, 'DD/MM/YYYY');
  end if;
  if _profit <= 0 then
    raise exception 'Não há lucro líquido positivo para distribuir neste período';
  end if;

  lock table public.partner_commission_closings in share row exclusive mode;
  if exists(
    select 1 from public.partner_commission_closings c
    where c.status <> 'cancelled'
      and c.period_start <= _to
      and c.period_end >= _from
  ) then
    raise exception 'Já existe um fechamento de comissão que cruza este período';
  end if;

  insert into public.partner_commission_closings(
    period_start, period_end, realized_revenue, paid_expenses, net_profit, status, created_by
  ) values (
    _from, _to, round(_revenue,2), round(_expenses,2), round(_profit,2), 'open', auth.uid()
  ) returning id into _closing_id;

  _remaining := round(_profit, 2);
  for _partner in
    select id, partner_name, share_percent
    from public.partner_settings
    where is_active
    order by sort_order, partner_name, id
  loop
    _index := _index + 1;
    if _index = _partner_count then
      _amount := _remaining;
    else
      _amount := round(_profit * _partner.share_percent / 100, 2);
      _remaining := round(_remaining - _amount, 2);
    end if;

    insert into public.partner_commissions(
      closing_id, partner_id, partner_name_snapshot, share_percent, commission_amount, paid_amount, status
    ) values (
      _closing_id, _partner.id, _partner.partner_name, _partner.share_percent, _amount, 0, 'pending'
    );
  end loop;

  return _closing_id;
end;
$$;

revoke all on function public.generate_partner_commission_closing(date,date) from public, anon;
grant execute on function public.generate_partner_commission_closing(date,date) to authenticated, service_role;

create or replace function public.pay_partner_commission(_commission_id uuid, _payment_method_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _row public.partner_commissions%rowtype;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  if not exists(
    select 1 from public.payment_methods pm
    where pm.id = _payment_method_id and pm.is_active and pm.kind <> 'credit_account'::public.payment_kind
  ) then
    raise exception 'Forma de pagamento inválida';
  end if;

  select * into _row
  from public.partner_commissions
  where id = _commission_id
  for update;

  if _row.id is null then raise exception 'Comissão não encontrada'; end if;
  if _row.status = 'cancelled' then raise exception 'Esta comissão foi cancelada'; end if;
  if _row.status = 'paid' then raise exception 'Esta comissão já foi paga'; end if;

  update public.partner_commissions
  set paid_amount = commission_amount,
      status = 'paid',
      payment_method_id = _payment_method_id,
      paid_by = auth.uid(),
      paid_at = now()
  where id = _commission_id;

  update public.partner_commission_closings c
  set status = case
        when not exists(select 1 from public.partner_commissions pc where pc.closing_id=c.id and pc.status='pending') then 'paid'
        when exists(select 1 from public.partner_commissions pc where pc.closing_id=c.id and pc.status='paid') then 'partial'
        else 'open'
      end,
      paid_at = case
        when not exists(select 1 from public.partner_commissions pc where pc.closing_id=c.id and pc.status='pending') then now()
        else null
      end
  where c.id = _row.closing_id;
end;
$$;

revoke all on function public.pay_partner_commission(uuid,uuid) from public, anon;
grant execute on function public.pay_partner_commission(uuid,uuid) to authenticated, service_role;

create or replace function public.reverse_partner_commission_payment(_commission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _row public.partner_commissions%rowtype;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  select * into _row from public.partner_commissions where id=_commission_id for update;
  if _row.id is null then raise exception 'Comissão não encontrada'; end if;
  if _row.status <> 'paid' then raise exception 'Esta comissão não está marcada como paga'; end if;

  update public.partner_commissions
  set paid_amount=0, status='pending', payment_method_id=null, paid_by=null, paid_at=null
  where id=_commission_id;

  update public.partner_commission_closings c
  set status = case
        when exists(select 1 from public.partner_commissions pc where pc.closing_id=c.id and pc.status='paid') then 'partial'
        else 'open'
      end,
      paid_at = null
  where c.id=_row.closing_id;
end;
$$;

revoke all on function public.reverse_partner_commission_payment(uuid) from public, anon;
grant execute on function public.reverse_partner_commission_payment(uuid) to authenticated, service_role;

create or replace function public.cancel_partner_commission_closing(_closing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  perform 1 from public.partner_commission_closings where id=_closing_id for update;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  if exists(select 1 from public.partner_commissions where closing_id=_closing_id and paid_amount > 0) then
    raise exception 'Não é possível cancelar um fechamento com repasse já pago';
  end if;

  update public.partner_commission_closings set status='cancelled', paid_at=null where id=_closing_id;
  update public.partner_commissions set status='cancelled' where closing_id=_closing_id;
end;
$$;

revoke all on function public.cancel_partner_commission_closing(uuid) from public, anon;
grant execute on function public.cancel_partner_commission_closing(uuid) to authenticated, service_role;

create or replace function public.save_partner_split(_partners jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _count integer;
  _item jsonb;
  _share numeric;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Acesso insuficiente';
  end if;

  select count(*) into _count from jsonb_array_elements(coalesce(_partners,'[]'::jsonb));
  if _count <> 2 then raise exception 'A Natural Point deve ter exatamente dois sócios'; end if;

  for _item in select * from jsonb_array_elements(_partners) loop
    _share := coalesce((_item->>'share_percent')::numeric, 0);
    if abs(_share - 50) > 0.001 then
      raise exception 'A regra da Natural Point é 50%% para cada sócio';
    end if;
    update public.partner_settings
    set partner_name=coalesce(nullif(trim(_item->>'partner_name'),''),partner_name),
        share_percent=50,
        is_active=true
    where id=(_item->>'id')::uuid;
    if not found then raise exception 'Sócio inválido'; end if;
  end loop;
end;
$$;

revoke all on function public.save_partner_split(jsonb) from public, anon;
grant execute on function public.save_partner_split(jsonb) to authenticated, service_role;