import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Ban, ChevronDown, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SearchBox, SectionCard, StatusPill, TableShell } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, dateBR, monthStartISO, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/receitas")({
  head: () => ({ meta: [{ title: "Receitas (Entradas) | Natural Point" }] }),
  component: ReceitasPage,
});

type Period = "today" | "7d" | "30d" | "month" | "year" | "all" | "custom";
type Origin = "all" | "sale" | "manual";
type EntryStatus = "all" | "paid" | "cancelled";

type RevenueEntry = {
  key: string;
  rawId: string;
  origin: "sale" | "manual";
  originLabel: string;
  date: string;
  customer: string;
  description: string;
  methodId: string;
  methodName: string;
  amount: number;
  status: "paid" | "cancelled";
};

const one = (value: any) => Array.isArray(value) ? value[0] : value;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function daysAgoISO(days: number) {
  const date = new Date(todayISO() + "T12:00:00");
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function ReceitasPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<Origin>("all");
  const [methodId, setMethodId] = useState("all");
  const [status, setStatus] = useState<EntryStatus>("paid");
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());

  const applyPeriod = (next: Exclude<Period, "custom">) => {
    const today = todayISO();
    setPeriod(next);
    setTo(today);
    if (next === "today") setFrom(today);
    if (next === "7d") setFrom(daysAgoISO(6));
    if (next === "30d") setFrom(daysAgoISO(29));
    if (next === "month") setFrom(today.slice(0, 7) + "-01");
    if (next === "year") setFrom(today.slice(0, 4) + "-01-01");
    if (next === "all") setFrom("2000-01-01");
  };

  const { data, isLoading } = useQuery({
    queryKey: ["np-revenues", from, to],
    enabled: isManager,
    queryFn: async () => {
      const start = from + "T00:00:00-03:00";
      const end = to + "T23:59:59.999-03:00";
      const [payments, manualReceipts, methods] = await Promise.all([
        supabase
          .from("sale_payments")
          .select("id,sale_id,payment_method_id,amount,created_at,payment_methods!inner(id,name,kind),sales(customer_name,status,sold_at)")
          .neq("payment_methods.kind", "credit_account")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false }),
        supabase
          .from("accounts_receivable")
          .select("id,customer_name,description,amount,issue_date,status,payment_method_id,paid_at,payment_methods(id,name,kind)")
          .is("sale_id", null)
          .in("status", ["paid", "cancelled"])
          .not("paid_at", "is", null)
          .gte("paid_at", start)
          .lte("paid_at", end)
          .order("paid_at", { ascending: false }),
        supabase
          .from("payment_methods")
          .select("id,name,kind,is_active,sort_order")
          .eq("is_active", true)
          .neq("kind", "credit_account")
          .order("sort_order"),
      ]);
      if (payments.error) throw payments.error;
      if (manualReceipts.error) throw manualReceipts.error;
      if (methods.error) throw methods.error;
      return {
        payments: payments.data ?? [],
        manualReceipts: manualReceipts.data ?? [],
        methods: methods.data ?? [],
      };
    },
  });

  const entries = useMemo<RevenueEntry[]>(() => {
    const salesEntries = (data?.payments ?? []).map((row: any) => {
      const method = one(row.payment_methods);
      const sale = one(row.sales);
      return {
        key: "sale-" + row.id,
        rawId: row.id,
        origin: "sale" as const,
        originLabel: "Venda",
        date: row.created_at,
        customer: sale?.customer_name || "Cliente balcão",
        description: sale?.customer_name ? "Recebimento de venda" : "Venda balcão",
        methodId: row.payment_method_id,
        methodName: method?.name || "Não informado",
        amount: Number(row.amount ?? 0),
        status: sale?.status === "cancelled" ? "cancelled" as const : "paid" as const,
      };
    });

    const manualEntries = (data?.manualReceipts ?? []).map((row: any) => {
      const method = one(row.payment_methods);
      return {
        key: "manual-" + row.id,
        rawId: row.id,
        origin: "manual" as const,
        originLabel: "Manual",
        date: row.paid_at || row.issue_date,
        customer: row.customer_name || "Entrada manual",
        description: row.description || "Entrada manual",
        methodId: row.payment_method_id || "",
        methodName: method?.name || "Não informado",
        amount: Number(row.amount ?? 0),
        status: row.status === "cancelled" ? "cancelled" as const : "paid" as const,
      };
    });

    return [...salesEntries, ...manualEntries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    return entries.filter((entry) => {
      if (origin !== "all" && entry.origin !== origin) return false;
      if (methodId !== "all" && entry.methodId !== methodId) return false;
      if (status !== "all" && entry.status !== status) return false;
      if (!q) return true;
      return normalize([
        entry.customer,
        entry.description,
        entry.methodName,
        entry.originLabel,
        entry.rawId,
      ].join(" ")).includes(q);
    });
  }, [entries, search, origin, methodId, status]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, RevenueEntry[]>();
    for (const entry of filtered) {
      const label = dateBR(entry.date);
      const rows = groups.get(label) ?? [];
      rows.push(entry);
      groups.set(label, rows);
    }
    return [...groups.entries()];
  }, [filtered]);

  const filteredTotal = filtered.reduce((sum, entry) => sum + entry.amount, 0);
  const entriesPanelTitle =
    status === "paid"
      ? `Entradas recebidas (${filtered.length})`
      : status === "cancelled"
        ? `Entradas canceladas (${filtered.length})`
        : `Entradas (${filtered.length})`;
  const entriesPanelSubtitle =
    status === "paid"
      ? "Somente valores efetivamente recebidos entram como receita, líquido e resultado."
      : status === "cancelled"
        ? "Lançamentos cancelados permanecem no histórico e não entram no resultado."
        : "Entradas recebidas e canceladas no período selecionado.";

  const activeEntries = filtered.filter((entry) => entry.status === "paid");
  const total = activeEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const salesTotal = activeEntries.filter((entry) => entry.origin === "sale").reduce((sum, entry) => sum + entry.amount, 0);
  const manualTotal = activeEntries.filter((entry) => entry.origin === "manual").reduce((sum, entry) => sum + entry.amount, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!isManager) throw new Error("Apenas sócios ou administradores podem registrar entradas manuais.");
      const value = parseNumber(amount);
      if (!description.trim()) throw new Error("Informe a descrição da entrada.");
      if (value <= 0) throw new Error("Informe um valor maior que zero.");
      if (!paymentMethodId) throw new Error("Selecione a forma de recebimento.");
      const { error } = await supabase.rpc("register_manual_receipt", {
        _customer_name: customer.trim() || null,
        _description: description.trim(),
        _amount: value,
        _payment_method_id: paymentMethodId,
        _entry_date: entryDate,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Entrada registrada.");
      setCustomer("");
      setDescription("");
      setAmount("");
      setPaymentMethodId("");
      setEntryDate(todayISO());
      setShowForm(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-revenues"] }),
        qc.invalidateQueries({ queryKey: ["np-receivables"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["caixa"] }),
        qc.invalidateQueries({ queryKey: ["np-reports"] }),
      ]);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const cancelEntry = useMutation({
    mutationFn: async (id: string) => {
      if (!isManager) throw new Error("Acesso restrito.");
      const { error } = await supabase.rpc("cancel_manual_receipt", { _id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Entrada cancelada e preservada no histórico.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-revenues"] }),
        qc.invalidateQueries({ queryKey: ["np-receivables"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["caixa"] }),
        qc.invalidateQueries({ queryKey: ["np-reports"] }),
      ]);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const resetFilters = () => {
    setSearch("");
    setOrigin("all");
    setMethodId("all");
    setStatus("all");
    applyPeriod("month");
  };

  return (
    <AppLayout
      managerOnly
      title="Receitas (Entradas)"
      subtitle="Tudo que realmente entrou: vendas, recebimentos e lançamentos manuais"
      actions={
        <Button size="sm" onClick={() => setShowForm((current) => !current)}>
          <Plus className="mr-2 h-4 w-4" /> Nova entrada
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total recebido" value={brl(total)} tone="positive" />
          <StatCard label="Vendas" value={brl(salesTotal)} />
          <StatCard label="Entradas manuais" value={brl(manualTotal)} tone="gold" />
          <StatCard label="Lançamentos" value={String(activeEntries.length)} />
        </div>

        {showForm && (
          <SectionCard title="Nova entrada" description="Registre aqui uma receita recebida que não veio de uma venda do PDV nem de uma conta a receber já cadastrada.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Descrição">
                <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Receita adicional" />
              </Field>
              <Field label="Recebido de">
                <Input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Opcional" />
              </Field>
              <Field label="Valor">
                <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Forma de recebimento">
                <NativeSelect value={paymentMethodId} onChange={setPaymentMethodId}>
                  <option value="">Selecione</option>
                  {(data?.methods ?? []).map((method: any) => <option key={method.id} value={method.id}>{method.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Data da entrada">
                <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              </Field>
            </div>
            <Button className="mt-5" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Registrando…" : "Registrar entrada"}
            </Button>
          </SectionCard>
        )}

        <SectionCard
          title="Histórico de entradas"
          description="Pesquise e filtre por período, origem, forma de recebimento e status."
        >
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_210px_170px_auto]">
              <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente, descrição, origem ou forma" />
              <NativeSelect value={origin} onChange={(value) => setOrigin(value as Origin)}>
                <option value="all">Todas as origens</option>
                <option value="sale">Vendas</option>
                <option value="manual">Entradas manuais</option>
              </NativeSelect>
              <NativeSelect value={methodId} onChange={setMethodId}>
                <option value="all">Todas as formas</option>
                {(data?.methods ?? []).map((method: any) => <option key={method.id} value={method.id}>{method.name}</option>)}
              </NativeSelect>
              <NativeSelect value={status} onChange={(value) => setStatus(value as EntryStatus)}>
                <option value="all">Todos os status</option>
                <option value="paid">Recebidas</option>
                <option value="cancelled">Canceladas</option>
              </NativeSelect>
              <Button type="button" variant="outline" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" /> Limpar
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                ["today", "Hoje"],
                ["7d", "7 dias"],
                ["30d", "30 dias"],
                ["month", "Mês"],
                ["year", "Ano"],
                ["all", "Tudo"],
              ] as const).map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={period === value ? "default" : "outline"} onClick={() => applyPeriod(value)}>
                  {label}
                </Button>
              ))}
              <Button type="button" size="sm" variant={period === "custom" ? "default" : "outline"} onClick={() => setPeriod("custom")}>
                Personalizado
              </Button>
            </div>

            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <Field label="De">
                <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPeriod("custom"); }} />
              </Field>
              <Field label="Até">
                <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPeriod("custom"); }} />
              </Field>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando entradas…</p>
            ) : filtered.length === 0 ? (
              <EmptyState title="Nenhuma entrada encontrada" description="Ajuste os filtros ou registre uma nova entrada manual." />
            ) : (
              <details className="group overflow-hidden rounded-[22px] border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <strong className="text-sm font-semibold text-foreground sm:text-base">{entriesPanelTitle}</strong>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{entriesPanelSubtitle}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <strong className="text-sm text-success sm:text-base">{brl(filteredTotal)}</strong>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                  </div>
                </summary>

                <div className="space-y-3 border-t border-border p-3 sm:p-4">
                  {groupedEntries.map(([date, rows]) => {
                    const dayTotal = rows.reduce((sum, entry) => sum + entry.amount, 0);
                    return (
                      <details key={date} className="group/day overflow-hidden rounded-2xl border border-border bg-background">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                          <div>
                            <strong className="text-sm">{date}</strong>
                            <p className="text-[11px] text-muted-foreground">{rows.length} lançamento(s)</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <strong className="text-foreground">{brl(dayTotal)}</strong>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open/day:rotate-180" />
                          </div>
                        </summary>
                        <div className="border-t border-border p-2 sm:p-3">
                          <TableShell>
                            <table className="min-w-full text-sm">
                              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                                <tr>
                                  <th className="px-4 py-3">Data</th>
                                  <th className="px-4 py-3">Descrição</th>
                                  <th className="px-4 py-3">Origem</th>
                                  <th className="px-4 py-3">Forma</th>
                                  <th className="px-4 py-3">Valor</th>
                                  <th className="px-4 py-3">Status</th>
                                  <th className="px-4 py-3 text-right">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {rows.map((entry) => (
                                  <tr key={entry.key}>
                                    <td className="px-4 py-3 whitespace-nowrap">{dateBR(entry.date)}</td>
                                    <td className="px-4 py-3 font-medium">
                                      {entry.description}
                                      <p className="text-xs font-normal text-muted-foreground">{entry.customer}</p>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{entry.originLabel}</td>
                                    <td className="px-4 py-3">{entry.methodName}</td>
                                    <td className="px-4 py-3 font-medium">{brl(entry.amount)}</td>
                                    <td className="px-4 py-3"><StatusPill status={entry.status} /></td>
                                    <td className="px-4 py-3 text-right">
                                      {entry.origin === "manual" && entry.status === "paid" ? (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-destructive"
                                          disabled={cancelEntry.isPending}
                                          onClick={() => {
                                            if (window.confirm("Cancelar esta entrada manual? O lançamento será preservado no histórico.")) {
                                              cancelEntry.mutate(entry.rawId);
                                            }
                                          }}
                                        >
                                          <Ban className="mr-2 h-4 w-4" /> Cancelar
                                        </Button>
                                      ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </TableShell>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
