import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, LowStockBadge, SectionCard } from "@/components/NaturalPointUI";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, dateTimeBR, monthStartISO, num, todayISO } from "@/lib/format";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Natural Point" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { isManager, role } = useAuth();
  const today = todayISO();
  const monthStart = monthStartISO();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", today, role],
    queryFn: async () => {
      const requests: any[] = [
        supabase.rpc("dashboard_summary", { _from: monthStart, _to: today }),
        supabase.from("sales").select("id,sold_at,total,customer_name,status").gte("sold_at", `${monthStart}T00:00:00`).order("sold_at", { ascending: false }),
        supabase.from("products").select("id,name,category,unit,stock_qty,low_stock_threshold").eq("is_active", true).order("stock_qty", { ascending: true }),
        supabase.from("accounts_receivable").select("id,customer_name,amount,due_date,status,paid_at").order("created_at", { ascending: false }).limit(10),
        supabase.from("cash_sessions").select("id,status,opened_at,opening_cash,difference").order("opened_at", { ascending: false }).limit(3),
      ];
      if (isManager) requests.push(supabase.from("expenses").select("id,expense_date,description,amount,status").gte("expense_date", monthStart).lte("expense_date", today).order("expense_date", { ascending: false }));
      const results = await Promise.all(requests);
      for (const r of results) if (r.error) throw r.error;
      return {
        summary: results[0].data ?? [], sales: results[1].data ?? [], products: results[2].data ?? [], receivables: results[3].data ?? [], cash: results[4].data ?? [], expenses: isManager ? results[5].data ?? [] : [],
      };
    },
  });

  const metrics = Object.fromEntries((data?.summary ?? []).map((r: any) => [r.metric, Number(r.value)]));
  const sales = data?.sales ?? [];
  const expenses = data?.expenses ?? [];
  const lowStock = (data?.products ?? []).filter((p: any) => Number(p.stock_qty) <= Number(p.low_stock_threshold));
  const openCash = (data?.cash ?? []).find((c: any) => c.status === "open");

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const iso = d.toISOString().slice(0, 10);
    const salesValue = sales.filter((s: any) => String(s.sold_at).slice(0, 10) === iso && s.status === "paid").reduce((a: number, s: any) => a + Number(s.total), 0);
    const expenseValue = isManager ? expenses.filter((e: any) => e.expense_date === iso && e.status === "paid").reduce((a: number, e: any) => a + Number(e.amount), 0) : 0;
    return { label: iso.slice(8, 10) + "/" + iso.slice(5, 7), vendas: salesValue, despesas: expenseValue };
  });

  const recent = [
    ...sales.slice(0, 6).map((s: any) => ({ id: `s-${s.id}`, date: s.sold_at, label: s.customer_name ? `Venda · ${s.customer_name}` : "Venda balcão", amount: Number(s.total), type: "in" as const })),
    ...(isManager ? expenses.slice(0, 6).map((e: any) => ({ id: `e-${e.id}`, date: `${e.expense_date}T12:00:00`, label: e.description, amount: Number(e.amount), type: "out" as const })) : []),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);

  return (
    <AppLayout title="Dashboard" subtitle={isManager ? "Visão geral financeira e operacional" : "Visão operacional do caixa"}>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando dados reais…</p> : <div className="space-y-6">
        {isManager ? <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Vendas de hoje" value={brl(metrics["sales_today"])} />
            <StatCard label="Vendas do mês" value={brl(metrics["sales_period"])} tone="gold" />
            <StatCard label="Total recebido líquido" value={brl(metrics["received"])} tone="positive" hint="Já descontadas taxas de pagamento" />
            <StatCard label="Despesas pagas" value={brl(metrics["expenses"])} tone="negative" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Resultado do mês" value={brl(metrics["result"])} tone={(metrics["result"] ?? 0) >= 0 ? "positive" : "negative"} />
            <StatCard label="Valor em caixa" value={brl(metrics["cash"])} hint={openCash ? "Caixa aberto" : "Caixa fechado"} />
            <StatCard label="Contas a pagar" value={brl(metrics["payable"])} tone="gold" />
            <StatCard label="Contas a receber" value={brl(metrics["receivable"])} />
          </div>
        </> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Vendas de hoje" value={brl(metrics["sales_today"])} />
          <StatCard label="Vendas do mês" value={brl(metrics["sales_period"])} tone="gold" />
          <StatCard label="Valor em caixa" value={brl(metrics["cash"])} hint={openCash ? "Caixa aberto" : "Caixa fechado"} />
          <StatCard label="Contas a receber" value={brl(metrics["receivable"])} />
        </div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Estoque baixo" value={String(lowStock.length)} tone={lowStock.length ? "negative" : "positive"} hint="itens no limite" /><StatCard label="Fiados pendentes" value={String((data?.receivables ?? []).filter((r: any) => r.status === "pending").length)} /><StatCard label="Caixa" value={openCash ? "Aberto" : "Fechado"} tone={openCash ? "positive" : "default"} />{isManager && <StatCard label="Lançamentos do mês" value={String(sales.length + expenses.length)} />}</div>

        <SectionCard title={isManager ? "Vendas x despesas · últimos 14 dias" : "Vendas · últimos 14 dias"}>
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={days}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => brl(Number(v))} /><Bar dataKey="vendas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />{isManager && <Bar dataKey="despesas" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />}</BarChart></ResponsiveContainer></div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Movimentações recentes">
            {recent.length === 0 ? <EmptyState title="Sem movimentações" description="Quando vendas e despesas forem lançadas, elas aparecerão aqui." /> : <div className="divide-y divide-border">{recent.map((m) => <div key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{m.label}</p><p className="text-xs text-muted-foreground">{dateTimeBR(m.date)}</p></div><span className={m.type === "in" ? "font-medium text-success" : "font-medium text-destructive"}>{m.type === "in" ? "+" : "-"}{brl(m.amount)}</span></div>)}</div>}
          </SectionCard>

          <SectionCard title="Estoque baixo" description="Produtos que já chegaram ao limite definido no cadastro.">
            {lowStock.length === 0 ? <EmptyState title="Estoque sob controle" description="Nenhum produto está abaixo do limite mínimo agora." /> : <div className="space-y-3">{lowStock.slice(0, 8).map((p: any) => <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.category}</p></div><div className="text-right"><LowStockBadge /><p className="mt-1 text-xs text-muted-foreground">{num(p.stock_qty, p.unit === "kg" ? 3 : 0)} {p.unit}</p></div></div>)}</div>}
          </SectionCard>
        </div>
      </div>}
    </AppLayout>
  );
}
