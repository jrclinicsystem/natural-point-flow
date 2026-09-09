import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { AMOUNT_KEYS, fetchList, inRange, n, pick, s, sum, type Row } from "@/lib/db";
import { brl, dateTimeBR, monthStartISO, todayISO } from "@/lib/format";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Natural Point Finance" },
      {
        name: "description",
        content: "Vendas do dia, resultado do mês, caixa, contas e estoque baixo da Natural Point.",
      },
      { property: "og:title", content: "Dashboard | Natural Point Finance" },
      { property: "og:description", content: "Resultado financeiro da Natural Point em tempo real." },
    ],
  }),
  component: DashboardPage,
});

const table = async (name: string, limit?: number) => {
  try {
    return await fetchList(name, limit ? { limit } : {});
  } catch {
    return [] as Row[];
  }
};

function DashboardPage() {
  const { isManager } = useAuth();
  const today = todayISO();
  const monthStart = monthStartISO();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", today],
    queryFn: async () => {
      const [sales, expenses, payable, receivable, products, cash] = await Promise.all([
        table("sales", 300),
        table("expenses", 300),
        table("accounts_payable", 300),
        table("accounts_receivable", 300),
        table("products", 500),
        table("cash_sessions", 30),
      ]);
      return { sales, expenses, payable, receivable, products, cash };
    },
  });

  const sales = data?.sales ?? [];
  const expenses = data?.expenses ?? [];
  const payable = data?.payable ?? [];
  const receivable = data?.receivable ?? [];
  const products = data?.products ?? [];
  const cash = data?.cash ?? [];

  const salesToday = sales.filter((r) => inRange(r, today, today));
  const salesMonth = sales.filter((r) => inRange(r, monthStart, today));
  const expensesMonth = expenses.filter((r) => inRange(r, monthStart, today));

  const revenueMonth = sum(salesMonth);
  const expenseMonth = sum(expensesMonth);
  const openCash = cash.find((c) => !pick(c, ["closed_at", "closing_at", "fechado_em"]));
  const cashValue = n(
    pick(openCash ?? {}, ["opening_amount", "initial_amount", "valor_inicial", "opening_balance"]),
  );

  const pendingPayable = payable.filter(
    (r) => s(pick(r, ["status"])).toLowerCase() !== "pago" && !pick(r, ["paid_at"]),
  );
  const pendingReceivable = receivable.filter(
    (r) => s(pick(r, ["status"])).toLowerCase() !== "recebido" && !pick(r, ["received_at"]),
  );
  const lowStock = products.filter((p) => {
    const stock = n(pick(p, ["stock", "current_stock", "quantity", "estoque", "saldo"]), -1);
    const min = n(pick(p, ["min_stock", "minimum_stock", "estoque_minimo"]), 0);
    return stock >= 0 && min > 0 && stock <= min;
  });

  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const iso = d.toISOString().slice(0, 10);
    return {
      dia: iso.slice(8, 10) + "/" + iso.slice(5, 7),
      entradas: sum(sales.filter((r) => inRange(r, iso, iso))),
      saidas: sum(expenses.filter((r) => inRange(r, iso, iso))),
    };
  });

  return (
    <AppLayout title="Dashboard" subtitle="Visão geral da operação e do resultado">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando dados…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Vendas de hoje" value={brl(sum(salesToday))} hint={`${salesToday.length} venda(s)`} />
            <StatCard label="Vendas do mês" value={brl(revenueMonth)} tone="gold" />
            <StatCard label="Despesas do mês" value={brl(expenseMonth)} tone="negative" />
            <StatCard
              label="Resultado do mês"
              value={brl(revenueMonth - expenseMonth)}
              tone={revenueMonth - expenseMonth >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Valor em caixa" value={brl(cashValue)} hint={openCash ? "Caixa aberto" : "Caixa fechado"} />
            <StatCard label="Contas a pagar" value={brl(sum(pendingPayable))} hint={`${pendingPayable.length} pendente(s)`} />
            <StatCard label="Contas a receber" value={brl(sum(pendingReceivable))} hint={`${pendingReceivable.length} em aberto`} />
            <StatCard label="Estoque baixo" value={String(lowStock.length)} tone={lowStock.length ? "negative" : "positive"} hint="itens no limite" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="np-card p-5">
              <h2 className="font-display text-lg">Entradas x Saídas (14 dias)</h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dia" fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                    <Tooltip formatter={(v) => brl(Number(v))} />
                    <Bar dataKey="entradas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="saidas" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="np-card p-5">
              <h2 className="font-display text-lg">Faturamento por dia</h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dia" fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                    <Tooltip formatter={(v) => brl(Number(v))} />
                    <Line type="monotone" dataKey="entradas" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="np-card p-5">
            <h2 className="font-display text-lg">Movimentações recentes</h2>
            <div className="mt-4 divide-y divide-border">
              {sales.slice(0, 8).map((sale, i) => (
                <div key={i} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    Venda
                    <span className="block text-xs text-muted-foreground">
                      {dateTimeBR(s(pick(sale, ["created_at", "date"])))}
                    </span>
                  </span>
                  <span className="text-success">{brl(n(pick(sale, AMOUNT_KEYS)))}</span>
                </div>
              ))}
              {!sales.length && (
                <p className="py-6 text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
              )}
            </div>
          </div>

          {isManager && lowStock.length > 0 && (
            <div className="np-card p-5">
              <h2 className="font-display text-lg">Alerta de estoque baixo</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {lowStock.slice(0, 10).map((p, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{s(pick(p, ["name", "nome"]), "Produto")}</span>
                    <span className="text-destructive">
                      {n(pick(p, ["stock", "current_stock", "quantity", "estoque", "saldo"]))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
