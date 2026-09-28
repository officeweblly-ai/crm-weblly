import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkItems, clientAlerts, morningDue, morningMessage, planFor, workloadFor, type WorkInput } from "./work-engine";

const DEV = "u-dev";
const OPS = "u-ops";
const TODAY = "2026-09-29";

function input(over: Partial<WorkInput> = {}): WorkInput {
  return {
    today: TODAY,
    people: [
      { id: DEV, name: "שותף א" },
      { id: OPS, name: "שותפה ב" },
    ],
    responsibilities: [
      { category: "development", assigned_to: DEV },
      { category: "deployment", assigned_to: DEV },
      { category: "client_communication", assigned_to: OPS },
      { category: "proposals", assigned_to: OPS },
      { category: "contracts", assigned_to: OPS },
      { category: "finance", assigned_to: OPS },
      { category: "content", assigned_to: OPS },
    ],
    tasks: [],
    followUps: [],
    leads: [],
    projects: [],
    submissions: [],
    proposals: [],
    contracts: [],
    approvals: [],
    portfolioProjectIds: [],
    albumProjectIds: [],
    links: [],
    handoffProjectIds: [],
    clients: [],
    alertStates: [],
    ...over,
  };
}

const task = (id: string, o: Partial<WorkInput["tasks"][number]>): WorkInput["tasks"][number] => ({
  id, title: id, status: "todo", priority: "medium", due_date: null, assigned_to: null, secondary_assigned_to: null,
  category: null, project_id: null, client_id: null, auto_key: null, project_name: null, client_name: null, ...o,
});

const project = (id: string, o: Partial<WorkInput["projects"][number]>): WorkInput["projects"][number] => ({
  id, name: id, status: "development", deadline: null, next_action: "להמשיך", status_changed_at: `${TODAY}T08:00:00Z`, updated_at: `${TODAY}T08:00:00Z`,
  owner_id: null, client_id: "c1", client_name: "לקוח", completed_at: null, total_price: 0, deposit_amount: 0, amount_paid: 0, balance_due: 0, ...o,
});

test("a task assigned to one partner is not the other's", () => {
  const items = buildWorkItems(input({ tasks: [task("mobile", { assigned_to: DEV, due_date: TODAY })] }));
  assert.equal(planFor(items, DEV).now.length, 1);
  assert.equal(planFor(items, OPS).now.length, 0);
  // The team view sees everything.
  assert.equal(planFor(items, null).now.length, 1);
});

test("unassigned work goes to whoever owns the area; with no owner it is shared", () => {
  const items = buildWorkItems(
    input({
      tasks: [task("deploy", { category: "deployment", due_date: TODAY }), task("misc", { category: "social", due_date: TODAY })],
    }),
  );
  assert.deepEqual(planFor(items, DEV).now.map((i) => i.title).sort(), ["deploy", "misc"]);
  assert.deepEqual(planFor(items, OPS).now.map((i) => i.title), ["misc"]);
});

test("priority: blocked, then overdue, then today", () => {
  const items = buildWorkItems(
    input({
      tasks: [
        task("today", { assigned_to: DEV, due_date: TODAY }),
        task("late", { assigned_to: DEV, due_date: "2026-09-20" }),
        task("stuck", { assigned_to: DEV, status: "blocked" }),
      ],
    }),
  );
  assert.deepEqual(planFor(items, DEV).now.map((i) => i.title), ["stuck", "late", "today"]);
});

test("waiting-for-client tasks are listed as waiting, not as work", () => {
  const items = buildWorkItems(input({ tasks: [task("photos", { assigned_to: OPS, status: "waiting_client", due_date: "2026-09-01" })] }));
  const plan = planFor(items, OPS);
  assert.equal(plan.now.length, 0);
  assert.equal(plan.waiting.length, 1);
});

test("client relationship: overdue follow-ups, unanswered proposals, accepted proposals without a contract", () => {
  const items = buildWorkItems(
    input({
      followUps: [{ id: "f1", client_id: "c1", client_name: "ליעד", project_id: null, assigned_to: null, due_date: "2026-09-27", reason: "לבקש תמונות" }],
      proposals: [
        { id: "p1", title: "הצעה", status: "sent", sent_at: "2026-09-24T09:00:00Z", created_at: "2026-09-24T09:00:00Z", valid_until: null, client_id: "c1", project_id: null, submission_id: null, client_name: "ליעד" },
        { id: "p2", title: "הצעה 2", status: "accepted", sent_at: null, created_at: "2026-09-20T09:00:00Z", valid_until: null, client_id: "c2", project_id: null, submission_id: null, client_name: "GOOM" },
      ],
    }),
  );
  const ops = planFor(items, OPS).now.map((i) => i.group);
  assert.deepEqual(ops.sort(), ["contract", "follow_up", "proposal"]);
  assert.equal(planFor(items, DEV).now.length, 0);
});

