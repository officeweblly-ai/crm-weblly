/**
 * The daily work engine — deterministic rules, no AI.
 *
 * Input: a snapshot of the business (tasks, follow-ups, leads, projects,
 * questionnaires, proposals, contracts, payments, approvals, clients…).
 * Output, per person: what needs action now, what's coming, what we're
 * waiting on from clients, and — only when there is little real work —
 * useful proactive suggestions built from the same data.
 *
 * Ownership never uses names. An item belongs to whoever it is assigned to;
 * otherwise to whoever owns its work area (team responsibilities); otherwise
 * it is shared and shown to everyone.
 *
 * Pure module: the loader lives in src/lib/data/work.ts, the tests in
 * src/lib/work-engine.test.ts.
 */
import type { WorkCategory } from "@/lib/domain/labels";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export type WorkInput = {
  /** Israel calendar date, YYYY-MM-DD. */
  today: string;
  people: { id: string; name: string }[];
  responsibilities: { category: string; assigned_to: string | null }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    assigned_to: string | null;
    secondary_assigned_to: string | null;
    category: string | null;
    project_id: string | null;
    client_id: string | null;
    auto_key: string | null;
    project_name: string | null;
    client_name: string | null;
  }[];
  followUps: { id: string; client_id: string; client_name: string; project_id: string | null; assigned_to: string | null; due_date: string; reason: string }[];
  leads: { id: string; name: string; business_name: string | null; status: string; follow_up_date: string | null; created_at: string }[];
  projects: {
    id: string;
    name: string;
    status: string;
    deadline: string | null;
    next_action: string | null;
    status_changed_at: string;
    updated_at: string;
    owner_id: string | null;
    client_id: string;
    client_name: string | null;
    completed_at: string | null;
    total_price: number;
    deposit_amount: number;
    amount_paid: number;
    balance_due: number;
  }[];
  submissions: { id: string; title: string; status: string; sent_at: string | null; created_at: string; completed_at: string | null; project_id: string | null; client_id: string | null; client_name: string | null }[];
  proposals: { id: string; title: string; status: string; sent_at: string | null; created_at: string; valid_until: string | null; client_id: string; project_id: string | null; submission_id: string | null; client_name: string | null }[];
  contracts: { id: string; title: string; status: string; created_at: string; sent_at: string | null; generated: boolean; proposal_id: string | null; client_id: string; project_id: string | null; client_name: string | null }[];
  approvals: { id: string; title: string; created_at: string; project_id: string; project_name: string | null }[];
  portfolioProjectIds: string[];
  albumProjectIds: string[];
  links: { project_id: string; kind: string }[];
  handoffProjectIds: string[];
  clients: {
    id: string;
    name: string;
    business_name: string | null;
    status: string;
    created_at: string;
    last_activity_at: string | null;
    last_purchase_date: string | null;
    total_revenue: number;
  }[];
  alertStates: { key: string; snoozed_until: string | null; dismissed_at: string | null }[];
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
export type Bucket = "now" | "later" | "waiting" | "idea";

/** Groups drive the one-line summaries ("2 משימות באיחור, מעקב אחד…"). */
export type WorkGroup =
  | "blocked" | "overdue" | "task_today" | "follow_up" | "lead" | "questionnaire" | "proposal" | "contract"
  | "payment" | "approval" | "project_deadline" | "project_stalled" | "project_no_next" | "deploy"
  | "task_soon" | "waiting" | "client_health" | "portfolio" | "social" | "links" | "handoff" | "past_client";

export type WorkItem = {
  key: string;
  group: WorkGroup;
  bucket: Bucket;
  /** 1 = most urgent (blocking) … 11 = nice to have. */
  rank: number;
  title: string;
  detail?: string;
  href: string;
  category: WorkCategory;
  /** Empty = shared: shown to every partner. */
  owners: string[];
  due?: string | null;
  taskId?: string;
  clientId?: string;
  /** Computed alerts can be dismissed / snoozed with this key. */
  alertKey?: string;
};

export type Workload = { userId: string; name: string; open: number; dueToday: number; overdue: number; waiting: number };

