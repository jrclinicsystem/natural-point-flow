-- Permitir descontos no fluxo de vendas para usuários com perfil caixa.
-- Mantém as validações de subtotal, valor mínimo e autorização do RPC.
-- Preserva o bloqueio da alteração de preço por kg para não gestores.
DO $allow_cashier_discounts$
DECLARE
  source_definition text;
  forbidden_guard constant text :=
    'if not _is_manager and _discount_value <> 0 then raise exception ''Somente sócio ou administrador pode aplicar desconto''; end if;';
BEGIN
  SELECT pg_get_functiondef(
    'public.create_sale(text,numeric,numeric,numeric,jsonb,jsonb,text,date)'::regprocedure
  ) INTO source_definition;

  IF position(forbidden_guard in source_definition) > 0 THEN
    EXECUTE replace(source_definition, forbidden_guard, 'null;');
  ELSIF position('Somente sócio ou administrador pode aplicar desconto' in source_definition) > 0 THEN
    RAISE EXCEPTION 'A regra de desconto mudou; revise create_sale antes de migrar';
  ELSE
    RAISE NOTICE 'Permissão de desconto já atualizada';
  END IF;
END
$allow_cashier_discounts$;