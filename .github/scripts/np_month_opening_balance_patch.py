from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Pattern not found for {label} in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


dashboard = Path("src/routes/dashboard.tsx")
reports = Path("src/routes/relatorios.tsx")

replace_once(
    dashboard,
    '''        supabase.from("cash_sessions").select("id,status,opened_at,closed_at,opening_cash,expected_cash,counted_cash,difference").order("opened_at", { ascending: false }).limit(3),
      ];''',
    '''        supabase.from("cash_sessions").select("id,status,opened_at,closed_at,opening_cash,expected_cash,counted_cash,difference").order("opened_at", { ascending: false }).limit(3),
        supabase.from("cash_sessions").select("id,business_date,opened_at,opening_cash,expected_cash,counted_cash,status").gte("business_date", monthStart).lte("business_date", today).order("business_date", { ascending: true }).order("opened_at", { ascending: true }).limit(1),
        supabase.from("cash_sessions").select("id,business_date,closed_at,expected_cash,counted_cash,status").eq("status", "closed").lt("business_date", monthStart).order("business_date", { ascending: false }).order("closed_at", { ascending: false }).limit(1),
      ];''',
    "dashboard cash carry queries",
)

replace_once(
    dashboard,
    '''      return {
        summary: results[0].data ?? [], sales: results[1].data ?? [], products: results[2].data ?? [], receivables: results[3].data ?? [], cash: results[4].data ?? [], expenses: isManager ? results[5].data ?? [] : [],
      };''',
    '''      return {
        summary: results[0].data ?? [],
        sales: results[1].data ?? [],
        products: results[2].data ?? [],
        receivables: results[3].data ?? [],
        cash: results[4].data ?? [],
        firstCashOfMonth: results[5].data?.[0] ?? null,
        previousClosedCash: results[6].data?.[0] ?? null,
        expenses: isManager ? results[7].data ?? [] : [],
      };''',
    "dashboard query result indexes",
)

replace_once(
    dashboard,
    '''  const lastClosed = (data?.cash ?? []).find((c: any) => c.status === "closed");
  const activeCash = openCash ? Number(metrics["cash"] ?? 0) : Number(lastClosed?.counted_cash ?? lastClosed?.expected_cash ?? 0);
  const pendingReceivables''',
    '''  const lastClosed = (data?.cash ?? []).find((c: any) => c.status === "closed");
  const activeCash = openCash ? Number(metrics["cash"] ?? 0) : Number(lastClosed?.counted_cash ?? lastClosed?.expected_cash ?? 0);
  const monthOpeningCash = Number(
    data?.firstCashOfMonth?.opening_cash ??
      data?.previousClosedCash?.counted_cash ??
      data?.previousClosedCash?.expected_cash ??
      0,
  );
  const pendingReceivables''',
    "dashboard opening balance calculation",
)

replace_once(
    dashboard,
    '''            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">''',
    '''            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">''',
    "dashboard metrics grid",
)

replace_once(
    dashboard,
    '''              <MetricCard
                label="Saldo ativo"''',
    '''              <MetricCard
                label="Saldo inicial do mês"
                value={brl(monthOpeningCash)}
                hint="Trazido do fechamento anterior · não conta como receita"
                icon={Wallet}
                tone="gold"
              />
              <MetricCard
                label="Saldo ativo"''',
    "dashboard opening balance card",
)

replace_once(
    reports,
    '''      const [payments, manualReceipts, expenses, cashMovements, cashSessions, reserve, profiles] = await Promise.all([''',
    '''      const [payments, manualReceipts, expenses, cashMovements, cashSessions, reserve, profiles, previousClosedCash] = await Promise.all([''',
    "reports query destructuring",
)

replace_once(
    reports,
    '''        supabase.rpc("cash_reserve_balance"),
        supabase.from("profiles").select("id,full_name,email"),
      ]);''',
    '''        supabase.rpc("cash_reserve_balance"),
        supabase.from("profiles").select("id,full_name,email"),
        supabase
          .from("cash_sessions")
          .select("id,business_date,closed_at,expected_cash,counted_cash,status")
          .eq("status", "closed")
          .lt("business_date", from)
          .order("business_date", { ascending: false })
          .order("closed_at", { ascending: false })
          .limit(1),
      ]);''',
    "reports previous closing query",
)

replace_once(
    reports,
    '''      if (profiles.error) throw profiles.error;
      return {''',
    '''      if (profiles.error) throw profiles.error;
      if (previousClosedCash.error) throw previousClosedCash.error;
      return {''',
    "reports previous closing error",
)

replace_once(
    reports,
    '''        reserveBalance: Number(reserve.data ?? 0),
        profiles: profiles.data ?? [],
      };''',
    '''        reserveBalance: Number(reserve.data ?? 0),
        profiles: profiles.data ?? [],
        previousClosedCash: previousClosedCash.data?.[0] ?? null,
      };''',
    "reports previous closing return",
)

replace_once(
    reports,
    '''  const cashMovements = data?.cashMovements ?? [];
  const totalWithdrawals''',
    '''  const cashSessions = data?.cashSessions ?? [];
  const firstCashSessionInPeriod = [...cashSessions].sort((a: any, b: any) =>
    String(a.business_date).localeCompare(String(b.business_date)),
  )[0];
  const periodOpeningCash = Number(
    firstCashSessionInPeriod?.opening_cash ??
      data?.previousClosedCash?.counted_cash ??
      data?.previousClosedCash?.expected_cash ??
      0,
  );

  const cashMovements = data?.cashMovements ?? [];
  const totalWithdrawals''',
    "reports opening balance calculation",
)

replace_once(
    reports,
    '''    const summaryCards = [
      ["Entradas líquidas", brl(totalEntries)],''',
    '''    const summaryCards = [
      ["Saldo inicial do período", brl(periodOpeningCash)],
      ["Entradas líquidas", brl(totalEntries)],''',
    "reports PDF opening balance metric",
)

replace_once(
    reports,
    '''  .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 9px; margin: 18px 0; }''',
    '''  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin: 18px 0 8px; }
  .carry-note { margin: 0 0 16px; color: #75687a; font-size: 9px; }''',
    "reports PDF metrics CSS",
)

replace_once(
    reports,
    '''  <div class="metrics">${summaryCards}</div>
  <div class="section">''',
    '''  <div class="metrics">${summaryCards}</div>
  <div class="carry-note">Saldo inicial trazido do fechamento anterior; não compõe entradas, vendas nem resultado líquido.</div>
  <div class="section">''',
    "reports PDF carry note",
)

replace_once(
    reports,
    '''        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Entradas líquidas"''',
    '''        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Saldo inicial do período" value={brl(periodOpeningCash)} tone="gold" />
          <StatCard label="Entradas líquidas"''',
    "reports UI opening balance metric",
)

replace_once(
    reports,
    '''          <StatCard label="Taxas de pagamento" value={brl(totalFees)} tone="gold" />
        </div>

        <SectionCard title="Entradas x despesas"''',
    '''          <StatCard label="Taxas de pagamento" value={brl(totalFees)} tone="gold" />
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">Saldo inicial trazido do fechamento anterior · não conta como receita.</p>

        <SectionCard title="Entradas x despesas"''',
    "reports UI carry note",
)

print("Natural Point month opening balance patch applied successfully.")
