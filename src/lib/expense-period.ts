export type ExpensePeriod = "today" | "7d" | "30d" | "month" | "year" | "all" | "custom";
export type ExpenseRange = { from: string; to: string };

export function expensePeriodRange(
  period: Exclude<ExpensePeriod, "custom">,
  today: string,
  month = today.slice(0, 7),
  year = today.slice(0, 4),
): ExpenseRange {
  if (period === "all") return { from: "", to: "" };
  if (period === "month") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { from: "", to: "" };
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: month === today.slice(0, 7) ? today : `${month}-${lastDay}` };
  }
  if (period === "year") {
    if (!/^\d{4}$/.test(year)) return { from: "", to: "" };
    return { from: `${year}-01-01`, to: year === today.slice(0, 4) ? today : `${year}-12-31` };
  }
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (period === "7d" ? 6 : period === "30d" ? 29 : 0));
  return { from: start.toISOString().slice(0, 10), to: today };
}

export function validExpenseRange(period: ExpensePeriod, { from, to }: ExpenseRange): boolean {
  if (period === "all") return true;
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  return validDate(from) && validDate(to) && from <= to;
}