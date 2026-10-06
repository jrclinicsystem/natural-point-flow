create or replace function public.require_open_cash_for_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.cash_sessions cs
    where cs.status = 'open'
  ) then
    raise exception 'Abra o caixa antes de registrar uma venda.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.require_open_cash_for_sale() from public, anon;

drop trigger if exists sales_require_open_cash on public.sales;
create trigger sales_require_open_cash
before insert on public.sales
for each row
execute function public.require_open_cash_for_sale();
