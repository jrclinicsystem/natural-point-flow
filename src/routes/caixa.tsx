import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SectionCard, TableShell, TextArea } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, dateTimeBR, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/caixa")({
  head: () => ({ meta: [{ title: "Caixa | Natural Point" }] }),
  component: CaixaPage,
});

type CashMovementType = "withdrawal" | "supply";

function CaixaPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [movementType, setMovementType] = useState<CashMovementType>("withdrawal");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [editSessionId, setEditSessionId] = useState("");
  const [correctedOpening, setCorrectedOpening] = useState("");
  const [correctedCounted, setCorrectedCounted] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctedNotes, setCorrectedNotes] = useState("");
  const today = todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["caixa", today],
    queryFn: async () => {
      const sessions = await supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }).limit(20);
      if (sessions.error) throw sessions.error;

      const sessionRows = sessions.data ?? [];
      const openSession = sessionRows.find((s: any) => s.status === "open") as any;
      const sessionStart = openSession?.opened_at ?? `${today}T00:00:00`;

      let expectedCash = 0;
      if (openSession?.id) {
        const expected = await supabase.rpc("cash_session_expected", { _session_id: openSession.id });
        if (expected.error) throw expected.error;
        expectedCash = Number(expected.data ?? openSession.opening_cash ?? 0);
      }

      const [cashPayments, cashExpenses, manualReceipts, cashMovements, corrections] = await Promise.all([
        supabase
          .from("sale_payments")
          .select("id,amount,created_at,payment_methods!inner(name,kind),sales(customer_name)")
          .eq("payment_methods.kind", "cash")
          .gte("created_at", sessionStart)
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("id,description,amount,created_at,paid_at,payment_methods!inner(name,kind)")
          .eq("status", "paid")
          .eq("payment_methods.kind", "cash")
          .eq("expense_date", today)
          .order("created_at", { ascending: false }),
        supabase
          .from("accounts_receivable")
          .select("id,customer_name,amount,paid_at,payment_methods!inner(name,kind)")
          .eq("status", "paid")
          .is("sale_id", null)
          .eq("payment_methods.kind", "cash")
          .gte("paid_at", sessionStart)
          .order("paid_at", { ascending: false }),
        openSession?.id
          ? supabase
              .from("cash_movements")
              .select("id,movement_type,amount,reason,created_at")
              .eq("session_id", openSession.id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("cash_session_corrections")
          .select("*")
          .order("changed_at", { ascending: false })
          .limit(100),
      ]);

      for (const result of [cashPayments, cashExpenses, manualReceipts, cashMovements, corrections]) {
        if (result.error) throw result.error;
      }

      const filteredCashExpenses = (cashExpenses.data ?? []).filter((e: any) => {
        const occurredAt = e.paid_at || e.created_at;
        return !openSession?.opened_at || String(occurredAt) >= String(openSession.opened_at);
      });

      return {
        sessions: sessionRows,
        expectedCash,
        cashPayments: cashPayments.data ?? [],
        cashExpenses: filteredCashExpenses,
        manualReceipts: manualReceipts.data ?? [],
        cashMovements: cashMovements.data ?? [],
        corrections: corrections.data ?? [],
      };
    },
  });

  const sessions = data?.sessions ?? [];
  const open = sessions.find((s: any) => s.status === "open") as any;
  const latestClosed = sessions.find((s: any) => s.status === "closed") as any;
  const expected = open ? Number(data?.expectedCash ?? open.opening_cash ?? 0) : 0;
  const differencePreview = parseNumber(counted) - expected;
  const editingSession = sessions.find((s: any) => s.id === editSessionId) as any;
  const correctedOpeningValue = editingSession ? parseNumber(correctedOpening) : 0;
  const correctedExpectedPreview = editingSession
    ? Number(editingSession.expected_cash ?? 0) - Number(editingSession.opening_cash ?? 0) + correctedOpeningValue
    : 0;
  const correctedDifferencePreview = editingSession ? parseNumber(correctedCounted) - correctedExpectedPreview : 0;
  const withdrawalTooHigh = movementType === "withdrawal" && parseNumber(movementAmount) > Math.max(expected, 0);

  useEffect(() => {
    if (!open && latestClosed?.counted_cash != null) {
      setOpening((current) => current.trim() === "" ? String(latestClosed.counted_cash) : current);
    }
  }, [open, latestClosed?.id, latestClosed?.counted_cash]);

  const movements = useMemo(() => {
    const rows: Array<{ id: string; date: string; label: string; amount: number; type: "in" | "out" }> = [];
    for (const raw of data?.cashPayments ?? []) {
      const p: any = raw;
      const sale = Array.isArray(p.sales) ? p.sales[0] : p.sales;
      rows.push({
        id: `sp-${p.id}`,
        date: p.created_at,
        label: sale?.customer_name ? `Venda · ${sale.customer_name}` : "Venda em dinheiro",
        amount: Number(p.amount),
        type: "in",
      });
    }
    for (const r of data?.manualReceipts ?? []) {
      rows.push({ id: `ar-${r.id}`, date: r.paid_at, label: `Recebimento · ${r.customer_name}`, amount: Number(r.amount), type: "in" });
    }
    for (const e of data?.cashExpenses ?? []) {
      rows.push({ id: `ex-${e.id}`, date: e.paid_at || e.created_at, label: `Despesa · ${e.description}`, amount: Number(e.amount), type: "out" });
    }
    for (const m of data?.cashMovements ?? []) {
      const isSupply = m.movement_type === "supply";
      rows.push({
        id: `cm-${m.id}`,
        date: m.created_at,
        label: `${isSupply ? "Suprimento" : "Sangria"} · ${m.reason}`,
        amount: Number(m.amount),
        type: isSupply ? "in" : "out",
      });
    }
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data]);

  const refreshCash = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["caixa"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({ queryKey: ["np-reports"] }),
    ]);
  };

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
      await refreshCash();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const registerMovement = useMutation({
    mutationFn: async () => {
      if (!open?.id) throw new Error("Abra o caixa antes de registrar uma movimentação.");
      const amount = parseNumber(movementAmount);
      const reason = movementReason.trim();
      if (amount <= 0) throw new Error("Informe um valor maior que zero.");
      if (!reason) throw new Error("Informe o motivo da movimentação.");

      const { error } = await supabase.rpc("register_cash_movement", {
        _session_id: open.id,
        _movement_type: movementType,
        _amount: amount,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(movementType === "withdrawal" ? "Sangria registrada." : "Suprimento registrado.");
      setMovementAmount("");
      setMovementReason("");
      await refreshCash();
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const correctClosure = useMutation({
    mutationFn: async () => {
      if (!isManager) throw new Error("Somente sócios ou administradores podem corrigir fechamentos.");
      if (!editingSession?.id) throw new Error("Selecione um fechamento para corrigir.");
      const openingValue = parseNumber(correctedOpening);
      const countedValue = parseNumber(correctedCounted);
      const reason = correctionReason.trim();
      if (openingValue < 0 || correctedOpening.trim() === "") throw new Error("Informe o valor inicial corrigido.");
      if (countedValue < 0 || correctedCounted.trim() === "") throw new Error("Informe o valor contado corrigido.");
      if (!reason) throw new Error("Informe o motivo da correção.");

      const { error } = await supabase.rpc("correct_cash_session", {
        _session_id: editingSession.id,
        _corrected_opening_cash: openingValue,
        _corrected_counted_cash: countedValue,
        _reason: reason,
        _corrected_notes: correctedNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Fechamento corrigido e registrado no histórico.");
      setEditSessionId("");
      setCorrectedOpening("");
      setCorrectedCounted("");
      setCorrectionReason("");
      setCorrectedNotes("");
      await refreshCash();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const closeCash = useMutation({
    mutationFn: async () => {
      if (!open?.id) throw new Error("Não há caixa aberto.");
      const value = parseNumber(counted);
      if (value < 0) throw new Error("Informe o valor contado fisicamente.");
      const { error } = await supabase.rpc("close_cash", {
        _session_id: open.id,
        _counted_cash: value,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Caixa fechado e conferido.");
      setCounted("");
      setNotes("");
      setMovementAmount("");
      setMovementReason("");
      await refreshCash();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppLayout title="Caixa" subtitle="Abertura, movimentações, conferência e diferença do dinheiro físico">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Situação" value={open ? "Caixa aberto" : "Caixa fechado"} tone={open ? "positive" : "default"} />
          <StatCard label="Valor inicial" value={brl(open?.opening_cash ?? 0)} />
          <StatCard label="Esperado agora" value={brl(expected)} tone="gold" />
          <StatCard label="Última diferença" value={brl(latestClosed?.difference ?? 0)} tone={Number(latestClosed?.difference ?? 0) === 0 ? "positive" : "negative"} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Abertura de caixa" description={open ? `Aberto em ${dateTimeBR(open.opened_at)}` : "Informe quanto existe em dinheiro físico no início do expediente."}>
            <Field label="Dinheiro inicial">
              <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Ex.: 200,00" disabled={!!open} />
            </Field>
            <Button className="mt-4 w-full" disabled={!!open || openCash.isPending} onClick={() => openCash.mutate()}>
              {open ? "Caixa já está aberto" : "Abrir caixa"}
            </Button>
          </SectionCard>

          <SectionCard title="Fechamento de caixa" description="Conte somente o dinheiro físico. O sistema compara com o valor esperado automaticamente.">
            <div className="space-y-3">
              <Field label="Valor contado">
                <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" disabled={!open} />
              </Field>
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Esperado</p>
                  <p className="font-medium">{brl(expected)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Diferença</p>
                  <p className={Math.abs(differencePreview) < 0.01 ? "font-medium text-success" : "font-medium text-destructive"}>{brl(differencePreview)}</p>
                </div>
              </div>
              <Field label="Observação">
                <TextArea value={notes} onChange={setNotes} placeholder="Opcional: motivo de diferença ou observação do fechamento." />
              </Field>
              <Button className="w-full" disabled={!open || closeCash.isPending || counted.trim() === ""} onClick={() => closeCash.mutate()}>
                Fechar e conferir caixa
              </Button>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Movimentar caixa"
          description="Registre toda retirada ou entrada manual de dinheiro. Sangria não é lançada como despesa financeira."
        >
          <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
            <Field label="Tipo">
              <NativeSelect value={movementType} onChange={(value) => setMovementType(value as CashMovementType)} disabled={!open}>
                <option value="withdrawal">Sangria</option>
                <option value="supply">Suprimento</option>
              </NativeSelect>
            </Field>
            <Field label="Valor">
              <Input
                inputMode="decimal"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="0,00"
                disabled={!open}
              />
            </Field>
            <Field label="Motivo">
              <Input
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                placeholder={movementType === "withdrawal" ? "Ex.: retirada para cofre" : "Ex.: reforço de troco"}
                disabled={!open}
              />
            </Field>
            <Button
              className="w-full md:w-auto"
              disabled={!open || registerMovement.isPending || !movementAmount.trim() || !movementReason.trim() || withdrawalTooHigh}
              onClick={() => registerMovement.mutate()}
            >
              {registerMovement.isPending ? "Registrando…" : movementType === "withdrawal" ? "Registrar sangria" : "Registrar suprimento"}
            </Button>
          </div>
          {!open ? <p className="mt-3 text-xs text-muted-foreground">Abra o caixa para registrar sangrias ou suprimentos.</p> : null}
          {open && movementType === "withdrawal" ? (
            <p className={`mt-3 text-xs ${withdrawalTooHigh ? "text-destructive" : "text-muted-foreground"}`}>
              Disponível para sangria: {brl(Math.max(expected, 0))}{withdrawalTooHigh ? " · o valor informado ultrapassa o dinheiro disponível." : ""}
            </p>
          ) : null}
        </SectionCard>

        {latestClosed ? (
          <SectionCard
            title="Resultado do último fechamento"
            description={`Fechado em ${dateTimeBR(latestClosed.closed_at)} · referência ${latestClosed.business_date ? latestClosed.business_date.split("-").reverse().join("/") : "-"}`}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-muted/35 p-4">
                <p className="text-xs text-muted-foreground">Valor inicial</p>
                <p className="mt-1 font-display text-xl">{brl(latestClosed.opening_cash)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/35 p-4">
                <p className="text-xs text-muted-foreground">Esperado</p>
                <p className="mt-1 font-display text-xl">{brl(latestClosed.expected_cash)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/35 p-4">
                <p className="text-xs text-muted-foreground">Contado</p>
                <p className="mt-1 font-display text-xl">{brl(latestClosed.counted_cash)}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${Math.abs(Number(latestClosed.difference ?? 0)) < 0.01 ? "border-success/25 bg-success/5" : "border-destructive/25 bg-destructive/5"}`}>
                <p className="text-xs text-muted-foreground">Diferença</p>
                <p className={`mt-1 font-display text-xl ${Math.abs(Number(latestClosed.difference ?? 0)) < 0.01 ? "text-success" : "text-destructive"}`}>
                  {brl(latestClosed.difference)}
                </p>
              </div>
            </div>
            {latestClosed.notes ? <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">Observação: {latestClosed.notes}</p> : null}
          </SectionCard>
        ) : null}

        <SectionCard title="Movimentações do caixa atual" description="Tudo que alterou o dinheiro físico desde a abertura deste caixa.">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : movements.length === 0 ? (
            <EmptyState
              title="Sem movimentações em dinheiro"
              description="Vendas em dinheiro, recebimentos, despesas em dinheiro, sangrias e suprimentos aparecerão aqui."
            />
          ) : (
            <TableShell>
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Horário</th>
                    <th className="px-4 py-3">Movimento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-muted-foreground">{dateTimeBR(m.date)}</td>
                      <td className="px-4 py-3">{m.label}</td>
                      <td className={`px-4 py-3 text-right font-medium ${m.type === "in" ? "text-success" : "text-destructive"}`}>
                        {m.type === "in" ? "+" : "-"}{brl(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          )}
        </SectionCard>


        {editingSession ? (
          <SectionCard
            title="Corrigir fechamento"
            description={`Correção auditada do caixa de ${editingSession.business_date ? editingSession.business_date.split("-").reverse().join("/") : dateTimeBR(editingSession.closed_at)}. O valor anterior continuará salvo no histórico.`}
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-muted/50 p-4 text-sm">
                <p className="text-xs text-muted-foreground">Inicial atual</p>
                <p className="mt-1 font-medium">{brl(editingSession.opening_cash ?? 0)}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4 text-sm">
                <p className="text-xs text-muted-foreground">Novo esperado</p>
                <p className="mt-1 font-medium">{brl(correctedExpectedPreview)}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4 text-sm">
                <p className="text-xs text-muted-foreground">Contado atual</p>
                <p className="mt-1 font-medium">{brl(editingSession.counted_cash ?? 0)}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4 text-sm">
                <p className="text-xs text-muted-foreground">Nova diferença</p>
                <p className={`mt-1 font-medium ${Math.abs(correctedDifferencePreview) < 0.01 ? "text-success" : "text-destructive"}`}>{brl(correctedDifferencePreview)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Valor inicial corrigido">
                <Input inputMode="decimal" value={correctedOpening} onChange={(e) => setCorrectedOpening(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Valor contado corrigido">
                <Input inputMode="decimal" value={correctedCounted} onChange={(e) => setCorrectedCounted(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Motivo da correção">
                <Input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Ex.: valor digitado incorretamente" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Observação do fechamento">
                <TextArea value={correctedNotes} onChange={setCorrectedNotes} placeholder="Opcional" />
              </Field>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditSessionId("");
                  setCorrectedOpening("");
                  setCorrectedCounted("");
                  setCorrectionReason("");
                  setCorrectedNotes("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={correctClosure.isPending || correctedOpening.trim() === "" || correctedCounted.trim() === "" || correctionReason.trim() === ""}
                onClick={() => correctClosure.mutate()}
              >
                {correctClosure.isPending ? "Salvando…" : "Salvar correção"}
              </Button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Histórico de fechamentos" description="Resultado dos caixas anteriores, incluindo esperado, contado e diferença.">
          {sessions.filter((s: any) => s.status === "closed").length === 0 ? (
            <EmptyState title="Nenhum caixa fechado" description="Assim que um caixa for fechado, o resultado ficará salvo aqui." />
          ) : (
            <TableShell>
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Inicial</th>
                    <th className="px-4 py-3">Esperado</th>
                    <th className="px-4 py-3">Contado</th>
                    <th className="px-4 py-3">Diferença</th>
                    {isManager ? <th className="px-4 py-3 text-right">Ação</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sessions.filter((s: any) => s.status === "closed").map((s: any) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">{s.business_date ? s.business_date.split("-").reverse().join("/") : dateTimeBR(s.closed_at)}</td>
                      <td className="px-4 py-3">{brl(s.opening_cash)}</td>
                      <td className="px-4 py-3">{brl(s.expected_cash)}</td>
                      <td className="px-4 py-3">{brl(s.counted_cash)}</td>
                      <td className={`px-4 py-3 font-medium ${Math.abs(Number(s.difference ?? 0)) < 0.01 ? "text-success" : "text-destructive"}`}>
                        {brl(s.difference)}
                      </td>
                      {isManager ? (
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditSessionId(s.id);
                              setCorrectedOpening(String(s.opening_cash ?? ""));
                              setCorrectedCounted(String(s.counted_cash ?? ""));
                              setCorrectionReason("");
                              setCorrectedNotes(String(s.notes ?? ""));
                            }}
                          >
                            Corrigir
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          )}
        </SectionCard>


        <SectionCard title="Histórico de correções" description="Auditoria dos fechamentos alterados: valor anterior, novo valor, motivo, responsável e horário.">
          {(data?.corrections ?? []).length === 0 ? (
            <EmptyState title="Nenhuma correção registrada" description="Quando um fechamento for corrigido, a alteração aparecerá aqui sem apagar o valor anterior." />
          ) : (
            <TableShell>
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Caixa</th>
                    <th className="px-4 py-3">Alteração</th>
                    <th className="px-4 py-3">Motivo</th>
                    <th className="px-4 py-3">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data?.corrections ?? []).map((item: any) => {
                    const session = sessions.find((s: any) => s.id === item.session_id);
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-muted-foreground">{dateTimeBR(item.changed_at)}</td>
                        <td className="px-4 py-3">{session?.business_date ? session.business_date.split("-").reverse().join("/") : "-"}</td>
                        <td className="px-4 py-3">
                          {item.previous_opening_cash != null || item.corrected_opening_cash != null ? (
                            <>
                              Inicial: {brl(item.previous_opening_cash ?? 0)} → <strong>{brl(item.corrected_opening_cash ?? 0)}</strong>
                              <br />
                            </>
                          ) : null}
                          Contado: {brl(item.previous_counted_cash ?? 0)} → <strong>{brl(item.corrected_counted_cash ?? 0)}</strong>
                        </td>
                        <td className="px-4 py-3">{item.reason}</td>
                        <td className="px-4 py-3">{item.changed_by_name || "Usuário"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
