import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { Field, SectionCard, TableShell } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateBR, monthStartISO, todayISO } from "@/lib/format";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios | Natural Point" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const { data, isLoading } = useQuery({
    queryKey: ["np-reports", from, to],
    queryFn: async () => {
      const [summary, sales, expenses, payments] = await Promise.all([
        supabase.rpc("dashboard_summary", { _from: from, _to: to }),
        supabase.from("sales").select("id,sold_at,total,status,customer_name").gte("sold_at", `${from}T00:00:00`).lte("sold_at", `${to}T23:59:59`).order("sold_at"),
        supabase.from("expenses").select("id,expense_date,description,amount,status,expense_categories(name)").gte("expense_date", from).lte("expense_date", to).order("expense_date"),
        supabase.from("sale_payments").select("amount,fee_amount,net_amount,created_at,payment_methods(name,kind)").gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`),
      ]);
      if (summary.error) throw summary.error;
      if (sales.error) throw sales.error;
      if (expenses.error) throw expenses.error;
      if (payments.error) throw payments.error;
      return { summary: summary.data ?? [], sales: sales.data ?? [], expenses: expenses.data ?? [], payments: payments.data ?? [] };
    },
  });

  const metrics = useMemo(() => Object.fromEntries((data?.summary ?? []).map((r: any) => [r.metric, Number(r.value)])), [data]);
  const chart = useMemo(() => {
    const map = new Map<string, { date: string; vendas: number; despesas: number }>();
    for (const s of data?.sales ?? []) {
      if (s.status !== "paid") continue;
      const d = String(s.sold_at).slice(0, 10);
      const item = map.get(d) ?? { date: d, vendas: 0, despesas: 0 };
      item.vendas += Number(s.total);
      map.set(d, item);
    }
    for (const e of data?.expenses ?? []) {
      if (e.status !== "paid") continue;
      const d = String(e.expense_date).slice(0, 10);
      const item = map.get(d) ?? { date: d, vendas: 0, despesas: 0 };
      item.despesas += Number(e.amount);
      map.set(d, item);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ ...x, label: x.date.slice(8, 10) + "/" + x.date.slice(5, 7) }));
  }, [data]);

  const byMethod = useMemo(() => {
    const map = new Map<string, { name: string; gross: number; fees: number; net: number }>();
    for (const raw of data?.payments ?? []) {
      const p: any = raw;
      const method = Array.isArray(p.payment_methods) ? p.payment_methods[0] : p.payment_methods;
      const name = method?.name ?? "Outro";
      const row = map.get(name) ?? { name, gross: 0, fees: 0, net: 0 };
      row.gross += Number(p.amount);
      row.fees += Number(p.fee_amount);
      row.net += Number(p.net_amount);
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.gross - a.gross);
  }, [data]);

  const exportCsv = () => {
    const lines = [
      ["Tipo", "Data", "Descrição", "Valor"],
      ...(data?.sales ?? []).map((s: any) => ["Venda", dateBR(s.sold_at), s.customer_name || "Venda balcão", Number(s.total).toFixed(2)]),
      ...(data?.expenses ?? []).map((e: any) => ["Despesa", dateBR(e.expense_date), e.description, (-Number(e.amount)).toFixed(2)]),
    ];
    const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `natural-point-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout managerOnly title="Relatórios" subtitle="Vendas, recebimentos, despesas e resultado por período" actions={<Button size="sm" variant="outline" onClick={exportCsv} disabled={!data}><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button>}>
      <div className="space-y-6">
        <SectionCard title="Período">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2"><Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
        </SectionCard>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Vendas" value={brl(metrics["sales_period"])} />
          <StatCard label="Total recebido" value={brl(metrics["received"])} tone="positive" />
          <StatCard label="Despesas pagas" value={brl(metrics["expenses"])} tone="negative" />
          <StatCard label="Resultado" value={brl(metrics["result"])} tone={(metrics["result"] ?? 0) >= 0 ? "positive" : "negative"} />
          <StatCard label="Taxas de pagamento" value={brl(byMethod.reduce((a, r) => a + r.fees, 0))} tone="gold" />
        </div>

        <SectionCard title="Entradas x despesas">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando relatório…</p> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => brl(Number(v))} /><Bar dataKey="vendas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /><Bar dataKey="despesas" fill="var(--chart-4)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}
        </SectionCard>

        <SectionCard title="Recebimentos por forma de pagamento" description="O valor líquido já considera a taxa configurada em cada forma de pagamento.">
          <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Forma</th><th className="px-4 py-3">Bruto</th><th className="px-4 py-3">Taxas</th><th className="px-4 py-3">Líquido</th></tr></thead><tbody className="divide-y divide-border">{byMethod.map((r) => <tr key={r.name}><td className="px-4 py-3 font-medium">{r.name}</td><td className="px-4 py-3">{brl(r.gross)}</td><td className="px-4 py-3 text-destructive">{brl(r.fees)}</td><td className="px-4 py-3 text-success">{brl(r.net)}</td></tr>)}{byMethod.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sem recebimentos no período.</td></tr>}</tbody></table></TableShell>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
