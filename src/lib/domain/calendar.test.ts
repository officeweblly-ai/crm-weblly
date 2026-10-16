import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, dueLabel, monthGrid, rangeFor, shiftDate, sortAgenda, startOfWeek, weekday, type AgendaItem } from "./calendar";

test("weeks start on Sunday", () => {
  assert.equal(weekday("2026-10-18"), 0);
  assert.equal(startOfWeek("2026-10-16"), "2026-10-11");
  assert.equal(startOfWeek("2026-10-11"), "2026-10-11");
});

test("month grid covers whole weeks", () => {
  const g = monthGrid("2026-10-16");
  assert.equal(g[0][0], "2026-09-27");
  assert.ok(g.every((w) => w.length === 7));
  assert.ok(g.flat().includes("2026-10-31"));
  assert.equal(weekday(g.at(-1)![6]), 6);
});

test("month arithmetic clamps the day", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftDate("month", "2026-12-15", 1), "2027-01-01");
  assert.equal(shiftDate("week", "2026-10-16", -1), "2026-10-09");
});

test("ranges per view", () => {
  assert.deepEqual(rangeFor("week", "2026-10-16"), { from: "2026-10-11", to: "2026-10-17" });
  assert.deepEqual(rangeFor("year", "2026-10-16"), { from: "2026-01-01", to: "2026-12-31" });
});

test("deadline wording", () => {
  assert.equal(dueLabel(2), "נותרו 2 ימים");
  assert.equal(dueLabel(-1), "באיחור של יום");
  assert.equal(dueLabel(-3), "באיחור של 3 ימים");
});

test("timed items first, done items last", () => {
  const base = { key: "", source: "task", sourceId: "", kind: "task", context: null, date: "2026-10-16", endDate: null, endTime: null, href: "", assigneeId: null, projectId: null, clientId: null, amount: null, status: null } as const;
  const a: AgendaItem = { ...base, key: "a", title: "ב", time: null, done: false };
  const b: AgendaItem = { ...base, key: "b", title: "א", time: "09:00", done: false };
  const c: AgendaItem = { ...base, key: "c", title: "ג", time: "08:00", done: true };
  assert.deepEqual([a, b, c].sort(sortAgenda).map((x) => x.key), ["b", "a", "c"]);
});
