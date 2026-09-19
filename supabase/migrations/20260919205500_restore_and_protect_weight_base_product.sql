-- Restore and protect the dedicated product used by weighted Açaí + Gelato sales.
-- The original seeded row was repurposed as a regular unit product, leaving the PDV
-- without any active weight base and causing weighted sales to fail.

insert into public.products(
  name,
  category,
  sale_mode,
  unit,
  price,
  cost,
  stock_qty,
  low_stock_threshold,
  is_free_addon,
  is_active
)
select
  'Açaí + Gelato',
  'Bases',
  'weight',
  'kg',
  0,
  0,
  0,
  0,
  false,
  true
where not exists (
  select 1
  from public.products
  where is_active = true
    and sale_mode = 'weight'
);

create or replace function public.protect_weight_base_product()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.is_active and old.sale_mode = 'weight' then
      raise exception 'A base Açaí + Gelato não pode ser excluída. Ajuste o estoque ou o preço.';
    end if;
    return old;
  end if;

  if old.is_active and old.sale_mode = 'weight' then
    if new.is_active is distinct from true then
      raise exception 'A base Açaí + Gelato não pode ser desativada.';
    end if;
    if new.sale_mode is distinct from 'weight'::public.sale_mode then
      raise exception 'A base Açaí + Gelato deve permanecer como produto por peso.';
    end if;
    if new.unit is distinct from 'kg' then
      raise exception 'A base Açaí + Gelato deve permanecer em kg.';
    end if;
  end if;

  if new.is_active and new.sale_mode = 'weight' and new.unit <> 'kg' then
    raise exception 'Produtos vendidos por peso devem usar unidade kg.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_protect_weight_base_product on public.products;
create trigger trg_protect_weight_base_product
before update or delete on public.products
for each row
execute function public.protect_weight_base_product();
