import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, SectionCard, TableShell, TextArea } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateTimeBR, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/caixa")({
  head: () => ({ meta: [{ title: "Caixa | Natural Point" }] }),
  component: CaixaPage,
});

function CaixaPage() {
  const qc = useQueryClient();
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const today = todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["caixa", today],
    queryFn: async () => {
      const [sessions, summary, cashPayments, cashExpenses, manualReceipts] = await Promise.all([
        supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }).limit(20),
        supabase.rpc("dashboard_summary", { _from: today, _to: today }),
        supabase.from("sale_payments").select("id,amount,created_at,payment_methods!inner(name,kind),sales(customer_name)").eq("payment_methods.kind", "cash").gte("created_at", `${today}T00:00:00`).order("created_at", { ascending: false }),
        supabase.from("expenses").select("id,description,amount,created_at,paid_at,payment_methods!inner(name,kind)").eq("status", "paid").eq("payment_methods.kind", "cash").eq("expense_date", today).order("created_at", { ascending: false }),
        supabase.from("accounts_receivable").select("id,customer_name,amount,paid_at,payment_methods!inner(name,kind)").eq("status", "paid").is("sale_id", null).eq("payment_methods.kind", "cash").gte("paid_at", `${today}T00:00:00`).order("paid_at", { ascending: false }),
      ]);
      for (const result of [sessions, summary, cashPayments, cashExpenses, manualReceipts]) if (result.error) throw result.error;
      return {
        sessions: sessions.data ?? [], summary: summary.data ?? [], cashPayments: cashPayments.data ?? [], cashExpenses: cashExpenses.data ?? [], manualReceipts: manualReceipts.data ?? [],
      };
    },
  });

  const sessions = data?.sessions ?? [];
  const open = sessions.find((s: any) => s.status === "open") as any;
  const latestClosed = sessions.find((s: any) => s.status === "closed") as any;
  const metrics = useMemo(() => Object.fromEntries((data?.summary ?? []).map((r: any) => [r.metric, Number(r.value)])), [data]);
  const expected = Number(metrics.cash ?? open?.opening_cash ?? 0);
  const differencePreview = parseNumber(counted) - expected;

  const movements = useMemo(() => {
    const rows: Array<{ id: string; date: string; label: string; amount: number; type: "in" | "out" }> = [];
    for (const p of data?.cashPayments ?? []) rows.push({ id: `sp-${p.id}`, date: p.created_at, label: p.sales?.customer_name ? `Venda · ${p.sales.customer_name}` : "Venda em dinheiro", amount: Number(p.amount), type: "in" });
    for (const r of data?.manualReceipts ?? []) rows.push({ id: `ar-${r.id}`, date: r.paid_at, label: `Recebimento · ${r.customer_name}`, amount: Number(r.amount), type: "in" });
    for (const e of data?.cashExpenses ?? []) rows.push({ id: `ex-${e.id}`, date: e.paid_at || e.created_at, label: e.description, amount: Number(e.amount), type: "out" });
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data]);

  const openCash = useMutation({
    mutationFn: async () => {
      const value = parseNumber(opening);
      if (value < 0) throw new Error("O valor inicial não pode ser negativo.");
      const { error } = await supabase.rpc("open_cash", { _opening_cash: value });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Caixa aberto.");
      setOpening("");
      await Promise.all([qc.invalidateQueries({ queryKey: ["caixa"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const closeCash = useMutation({
    mutationFn: async () => {
      if (!open?.id) throw new Error("Não há caixa aberto.");
      const value = parseNumber(counted);
      if (value < 0) throw new Error("Informe o valor contado fisicamente.");
      const { error } = await supabase.rpc("close_cash", { _session_id: open.id, _counted_cash: value, _notes: notes.trim() || null });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Caixa fechado e conferido.");
      setCounted(""); setNotes("");
      await Promise.all([qc.invalidateQueries({ queryKey: ["caixa"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppLayout title="Caixa" subtitle="Abertura, valor esperado, conferência e diferença do dia">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Situação" value={open ? "Caixa aberto" : "Caixa fechado"} tone={open ? "positive" : "default"} />
          <StatCard label="Valor inicial" value={brl(open?.opening_cash ?? 0)} />
          <StatCard label="Esperado agora" value={brl(expected)} tone="gold" />
          <StatCard label="Última diferença" value={brl(latestClosed?.difference ?? 0)} tone={Number(latestClosed?.difference ?? 0) === 0 ? "positive" : "negative"} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Abertura de caixa" description={open ? `Aberto em ${dateTimeBR(open.opened_at)}` : "Informe quanto existe em dinheiro físico no início do expediente."}>
            <Field label="Dinheiro inicial"><Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Ex.: 200,00" disabled={!!open} /></Field>
            <Button className="mt-4 w-full" disabled={!!open || openCash.isPending} onClick={() => openCash.mutate()}>{open ? "Caixa já está aberto" : "Abrir caixa"}</Button>
          </SectionCard>

          <SectionCard title="Fechamento de caixa" description="Conte somente o dinheiro físico. O sistema compara com o valor esperado automaticamente.">
            <div className="space-y-3">
              <Field label="Valor contado"><Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" disabled={!open} /></Field>
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-4 text-sm"><div><p className="text-xs text-muted-foreground">Esperado</p><p className="font-medium">{brl(expected)}</p></div><div><p className="text-xs text-muted-foreground">Diferença</p><p className={Math.abs(differencePreview) < 0.01 ? "font-medium text-success" : "font-medium text-destructive"}>{brl(differencePreview)}</p></div></div>
              <Field label="Observação"><TextArea value={notes} onChange={setNotes} placeholder="Opcional: motivo de diferença, sangria manual etc." /></Field>
              <Button className="w-full" disabled={!open || closeCash.isPending || counted.trim() === ""} onClick={() => closeCash.mutate()}>Fechar e conferir caixa</Button>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Movimentações em dinheiro de hoje" description="Entradas e saídas que alteram o dinheiro físico do caixa.">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : movements.length === 0 ? <EmptyState title="Sem movimentações em dinheiro" description="Vendas em dinheiro, recebimentos de fiado em dinheiro e despesas pagas em dinheiro aparecerão aqui." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Horário</th><th className="px-4 py-3">Movimento</th><th className="px-4 py-3 text-right">Valor</th></tr></thead><tbody className="divide-y divide-border">{movements.map((m) => <tr key={m.id}><td className="px-4 py-3 text-muted-foreground">{dateTimeBR(m.date)}</td><td className="px-4 py-3">{m.label}</td><td className={`px-4 py-3 text-right font-medium ${m.type === "in" ? "text-success" : "text-destructive"}`}>{m.type === "in" ? "+" : "-"}{brl(m.amount)}</td></tr>)}</tbody></table></TableShell>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
