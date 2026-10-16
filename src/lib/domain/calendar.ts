/**
 * Calendar model. Every dated thing in the business (events, task due dates,
 * project deadlines, milestones, expected and received payments, follow-ups,
 * contract signatures) becomes one `AgendaItem`, so the dashboard month board,
 * the calendar views and "today" all read the same list.
 *
 * Dates are calendar dates (YYYY-MM-DD) handled in UTC so they never shift.
 */

export type AgendaKind =
  | "meeting"
  | "call"
  | "task"
  | "deadline"
  | "milestone"
  | "delivery"
  | "payment_due"
  | "payment"
  | "follow_up"
  | "contract"
  | "business"
  | "other";

export type AgendaSource = "event" | "task" | "project" | "milestone" | "schedule" | "payment" | "followup" | "lead" | "proposal" | "contract";

export type AgendaItem = {
  key: string;
  source: AgendaSource;
  sourceId: string;
  kind: AgendaKind;
  title: string;
  /** Client / project line. */
  context: string | null;
  date: string;
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  href: string;
  assigneeId: string | null;
  projectId: string | null;
  clientId: string | null;
  done: boolean;
  amount: number | null;
  /** Raw status label of the source (task status, milestone status…). */
  status: string | null;
  /** Calendar events only: the stored fields, for editing in place. */
  event?: {
    id: string;
    title: string;
    kind: string;
    starts_on: string;
    ends_on: string | null;
    all_day: boolean;
    start_time: string | null;
    end_time: string | null;
    assigned_to: string | null;
    client_id: string | null;
    project_id: string | null;
    description: string | null;
    reminder_minutes: number | null;
  };
};

/** Event kinds a person can create (calendar_events.kind). */
export const EVENT_KINDS = [
  { value: "meeting", label: "פגישה" },
  { value: "task", label: "משימה" },
  { value: "deadline", label: "דדליין" },
  { value: "payment", label: "תשלום" },
  { value: "delivery", label: "מסירה" },
  { value: "call", label: "שיחה" },
  { value: "follow_up", label: "מעקב" },
  { value: "business", label: "אירוע עסקי" },
  { value: "other", label: "אחר" },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]["value"];
export const EVENT_KIND_VALUES = EVENT_KINDS.map((k) => k.value) as [EventKind, ...EventKind[]];

/** calendar_events.kind → how it is drawn. */
export function eventKindToAgenda(kind: string): AgendaKind {
  if (kind === "payment") return "payment_due";
  return (["meeting", "call", "task", "deadline", "delivery", "follow_up", "business", "other"] as string[]).includes(kind) ? (kind as AgendaKind) : "other";
}

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  meeting: "פגישה",
  call: "שיחה",
  task: "משימה",
  deadline: "דדליין",
  milestone: "אבן דרך",
  delivery: "מסירה",
  payment_due: "תשלום צפוי",
  payment: "תשלום התקבל",
  follow_up: "מעקב",
  contract: "חוזה",
  business: "אירוע עסקי",
  other: "אחר",
};

/**
 * Restrained palette: five hues, each tied to a family of meaning.
 * Drawn as a thin bar/dot next to text — never as the only signal.
 */
export type KindFamily = "meet" | "work" | "date" | "money" | "client";
export const KIND_FAMILY: Record<AgendaKind, KindFamily> = {
  meeting: "meet",
  call: "meet",
  business: "meet",
  task: "work",
  other: "work",
  deadline: "date",
  milestone: "date",
  delivery: "date",
  payment_due: "money",
  payment: "money",
  follow_up: "client",
  contract: "client",
};

/** Calendar filters (URL `f`). Person filters use `who`. */
export const AGENDA_FILTERS = [
  { value: "all", label: "הכל" },
  { value: "projects", label: "פרויקטים" },
  { value: "clients", label: "לקוחות" },
  { value: "payments", label: "תשלומים" },
  { value: "meetings", label: "פגישות" },
  { value: "deadlines", label: "דדליינים" },
] as const;
export type AgendaFilter = (typeof AGENDA_FILTERS)[number]["value"];

export function matchesFilter(item: AgendaItem, f: AgendaFilter): boolean {
  switch (f) {
    case "projects":
      return Boolean(item.projectId) || ["deadline", "milestone", "delivery"].includes(item.kind);
    case "clients":
      return Boolean(item.clientId) && ["follow_up", "contract", "meeting", "call"].includes(item.kind);
    case "payments":
      return item.kind === "payment" || item.kind === "payment_due";
    case "meetings":
      return item.kind === "meeting" || item.kind === "call" || item.kind === "business";
    case "deadlines":
      return ["deadline", "milestone", "delivery"].includes(item.kind) || (item.kind === "task" && !item.done);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Date arithmetic on YYYY-MM-DD
// ---------------------------------------------------------------------------
const d = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (dt: Date) => dt.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const x = d(date);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}

export function addMonths(date: string, n: number): string {
  const x = d(date);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return iso(x);
}

/** 0 = Sunday. */
export function weekday(date: string): number {
  return d(date).getUTCDay();
}

/** Israeli week: Sunday → Saturday. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekday(date));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((d(to).getTime() - d(from).getTime()) / 86_400_000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let x = from; x <= to; x = addDays(x, 1)) out.push(x);
  return out;
}

/** The 6×7 (or 5×7) grid a month view draws, Sunday-first. */
export function monthGrid(date: string): string[][] {
  const first = startOfWeek(startOfMonth(date));
  const last = addDays(startOfWeek(endOfMonth(date)), 6);
  const days = eachDay(first, last);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export type CalendarView = "day" | "week" | "month" | "year";
export const CALENDAR_VIEWS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "יום" },
  { value: "week", label: "שבוע" },
  { value: "month", label: "חודש" },
  { value: "year", label: "שנה" },
];

/** The date range a view loads. Month includes the leading/trailing grid days. */
export function rangeFor(view: CalendarView, date: string): { from: string; to: string } {
  switch (view) {
    case "day":
      return { from: date, to: date };
    case "week": {
      const from = startOfWeek(date);
      return { from, to: addDays(from, 6) };
    }
    case "month": {
      const g = monthGrid(date);
      return { from: g[0][0], to: g.at(-1)![6] };
    }
    case "year":
      return { from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
  }
}

export function shiftDate(view: CalendarView, date: string, dir: 1 | -1): string {
  switch (view) {
    case "day":
      return addDays(date, dir);
    case "week":
      return addDays(date, 7 * dir);
    case "month":
      return addMonths(startOfMonth(date), dir);
    case "year":
      return `${Number(date.slice(0, 4)) + dir}-01-01`;
  }
}

/** True when the item covers the day (multi-day items span). */
export function onDay(item: AgendaItem, day: string): boolean {
  return item.date <= day && (item.endDate ?? item.date) >= day;
}

/** Timed first (by time), then all-day; done items sink. */
export function sortAgenda(a: AgendaItem, b: AgendaItem): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
  if (a.time) return -1;
  if (b.time) return 1;
  return a.title.localeCompare(b.title, "he");
}

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/** Subtle deadline wording: "נותרו 2 ימים", "היום", "באיחור של יום". */
export function dueLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days > 1) return `נותרו ${days} ימים`;
  if (days === -1) return "באיחור של יום";
  return `באיחור של ${-days} ימים`;
}

const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
export const monthName = (date: string) => HE_MONTHS[Number(date.slice(5, 7)) - 1];
export const dayNum = (date: string) => Number(date.slice(8, 10));
