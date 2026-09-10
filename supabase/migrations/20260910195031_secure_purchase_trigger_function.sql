create or replace function public.prevent_linked_financial_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.purchase_id is not null then
    raise exception 'Lançamento vinculado a compra não pode ser excluído';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_linked_financial_delete() from public, anon, authenticated;
grant execute on function public.prevent_linked_financial_delete() to postgres, service_role;
