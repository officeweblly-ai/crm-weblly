/**
 * Project timeline: the default phases and how they are laid out over the
 * project's dates. Pure — tested in timeline.test.ts.
 */
import { addDays, daysBetween } from "./calendar";
import type { Tone } from "./labels";

export type MilestoneStatus = "not_started" | "in_progress" | "waiting_client" | "done";
export type Phase = "spec" | "design" | "development" | "testing" | "fixes" | "delivery";

export const MILESTONE_STATUS: { value: MilestoneStatus; label: string; tone: Tone }[] = [
  { value: "not_started", label: "לא התחיל", tone: "neutral" },
  { value: "in_progress", label: "בתהליך", tone: "accent" },
  { value: "waiting_client", label: "ממתין ללקוח", tone: "warn" },
  { value: "done", label: "הושלם", tone: "ok" },
];
export const milestoneStatusLabel = (s: string) => MILESTONE_STATUS.find((x) => x.value === s)?.label ?? s;

/** Weights = share of the project duration. Delivery is a single day. */
export const DEFAULT_PHASES: { phase: Phase; title: string; weight: number }[] = [
  { phase: "spec", title: "אפיון", weight: 0.12 },
  { phase: "design", title: "עיצוב", weight: 0.28 },
  { phase: "development", title: "פיתוח", weight: 0.35 },
  { phase: "testing", title: "בדיקות", weight: 0.12 },
  { phase: "fixes", title: "תיקונים", weight: 0.13 },
  { phase: "delivery", title: "מסירה", weight: 0 },
];

/** Default length when the project has no target date yet. */
export const DEFAULT_PROJECT_DAYS = 42;

/**
 * Lays the default phases out back-to-back between start and target delivery.
 * Every phase gets at least one day; delivery lands on the target date.
 */
export function planDefaultMilestones(start: string, target: string | null): { phase: Phase; title: string; start_date: string; end_date: string }[] {
  const end = target && target > start ? target : addDays(start, DEFAULT_PROJECT_DAYS);
  const work = Math.max(DEFAULT_PHASES.length - 1, daysBetween(start, end));
  const out: { phase: Phase; title: string; start_date: string; end_date: string }[] = [];
  let cursor = start;
  let used = 0;
  DEFAULT_PHASES.forEach((p, i) => {
    if (p.phase === "delivery") {
      out.push({ phase: p.phase, title: p.title, start_date: end, end_date: end });
      return;
    }
    const remainingPhases = DEFAULT_PHASES.length - 1 - i - 1;
    const isLastWork = remainingPhases === 0;
    let len = isLastWork ? work - used : Math.max(1, Math.round(work * p.weight));
    len = Math.max(1, Math.min(len, work - used - remainingPhases));
    const s = cursor;
    const e = addDays(s, len - 1);
    out.push({ phase: p.phase, title: p.title, start_date: s, end_date: e });
    used += len;
    cursor = addDays(e, 1);
  });
  return out;
}

export type TimelineState = "done" | "late" | "soon" | "active" | "waiting" | "idle";

/** What the bar should say about itself today. */
export function milestoneState(m: { status: string; end_date: string | null; start_date: string | null }, today: string): TimelineState {
  if (m.status === "done") return "done";
  if (m.end_date && m.end_date < today) return "late";
  if (m.status === "waiting_client") return "waiting";
  if (m.end_date && daysBetween(today, m.end_date) <= 2) return "soon";
  if (m.status === "in_progress" || (m.start_date && m.start_date <= today)) return "active";
  return "idle";
}
