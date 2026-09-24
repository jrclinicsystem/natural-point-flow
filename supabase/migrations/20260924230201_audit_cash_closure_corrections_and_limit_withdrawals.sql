create table if not exists public.cash_session_corrections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete restrict,
  previous_counted_cash numeric(12,2),
  corrected_counted_cash numeric(12,2) not null,
  previous_difference numeric(12,2),
  corrected_difference numeric(12,2) not null,
  previous_notes text,
  corrected_notes text,
  reason text not null check (length(trim(reason)) > 0),
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);

create index if not exists cash_session_corrections_session_changed_idx
  on public.cash_session_corrections(session_id, changed_at desc);

alter table public.cash_session_corrections enable row level security;

drop policy if exists cash_session_corrections_read on public.cash_session_corrections;
create policy cash_session_corrections_read on public.cash_session_corrections
  for select to authenticated
  using (public.has_role(array['partner','admin','cashier']::public.app_role[]));

revoke all on public.cash_session_corrections from public, anon;
grant select on public.cash_session_corrections to authenticated;
grant all on public.cash_session_corrections to service_role;

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
  _available numeric;
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

  if _movement_type = 'withdrawal' then
    select public.cash_session_expected(_session_id) into _available;
    if round(_amount, 2) > greatest(coalesce(_available, 0), 0) then
      raise exception 'Sangria maior que o dinheiro disponível no caixa. Disponível: R$ %',
        replace(to_char(greatest(coalesce(_available,0),0), 'FM999999990D00'), '.', ',');
    end if;
  end if;

  insert into public.cash_movements(session_id, movement_type, amount, reason, created_by)
  values (_session_id, _movement_type, round(_amount, 2), trim(_reason), auth.uid())
  returning * into _movement;

  return _movement;
end;
$$;

revoke all on function public.register_cash_movement(uuid,text,numeric,text) from public, anon;
grant execute on function public.register_cash_movement(uuid,text,numeric,text) to authenticated, service_role;

create or replace function public.correct_cash_closure(
  _session_id uuid,
  _corrected_counted_cash numeric,
  _reason text,
  _corrected_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  _s public.cash_sessions%rowtype;
  _expected numeric;
  _new_difference numeric;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Somente sócios ou administradores podem corrigir um fechamento';
  end if;

  if _corrected_counted_cash is null or _corrected_counted_cash < 0 then
    raise exception 'O valor contado corrigido não pode ser negativo';
  end if;

  if nullif(trim(coalesce(_reason,'')), '') is null then
    raise exception 'Informe o motivo da correção';
  end if;

  select *
    into _s
  from public.cash_sessions
  where id = _session_id
    and status = 'closed'
  for update;

  if _s.id is null then
    raise exception 'Fechamento não encontrado';
  end if;

  _expected := coalesce(_s.expected_cash, public.cash_session_expected(_session_id));
  _new_difference := round(_corrected_counted_cash - _expected, 2);

  insert into public.cash_session_corrections(
    session_id,
    previous_counted_cash,
    corrected_counted_cash,
    previous_difference,
    corrected_difference,
    previous_notes,
    corrected_notes,
    reason,
    changed_by
  )
  values (
    _s.id,
    _s.counted_cash,
    round(_corrected_counted_cash, 2),
    _s.difference,
    _new_difference,
    _s.notes,
    nullif(trim(coalesce(_corrected_notes,'')), ''),
    trim(_reason),
    auth.uid()
  );

  update public.cash_sessions
  set counted_cash = round(_corrected_counted_cash, 2),
      difference = _new_difference,
      notes = nullif(trim(coalesce(_corrected_notes,'')), '')
  where id = _s.id
  returning * into _s;

  return _s;
end;
$$;

revoke all on function public.correct_cash_closure(uuid,numeric,text,text) from public, anon;
grant execute on function public.correct_cash_closure(uuid,numeric,text,text) to authenticated, service_role;
