import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { AMOUNT_KEYS, fetchList, inRange, n, pick, s, sum, type Row } from "@/lib/db";
import { brl, dateTimeBR, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa | Natural Point Finance" },
      { name: "description", content: "Abertura, fechamento e movimentações do caixa da Natural Point." },
      { property: "og:title", content: "Caixa | Natural Point Finance" },
      { property: "og:description", content: "Controle do caixa do dia com valor esperado e diferença." },
    ],
  }),
  component: CaixaPage,
});

function CaixaPage() {
  const qc = useQueryClient();
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");

  const { data } = useQuery({
    queryKey: ["caixa"],
    queryFn: async () => {
      const safe = async (t: string) => {
        try {
          return await fetchList(t, { limit: 200 });
        } catch {
          return [] as Row[];
        }
      };
      const [sessions, sales, expenses] = await Promise.all([
        safe("cash_sessions"),
        safe("sales"),
        safe("expenses"),
      ]);
      return { sessions, sales, expenses };
    },
  });

  const sessions = data?.sessions ?? [];
  const today = todayISO();
  const open = sessions.find((c) => !pick(c, ["closed_at", "closing_at", "fechado_em"]));
  const openingAmount = n(pick(open ?? {}, ["opening_amount", "initial_amount", "valor_inicial"]));
  const salesToday = (data?.sales ?? []).filter((r) => inRange(r, today, today));
  const expensesToday = (data?.expenses ?? []).filter((r) => inRange(r, today, today));
  const expected = openingAmount + sum(salesToday) - sum(expensesToday);

  const openCash = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("open_cash", { p_opening_amount: parseNumber(opening) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa aberto.");
      setOpening("");
      void qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const closeCash = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("close_cash", { p_counted_amount: parseNumber(counted) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa fechado.");
      setCounted("");
      void qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppLayout title="Caixa" subtitle="Abertura, conferência e fechamento do dia">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Situação" value={open ? "Caixa aberto" : "Caixa fechado"} tone={open ? "positive" : "default"} />
          <StatCard label="Valor de abertura" value={brl(openingAmount)} />
          <StatCard label="Valor esperado agora" value={brl(expected)} tone="gold" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="np-card space-y-3 p-5">
            <h2 className="font-display text-lg">Abrir caixa</h2>
            <div className="space-y-2">
              <Label>Valor inicial</Label>
              <Input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="200,00" />
            </div>
            <Button disabled={!!open || openCash.isPending} onClick={() => openCash.mutate()} className="w-full">
              Abrir caixa
            </Button>
          </div>

          <div className="np-card space-y-3 p-5">
            <h2 className="font-display text-lg">Fechar caixa</h2>
            <div className="space-y-2">
              <Label>Valor contado</Label>
              <Input value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" />
            </div>
            <p className="text-xs text-muted-foreground">
              Diferença: {brl(parseNumber(counted || "0") - expected)}
            </p>
            <Button disabled={!open || closeCash.isPending} onClick={() => closeCash.mutate()} className="w-full">
              Fechar caixa
            </Button>
          </div>
        </div>

        <div className="np-card p-5">
          <h2 className="font-display text-lg">Movimentações de hoje</h2>
          <div className="mt-3 divide-y divide-border text-sm">
            {[...salesToday, ...expensesToday].map((row, i) => (
              <div key={i} className="flex justify-between py-2.5">
                <span className="text-muted-foreground">{dateTimeBR(s(pick(row, ["created_at", "date"])))}</span>
                <span>{brl(n(pick(row, AMOUNT_KEYS)))}</span>
              </div>
            ))}
            {!salesToday.length && !expensesToday.length && (
              <p className="py-4 text-muted-foreground">Sem movimentações hoje.</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
