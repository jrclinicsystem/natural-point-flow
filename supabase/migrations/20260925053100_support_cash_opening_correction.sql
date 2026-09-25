alter table public.cash_session_corrections
  add column if not exists previous_opening_cash numeric(12,2),
  add column if not exists corrected_opening_cash numeric(12,2),
  add column if not exists previous_expected_cash numeric(12,2),
  add column if not exists corrected_expected_cash numeric(12,2);

create or replace function public.correct_cash_session(
  _session_id uuid,
  _corrected_opening_cash numeric,
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
  _computed_before numeric;
  _new_expected numeric;
  _new_difference numeric;
  _actor_name text;
begin
  if not public.has_role(array['partner','admin']::public.app_role[]) then
    raise exception 'Somente sócios ou administradores podem corrigir um fechamento';
  end if;

  if _corrected_opening_cash is null or _corrected_opening_cash < 0 then
    raise exception 'O valor inicial corrigido não pode ser negativo';
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

  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Usuário')
    into _actor_name
  from public.profiles p
  where p.id = auth.uid();

  _actor_name := coalesce(_actor_name, 'Usuário');
  _computed_before := public.cash_session_expected(_session_id);
  _new_expected := round(
    coalesce(_computed_before, _s.expected_cash, _s.opening_cash, 0)
    - coalesce(_s.opening_cash, 0)
    + round(_corrected_opening_cash, 2),
    2
  );
  _new_difference := round(_corrected_counted_cash - _new_expected, 2);

  insert into public.cash_session_corrections(
    session_id,
    previous_counted_cash,
    corrected_counted_cash,
    previous_difference,
    corrected_difference,
    previous_notes,
    corrected_notes,
    reason,
    changed_by,
    changed_by_name,
    previous_opening_cash,
    corrected_opening_cash,
    previous_expected_cash,
    corrected_expected_cash
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
    auth.uid(),
    _actor_name,
    _s.opening_cash,
    round(_corrected_opening_cash, 2),
    _s.expected_cash,
    _new_expected
  );

  update public.cash_sessions
  set opening_cash = round(_corrected_opening_cash, 2),
      expected_cash = _new_expected,
      counted_cash = round(_corrected_counted_cash, 2),
      difference = _new_difference,
      notes = nullif(trim(coalesce(_corrected_notes,'')), '')
  where id = _s.id
  returning * into _s;

  return _s;
end;
$$;

revoke all on function public.correct_cash_session(uuid,numeric,numeric,text,text) from public, anon;
grant execute on function public.correct_cash_session(uuid,numeric,numeric,text,text) to authenticated, service_role;
