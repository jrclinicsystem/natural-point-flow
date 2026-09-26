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

type CashMovementType = "withdrawal" | "supply" | "reserve_return";

function CaixaPage() {
  const qc = useQueryClient();
  const { isManager, user, displayName } = useAuth();
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [movementType, setMovementType] = useState<CashMovementType>("withdrawal");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [historySessionId, setHistorySessionId] = useState("");
  const [historyAmount, setHistoryAmount] = useState("");
  const [historyReason, setHistoryReason] = useState("");
  const [editSessionId, setEditSessionId] = useState("");
  const [correctedOpening, setCorrectedOpening] = useState("");
  const [correctedCounted, setCorrectedCounted] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctedNotes, setCorrectedNotes] = useState("");
  const today = todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["caixa", today, isManager],
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

      const [cashPayments, cashExpenses, manualReceipts, cashMovements, corrections, reserve, reserveHistory, profiles] = await Promise.all([
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
              .select("id,movement_type,amount,reason,created_at,supply_source")
              .eq("session_id", openSession.id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("cash_session_corrections")
          .select("*")
          .order("changed_at", { ascending: false })
          .limit(100),
        supabase.rpc("cash_reserve_balance"),
        supabase
          .from("cash_movements")
          .select("id,movement_type,amount,reason,created_at,supply_source,is_retrospective,created_by,cash_sessions(business_date)")
          .order("created_at", { ascending: false })
          .limit(100),
        isManager
          ? supabase.from("profiles").select("id,full_name,email")
          : Promise.resolve({ data: [], error: null }),
      ]);

      for (const result of [cashPayments, cashExpenses, manualReceipts, cashMovements, corrections, reserve, reserveHistory, profiles]) {
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
        reserveBalance: Number(reserve.data ?? 0),
        reserveHistory: reserveHistory.data ?? [],
        profiles: profiles.data ?? [],
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
  const reserveBalance = Number(data?.reserveBalance ?? 0);
  const returnTooHigh = movementType === "reserve_return" && parseNumber(movementAmount) > Math.max(reserveBalance, 0);
  const historySession = sessions.find((s: any) => s.id === historySessionId && s.status === "closed") as any;
  const historyValue = parseNumber(historyAmount);
  const historyTooHigh = historyValue > Math.max(reserveBalance, 0);
  const revisedHistoricalDifference = historySession
    ? Number(historySession.counted_cash ?? 0) - Number(historySession.expected_cash ?? 0) - historyValue
    : 0;
  const reserveMovements = (data?.reserveHistory ?? []).filter(
    (m: any) => m.movement_type === "withdrawal" || m.supply_source === "reserve",
  );

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
        label: `${isSupply ? (m.supply_source === "reserve" ? "Devolução da reserva" : "Suprimento externo") : "Sangria"} · ${m.reason}`,
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

      const { error } = movementType === "reserve_return"
        ? await supabase.rpc("register_cash_reserve_return", {
            _session_id: open.id,
            _amount: amount,
            _reason: reason,
          })
        : await supabase.rpc("register_cash_movement", {
            _session_id: open.id,
            _movement_type: movementType,
            _amount: amount,
            _reason: reason,
          });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(movementType === "withdrawal" ? "Sangria registrada na reserva." : movementType === "reserve_return" ? "Dinheiro devolvido da reserva ao caixa." : "Suprimento externo registrado.");
      setMovementAmount("");
      setMovementReason("");
      await refreshCash();
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const reconcileReserveReturn = useMutation({
    mutationFn: async () => {
      if (!isManager) throw new Error("Somente sócios e administradores podem regularizar caixas anteriores.");
      if (!historySession?.id) throw new Error("Selecione o caixa encerrado ao qual a reserva retornou.");
      if (!historyAmount.trim() || historyValue <= 0) throw new Error("Informe um valor maior que zero.");
      if (!historyReason.trim()) throw new Error("Informe o motivo e o contexto da devolução anterior.");
      if (historyTooHigh) throw new Error("Valor superior à reserva registrada.");
      const { error } = await supabase.rpc("register_cash_reserve_return_historical", {
        _session_id: historySession.id,
        _amount: historyValue,
        _reason: historyReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Devolução histórica registrada, com auditoria do fechamento.");
      setHistorySessionId("");
      setHistoryAmount("");
      setHistoryReason("");
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Situação" value={open ? "Caixa aberto" : "Caixa fechado"} tone={open ? "positive" : "default"} />
          <StatCard label="Valor inicial" value={brl(open?.opening_cash ?? 0)} />
          <StatCard label="Esperado agora" value={brl(expected)} tone="gold" />
          <StatCard label="Última diferença" value={brl(latestClosed?.difference ?? 0)} tone={Number(latestClosed?.difference ?? 0) === 0 ? "positive" : "negative"} />
          <StatCard label="Reserva guardada" value={brl(reserveBalance)} tone="gold" />
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
          description="Sangria guarda dinheiro na reserva. Devolução traz dinheiro da reserva ao caixa. Suprimento externo não usa a reserva. Nenhuma dessas movimentações é receita."
        >
          <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
            <Field label="Tipo">
              <NativeSelect value={movementType} onChange={(value) => setMovementType(value as CashMovementType)} disabled={!open}>
                <option value="withdrawal">Sangria</option>
                <option value="reserve_return">Devolver da reserva</option>
                <option value="supply">Suprimento externo</option>
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
                placeholder={movementType === "withdrawal" ? "Ex.: retirada para cofre" : movementType === "reserve_return" ? "Ex.: troco devolvido do cofre" : "Ex.: aporte de dinheiro externo"}
                disabled={!open}
              />
            </Field>
            <Button
              className="w-full md:w-auto"
              disabled={!open || registerMovement.isPending || !movementAmount.trim() || !movementReason.trim() || withdrawalTooHigh || returnTooHigh}
              onClick={() => registerMovement.mutate()}
            >
              {registerMovement.isPending ? "Registrando…" : movementType === "withdrawal" ? "Registrar sangria" : movementType === "reserve_return" ? "Devolver ao caixa" : "Registrar suprimento"}
            </Button>
          </div>
          {!open ? <p className="mt-3 text-xs text-muted-foreground">Abra o caixa para registrar sangrias, devoluções e suprimentos. Não lance novamente no caixa de hoje uma devolução feita num caixa anterior: isso exige conciliação do fechamento de origem.</p> : null}
          {open && movementType === "withdrawal" ? (
            <p className={`mt-3 text-xs ${withdrawalTooHigh ? "text-destructive" : "text-muted-foreground"}`}>
              Disponível para sangria: {brl(Math.max(expected, 0))}{withdrawalTooHigh ? " · o valor informado ultrapassa o dinheiro disponível." : ""}
            </p>
          ) : null}
          {movementType === "reserve_return" ? (
            <p className={`mt-3 text-xs ${returnTooHigh ? "text-destructive" : "text-muted-foreground"}`}>
              Reserva registrada disponível: {brl(Math.max(reserveBalance, 0))}{returnTooHigh ? " · não é possível devolver mais do que está guardado." : ""}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Reserva de sangrias" description="Histórico do dinheiro separado do caixa. Cada sangria aumenta o guardado; cada devolução diminui. Os sócios podem conferir o horário, motivo e responsável.">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <p className="text-xs text-muted-foreground">Saldo guardado registrado</p>
              <p className="mt-1 font-display text-2xl">{brl(reserveBalance)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 p-4 text-xs text-muted-foreground">
              A reserva corresponde às movimentações lançadas no sistema; dinheiro movimentado sem registro ainda precisa ser conciliado. Não contabilize a mesma devolução duas vezes.
            </div>
          </div>
          {reserveMovements.length === 0 ? (
            <EmptyState title="Nenhuma movimentação na reserva" description="As sangrias e devoluções registradas aparecerão aqui." />
          ) : (
            <TableShell>
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Registrado em</th>
                    <th className="px-4 py-3">Operação e motivo</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3 text-right">Reserva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reserveMovements.map((m: any) => {
                    const isWithdrawal = m.movement_type === "withdrawal";
                    const actor = (data?.profiles ?? []).find((p: any) => p.id === m.created_by);
                    const actorName = actor?.full_name || actor?.email || (m.created_by === user?.id ? displayName : `Usuário ${String(m.created_by ?? "").slice(0, 8)}`);
                    return (
                      <tr key={m.id}>
                        <td className="px-4 py-3 text-muted-foreground">{dateTimeBR(m.created_at)}</td>
                        <td className="px-4 py-3">
                          {isWithdrawal ? "Sangria para reserva" : "Devolução ao caixa"} · {m.reason}
                          {m.is_retrospective ? <span className="mt-0.5 block text-xs text-muted-foreground">Regularização referente ao caixa de {String((Array.isArray(m.cash_sessions) ? m.cash_sessions[0] : m.cash_sessions)?.business_date ?? "").split("-").reverse().join("/")}; registrada posteriormente.</span> : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{actorName}</td>
                        <td className={`px-4 py-3 text-right font-medium ${isWithdrawal ? "text-success" : "text-destructive"}`}>{isWithdrawal ? "+" : "-"}{brl(m.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
          )}
        </SectionCard>

        {isManager ? (
          <SectionCard
            title="Regularizar devolução de um caixa anterior"
            description="Use somente se o dinheiro já saiu da reserva e voltou a um caixa que foi encerrado. O lançamento fica vinculado à data do caixa original, mantendo a data real do registro e uma correção auditada."
          >
            <div className="grid gap-3 md:grid-cols-[minmax(210px,1fr)_150px_minmax(210px,1.4fr)] md:items-end">
              <Field label="Caixa em que o dinheiro voltou">
                <NativeSelect value={historySessionId} onChange={setHistorySessionId}>
                  <option value="">Selecione o fechamento</option>
                  {sessions.filter((item: any) => item.status === "closed").map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.business_date ? item.business_date.split("-").reverse().join("/") : dateTimeBR(item.closed_at)} · {brl(item.counted_cash)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Valor devolvido">
                <Input inputMode="decimal" placeholder="Ex.: 50,00" value={historyAmount} onChange={(event) => setHistoryAmount(event.target.value)} />
              </Field>
              <Field label="Motivo e referência">
                <Input placeholder="Ex.: R$ 50 da sangria usados como troco ontem" value={historyReason} onChange={(event) => setHistoryReason(event.target.value)} />
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Saldo registrado na reserva: {brl(reserveBalance)}. O dinheiro contado no fechamento não será alterado.
              {historyTooHigh ? <span className="text-destructive"> O valor excede a reserva.</span> : null}
            </p>
            {historySession ? (
              <div className="mt-3 grid gap-3 rounded-2xl border border-border bg-muted/35 p-4 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Esperado antes</p><p className="font-medium">{brl(historySession.expected_cash)}</p></div>
                <div><p className="text-xs text-muted-foreground">Esperado após o registro</p><p className="font-medium">{brl(Number(historySession.expected_cash ?? 0) + historyValue)}</p></div>
                <div><p className="text-xs text-muted-foreground">Diferença após registro</p><p className={`font-medium ${Math.abs(revisedHistoricalDifference) < 0.01 ? "text-success" : "text-destructive"}`}>{brl(revisedHistoricalDifference)}</p></div>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">Atenção: se houver divergência após registrar a devolução, confira também todas as despesas e a contagem física do fechamento anterior. Não altere a contagem sem conferência.</p>
            <Button
              className="mt-4"
              disabled={reconcileReserveReturn.isPending || !historySession || !historyAmount.trim() || historyValue <= 0 || historyTooHigh || !historyReason.trim()}
              onClick={() => reconcileReserveReturn.mutate()}
            >
              {reconcileReserveReturn.isPending ? "Regularizando…" : "Regularizar devolução no caixa anterior"}
            </Button>
          </SectionCard>
        ) : null}

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
