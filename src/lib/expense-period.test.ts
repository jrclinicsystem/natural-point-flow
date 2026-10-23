import { describe, expect, test } from "bun:test";
import { expensePeriodRange, validExpenseRange } from "./expense-period";

describe("expense period selection", () => {
  const today = "2026-10-23";
  test("defaults to the current month through today", () => {
    expect(expensePeriodRange("month", today)).toEqual({ from: "2026-10-01", to: today });
  });
  test("selects an entire previous month", () => {
    expect(expensePeriodRange("month", today, "2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  test("selects a previous year", () => {
    expect(expensePeriodRange("year", today, undefined, "2025")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
  test("today includes only today", () => {
    expect(expensePeriodRange("today", today)).toEqual({ from: today, to: today });
  });
  test("7 days includes both endpoints", () => {
    expect(expensePeriodRange("7d", today)).toEqual({ from: "2026-10-17", to: today });
  });
  test("30 days crosses month and year boundaries", () => {
    expect(expensePeriodRange("30d", "2026-01-10")).toEqual({ from: "2025-12-12", to: "2026-01-10" });
  });
  test("all has no date bounds", () => {
    expect(expensePeriodRange("all", today)).toEqual({ from: "", to: "" });
  });
  test("custom accepts inclusive past dates and rejects missing or reversed dates", () => {
    expect(validExpenseRange("custom", { from: "2026-09-01", to: "2026-09-30" })).toBe(true);
    expect(validExpenseRange("custom", { from: "2026-09-30", to: "2026-09-01" })).toBe(false);
    expect(validExpenseRange("custom", { from: "", to: today })).toBe(false);
  });
  test("month selection handles leap years", () => {
    expect(expensePeriodRange("month", today, "2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});