test("a questionnaire that already opened a review task is not listed twice", () => {
  const sub = { id: "s1", title: "אפיון", status: "completed", sent_at: null, created_at: "2026-09-28T09:00:00Z", completed_at: "2026-09-28T10:00:00Z", project_id: null, client_id: "c1", client_name: "ליעד" };
  const withTask = buildWorkItems(input({ submissions: [sub], tasks: [task("review", { auto_key: "questionnaire_review:s1", due_date: TODAY, category: "proposals" })] }));
  assert.equal(withTask.filter((i) => i.group === "questionnaire").length, 0);
  const without = buildWorkItems(input({ submissions: [sub] }));
  assert.equal(without.filter((i) => i.group === "questionnaire").length, 1);
});

test("projects: stalled, past deadline, deposit, and a project owner overrides the area", () => {
  const items = buildWorkItems(
    input({
      projects: [
        project("stalled", { status_changed_at: "2026-09-20T08:00:00Z", updated_at: "2026-09-21T08:00:00Z", owner_id: OPS }),
        project("late", { deadline: "2026-09-25" }),
        project("deposit", { status: "awaiting_deposit", deposit_amount: 3000, amount_paid: 0 }),
      ],
    }),
  );
  assert.ok(planFor(items, OPS).now.some((i) => i.group === "project_stalled"));
  assert.ok(planFor(items, DEV).now.some((i) => i.group === "project_deadline"));
  assert.ok(planFor(items, OPS).now.some((i) => i.group === "payment"));
  assert.ok(planFor(items, OPS).waiting.some((i) => i.key === "project-wait:deposit"));
});

test("suggestions appear only on a quiet day", () => {
  const done = project("done", { status: "completed", completed_at: "2026-09-10T08:00:00Z" });
  const quiet = planFor(buildWorkItems(input({ projects: [done] })), OPS);
  assert.ok(quiet.ideas.some((i) => i.group === "portfolio"));
  const busy = planFor(
    buildWorkItems(input({ projects: [done], tasks: [1, 2, 3].map((n) => task(`t${n}`, { assigned_to: OPS, due_date: TODAY })) })),
    OPS,
  );
  assert.equal(busy.ideas.length, 0);
});

test("inactive clients: one alert per client, snooze and dismiss hide it", () => {
  const clients = [
    { id: "old", name: "לקוח ותיק", business_name: null, status: "completed", created_at: "2023-01-01T00:00:00Z", last_activity_at: "2024-06-01T00:00:00Z", last_purchase_date: "2024-05-01", total_revenue: 8000 },
    { id: "fresh", name: "חדש", business_name: null, status: "active", created_at: "2026-09-20T00:00:00Z", last_activity_at: "2026-09-20T00:00:00Z", last_purchase_date: null, total_revenue: 0 },
    { id: "quiet", name: "שקט", business_name: null, status: "active", created_at: "2026-01-01T00:00:00Z", last_activity_at: "2026-08-01T00:00:00Z", last_purchase_date: null, total_revenue: 0 },
  ];
  const alerts = clientAlerts(input({ clients }));
  assert.deepEqual(alerts.map((a) => a.key).sort(), ["client:old:2y", "client:quiet:30d"]);
  const snoozed = clientAlerts(input({ clients, alertStates: [{ key: "client:old:2y", snoozed_until: "2026-10-10", dismissed_at: null }, { key: "client:quiet:30d", snoozed_until: null, dismissed_at: "2026-09-29T00:00:00Z" }] }));
  assert.equal(snoozed.length, 0);
  // An expired snooze shows it again.
  const back = clientAlerts(input({ clients, alertStates: [{ key: "client:old:2y", snoozed_until: "2026-09-01", dismissed_at: null }] }));
  assert.ok(back.some((a) => a.key === "client:old:2y"));
});

test("morning message: work first, suggestions only when there is none", () => {
  const busy = planFor(buildWorkItems(input({ tasks: [task("א", { assigned_to: DEV, due_date: "2026-09-01" }), task("ב", { assigned_to: DEV, due_date: TODAY })] })), DEV);
  const m = morningMessage("ינאי", busy);
  assert.equal(m.title, "בוקר טוב ינאי");
  assert.match(m.body, /2 דברים דורשים טיפול היום/);
  assert.match(m.body, /משימה באיחור/);

  const quiet = planFor(buildWorkItems(input({ projects: [project("done", { status: "completed", completed_at: "2026-09-10T08:00:00Z" })] })), OPS);
  assert.match(morningMessage("נויה", quiet).body, /אין לך כרגע משהו דחוף/);
});

test("workload counts per person", () => {
  const w = workloadFor(input({ tasks: [task("a", { assigned_to: DEV, due_date: TODAY }), task("b", { assigned_to: DEV, due_date: "2026-09-01" }), task("c", { secondary_assigned_to: DEV, status: "waiting_team" })] }));
  assert.deepEqual(w.find((x) => x.userId === DEV), { userId: DEV, name: "שותף א", open: 3, dueToday: 1, overdue: 1, waiting: 1 });
  assert.equal(w.find((x) => x.userId === OPS)!.open, 0);
});

test("morning schedule respects working days and the chosen time", () => {
  const p = { working_days: [0, 1, 2, 3, 4], morning_time: "08:30:00" };
  assert.equal(morningDue(p, { weekday: 2, time: "08:15" }), false);
  assert.equal(morningDue(p, { weekday: 2, time: "08:30" }), true);
  assert.equal(morningDue(p, { weekday: 5, time: "09:00" }), false);
});
