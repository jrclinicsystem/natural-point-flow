from pathlib import Path


def patch(path, replacements):
    p = Path(path)
    text = p.read_text()
    original = text
    for old, new in replacements:
        if old not in text:
            print(f"WARN missing in {path}: {old[:80]!r}")
        text = text.replace(old, new)
    if text != original:
        p.write_text(text)
        print(f"patched {path}")

# noPropertyAccessFromIndexSignature
patch("src/routes/dashboard.tsx", [
    ("metrics.sales_today", 'metrics["sales_today"]'),
    ("metrics.sales_period", 'metrics["sales_period"]'),
    ("metrics.received", 'metrics["received"]'),
    ("metrics.expenses", 'metrics["expenses"]'),
    ("metrics.result", 'metrics["result"]'),
    ("metrics.cash", 'metrics["cash"]'),
    ("metrics.payable", 'metrics["payable"]'),
    ("metrics.receivable", 'metrics["receivable"]'),
])

patch("src/routes/relatorios.tsx", [
    ("metrics.sales_period", 'metrics["sales_period"]'),
    ("metrics.received", 'metrics["received"]'),
    ("metrics.expenses", 'metrics["expenses"]'),
    ("metrics.result", 'metrics["result"]'),
    (
        'for (const p of data?.payments ?? []) {\n      const name = p.payment_methods?.name ?? "Outro";',
        'for (const raw of data?.payments ?? []) {\n      const p: any = raw;\n      const method = Array.isArray(p.payment_methods) ? p.payment_methods[0] : p.payment_methods;\n      const name = method?.name ?? "Outro";'
    ),
])

patch("src/routes/caixa.tsx", [
    ("metrics.cash", 'metrics["cash"]'),
    (
        'for (const p of data?.cashPayments ?? []) rows.push({ id: `sp-${p.id}`, date: p.created_at, label: p.sales?.customer_name ? `Venda · ${p.sales.customer_name}` : "Venda em dinheiro", amount: Number(p.amount), type: "in" });',
        'for (const raw of data?.cashPayments ?? []) {\n      const p: any = raw;\n      const sale = Array.isArray(p.sales) ? p.sales[0] : p.sales;\n      rows.push({ id: `sp-${p.id}`, date: p.created_at, label: sale?.customer_name ? `Venda · ${sale.customer_name}` : "Venda em dinheiro", amount: Number(p.amount), type: "in" });\n    }'
    ),
])

# Explicit void returns for strict noImplicitReturns.
patch("src/routes/index.tsx", [
    ('if (!isSupabaseConfigured) return toast.error("O sistema ainda não está ligado à base de dados.");', 'if (!isSupabaseConfigured) { toast.error("O sistema ainda não está ligado à base de dados."); return; }'),
])

patch("src/routes/vendas.tsx", [
    ("weightProducts[0].price", "weightProducts[0]?.price"),
    ('if (p.stock_qty <= 0) return toast.error(`${p.name} está sem estoque.`);', 'if (p.stock_qty <= 0) { toast.error(`${p.name} está sem estoque.`); return; }'),
])

patch("src/routes/estoque.tsx", [
    ('if (!window.confirm(`Desativar ${p.name}?`)) return;\n    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", p.id);\n    if (error) return toast.error(error.message);', 'if (!window.confirm(`Desativar ${p.name}?`)) return;\n    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", p.id);\n    if (error) { toast.error(error.message); return; }'),
])

patch("src/routes/despesas.tsx", [
    ('if (!window.confirm(`Excluir a despesa “${row.description}”?`)) return;\n    const { error } = await supabase.from("expenses").delete().eq("id", row.id);\n    if (error) return toast.error(error.message);', 'if (!window.confirm(`Excluir a despesa “${row.description}”?`)) return;\n    const { error } = await supabase.from("expenses").delete().eq("id", row.id);\n    if (error) { toast.error(error.message); return; }'),
    ('if (!methodId) return;\n    const { error } = await supabase.from("expenses").update({ status: "paid", payment_method_id: methodId, paid_at: new Date().toISOString() }).eq("id", row.id);\n    if (error) return toast.error(error.message);', 'if (!methodId) return;\n    const { error } = await supabase.from("expenses").update({ status: "paid", payment_method_id: methodId, paid_at: new Date().toISOString() }).eq("id", row.id);\n    if (error) { toast.error(error.message); return; }'),
])

patch("src/routes/contas-a-pagar.tsx", [
    ('if (!method) return;\n    const { error } = await supabase.rpc("pay_account_payable", { _id: row.id, _payment_method_id: method });\n    if (error) return toast.error(error.message);', 'if (!method) return;\n    const { error } = await supabase.rpc("pay_account_payable", { _id: row.id, _payment_method_id: method });\n    if (error) { toast.error(error.message); return; }'),
    ('if (row.status === "paid") return toast.error("Uma conta já paga deve permanecer no histórico.");', 'if (row.status === "paid") { toast.error("Uma conta já paga deve permanecer no histórico."); return; }'),
    ('if (error) return toast.error(error.message);\n    toast.success("Conta excluída.");', 'if (error) { toast.error(error.message); return; }\n    toast.success("Conta excluída.");'),
])

patch("src/routes/contas-a-receber.tsx", [
    ('if (!method) return;\n    const { error } = await supabase.rpc("receive_account_receivable", { _id: row.id, _payment_method_id: method });\n    if (error) return toast.error(error.message);', 'if (!method) return;\n    const { error } = await supabase.rpc("receive_account_receivable", { _id: row.id, _payment_method_id: method });\n    if (error) { toast.error(error.message); return; }'),
    ('if (row.sale_id) return toast.error("Recebimentos gerados por uma venda fiada devem permanecer vinculados à venda.");', 'if (row.sale_id) { toast.error("Recebimentos gerados por uma venda fiada devem permanecer vinculados à venda."); return; }'),
    ('if (row.status === "paid") return toast.error("Um recebimento já pago deve permanecer no histórico.");', 'if (row.status === "paid") { toast.error("Um recebimento já pago deve permanecer no histórico."); return; }'),
    ('if (error) return toast.error(error.message);\n    toast.success("Conta excluída.");', 'if (error) { toast.error(error.message); return; }\n    toast.success("Conta excluída.");'),
])

patch("src/routes/usuarios.tsx", [
    ('if (error) return toast.error(error.message);\n    toast.success(next ? "Acesso reativado." : "Acesso bloqueado.");', 'if (error) { toast.error(error.message); return; }\n    toast.success(next ? "Acesso reativado." : "Acesso bloqueado.");'),
])
