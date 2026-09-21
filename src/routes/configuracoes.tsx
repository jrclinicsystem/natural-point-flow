import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, Percent, Save } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, Field, SectionCard } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { parseNumber } from "@/lib/format";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações | Natural Point" }] }),
  component: ConfiguracoesPage,
});

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  kind: "cash" | "pix" | "debit" | "credit" | "credit_account";
  fee_percent: number;
  is_active: boolean;
  sort_order: number;
};

const kindLabel: Record<PaymentMethod["kind"], string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
  credit_account: "Fiado",
};

function ConfiguracoesPage() {
  const qc = useQueryClient();
  const [fees, setFees] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["np-payment-fee-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id,code,name,kind,fee_percent,is_active,sort_order")
        .eq("is_active", true)
        .neq("kind", "credit_account")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PaymentMethod[];
    },
  });

  useEffect(() => {
    if (!data) return;
    setFees(
      Object.fromEntries(
        data.map((method) => [
          method.id,
          Number(method.fee_percent ?? 0).toLocaleString("pt-BR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          }),
        ]),
      ),
    );
  }, [data]);

  const changedIds = useMemo(
    () =>
      (data ?? [])
        .filter((method) => {
          const next = parseNumber(fees[method.id] ?? "0");
          return Math.abs(next - Number(method.fee_percent ?? 0)) > 0.00005;
        })
        .map((method) => method.id),
    [data, fees],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const changed = data.filter((method) => changedIds.includes(method.id));
      for (const method of changed) {
        const fee = parseNumber(fees[method.id] ?? "0");
        if (fee < 0 || fee > 100) {
          throw new Error(`A taxa de ${method.name} deve ficar entre 0% e 100%.`);
        }
        const { error } = await supabase.rpc("set_payment_method_fee", {
          _payment_method_id: method.id,
          _fee_percent: fee,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Taxas atualizadas.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-payment-fee-settings"] }),
        qc.invalidateQueries({ queryKey: ["np-sales-workspace"] }),
        qc.invalidateQueries({ queryKey: ["np-revenues"] }),
        qc.invalidateQueries({ queryKey: ["np-reports"] }),
      ]);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <AppLayout
      managerOnly
      title="Configurações"
      subtitle="Ajustes financeiros e formas de pagamento"
      actions={
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || changedIds.length === 0}
        >
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      }
    >
      <div className="space-y-6">
        <SectionCard
          title="Taxas das formas de pagamento"
          description="Cadastre a porcentagem cobrada pela maquininha ou pelo meio de pagamento. A taxa será descontada automaticamente do valor líquido das novas vendas."
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando formas de pagamento…</p>
          ) : !data?.length ? (
            <EmptyState
              title="Nenhuma forma de pagamento encontrada"
              description="Cadastre uma forma de pagamento ativa para configurar suas taxas."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.map((method) => {
                const isCard = method.kind === "debit" || method.kind === "credit";
                const changed = changedIds.includes(method.id);
                return (
                  <div
                    key={method.id}
                    className="rounded-[20px] border border-border bg-card p-4 sm:p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.07] text-primary">
                          {isCard ? <CreditCard className="h-4 w-4" /> : <Percent className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{method.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{kindLabel[method.kind]}</p>
                        </div>
                      </div>
                      {changed && (
                        <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-foreground">
                          Alterado
                        </span>
                      )}
                    </div>

                    <Field
                      label="Taxa cobrada (%)"
                      hint={
                        method.kind === "cash"
                          ? "Normalmente 0% para dinheiro."
                          : method.kind === "pix"
                            ? "Se o seu provedor não cobra taxa no Pix, deixe 0%."
                            : "Informe a porcentagem exata cobrada pela maquininha."
                      }
                    >
                      <div className="relative">
                        <Input
                          inputMode="decimal"
                          value={fees[method.id] ?? ""}
                          onChange={(event) =>
                            setFees((current) => ({ ...current, [method.id]: event.target.value }))
                          }
                          placeholder="0,00"
                          className="pr-10"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                          %
                        </span>
                      </div>
                    </Field>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/[0.035] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            Exemplo: em uma venda de R$ 100,00 no crédito com taxa de 3,49%, o sistema registra R$ 3,49 de taxa e R$ 96,51 como valor líquido. Alterar a taxa não modifica vendas antigas.
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
