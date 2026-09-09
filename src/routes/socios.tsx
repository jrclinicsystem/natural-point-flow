import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { Field, SectionCard } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, parseNumber } from "@/lib/format";

export const Route = createFileRoute("/socios")({
  head: () => ({ meta: [{ title: "Sócios | Natural Point" }] }),
  component: SociosPage,
});

type Partner = { id: string; partner_name: string; share_percent: number; is_active: boolean; sort_order: number };

function SociosPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Array<Partner & { shareText: string }>>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["np-partners"],
    queryFn: async () => {
      const [settings, profit] = await Promise.all([
        supabase.from("partner_settings").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("partner_profit_view").select("*").order("share_percent", { ascending: false }),
      ]);
      if (settings.error) throw settings.error;
      if (profit.error) throw profit.error;
      return { settings: (settings.data ?? []) as Partner[], profit: profit.data ?? [] };
    },
  });

  useEffect(() => {
    if (data?.settings) setDraft(data.settings.map((p) => ({ ...p, shareText: String(p.share_percent) })));
  }, [data?.settings]);

  const profitRows = data?.profit ?? [];
  const netProfit = Number(profitRows[0]?.net_profit ?? 0);
  const totalShare = draft.reduce((a, p) => a + parseNumber(p.shareText), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (draft.some((p) => !p.partner_name.trim())) throw new Error("Informe o nome dos dois sócios.");
      if (Math.abs(totalShare - 100) > 0.001) throw new Error("A soma dos percentuais precisa ser exatamente 100%.");
      const { error } = await supabase.rpc("save_partner_split", {
        _partners: draft.map((p) => ({ id: p.id, partner_name: p.partner_name.trim(), share_percent: parseNumber(p.shareText), is_active: true })),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Divisão dos sócios atualizada.");
      await qc.invalidateQueries({ queryKey: ["np-partners"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppLayout managerOnly title="Sócios" subtitle="Divisão do lucro líquido realizado da Natural Point">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Lucro líquido disponível" value={brl(netProfit)} tone="positive" hint="Recebimentos líquidos menos despesas pagas" />
          <StatCard label="Sócios ativos" value={String(draft.length)} />
          <StatCard label="Percentual distribuído" value={`${totalShare.toFixed(2).replace(".00", "")}%`} tone={Math.abs(totalShare - 100) < 0.001 ? "positive" : "negative"} />
        </div>

        <SectionCard title="Distribuição atual" description="O sistema calcula a parte de cada sócio somente sobre o que foi efetivamente recebido, já descontadas taxas de pagamento e despesas pagas.">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : <div className="grid gap-4 md:grid-cols-2">{profitRows.map((row: any) => <div key={row.id} className="rounded-2xl border border-border bg-muted/20 p-5"><p className="text-sm text-muted-foreground">{row.partner_name}</p><p className="mt-2 font-display text-3xl text-primary">{brl(row.partner_amount)}</p><p className="mt-1 text-xs text-muted-foreground">{Number(row.share_percent)}% do lucro líquido</p></div>)}</div>}
          {!isLoading && profitRows.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há resultado disponível para distribuir.</p>}
        </SectionCard>

        <SectionCard title="Configurar sócios" description="O total dos percentuais deve sempre ser 100%.">
          <div className="grid gap-4 md:grid-cols-2">
            {draft.map((p, index) => <div key={p.id} className="rounded-2xl border border-border p-4"><p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sócio {index + 1}</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Nome"><Input value={p.partner_name} onChange={(e) => setDraft((rows) => rows.map((x) => x.id === p.id ? { ...x, partner_name: e.target.value } : x))} /></Field><Field label="Percentual"><Input value={p.shareText} onChange={(e) => setDraft((rows) => rows.map((x) => x.id === p.id ? { ...x, shareText: e.target.value } : x))} placeholder="50" /></Field></div></div>)}
          </div>
          <div className="mt-5 flex items-center gap-3"><Button onClick={() => save.mutate()} disabled={save.isPending || draft.length < 2}>Salvar divisão</Button><span className={Math.abs(totalShare - 100) < 0.001 ? "text-xs text-success" : "text-xs text-destructive"}>Total: {totalShare.toFixed(2)}%</span></div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