export type WorkPlan = {
  now: WorkItem[];
  later: WorkItem[];
  waiting: WorkItem[];
  ideas: WorkItem[];
  /** Short counts line, e.g. "2 משימות באיחור · מעקב אחד ללקוח". */
  countsLine: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY = 86_400_000;

function dateOnly(d: string): number {
  return Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
}

/** Whole days from `a` (YYYY-MM-DD or ISO) to today; positive = in the past. */
function daysSince(ts: string | null | undefined, today: string): number | null {
  if (!ts) return null;
  return Math.floor((dateOnly(today) - dateOnly(ts)) / DAY);
}

function daysUntil(d: string | null | undefined, today: string): number | null {
  if (!d) return null;
  return Math.round((dateOnly(d) - dateOnly(today)) / DAY);
}

/** Hebrew count: (1, "משימה אחת", "משימות") → "משימה אחת" / "3 משימות". */
function count(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

const ACTIVE_PROJECT = (s: string) => s !== "lead" && s !== "completed";
const WAITING_STAGES = ["questionnaire_sent", "awaiting_deposit", "awaiting_approval", "awaiting_final_payment"];

function stageCategory(status: string): WorkCategory {
  if (status === "design") return "design";
  if (status === "development" || status === "testing") return "development";
  if (status === "awaiting_deposit" || status === "awaiting_final_payment") return "finance";
  return "project_management";
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
export function buildWorkItems(input: WorkInput): WorkItem[] {
  const { today } = input;
  const owner = new Map<string, string>();
  for (const r of input.responsibilities) if (r.assigned_to && !owner.has(r.category)) owner.set(r.category, r.assigned_to);
  const ownersFor = (category: WorkCategory, ...explicit: (string | null | undefined)[]) => {
    const ids = explicit.filter((x): x is string => Boolean(x));
    if (ids.length) return [...new Set(ids)];
    const o = owner.get(category);
    return o ? [o] : [];
  };

  const items: WorkItem[] = [];
  const openAutoKeys = new Set(input.tasks.map((t) => t.auto_key).filter(Boolean) as string[]);
  const projectById = new Map(input.projects.map((p) => [p.id, p]));

  // ---- Tasks ---------------------------------------------------------------
  for (const t of input.tasks) {
    const cat = (t.category ?? (t.project_id ? stageCategory(projectById.get(t.project_id)?.status ?? "") : "other")) as WorkCategory;
    const owners = ownersFor(cat, t.assigned_to, t.secondary_assigned_to);
    const where = t.project_name ?? t.client_name ?? undefined;
    const href = t.project_id ? `/projects/${t.project_id}#tasks` : t.client_id ? `/clients/${t.client_id}?tab=tasks` : "/tasks";
    const base = { key: `task:${t.id}`, taskId: t.id, title: t.title, detail: where, href, category: cat, owners, due: t.due_date, clientId: t.client_id ?? undefined };
    const due = daysUntil(t.due_date, today);
    if (t.status === "waiting_client") {
      items.push({ ...base, group: "waiting", bucket: "waiting", rank: 9 });
    } else if (t.status === "blocked") {
      items.push({ ...base, group: "blocked", bucket: "now", rank: 1 });
    } else if (due !== null && due < 0) {
      items.push({ ...base, group: "overdue", bucket: "now", rank: 2 });
    } else if (due === 0) {
      items.push({ ...base, group: "task_today", bucket: "now", rank: t.priority === "urgent" || t.priority === "high" ? 3 : 4 });
    } else if (t.status !== "waiting_team" && ((due !== null && due <= 3) || t.status === "in_progress")) {
      items.push({ ...base, group: "task_soon", bucket: "later", rank: 5 });
    }
  }

  // ---- Follow-ups ------------------------------------------------------------
  for (const f of input.followUps) {
    const due = daysUntil(f.due_date, today)!;
    const owners = ownersFor("client_communication", f.assigned_to);
    const base = { key: `followup:${f.id}`, title: `${f.reason} — ${f.client_name}`, href: `/clients/${f.client_id}?tab=relationship`, category: "client_communication" as const, owners, due: f.due_date, clientId: f.client_id };
    if (due < 0) items.push({ ...base, group: "follow_up", bucket: "now", rank: 2, detail: "מעקב שעבר מועדו" });
    else if (due === 0) items.push({ ...base, group: "follow_up", bucket: "now", rank: 6, detail: "מעקב להיום" });
    else if (due <= 3) items.push({ ...base, group: "follow_up", bucket: "later", rank: 6 });
  }

  // ---- Leads -------------------------------------------------------------------
  for (const l of input.leads) {
    if (l.status === "converted" || l.status === "lost") continue;
    const who = l.business_name ? `${l.name} (${l.business_name})` : l.name;
    const owners = ownersFor("sales");
    const due = daysUntil(l.follow_up_date, today);
    if (due !== null && due <= 0) {
      items.push({ key: `lead:${l.id}`, group: "lead", bucket: "now", rank: due < 0 ? 2 : 6, title: `לחזור לליד — ${who}`, detail: due < 0 ? "המעקב עבר מועדו" : "מעקב להיום", href: `/leads/${l.id}`, category: "sales", owners, due: l.follow_up_date });
    } else if (l.status === "new" && !l.follow_up_date) {
      items.push({ key: `lead:${l.id}`, group: "lead", bucket: "now", rank: 3, title: `ליד חדש מחכה לתשובה — ${who}`, href: `/leads/${l.id}`, category: "sales", owners });
    }
  }

  // ---- Questionnaires --------------------------------------------------------
  const proposalBySubmission = new Set(input.proposals.map((p) => p.submission_id).filter(Boolean));
  const proposalByProject = new Set(input.proposals.map((p) => p.project_id).filter(Boolean));
  for (const s of input.submissions) {
    const who = s.client_name ?? s.title;
    if (s.status === "completed" && s.completed_at) {
      const age = daysSince(s.completed_at, today) ?? 0;
      const project = s.project_id ? projectById.get(s.project_id) : undefined;
      const needsProposal = !proposalBySubmission.has(s.id) && !(s.project_id && proposalByProject.has(s.project_id)) && age <= 45 && (!project || ["lead", "questionnaire_sent", "questionnaire_received"].includes(project.status));
      // The automation already opened a review task — the task carries it.
      if (needsProposal && !openAutoKeys.has(`questionnaire_review:${s.id}`)) {
        items.push({ key: `questionnaire:${s.id}`, group: "questionnaire", bucket: "now", rank: 7, title: `להכין הצעת מחיר מהאפיון של ${who}`, href: `/proposals/new?submission=${s.id}`, category: "proposals", owners: ownersFor("proposals") });
      }
    } else if (s.status === "sent" || s.status === "in_progress") {
      const age = daysSince(s.sent_at ?? s.created_at, today) ?? 0;
      const base = { key: `questionnaire:${s.id}`, href: `/questionnaires/${s.id}`, category: "client_communication" as const, owners: ownersFor("client_communication"), clientId: s.client_id ?? undefined };
      if (age >= 5) items.push({ ...base, group: "questionnaire", bucket: "now", rank: 6, title: `לתזכר את ${who} למלא את השאלון`, detail: `נשלח לפני ${age} ימים` });
      else items.push({ ...base, group: "waiting", bucket: "waiting", rank: 9, title: `שאלון: ${who}`, detail: s.status === "in_progress" ? "בתהליך מילוי" : "נשלח" });
    }
  }

  // ---- Proposals -------------------------------------------------------------
  const contractByProposal = new Set(input.contracts.map((c) => c.proposal_id).filter(Boolean));
  for (const p of input.proposals) {
    const who = p.client_name ?? p.title;
    const href = `/proposals/${p.id}`;
    const owners = ownersFor("proposals");
    const expired = p.valid_until !== null && (daysUntil(p.valid_until, today) ?? 0) < 0;
    if (p.status === "draft") {
      if ((daysSince(p.created_at, today) ?? 0) >= 1) items.push({ key: `proposal:${p.id}`, group: "proposal", bucket: "now", rank: 8, title: `לשלוח הצעת מחיר — ${who}`, detail: "טיוטה שעוד לא נשלחה", href, category: "proposals", owners });
    } else if ((p.status === "sent" || p.status === "viewed") && !expired) {
      const age = daysSince(p.sent_at ?? p.created_at, today) ?? 0;
      if (age >= 3) items.push({ key: `proposal:${p.id}`, group: "proposal", bucket: "now", rank: 6, title: `Follow-up להצעת המחיר — ${who}`, detail: `נשלחה לפני ${age} ימים${p.status === "viewed" ? " · נצפתה" : ""}`, href, category: "proposals", owners, clientId: p.client_id });
      else items.push({ key: `proposal:${p.id}`, group: "waiting", bucket: "waiting", rank: 9, title: `הצעת מחיר: ${who}`, detail: p.status === "viewed" ? "הלקוח פתח" : "נשלחה", href, category: "proposals", owners, clientId: p.client_id });
    } else if ((p.status === "sent" || p.status === "viewed") && expired) {
      items.push({ key: `proposal:${p.id}`, group: "proposal", bucket: "later", rank: 8, title: `תוקף ההצעה ל-${who} פג`, detail: "לחדש או לסגור", href, category: "proposals", owners });
    } else if (p.status === "accepted" && !contractByProposal.has(p.id) && !openAutoKeys.has(`proposal_contract:${p.id}`)) {
      items.push({ key: `proposal:${p.id}`, group: "contract", bucket: "now", rank: 8, title: `הצעה אושרה — להכין חוזה ל-${who}`, href: `/contracts/new?proposal=${p.id}`, category: "contracts", owners: ownersFor("contracts") });
    }
  }

  // ---- Contracts -------------------------------------------------------------
  for (const c of input.contracts) {
    const who = c.client_name ?? c.title;
    const href = `/contracts/${c.id}`;
    const owners = ownersFor("contracts");
    if (c.status === "draft" && c.generated && (daysSince(c.created_at, today) ?? 0) >= 2) {
      items.push({ key: `contract:${c.id}`, group: "contract", bucket: "now", rank: 9, title: `לשלוח חוזה לחתימה — ${who}`, href, category: "contracts", owners });
    } else if (c.status === "sent") {
      const age = daysSince(c.sent_at ?? c.created_at, today) ?? 0;
      if (age >= 3) items.push({ key: `contract:${c.id}`, group: "contract", bucket: "now", rank: 9, title: `חוזה לא נחתם — ${who}`, detail: `נשלח לפני ${age} ימים`, href, category: "contracts", owners, clientId: c.client_id });
      else items.push({ key: `contract:${c.id}`, group: "waiting", bucket: "waiting", rank: 9, title: `חוזה לחתימה: ${who}`, href, category: "contracts", owners, clientId: c.client_id });
    }
  }

  // ---- Approvals ---------------------------------------------------------------
  for (const a of input.approvals) {
    const age = daysSince(a.created_at, today) ?? 0;
    const project = projectById.get(a.project_id);
    const owners = ownersFor("client_communication", project?.owner_id);
    const base = { key: `approval:${a.id}`, href: `/projects/${a.project_id}#approvals`, category: "client_communication" as const, owners, clientId: project?.client_id };
    if (age >= 3) items.push({ ...base, group: "approval", bucket: "now", rank: 6, title: `לתזכר אישור: ${a.title}`, detail: `${a.project_name ?? ""} · ממתין ${age} ימים` });
    else items.push({ ...base, group: "waiting", bucket: "waiting", rank: 9, title: `אישור: ${a.title}`, detail: a.project_name ?? undefined });
  }

  // ---- Projects & money --------------------------------------------------------
  const linkKinds = new Map<string, Set<string>>();
  for (const l of input.links) linkKinds.set(l.project_id, (linkKinds.get(l.project_id) ?? new Set()).add(l.kind));
  const portfolio = new Set(input.portfolioProjectIds);
  const albums = new Set(input.albumProjectIds);
  const handoffs = new Set(input.handoffProjectIds);

  for (const p of input.projects) {
    // "אתר GOOM" + client "GOOM" → no need to say it twice.
    const who = p.client_name && !p.name.includes(p.client_name) ? `${p.name} (${p.client_name})` : p.name;
    const href = `/projects/${p.id}`;
    const cat = stageCategory(p.status);
    const owners = ownersFor(cat, p.owner_id);

    if (p.status === "awaiting_deposit" && p.deposit_amount > p.amount_paid) {
      items.push({ key: `payment:${p.id}`, group: "payment", bucket: "now", rank: 9, title: `מקדמה טרם שולמה — ${who}`, href: `${href}#payments`, category: "finance", owners: ownersFor("finance") });
    } else if ((p.status === "awaiting_final_payment" || p.status === "completed") && p.balance_due > 0 && p.total_price > 0) {
      items.push({ key: `payment:${p.id}`, group: "payment", bucket: "now", rank: 9, title: p.status === "completed" ? `יתרה פתוחה בפרויקט שהסתיים — ${who}` : `לגבות יתרת תשלום — ${who}`, href: `${href}#payments`, category: "finance", owners: ownersFor("finance") });
    }

    if (ACTIVE_PROJECT(p.status)) {
      if (WAITING_STAGES.includes(p.status)) {
        items.push({ key: `project-wait:${p.id}`, group: "waiting", bucket: "waiting", rank: 9, title: p.name, detail: p.client_name ?? undefined, href, category: cat, owners, clientId: p.client_id });
      }
      const until = daysUntil(p.deadline, today);
      if (until !== null && until < 0) {
        items.push({ key: `project:${p.id}`, group: "project_deadline", bucket: "now", rank: 2, title: `עבר תאריך היעד — ${who}`, detail: `לפני ${-until} ימים`, href, category: cat, owners });
      } else if (until !== null && until <= 3) {
        items.push({ key: `project:${p.id}`, group: "project_deadline", bucket: "now", rank: 5, title: `יעד קרוב — ${who}`, detail: until === 0 ? "היום" : `בעוד ${until} ימים`, href, category: cat, owners });
      }
      const idle = Math.min(daysSince(p.status_changed_at, today) ?? 0, daysSince(p.updated_at, today) ?? 0);
      if (!WAITING_STAGES.includes(p.status) && idle >= 4) {
        items.push({ key: `stalled:${p.id}`, group: "project_stalled", bucket: "now", rank: 10, title: `${p.name} לא התקדם ${idle} ימים`, detail: p.next_action ? `הבא: ${p.next_action}` : undefined, href, category: cat, owners });
      }
      if (!p.next_action?.trim()) {
        items.push({ key: `nonext:${p.id}`, group: "project_no_next", bucket: "later", rank: 10, title: `לפרויקט ${p.name} אין פעולה הבאה`, href, category: "project_management", owners: ownersFor("project_management", p.owner_id) });
      }
      if (p.status === "testing") {
        items.push({ key: `deploy:${p.id}`, group: "deploy", bucket: "later", rank: 8, title: `מוכן להעלאה לאוויר? — ${p.name}`, href: `${href}#links`, category: "deployment", owners: ownersFor("deployment", p.owner_id) });
      }
      const kinds = linkKinds.get(p.id) ?? new Set();
      if ((p.status === "development" || p.status === "testing") && !kinds.has("github") && !kinds.has("production") && !kinds.has("staging")) {
        items.push({ key: `links:${p.id}`, group: "links", bucket: "idea", rank: 11, title: `להוסיף קישורי GitHub / Production ל-${p.name}`, href: `${href}#links`, category: "development", owners: ownersFor("development", p.owner_id) });
      }
      if ((p.status === "design" || p.status === "development") && !handoffs.has(p.id)) {
        items.push({ key: `handoff:${p.id}`, group: "handoff", bucket: "idea", rank: 11, title: `להכין Development Handoff ל-${p.name}`, href: `${href}#ai-handoff`, category: "development", owners: ownersFor("development", p.owner_id) });
      }
    } else if (p.status === "completed" && (daysSince(p.completed_at, today) ?? 999) <= 180) {
      if (!portfolio.has(p.id)) items.push({ key: `portfolio:${p.id}`, group: "portfolio", bucket: "idea", rank: 11, title: `להוסיף את ${p.name} לתיק העבודות`, href, category: "content", owners: ownersFor("content") });
      if (!albums.has(p.id)) items.push({ key: `album:${p.id}`, group: "social", bucket: "idea", rank: 11, title: `להכין תיקיית סושיאל מ-${p.name}`, href, category: "social", owners: ownersFor("social") });
    }
  }

  // ---- Client health -------------------------------------------------------------
  items.push(...clientAlerts(input).map((a) => ({ ...a, owners: ownersFor("client_communication") })));

  return items.sort((a, b) => a.rank - b.rank || (a.due ?? "9").localeCompare(b.due ?? "9"));
}

// ---------------------------------------------------------------------------
// Inactive clients — computed, never pushed one by one.
// ---------------------------------------------------------------------------
export type ClientAlertRule = "2y" | "purchase_1y" | "90d" | "purchase_6m" | "30d";

const ALERT_TEXT: Record<ClientAlertRule, (days: number) => string> = {
  "2y": () => "לא היה קשר כבר שנתיים",
  purchase_1y: () => "לא רכש כבר יותר משנה",
  "90d": (d) => `${d} ימים בלי קשר`,
  purchase_6m: () => "לא רכש כבר חצי שנה",
  "30d": (d) => `${d} ימים בלי קשר`,
};

export function clientAlerts(input: WorkInput): Omit<WorkItem, "owners">[] {
  const { today } = input;
  const states = new Map(input.alertStates.map((s) => [s.key, s]));
  const activeProjects = new Set(input.projects.filter((p) => ACTIVE_PROJECT(p.status)).map((p) => p.client_id));
  const openFollowUp = new Set(input.followUps.map((f) => f.client_id));
  const out: Omit<WorkItem, "owners">[] = [];

  for (const c of input.clients) {
    if (c.status === "archived" || c.status === "lead" || openFollowUp.has(c.id)) continue;
    const quiet = daysSince(c.last_activity_at ?? c.created_at, today) ?? 0;
    const noPurchase = daysSince(c.last_purchase_date, today);
    const live = ["new", "active", "on_hold", "returning"].includes(c.status);
    let rule: ClientAlertRule | null = null;
    if (quiet >= 730) rule = "2y";
    else if (noPurchase !== null && noPurchase >= 365 && !activeProjects.has(c.id)) rule = "purchase_1y";
    else if (quiet >= 90) rule = "90d";
    else if (noPurchase !== null && noPurchase >= 180 && !activeProjects.has(c.id)) rule = "purchase_6m";
    else if (quiet >= 30 && live) rule = "30d";
    if (!rule) continue;

    const key = `client:${c.id}:${rule}`;
    const st = states.get(key);
    if (st?.dismissed_at || (st?.snoozed_until && st.snoozed_until >= today)) continue;
    const who = c.business_name || c.name;
    out.push({
      key,
      alertKey: key,
      group: rule.startsWith("purchase") ? "past_client" : "client_health",
      bucket: "idea",
      rank: 11,
      title: `${who} — ${ALERT_TEXT[rule](quiet)}`,
      detail: rule === "2y" || rule === "purchase_1y" ? "אולי כדאי לחזור אליו" : undefined,
      href: `/clients/${c.id}?tab=relationship`,
      category: "client_communication",
      clientId: c.id,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-person plan
// ---------------------------------------------------------------------------
/** Below this many urgent items, proactive suggestions are offered. */
export const QUIET_DAY = 3;

export function planFor(items: WorkItem[], userId: string | null): WorkPlan {
  const mine = userId ? items.filter((i) => !i.owners.length || i.owners.includes(userId)) : items;
  const now = mine.filter((i) => i.bucket === "now");
  // Suggestions only on a quiet day — never while a client is waiting on us.
  const pool = mine.filter((i) => i.bucket === "idea");
  // A mix: project/portfolio ideas first, then a few quiet clients — never a wall of alerts.
  const ideas = now.length < QUIET_DAY ? [...pool.filter((i) => !i.alertKey).slice(0, 4), ...pool.filter((i) => i.alertKey).slice(0, 2)] : [];
  return {
    now,
    later: mine.filter((i) => i.bucket === "later"),
    waiting: mine.filter((i) => i.bucket === "waiting"),
    ideas,
    countsLine: countsLine(now),
  };
}

const PHRASES: Partial<Record<WorkGroup, (n: number) => string>> = {
  blocked: (n) => count(n, "משימה חסומה", "משימות חסומות"),
  overdue: (n) => count(n, "משימה באיחור", "משימות באיחור"),
  task_today: (n) => count(n, "משימה להיום", "משימות להיום"),
  follow_up: (n) => count(n, "מעקב ללקוח", "מעקבים ללקוחות"),
  lead: (n) => count(n, "ליד לחזור אליו", "לידים לחזור אליהם"),
  questionnaire: (n) => count(n, "אפיון שדורש טיפול", "אפיונים שדורשים טיפול"),
  proposal: (n) => count(n, "הצעת מחיר לטפל בה", "הצעות מחיר לטפל בהן"),
  contract: (n) => count(n, "חוזה לטפל בו", "חוזים לטפל בהם"),
  payment: (n) => count(n, "תשלום למעקב", "תשלומים למעקב"),
  approval: (n) => count(n, "אישור לקוח לתזכר", "אישורי לקוח לתזכר"),
  project_deadline: (n) => count(n, "פרויקט עם יעד קרוב או שעבר", "פרויקטים עם יעד קרוב או שעבר"),
  project_stalled: (n) => count(n, "פרויקט שלא התקדם", "פרויקטים שלא התקדמו"),
};

export function countsLine(now: WorkItem[]): string {
  const by = new Map<WorkGroup, number>();
  for (const i of now) by.set(i.group, (by.get(i.group) ?? 0) + 1);
  return [...by.entries()]
    .map(([g, n]) => PHRASES[g]?.(n))
    .filter(Boolean)
    .join(" · ");
}

/** The morning push: short, personal, based only on real items. */
export function morningMessage(firstName: string, plan: WorkPlan): { title: string; body: string } {
  const title = `בוקר טוב${firstName ? ` ${firstName}` : ""}`;
  if (plan.now.length) {
    const head = plan.now.length === 1 ? "דבר אחד דורש טיפול היום" : `${plan.now.length} דברים דורשים טיפול היום`;
    const top = plan.now.slice(0, 2).map((i) => i.title);
    return { title, body: [`${head}: ${plan.countsLine}.`, ...top.map((t) => `• ${t}`)].join("\n").slice(0, 300) };
  }
  if (plan.ideas.length) {
    return { title, body: ["אין לך כרגע משהו דחוף. הצעות להיום:", ...plan.ideas.slice(0, 3).map((i) => `• ${i.title}`)].join("\n").slice(0, 300) };
  }
  return { title, body: "אין לך משימות פתוחות להיום. יום טוב!" };
}

export function workloadFor(input: WorkInput): Workload[] {
  return input.people.map((p) => {
    const mine = input.tasks.filter((t) => t.assigned_to === p.id || t.secondary_assigned_to === p.id);
    const due = (t: (typeof mine)[number]) => daysUntil(t.due_date, input.today);
    return {
      userId: p.id,
      name: p.name,
      open: mine.length,
      dueToday: mine.filter((t) => due(t) === 0).length,
      overdue: mine.filter((t) => (due(t) ?? 1) < 0).length,
      waiting: mine.filter((t) => t.status === "waiting_client" || t.status === "waiting_team").length,
    };
  });
}

/** Whether the morning summary should go out now for this person. */
export function morningDue(p: { working_days: number[]; morning_time: string }, now: { weekday: number; time: string }): boolean {
  return p.working_days.includes(now.weekday) && now.time >= p.morning_time.slice(0, 5);
}
