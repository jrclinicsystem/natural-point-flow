import { supabase } from "./supabase";

export type Row = Record<string, unknown>;

export const s = (v: unknown, fallback = ""): string =>
  v === null || v === undefined ? fallback : String(v);

export const n = (v: unknown, fallback = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

/** Returns the first defined value among the candidate column names. */
export const pick = (row: Row | null | undefined, keys: string[]): unknown => {
  if (!row) return undefined;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

export const AMOUNT_KEYS = ["amount", "value", "valor", "total", "total_amount"];
export const DATE_KEYS = [
  "date",
  "due_date",
  "occurred_at",
  "paid_at",
  "created_at",
  "data",
  "vencimento",
];
export const NAME_KEYS = ["name", "nome", "description", "descricao", "title", "label"];
export const STATUS_KEYS = ["status", "situacao"];

/** Defensive list read: tries to order by a column and silently falls back. */
export async function fetchList(
  table: string,
  opts: { orderBy?: string; ascending?: boolean; limit?: number } = {},
): Promise<Row[]> {
  const run = async (orderBy?: string) => {
    let q = supabase.from(table).select("*");
    if (orderBy) q = q.order(orderBy, { ascending: opts.ascending ?? false });
    if (opts.limit) q = q.limit(opts.limit);
    return q;
  };

  let res = await run(opts.orderBy ?? "created_at");
  if (res.error) res = await run(undefined);
  if (res.error) throw res.error;
  return (res.data ?? []) as Row[];
}

export const inRange = (row: Row, from: string, to: string) => {
  const raw = pick(row, DATE_KEYS);
  if (!raw) return true;
  const d = s(raw).slice(0, 10);
  return d >= from && d <= to;
};

export const sum = (rows: Row[], keys: string[] = AMOUNT_KEYS) =>
  rows.reduce((acc, r) => acc + n(pick(r, keys)), 0);
