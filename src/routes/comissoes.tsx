import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDollarSign, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SectionCard } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateBR, monthStartISO, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/comissoes")({
  head: () => ({ meta: [{ title: "Comissões | Natural Point" }] }),
  component: ComissoesPage,
});

type Partner = {
  id: string;
  partner_name: string;
  share_percent: number;
  is_active: boolean;
  sort_order: number;
};

type Preview = {
  realized_revenue: number;
  paid_expenses: number;
  net_profit: number;
  pending_payables_count: number;
  pending_payables_total: number;
  has_overlap: boolean;
};

const statusLabel: Record<string, string> = {
  open: "Aberto",
  partial: "Parcial",
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.06em] ring-1",
        status === "paid"
          ? "bg-success/10 text-success ring-success/10"
          : status === "cancelled"
            ? "bg-muted text-muted-foreground ring-border"
            : status === "partial"
              ? "bg-primary/10 text-primary ring-primary/10"
              : "bg-gold/15 text-foreground ring-gold/15",
      )}
    >
      {statusLabel[status] || status}
    </span>
  );
}

function ComissoesPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({});

  const periodIsValid = Boolean(from && to && from <= to);

  const { data, isLoading, error } = useQuery({
    queryKey: ["np-partner-commissions", from, to],
    enabled: periodIsValid,
    queryFn: async () => {
      const [preview, partners, closings, methods] = await Promise.all([
        supabase.rpc("get_partner_commission_preview", { _from: from, _to: to }),
        supabase.from("partner_settings").select("*").eq("is_active", true).order("sort_order"),
        supabase
          .from("partner_commission_closings")
          .select("*,partner_commissions(*)")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("payment_methods")
          .select("id,name,kind,is_active,sort_order")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      if (preview.error) throw preview.error;
      if (partners.error) throw partners.error;
      if (closings.error) throw closings.error;
      if (methods.error) throw methods.error;

      return {
        preview: (preview.data?.[0] ?? null) as Preview | null,
        partners: (partners.data ?? []) as Partner[],
        closings: closings.data ?? [],
        methods: (methods.data ?? []).filter((method: any) => method.kind !== "credit_account"),
      };
    },
  });

  useEffect(() => {
    if (!data?.partners) return;
    setPartnerNames((current) => {
      const next = { ...current };
      for (const partner of data.partners) {
        if (!(partner.id in next)) next[partner.id] = partner.partner_name;
      }
      return next;
    });
  }, [data?.partners]);

  useEffect(() => {
    if (!paymentMethodId && data?.methods?.[0]?.id) setPaymentMethodId(data.methods[0].id);
  }, [data?.methods, paymentMethodId]);

  const commissionRows = useMemo(
    () =>
      (data?.closings ?? []).flatMap((closing: any) =>
        (closing.partner_commissions ?? []).map((commission: any) => ({ commission, closing })),
      ),
    [data?.closings],
  );

  const pendingCommissions = commissionRows.reduce(
    (sum: number, row: any) =>
      row.commission.status === "pending"
        ? sum + Number(row.commission.commission_amount ?? 0) - Number(row.commission.paid_amount ?? 0)
        : sum,
    0,
  );

  const paidCommissions = commissionRows.reduce(
    (sum: number, row: any) => sum + Number(row.commission.paid_amount ?? 0),
    0,
  );

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["np-partner-commissions"] });
  };

  const generateClosing = useMutation({
    mutationFn: async () => {
      if (!periodIsValid) throw new Error("Informe um período válido.");
      const { error: rpcError } = await supabase.rpc("generate_partner_commission_closing", {
        _from: from,
        _to: to,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      toast.success("Fechamento de comissões gerado.");
      await refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const payCommission = useMutation({
    mutationFn: async (commissionId: string) => {
      if (!paymentMethodId) throw new Error("Selecione a forma de pagamento do repasse.");
      const { error: rpcError } = await supabase.rpc("pay_partner_commission", {
        _commission_id: commissionId,
        _payment_method_id: paymentMethodId,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      toast.success("Repasse marcado como pago.");
      await refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reversePayment = useMutation({
    mutationFn: async (commissionId: string) => {
      const { error: rpcError } = await supabase.rpc("reverse_partner_commission_payment", {
        _commission_id: commissionId,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      toast.success("Pagamento do repasse desfeito.");
      await refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cancelClosing = useMutation({
    mutationFn: async (closingId: string) => {
      const { error: rpcError } = await supabase.rpc("cancel_partner_commission_closing", {
        _closing_id: closingId,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      toast.success("Fechamento cancelado. O período pode ser gerado novamente.");
      await refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const savePartners = useMutation({
    mutationFn: async () => {
      const partners = data?.partners ?? [];
      if (partners.length !== 2) throw new Error("A Natural Point deve ter exatamente dois sócios ativos.");
      if (partners.some((partner) => !(partnerNames[partner.id] || "").trim())) {
        throw new Error("Informe o nome dos dois sócios.");
      }

      const { error: rpcError } = await supabase.rpc("save_partner_split", {
        _partners: partners.map((partner) => ({
          id: partner.id,
          partner_name: partnerNames[partner.id].trim(),
          share_percent: 50,
          is_active: true,
        })),
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      toast.success("Nomes atualizados. A divisão permanece 50/50.");
      await refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const preview = data?.preview;
  const partners = data?.partners ?? [];
  const closingBlocked =
    !periodIsValid ||
    !preview ||
    Number(preview.net_profit) <= 0 ||
    Number(preview.pending_payables_count) > 0 ||
    Boolean(preview.has_overlap) ||
    partners.length !== 2;

  return (
    <AppLayout
      managerOnly
      title="Comissões"
      subtitle="Fechamento e repasse do lucro líquido dos sócios"
    >
      <div className="space-y-6">
        <SectionCard
          title="Período do fechamento"
          description="A comissão é calculada somente sobre o valor realmente recebido no período, menos taxas e despesas efetivamente pagas."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
            <Field label="Início">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Fim">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {!periodIsValid && <p className="mt-3 text-xs text-destructive">A data final precisa ser igual ou posterior à data inicial.</p>}
        </SectionCard>

        {error ? (
          <div className="np-card border-destructive/20 bg-destructive/[.025] p-5 text-sm text-destructive">
            Não foi possível carregar as comissões: {(error as Error).message}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Receita líquida realizada" value={brl(Number(preview?.realized_revenue ?? 0))} hint="Recebimentos já realizados, líquidos das taxas" />
          <StatCard label="Despesas pagas" value={brl(Number(preview?.paid_expenses ?? 0))} tone="negative" hint="Somente contas/despesas já pagas no período" />
          <StatCard label="Lucro líquido a distribuir" value={brl(Number(preview?.net_profit ?? 0))} tone="positive" hint="Base da divisão 50% / 50%" />
          <StatCard label="Comissões pendentes" value={brl(pendingCommissions)} tone={pendingCommissions > 0 ? "gold" : "positive"} hint={`${brl(paidCommissions)} já repassados no histórico`} />
        </div>

        <SectionCard
          title="Fechamento dos sócios"
          description="Assim como no fechamento de comissões do Clinic, o período é consolidado e depois cada repasse pode ser marcado como pago individualmente."
          actions={
            <Button onClick={() => generateClosing.mutate()} disabled={closingBlocked || generateClosing.isPending}>
              <CircleDollarSign className="mr-2 h-4 w-4" />
              {generateClosing.isPending ? "Gerando…" : "Gerar fechamento"}
            </Button>
          }
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando prévia…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {partners.map((partner) => (
                  <div key={partner.id} className="rounded-2xl border border-border bg-muted/20 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{partner.partner_name}</p>
                      <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">50%</span>
                    </div>
                    <p className="mt-3 font-display text-3xl text-primary">{brl(Number(preview?.net_profit ?? 0) / 2)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">50% do lucro líquido realizado deste período</p>
                  </div>
                ))}
              </div>

              {partners.length !== 2 && (
                <div className="flex gap-3 rounded-2xl border border-destructive/20 bg-destructive/[.04] p-4 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Configure exatamente dois sócios para usar a regra 50/50.
                </div>
              )}

              {Number(preview?.pending_payables_count ?? 0) > 0 && (
                <div className="flex gap-3 rounded-2xl border border-gold/30 bg-gold/[.07] p-4 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <div>
                    <p className="font-medium">Fechamento bloqueado por contas pendentes</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Existem {Number(preview?.pending_payables_count)} conta(s) a pagar pendente(s), totalizando {brl(Number(preview?.pending_payables_total ?? 0))}, com vencimento até {dateBR(to)}. Quite essas contas antes de distribuir o lucro.
                    </p>
                  </div>
                </div>
              )}

              {preview?.has_overlap && (
                <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/[.04] p-4 text-sm text-primary">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  Já existe um fechamento que cruza este período. Consulte o histórico abaixo antes de gerar outro.
                </div>
              )}

              {!preview?.has_overlap && Number(preview?.pending_payables_count ?? 0) === 0 && Number(preview?.net_profit ?? 0) <= 0 && (
                <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                  Ainda não há lucro líquido positivo para distribuir neste período.
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Comissões" description="Repasses individuais dos sócios, seguindo o mesmo conceito de pendente/pago usado no Clinic.">
            <div className="mb-4 max-w-sm">
              <Field label="Forma de pagamento do repasse">
                <NativeSelect value={paymentMethodId} onChange={setPaymentMethodId} disabled={(data?.methods?.length ?? 0) === 0}>
                  {(data?.methods ?? []).map((method: any) => (
                    <option key={method.id} value={method.id}>{method.name}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            {commissionRows.length === 0 ? (
              <EmptyState title="Nenhuma comissão gerada" description="Escolha um período com lucro líquido positivo e gere o primeiro fechamento." />
            ) : (
              <div className="space-y-3">
                {commissionRows.map(({ commission, closing }: any) => (
                  <div key={commission.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="text-sm">{commission.partner_name_snapshot}</strong>
                        <p className="mt-1 text-xs text-muted-foreground">{dateBR(closing.period_start)} — {dateBR(closing.period_end)} · {Number(commission.share_percent)}% do lucro líquido</p>
                      </div>
                      <div className="text-right">
                        <strong className="font-display text-xl text-primary">{brl(Number(commission.commission_amount))}</strong>
                        <div className="mt-1"><StatusBadge status={commission.status} /></div>
                      </div>
                    </div>

                    {commission.status === "pending" && closing.status !== "cancelled" ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        disabled={payCommission.isPending || !paymentMethodId}
                        onClick={() => payCommission.mutate(commission.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar repasse pago
                      </Button>
                    ) : commission.status === "paid" ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={reversePayment.isPending}
                        onClick={() => {
                          if (!window.confirm(`Desfazer o pagamento de ${commission.partner_name_snapshot} no valor de ${brl(Number(commission.commission_amount))}?`)) return;
                          reversePayment.mutate(commission.id);
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> Desfazer pagamento
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Fechamentos" description="Cada fechamento preserva os valores do período e a regra 50/50 usada naquele momento.">
            {(data?.closings?.length ?? 0) === 0 ? (
              <EmptyState title="Nenhum fechamento" description="Os fechamentos gerados aparecerão aqui com o histórico completo." />
            ) : (
              <div className="space-y-3">
                {(data?.closings ?? []).map((closing: any) => {
                  const commissions = closing.partner_commissions ?? [];
                  const hasPaid = commissions.some((commission: any) => Number(commission.paid_amount ?? 0) > 0);
                  return (
                    <div key={closing.id} className="rounded-2xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-sm">{dateBR(closing.period_start)} — {dateBR(closing.period_end)}</strong>
                          <p className="mt-1 text-xs text-muted-foreground">Receita {brl(Number(closing.realized_revenue))} · Despesas {brl(Number(closing.paid_expenses))}</p>
                          <p className="mt-1 text-xs font-medium text-foreground">Lucro líquido: {brl(Number(closing.net_profit))}</p>
                        </div>
                        <StatusBadge status={closing.status} />
                      </div>

                      {closing.status !== "cancelled" && !hasPaid ? (
                        <Button
                          className="mt-3 text-destructive hover:text-destructive"
                          size="sm"
                          variant="outline"
                          disabled={cancelClosing.isPending}
                          onClick={() => {
                            if (!window.confirm(`Cancelar o fechamento de ${dateBR(closing.period_start)} a ${dateBR(closing.period_end)}?`)) return;
                            cancelClosing.mutate(closing.id);
                          }}
                        >
                          <XCircle className="mr-2 h-4 w-4" /> Cancelar fechamento
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Regra de comissão" description="A Natural Point possui dois sócios com divisão fixa de 50% para cada. Aqui você pode apenas atualizar os nomes.">
          <div className="grid gap-4 md:grid-cols-2">
            {partners.map((partner, index) => (
              <div key={partner.id} className="rounded-2xl border border-border p-4">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sócio {index + 1}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome">
                    <Input value={partnerNames[partner.id] ?? partner.partner_name} onChange={(e) => setPartnerNames((current) => ({ ...current, [partner.id]: e.target.value }))} />
                  </Field>
                  <Field label="Percentual" hint="Regra fixa da Natural Point">
                    <Input value="50%" disabled />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => savePartners.mutate()} disabled={savePartners.isPending || partners.length !== 2}>
              {savePartners.isPending ? "Salvando…" : "Salvar nomes"}
            </Button>
            <span className="text-xs text-success">Total distribuído: 100% · 50% para cada sócio</span>
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
