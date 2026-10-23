import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { expensePeriodRange, validExpenseRange } from "./expense-period";

describe("expense period selection", () => {
  const today = "2026-10-23";
  test("defaults to the current month through today", () => {
    deepStrictEqual(expensePeriodRange("month", today), { from: "2026-10-01", to: today });
  });
  test("selects an entire previous month", () => {
    deepStrictEqual(expensePeriodRange("month", today, "2026-09"), { from: "2026-09-01", to: "2026-09-30" });
  });
  test("selects a previous year", () => {
    deepStrictEqual(expensePeriodRange("year", today, undefined, "2025"), { from: "2025-01-01", to: "2025-12-31" });
  });
  test("today includes only today", () => {
    deepStrictEqual(expensePeriodRange("today", today), { from: today, to: today });
  });
  test("7 days includes both endpoints", () => {
    deepStrictEqual(expensePeriodRange("7d", today), { from: "2026-10-17", to: today });
  });
  test("30 days crosses month and year boundaries", () => {
    deepStrictEqual(expensePeriodRange("30d", "2026-01-10"), { from: "2025-12-12", to: "2026-01-10" });
  });
  test("all has no date bounds", () => {
    deepStrictEqual(expensePeriodRange("all", today), { from: "", to: "" });
  });
  test("custom accepts inclusive past dates and rejects missing or reversed dates", () => {
    strictEqual(validExpenseRange("custom", { from: "2026-09-01", to: "2026-09-30" }), true);
    strictEqual(validExpenseRange("custom", { from: "2026-09-30", to: "2026-09-01" }), false);
    strictEqual(validExpenseRange("custom", { from: "", to: today }), false);
  });
  test("month selection handles leap years", () => {
    deepStrictEqual(expensePeriodRange("month", today, "2024-02"), { from: "2024-02-01", to: "2024-02-29" });
  });
});