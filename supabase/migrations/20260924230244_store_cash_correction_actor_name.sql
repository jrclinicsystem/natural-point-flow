alter table public.cash_session_corrections
  add column if not exists changed_by_name text;

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
  _actor_name text;
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

  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Usuário')
    into _actor_name
  from public.profiles p
  where p.id = auth.uid();

  _actor_name := coalesce(_actor_name, 'Usuário');
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
    changed_by,
    changed_by_name
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
    _actor_name
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
