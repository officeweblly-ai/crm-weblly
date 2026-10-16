import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneState, planDefaultMilestones } from "./timeline";

test("default phases fill the project back-to-back and deliver on the target date", () => {
  const plan = planDefaultMilestones("2026-10-01", "2026-11-10");
  assert.deepEqual(plan.map((p) => p.title), ["אפיון", "עיצוב", "פיתוח", "בדיקות", "תיקונים", "מסירה"]);
  assert.equal(plan[0].start_date, "2026-10-01");
  assert.equal(plan.at(-1)!.end_date, "2026-11-10");
  for (let i = 1; i < plan.length - 1; i++) assert.ok(plan[i].start_date > plan[i - 1].end_date);
  assert.ok(plan.every((p) => p.end_date >= p.start_date));
  assert.ok(plan[4].end_date < "2026-11-10");
});

test("short or missing target still gives every phase a day", () => {
  const tight = planDefaultMilestones("2026-10-01", "2026-10-03");
  assert.equal(tight.length, 6);
  assert.ok(tight.every((p) => p.end_date >= p.start_date));
  const open = planDefaultMilestones("2026-10-01", null);
  assert.equal(open.at(-1)!.end_date, "2026-11-12");
});

test("milestone state", () => {
  assert.equal(milestoneState({ status: "in_progress", start_date: "2026-10-01", end_date: "2026-10-10" }, "2026-10-12"), "late");
  assert.equal(milestoneState({ status: "in_progress", start_date: "2026-10-01", end_date: "2026-10-13" }, "2026-10-12"), "soon");
  assert.equal(milestoneState({ status: "done", start_date: null, end_date: "2026-10-01" }, "2026-10-12"), "done");
  assert.equal(milestoneState({ status: "not_started", start_date: "2026-11-01", end_date: "2026-11-20" }, "2026-10-12"), "idle");
});
