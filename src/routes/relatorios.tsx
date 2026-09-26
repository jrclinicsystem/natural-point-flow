import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
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

type ReportEntry = {
  key: string;
  type: "sale" | "manual";
  date: string;
  description: string;
  gross: number;
  fees: number;
  net: number;
};

const one = (value: any) => (Array.isArray(value) ? value[0] : value);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function RelatoriosPage() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [period, setPeriod] = useState<"today" | "30d" | "month" | "year" | "custom">("month");

  const applyPeriod = (next: "today" | "30d" | "month" | "year") => {
    const today = todayISO();
    setPeriod(next);
    setTo(today);
    if (next === "today") {
      setFrom(today);
      return;
    }
    if (next === "month") {
      setFrom(today.slice(0, 7) + "-01");
      return;
    }
    if (next === "year") {
      setFrom(today.slice(0, 4) + "-01-01");
      return;
    }
    const date = new Date(today + "T12:00:00");
    date.setDate(date.getDate() - 29);
    setFrom(date.toISOString().slice(0, 10));
  };

  const { data, isLoading } = useQuery({
    queryKey: ["np-reports", from, to],
    queryFn: async () => {
      const start = `${from}T00:00:00-03:00`;
      const end = `${to}T23:59:59.999-03:00`;
      const [payments, manualReceipts, expenses, cashMovements, cashSessions, reserve, profiles] = await Promise.all([
        supabase
          .from("sale_payments")
          .select("id,sale_id,payment_method_id,amount,fee_amount,net_amount,created_at,payment_methods!inner(name,kind),sales(customer_name,status,sold_at)")
          .neq("payment_methods.kind", "credit_account")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at"),
        supabase
          .from("accounts_receivable")
          .select("id,customer_name,description,amount,issue_date,status,payment_method_id,paid_at,payment_methods(name,kind)")
          .is("sale_id", null)
          .eq("status", "paid")
          .not("paid_at", "is", null)
          .gte("paid_at", start)
          .lte("paid_at", end)
          .order("paid_at"),
        supabase
          .from("expenses")
          .select("id,expense_date,description,amount,status,payment_method_id,payment_methods(name,kind),expense_categories(name)")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .order("expense_date"),
        supabase
          .from("cash_movements")
          .select("id,movement_type,amount,reason,created_at,supply_source,created_by,cash_sessions!inner(business_date)")
          .gte("cash_sessions.business_date", from)
          .lte("cash_sessions.business_date", to)
          .order("created_at"),
        supabase
          .from("cash_sessions")
          .select("*")
          .gte("business_date", from)
          .lte("business_date", to)
          .order("business_date", { ascending: false }),
        supabase.rpc("cash_reserve_balance"),
        supabase.from("profiles").select("id,full_name,email"),
      ]);
      if (payments.error) throw payments.error;
      if (manualReceipts.error) throw manualReceipts.error;
      if (expenses.error) throw expenses.error;
      if (cashMovements.error) throw cashMovements.error;
      if (cashSessions.error) throw cashSessions.error;
      if (reserve.error) throw reserve.error;
      if (profiles.error) throw profiles.error;
      return {
        payments: payments.data ?? [],
        manualReceipts: manualReceipts.data ?? [],
        expenses: expenses.data ?? [],
        cashMovements: cashMovements.data ?? [],
        cashSessions: cashSessions.data ?? [],
        reserveBalance: Number(reserve.data ?? 0),
        profiles: profiles.data ?? [],
      };
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const entries = useMemo<ReportEntry[]>(() => {
    const salesMap = new Map<string, ReportEntry>();

    for (const raw of data?.payments ?? []) {
      const p: any = raw;
      const sale = one(p.sales);
      if (sale?.status === "cancelled") continue;

      const gross = Number(p.amount ?? 0);
      const fees = Number(p.fee_amount ?? 0);
      const net = Number(p.net_amount ?? gross - fees);
      const key = String(p.sale_id ?? p.id);
      const current = salesMap.get(key) ?? {
        key: `sale-${key}`,
        type: "sale" as const,
        date: sale?.sold_at || p.created_at,
        description: sale?.customer_name ? `Venda · ${sale.customer_name}` : "Venda balcão",
        gross: 0,
        fees: 0,
        net: 0,
      };
      current.gross += gross;
      current.fees += fees;
      current.net += net;
      salesMap.set(key, current);
    }

    const manualEntries = (data?.manualReceipts ?? []).map((row: any) => {
      const amount = Number(row.amount ?? 0);
      return {
        key: `manual-${row.id}`,
        type: "manual" as const,
        date: row.paid_at || row.issue_date,
        description: row.description || row.customer_name || "Entrada manual",
        gross: amount,
        fees: 0,
        net: amount,
      };
    });

    return [...salesMap.values(), ...manualEntries].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data]);

  const paidExpenses = useMemo(
    () => (data?.expenses ?? []).filter((expense: any) => expense.status === "paid"),
    [data],
  );

  const chart = useMemo(() => {
    const map = new Map<string, { date: string; entradas: number; despesas: number }>();
    for (const entry of entries) {
      const d = String(entry.date).slice(0, 10);
      const item = map.get(d) ?? { date: d, entradas: 0, despesas: 0 };
      item.entradas += entry.net;
      map.set(d, item);
    }
    for (const expense of paidExpenses) {
      const d = String(expense.expense_date).slice(0, 10);
      const item = map.get(d) ?? { date: d, entradas: 0, despesas: 0 };
      item.despesas += Number(expense.amount ?? 0);
      map.set(d, item);
    }
    return [...map.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({ ...x, label: x.date.slice(8, 10) + "/" + x.date.slice(5, 7) }));
  }, [entries, paidExpenses]);

  const cashMovements = data?.cashMovements ?? [];
  const totalWithdrawals = cashMovements
    .filter((movement: any) => movement.movement_type === "withdrawal")
    .reduce((sum: number, movement: any) => sum + Number(movement.amount ?? 0), 0);
  const totalSupplies = cashMovements
    .filter((movement: any) => movement.movement_type === "supply")
    .reduce((sum: number, movement: any) => sum + Number(movement.amount ?? 0), 0);
  const reserveReturns = cashMovements.filter((movement: any) => movement.movement_type === "supply" && movement.supply_source === "reserve");
  const totalReserveReturns = reserveReturns.reduce((sum: number, movement: any) => sum + Number(movement.amount ?? 0), 0);
  const reserveTransactions = cashMovements.filter((movement: any) => movement.movement_type === "withdrawal" || movement.supply_source === "reserve");
  const reserveBalance = Number(data?.reserveBalance ?? 0);

  const byMethod = useMemo(() => {
    const emptyMethod = (name: string) => ({
      name,
      gross: 0,
      fees: 0,
      net: 0,
      expenses: 0,
      withdrawals: 0,
      supplies: 0,
      balance: 0,
    });
    const map = new Map<string, ReturnType<typeof emptyMethod>>();
    for (const raw of data?.payments ?? []) {
      const p: any = raw;
      const sale = one(p.sales);
      if (sale?.status === "cancelled") continue;
      const method = one(p.payment_methods);
      const name = method?.name ?? "Outro";
      const row = map.get(name) ?? emptyMethod(name);
      const gross = Number(p.amount ?? 0);
      const fees = Number(p.fee_amount ?? 0);
      row.gross += gross;
      row.fees += fees;
      row.net += Number(p.net_amount ?? gross - fees);
      map.set(name, row);
    }
    for (const raw of data?.manualReceipts ?? []) {
      const receipt: any = raw;
      const method = one(receipt.payment_methods);
      const name = method?.name ?? "Outro";
      const amount = Number(receipt.amount ?? 0);
      const row = map.get(name) ?? emptyMethod(name);
      row.gross += amount;
      row.net += amount;
      map.set(name, row);
    }
    for (const raw of paidExpenses) {
      const expense: any = raw;
      const method = one(expense.payment_methods);
      const name = method?.name ?? "Outro";
      const row = map.get(name) ?? emptyMethod(name);
      row.expenses += Number(expense.amount ?? 0);
      map.set(name, row);
    }
    if (totalWithdrawals > 0 || totalSupplies > 0) {
      const cashRow = map.get("Dinheiro") ?? emptyMethod("Dinheiro");
      cashRow.withdrawals += totalWithdrawals;
      cashRow.supplies += totalSupplies;
      map.set("Dinheiro", cashRow);
    }
    return [...map.values()]
      .map((row) => ({
        ...row,
        balance: row.net + row.supplies - row.expenses - row.withdrawals,
      }))
      .sort((a, b) => b.gross - a.gross);
  }, [data, paidExpenses, totalSupplies, totalWithdrawals]);
  const paymentRows = useMemo(() => {
    const rows = byMethod.map((row) => ({ ...row, isWithdrawalSummary: false }));
    if (totalWithdrawals <= 0) return rows;

    const withdrawalRow = {
      name: "Sangria",
      gross: 0,
      fees: 0,
      net: 0,
      expenses: 0,
      withdrawals: totalWithdrawals,
      supplies: 0,
      balance: -totalWithdrawals,
      isWithdrawalSummary: true,
    };
    const cashIndex = rows.findIndex((row) => row.name.toLocaleLowerCase("pt-BR") === "dinheiro");
    rows.splice(cashIndex >= 0 ? cashIndex + 1 : rows.length, 0, withdrawalRow);
    return rows;
  }, [byMethod, totalWithdrawals]);
  const salesNet = entries.filter((entry) => entry.type === "sale").reduce((sum, entry) => sum + entry.net, 0);
  const manualNet = entries.filter((entry) => entry.type === "manual").reduce((sum, entry) => sum + entry.net, 0);
  const totalEntries = salesNet + manualNet;
  const totalFees = entries.reduce((sum, entry) => sum + entry.fees, 0);
  const totalExpenses = paidExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount ?? 0), 0);
  const result = totalEntries - totalExpenses;

  const exportCsv = () => {
    const lines = [
      ["Tipo", "Data", "Descrição", "Bruto", "Taxas", "Líquido"],
      ...entries.map((entry) => [
        entry.type === "sale" ? "Venda" : "Entrada manual",
        dateBR(entry.date),
        entry.description,
        entry.gross.toFixed(2),
        entry.fees.toFixed(2),
        entry.net.toFixed(2),
      ]),
      ...paidExpenses.map((expense: any) => [
        "Despesa",
        dateBR(expense.expense_date),
        expense.description,
        (-Number(expense.amount)).toFixed(2),
        "0.00",
        (-Number(expense.amount)).toFixed(2),
      ]),
      ...cashMovements.map((movement: any) => {
        const session = one(movement.cash_sessions);
        const isSupply = movement.movement_type === "supply";
        const amount = Number(movement.amount ?? 0);
        return [
          isSupply ? (movement.supply_source === "reserve" ? "Devolução da reserva" : "Suprimento externo") : "Sangria",
          dateBR(session?.business_date || movement.created_at),
          movement.reason || (isSupply ? "Suprimento de caixa" : "Sangria de caixa"),
          (isSupply ? amount : -amount).toFixed(2),
          "0.00",
          (isSupply ? amount : -amount).toFixed(2),
        ];
      }),
    ];
    const csv = lines.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `natural-point-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!data) return;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return;

    const movementRows = [
      ...entries.map((entry) => ({
        date: entry.date,
        type: entry.type === "sale" ? "Entrada · Venda" : "Entrada · Manual",
        description: entry.description,
        gross: entry.gross,
        fees: entry.fees,
        net: entry.net,
        direction: "in" as const,
      })),
      ...paidExpenses.map((expense: any) => ({
        date: expense.expense_date,
        type: "Saída · Despesa",
        description: expense.description,
        gross: Number(expense.amount ?? 0),
        fees: 0,
        net: Number(expense.amount ?? 0),
        direction: "out" as const,
      })),
      ...cashMovements.map((movement: any) => {
        const session = one(movement.cash_sessions);
        const isSupply = movement.movement_type === "supply";
        return {
          date: session?.business_date || movement.created_at,
          type: isSupply ? (movement.supply_source === "reserve" ? "Entrada · Devolução da reserva" : "Entrada · Suprimento externo") : "Saída · Sangria",
          description: movement.reason || (isSupply ? "Suprimento de caixa" : "Sangria de caixa"),
          gross: Number(movement.amount ?? 0),
          fees: 0,
          net: Number(movement.amount ?? 0),
          direction: isSupply ? ("in" as const) : ("out" as const),
        };
      }),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const summaryCards = [
      ["Entradas líquidas", brl(totalEntries)],
      ["Saídas pagas", brl(totalExpenses)],
      ["Taxas", brl(totalFees)],
      ["Reserva guardada (atual)", brl(reserveBalance)],
      ["Resultado líquido", brl(result)],
    ]
      .map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join("");

    const movementTable = movementRows.length
      ? movementRows
          .map(
            (row) => `<tr>
              <td>${escapeHtml(dateBR(row.date))}</td>
              <td>${escapeHtml(row.type)}</td>
              <td>${escapeHtml(row.description)}</td>
              <td class="num">${escapeHtml(brl(row.gross))}</td>
              <td class="num fee">${row.fees ? escapeHtml(brl(row.fees)) : "-"}</td>
              <td class="num ${row.direction === "out" ? "out" : "in"}">${row.direction === "out" ? "-" : "+"}${escapeHtml(brl(row.net))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="empty">Sem movimentações no período.</td></tr>`;

    const reserveTable = reserveTransactions.length
      ? reserveTransactions.map((movement: any) => {
          const isWithdrawal = movement.movement_type === "withdrawal";
          const session = one(movement.cash_sessions);
          const actor = (data?.profiles ?? []).find((p: any) => p.id === movement.created_by);
          return `<tr><td>${escapeHtml(dateBR(session?.business_date || movement.created_at))}</td><td>${escapeHtml(isWithdrawal ? "Sangria" : "Devolução ao caixa")}</td><td>${escapeHtml(movement.reason)}</td><td>${escapeHtml(actor?.full_name || actor?.email || String(movement.created_by ?? "").slice(0, 8))}</td><td class="num ${isWithdrawal ? "in" : "out"}">${isWithdrawal ? "+" : "-"}${escapeHtml(brl(movement.amount))}</td></tr>`;
        }).join("")
      : `<tr><td colspan="5" class="empty">Sem movimentações de reserva no período.</td></tr>`;

    const paymentTable = paymentRows.length
      ? paymentRows
          .map(
            (row) => `<tr>
              <td><strong>${escapeHtml(row.name)}</strong>${row.isWithdrawalSummary ? "<br><small>Valor retirado para o cofre</small>" : ""}</td>
              <td class="num">${row.isWithdrawalSummary ? "—" : escapeHtml(brl(row.gross))}</td>
              <td class="num fee">${row.isWithdrawalSummary ? "—" : escapeHtml(brl(row.fees))}</td>
              <td class="num out">${row.isWithdrawalSummary ? "—" : `${row.expenses ? "-" : ""}${escapeHtml(brl(row.expenses))}`}</td>
              <td class="num out">${row.withdrawals ? "-" : ""}${escapeHtml(brl(row.withdrawals))}</td>
              <td class="num ${row.balance >= 0 ? "in" : "out"}">${row.isWithdrawalSummary ? "—" : escapeHtml(brl(row.balance))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="empty">Sem movimentações no período.</td></tr>`;

    printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório Financeiro Natural Point</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #32183a; font-family: Arial, Helvetica, sans-serif; background: #fffdf8; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #4c1758; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: #4c1758; color: #e2b95f; font: 700 22px Georgia, serif; }
  h1 { margin: 0; font: 700 25px Georgia, serif; }
  .sub { margin-top: 5px; color: #75687a; font-size: 11px; }
  .period { text-align: right; font-size: 11px; color: #75687a; line-height: 1.5; }
  .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 9px; margin: 18px 0; }
  .metric { border: 1px solid #e8dfd5; border-radius: 12px; padding: 11px; background: #fff; }
  .metric span { display: block; color: #75687a; text-transform: uppercase; letter-spacing: .06em; font-size: 8px; font-weight: 700; }
  .metric strong { display: block; margin-top: 6px; font: 700 16px Georgia, serif; }
  .section { margin-top: 20px; break-inside: avoid; }
  .section h2 { margin: 0 0 8px; font: 700 15px Georgia, serif; }
  .section p { margin: -3px 0 10px; color: #75687a; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; background: #fff; font-size: 9px; }
  th { text-align: left; padding: 8px 7px; background: #f4efe8; color: #65576a; font-size: 8px; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 8px 7px; border-bottom: 1px solid #eee7df; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .fee, .out { color: #9a3744; }
  .in { color: #27744c; font-weight: 700; }
  .empty { text-align: center; color: #8b7f8e; padding: 18px; }
  .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totals table { width: 280px; }
  .totals td { border: 0; padding: 4px 0 4px 12px; }
  .totals td:first-child { color: #75687a; }
  .result { font-weight: 700; font-size: 11px; border-top: 1px solid #d9cec5 !important; padding-top: 7px !important; }
  .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e8dfd5; color: #8b7f8e; font-size: 8px; text-align: center; }
  @media print { body { background: #fff; } .section { break-inside: auto; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand"><div class="logo">N</div><div><h1>Relatório Financeiro</h1><div class="sub">Natural Point · Gestão financeira e operacional</div></div></div>
    <div class="period"><strong>Período</strong><br>${escapeHtml(dateBR(from))} a ${escapeHtml(dateBR(to))}<br>Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</div>
  </div>
  <div class="metrics">${summaryCards}</div>
  <div class="section">
    <h2>Entradas e saídas</h2>
    <p>Valores de vendas já aparecem líquidos das taxas configuradas. Entradas manuais e despesas pagas também estão incluídas.</p>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Bruto</th><th class="num">Taxa</th><th class="num">Líquido</th></tr></thead><tbody>${movementTable}</tbody></table>
    <div class="totals"><table><tbody>
      <tr><td>Entradas líquidas</td><td class="num in">${escapeHtml(brl(totalEntries))}</td></tr>
      <tr><td>Saídas pagas</td><td class="num out">-${escapeHtml(brl(totalExpenses))}</td></tr>
      <tr><td>Taxas descontadas</td><td class="num fee">${escapeHtml(brl(totalFees))}</td></tr>
      <tr><td class="result">Resultado líquido</td><td class="num result ${result >= 0 ? "in" : "out"}">${escapeHtml(brl(result))}</td></tr>
    </tbody></table></div>
  </div>
  <div class="section">
    <h2>Reserva de sangrias</h2>
    <p>Saldo registrado atual: ${escapeHtml(brl(reserveBalance))}. No período: guardado ${escapeHtml(brl(totalWithdrawals))}, devolvido ${escapeHtml(brl(totalReserveReturns))}. Transferências não são receitas nem despesas.</p>
    <table><thead><tr><th>Data</th><th>Operação</th><th>Motivo</th><th>Responsável</th><th class="num">Reserva</th></tr></thead><tbody>${reserveTable}</tbody></table>
  </div>
  <div class="section">
    <h2>Saldo por forma de pagamento</h2>
    <p>Entradas líquidas menos despesas e sangrias. Suprimentos aumentam somente o saldo em dinheiro.</p>
    <table><thead><tr><th>Forma</th><th class="num">Entradas</th><th class="num">Taxas</th><th class="num">Despesas</th><th class="num">Sangrias</th><th class="num">Saldo</th></tr></thead><tbody>${paymentTable}</tbody></table>
  </div>
  <div class="footer">Natural Point · Relatório gerado automaticamente pelo sistema</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 180); });</script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <AppLayout
      managerOnly
      title="Relatórios"
      subtitle="Entradas, saídas, taxas e resultado líquido por período"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={!data}>
            <Printer className="mr-2 h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <SectionCard title="Período" description="Use um atalho ou escolha um intervalo personalizado.">
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              ["today", "Hoje"],
              ["30d", "30 dias"],
              ["month", "Mês"],
              ["year", "Ano"],
            ] as const).map(([value, label]) => (
              <Button key={value} type="button" size="sm" variant={period === value ? "default" : "outline"} onClick={() => applyPeriod(value)}>
                {label}
              </Button>
            ))}
            <Button type="button" size="sm" variant={period === "custom" ? "default" : "outline"} onClick={() => setPeriod("custom")}>
              Personalizado
            </Button>
          </div>
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field label="De"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPeriod("custom"); }} /></Field>
            <Field label="Até"><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPeriod("custom"); }} /></Field>
          </div>
        </SectionCard>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Entradas líquidas" value={brl(totalEntries)} tone="positive" />
          <StatCard label="Vendas líquidas" value={brl(salesNet)} />
          <StatCard label="Saídas pagas" value={brl(totalExpenses)} tone="negative" />
          <StatCard label="Resultado líquido" value={brl(result)} tone={result >= 0 ? "positive" : "negative"} />
          <StatCard label="Taxas de pagamento" value={brl(totalFees)} tone="gold" />
        </div>

        <SectionCard title="Entradas x despesas" description="Entradas já líquidas das taxas configuradas nas formas de pagamento.">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando relatório…</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(value) => brl(Number(value))} />
                  <Bar dataKey="entradas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="despesas" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Reserva de sangrias" description="Movimentações de dinheiro entre o caixa e a reserva. O saldo atual considera todos os períodos; a tabela abaixo respeita o filtro selecionado.">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Saldo atual guardado" value={brl(reserveBalance)} tone="gold" />
            <StatCard label="Guardado no período" value={brl(totalWithdrawals)} />
            <StatCard label="Devolvido no período" value={brl(totalReserveReturns)} />
          </div>
          <TableShell>
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Movimentação</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3 text-right">Reserva</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reserveTransactions.map((movement: any) => {
                  const isWithdrawal = movement.movement_type === "withdrawal";
                  const session = one(movement.cash_sessions);
                  const actor = (data?.profiles ?? []).find((p: any) => p.id === movement.created_by);
                  return (
                    <tr key={movement.id}>
                      <td className="px-4 py-3">{dateBR(session?.business_date || movement.created_at)}</td>
                      <td className="px-4 py-3">{isWithdrawal ? "Sangria para reserva" : "Devolução ao caixa"}</td>
                      <td className="px-4 py-3">{movement.reason}</td>
                      <td className="px-4 py-3">{actor?.full_name || actor?.email || `Usuário ${String(movement.created_by ?? "").slice(0, 8)}`}</td>
                      <td className={`px-4 py-3 text-right font-medium ${isWithdrawal ? "text-success" : "text-destructive"}`}>{isWithdrawal ? "+" : "-"}{brl(movement.amount)}</td>
                    </tr>
                  );
                })}
                {!reserveTransactions.length && <tr><td colSpan={5} className="px-4 py-7 text-center text-muted-foreground">Nenhuma movimentação da reserva neste período.</td></tr>}
              </tbody>
            </table>
          </TableShell>
        </SectionCard>
        <SectionCard title="Saldo por forma de pagamento" description="Entradas líquidas menos despesas na mesma forma. Sangrias reduzem somente o dinheiro físico; suprimentos aumentam esse saldo.">
          <TableShell>
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-3">Forma</th><th className="px-4 py-3">Entradas</th><th className="px-4 py-3">Taxas</th><th className="px-4 py-3">Despesas</th><th className="px-4 py-3">Sangrias</th><th className="px-4 py-3">Saldo</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentRows.map((row) => (
                  <tr key={row.name} className={row.isWithdrawalSummary ? "bg-amber-50/60" : undefined}>
                    <td className="px-4 py-3 font-medium">
                      {row.name}
                      {row.isWithdrawalSummary ? <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Valor retirado para o cofre</span> : null}
                    </td>
                    <td className="px-4 py-3">{row.isWithdrawalSummary ? "—" : brl(row.gross)}</td>
                    <td className="px-4 py-3 text-destructive">{row.isWithdrawalSummary ? "—" : row.fees > 0 ? `-${brl(row.fees)}` : brl(0)}</td>
                    <td className="px-4 py-3 text-destructive">{row.isWithdrawalSummary ? "—" : row.expenses > 0 ? `-${brl(row.expenses)}` : brl(0)}</td>
                    <td className="px-4 py-3 text-destructive">{row.withdrawals > 0 ? `-${brl(row.withdrawals)}` : brl(0)}</td>
                    <td className={`px-4 py-3 font-semibold ${row.balance >= 0 ? "text-success" : "text-destructive"}`}>{row.isWithdrawalSummary ? "—" : brl(row.balance)}</td>
                  </tr>
                ))}
                {paymentRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sem movimentações no período.</td></tr>}
              </tbody>
            </table>
          </TableShell>
        </SectionCard>
        <SectionCard title="Fechamentos de caixa" description="Conferência do dinheiro físico em cada caixa do período selecionado.">
          <TableShell>
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Inicial</th>
                  <th className="px-4 py-3">Esperado</th>
                  <th className="px-4 py-3">Contado</th>
                  <th className="px-4 py-3">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.cashSessions ?? []).map((row: any) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{dateBR(row.business_date)}</td>
                    <td className="px-4 py-3">{row.status === "closed" ? "Fechado" : "Aberto"}</td>
                    <td className="px-4 py-3">{brl(row.opening_cash)}</td>
                    <td className="px-4 py-3">{brl(row.expected_cash)}</td>
                    <td className="px-4 py-3">{row.counted_cash == null ? "-" : brl(row.counted_cash)}</td>
                    <td className={`px-4 py-3 font-medium ${row.status === "closed" && Math.abs(Number(row.difference ?? 0)) >= 0.01 ? "text-destructive" : "text-success"}`}>
                      {row.status === "closed" ? brl(row.difference) : "-"}
                    </td>
                  </tr>
                ))}
                {(data?.cashSessions ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum caixa encontrado no período.</td></tr>}
              </tbody>
            </table>
          </TableShell>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
