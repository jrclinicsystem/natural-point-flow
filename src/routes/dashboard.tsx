import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  Clock3,
  CreditCard,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, LowStockBadge, SectionCard } from "@/components/NaturalPointUI";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, dateTimeBR, monthStartISO, num, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Natural Point" }] }),
  component: DashboardPage,
});

type Tone = "purple" | "gold" | "green" | "red";

const toneStyles: Record<Tone, { icon: string; wash: string; accent: string }> = {
  purple: { icon: "bg-primary/10 text-primary", wash: "from-primary/[0.075]", accent: "bg-primary" },
  gold: { icon: "bg-gold/15 text-gold-foreground", wash: "from-gold/[0.11]", accent: "bg-gold" },
  green: { icon: "bg-success/10 text-success", wash: "from-success/[0.075]", accent: "bg-success" },
  red: { icon: "bg-destructive/10 text-destructive", wash: "from-destructive/[0.07]", accent: "bg-destructive" },
};

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "purple",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof ShoppingBag;
  tone?: Tone;
}) {
  const style = toneStyles[tone];
  return (
    <div className={cn("group relative overflow-hidden rounded-[1.45rem] border border-border/80 bg-card p-5 shadow-[0_14px_34px_-30px_rgba(55,20,60,.42)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(55,20,60,.48)]", "bg-gradient-to-br", style.wash, "via-card to-card")}> 
      <span className={cn("absolute inset-x-0 top-0 h-[3px]", style.accent)} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-[1.8rem] leading-none tracking-[-0.02em] text-foreground">{value}</p>
          {hint && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105", style.icon)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
      </div>
    </div>
  );
}

function CompactMetric({ label, value, hint, icon: Icon, alert = false }: { label: string; value: string; hint?: string; icon: typeof Boxes; alert?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-3.5">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", alert ? "bg-destructive/10 text-destructive" : "bg-primary/[0.07] text-primary")}>
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="font-display text-lg leading-none text-foreground">{value}</p>
          {hint && <span className="truncate text-[10px] text-muted-foreground">{hint}</span>}
        </div>
      </div>
    </div>
  );
}

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
  const pendingReceivables = (data?.receivables ?? []).filter((r: any) => r.status === "pending").length;

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
      {isLoading ? (
        <div className="np-card flex min-h-56 items-center justify-center text-sm text-muted-foreground">Carregando dados reais…</div>
      ) : (
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-[1.7rem] border border-primary/10 bg-primary px-5 py-5 text-primary-foreground shadow-[0_22px_55px_-40px_rgba(48,12,55,.8)] sm:px-6">
            <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-gold/20" />
            <div className="absolute -bottom-24 right-36 h-44 w-44 rounded-full bg-gold/[0.055] blur-2xl" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                  <Sparkles className="h-3.5 w-3.5" /> Resumo operacional
                </div>
                <h2 className="mt-2 font-display text-2xl sm:text-[1.8rem]">Natural Point em um olhar</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-primary-foreground/65">Os indicadores mais importantes do dia e do mês, organizados sem excesso de informação.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px]">Caixa <strong className="ml-1 font-semibold text-white">{openCash ? "aberto" : "fechado"}</strong></span>
                <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px]">{sales.length + expenses.length} lançamentos no mês</span>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Indicadores principais</p><h3 className="mt-1 font-display text-xl">Financeiro do período</h3></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Vendas de hoje" value={brl(metrics["sales_today"])} icon={ShoppingBag} tone="purple" />
              <MetricCard label="Vendas do mês" value={brl(metrics["sales_period"])} icon={CircleDollarSign} tone="gold" />
              <MetricCard label="Total recebido líquido" value={brl(metrics["received"])} hint="Taxas de pagamento já descontadas" icon={ArrowUpRight} tone="green" />
              {isManager ? (
                <MetricCard label="Resultado do mês" value={brl(metrics["result"])} hint="Receitas líquidas menos despesas" icon={(metrics["result"] ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight} tone={(metrics["result"] ?? 0) >= 0 ? "green" : "red"} />
              ) : (
                <MetricCard label="Valor em caixa" value={brl(metrics["cash"])} hint={openCash ? "Sessão atualmente aberta" : "Caixa fechado"} icon={Wallet} tone="purple" />
              )}
            </div>
          </section>

          <div className={cn("grid gap-5", isManager ? "xl:grid-cols-[1.2fr_.8fr]" : "xl:grid-cols-1")}>
            {isManager && (
              <section className="np-card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/65 px-5 py-4 sm:px-6">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Fluxo financeiro</p><h3 className="mt-1 font-display text-xl">Compromissos e disponibilidade</h3></div>
                  <span className="rounded-full bg-primary/[0.06] px-3 py-1.5 text-[10px] font-medium text-primary">Atualizado pelo sistema</span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                  <CompactMetric label="Valor em caixa" value={brl(metrics["cash"])} hint={openCash ? "aberto" : "fechado"} icon={Wallet} />
                  <CompactMetric label="Despesas pagas" value={brl(metrics["expenses"])} icon={ReceiptText} alert={(metrics["expenses"] ?? 0) > 0} />
                  <CompactMetric label="Contas a pagar" value={brl(metrics["payable"])} hint="pendentes" icon={CreditCard} alert={(metrics["payable"] ?? 0) > 0} />
                  <CompactMetric label="Contas a receber" value={brl(metrics["receivable"])} hint="previstas" icon={Banknote} />
                </div>
              </section>
            )}

            <section className="np-card overflow-hidden">
              <div className="border-b border-border/65 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Operação</p>
                <h3 className="mt-1 font-display text-xl">Situação da loja</h3>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1">
                <CompactMetric label="Estoque baixo" value={String(lowStock.length)} hint="itens no limite" icon={Boxes} alert={lowStock.length > 0} />
                <CompactMetric label="Fiados pendentes" value={String(pendingReceivables)} hint="a receber" icon={Clock3} alert={pendingReceivables > 0} />
                {!isManager && <CompactMetric label="Caixa" value={openCash ? "Aberto" : "Fechado"} icon={Wallet} />}
              </div>
            </section>
          </div>

          <SectionCard title={isManager ? "Vendas x despesas · últimos 14 dias" : "Vendas · últimos 14 dias"} description="Evolução diária para visualizar o movimento sem poluir o painel.">
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={days} barGap={5}><CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} /><XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} dy={8} /><YAxis fontSize={10} axisLine={false} tickLine={false} width={40} /><Tooltip cursor={{ fill: "rgba(75, 25, 75, .035)" }} formatter={(v) => brl(Number(v))} contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", boxShadow: "0 12px 30px -20px rgba(40,10,45,.35)" }} /><Bar dataKey="vendas" fill="var(--chart-1)" radius={[7, 7, 2, 2]} maxBarSize={26} />{isManager && <Bar dataKey="despesas" fill="var(--chart-4)" radius={[7, 7, 2, 2]} maxBarSize={26} />}</BarChart></ResponsiveContainer></div>
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Movimentações recentes" description="Últimas entradas e saídas registradas no sistema.">
              {recent.length === 0 ? <EmptyState title="Sem movimentações" description="Quando vendas e despesas forem lançadas, elas aparecerão aqui." /> : <div className="space-y-1">{recent.map((m) => <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 text-sm transition-colors hover:bg-primary/[0.025]"><div className="flex min-w-0 items-center gap-3"><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", m.type === "in" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{m.type === "in" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate font-medium">{m.label}</p><p className="text-[11px] text-muted-foreground">{dateTimeBR(m.date)}</p></div></div><span className={m.type === "in" ? "shrink-0 font-medium text-success" : "shrink-0 font-medium text-destructive"}>{m.type === "in" ? "+" : "-"}{brl(m.amount)}</span></div>)}</div>}
            </SectionCard>

            <SectionCard title="Estoque baixo" description="Produtos que já chegaram ao limite definido no cadastro.">
              {lowStock.length === 0 ? <EmptyState title="Estoque sob controle" description="Nenhum produto está abaixo do limite mínimo agora." /> : <div className="space-y-2">{lowStock.slice(0, 8).map((p: any) => <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/65 bg-background/45 p-3.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-[11px] text-muted-foreground">{p.category}</p></div><div className="shrink-0 text-right"><LowStockBadge /><p className="mt-1 text-[11px] text-muted-foreground">{num(p.stock_qty, p.unit === "kg" ? 3 : 0)} {p.unit}</p></div></div>)}</div>}
            </SectionCard>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
