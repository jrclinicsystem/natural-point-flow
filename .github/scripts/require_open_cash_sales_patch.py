from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


path = Path("src/routes/vendas.tsx")
text = path.read_text(encoding="utf-8")

old_query = '''      const [products, methods] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("category").order("name"),
        supabase.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
      ]);
      if (products.error) throw products.error;
      if (methods.error) throw methods.error;
      return { products: (products.data ?? []) as Product[], methods: (methods.data ?? []) as PaymentMethod[] };'''
new_query = '''      const [products, methods, openCash] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("category").order("name"),
        supabase.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
        supabase
          .from("cash_sessions")
          .select("id, opened_at, business_date")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (products.error) throw products.error;
      if (methods.error) throw methods.error;
      if (openCash.error) throw openCash.error;
      return {
        products: (products.data ?? []) as Product[],
        methods: (methods.data ?? []) as PaymentMethod[],
        openCash: openCash.data ?? null,
      };'''
if "const [products, methods, openCash]" not in text:
    text = replace_once(text, old_query, new_query, "sales workspace open cash query")

old_methods = '''  const products = data?.products ?? [];
  const methods = data?.methods ?? [];'''
new_methods = '''  const products = data?.products ?? [];
  const methods = data?.methods ?? [];
  const cashIsOpen = Boolean(data?.openCash?.id);'''
if "const cashIsOpen = Boolean" not in text:
    text = replace_once(text, old_methods, new_methods, "cash open state")

old_can_finalize = '  const canFinalize = total > 0 && paymentsMatch && !cashShort;'
new_can_finalize = '  const canFinalize = cashIsOpen && total > 0 && paymentsMatch && !cashShort;'
if new_can_finalize not in text:
    text = replace_once(text, old_can_finalize, new_can_finalize, "finalize guard")

old_mutation = '''  const createSale = useMutation({
    mutationFn: async () => {
      if (total <= 0) throw new Error("Adicione o peso ou algum produto à venda.");'''
new_mutation = '''  const createSale = useMutation({
    mutationFn: async () => {
      if (!cashIsOpen) throw new Error("Abra o caixa antes de registrar uma venda.");
      if (total <= 0) throw new Error("Adicione o peso ou algum produto à venda.");'''
if 'if (!cashIsOpen) throw new Error("Abra o caixa antes de registrar uma venda.");' not in text:
    text = replace_once(text, old_mutation, new_mutation, "sale mutation cash guard")

old_actions = '''            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {'''
new_actions = '''            {!cashIsOpen ? (
              <div className="mt-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] p-3 text-xs font-medium text-destructive">
                Caixa fechado. Abra o caixa antes de registrar qualquer venda.
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {'''
if "Caixa fechado. Abra o caixa antes de registrar qualquer venda." not in text:
    text = replace_once(text, old_actions, new_actions, "closed cash warning")

path.write_text(text, encoding="utf-8")
print("Natural Point open-cash sales hotfix applied")
