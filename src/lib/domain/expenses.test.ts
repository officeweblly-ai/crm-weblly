import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInMonth, expensesByMonth, lastMonths, monthlyRunRate } from "./expenses";

test("lastMonths crosses a year boundary", () => {
  assert.deepEqual(lastMonths(3, "2026-02-10"), ["2025-12", "2026-01", "2026-02"]);
});

test("one-off, monthly and yearly expenses land in the right months", () => {
  const once = { amount: 100, spent_on: "2026-03-05", recurring: "none", ended_on: null };
  const monthly = { amount: 50, spent_on: "2026-02-01", recurring: "monthly", ended_on: "2026-04-30" };
  const yearly = { amount: 1200, spent_on: "2025-03-15", recurring: "yearly", ended_on: null };
  assert.equal(amountInMonth(once, "2026-03"), 100);
  assert.equal(amountInMonth(once, "2026-04"), 0);
  assert.equal(amountInMonth(monthly, "2026-01"), 0);
  assert.equal(amountInMonth(monthly, "2026-04"), 50);
  assert.equal(amountInMonth(monthly, "2026-05"), 0);
  assert.equal(amountInMonth(yearly, "2026-03"), 1200);
  assert.equal(amountInMonth(yearly, "2026-04"), 0);
  assert.deepEqual(expensesByMonth([once, monthly, yearly], ["2026-02", "2026-03"]), { "2026-02": 50, "2026-03": 1350 });
  assert.equal(monthlyRunRate([once, monthly, yearly], "2026-03"), 150);
});
