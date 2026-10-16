import { CalendarScreen } from "@/components/calendar/calendar-view";
import { requireStaff } from "@/lib/auth";
import { loadAgenda } from "@/lib/data/agenda";
import { AGENDA_FILTERS, CALENDAR_VIEWS, rangeFor, type AgendaFilter, type CalendarView } from "@/lib/domain/calendar";
import { can } from "@/lib/domain/permissions";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { first } from "@/lib/utils";

export const metadata = { title: "יומן" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  const view = (CALENDAR_VIEWS.map((v) => v.value) as string[]).includes(first(sp.view) ?? "") ? (first(sp.view) as CalendarView) : "month";
  const rawDate = first(sp.date) ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? rawDate : today;
  const f = (AGENDA_FILTERS.map((x) => x.value) as string[]).includes(first(sp.f) ?? "") ? (first(sp.f) as AgendaFilter) : "all";
  const whoRaw = first(sp.who) ?? "all";
  const who = whoRaw === "me" ? viewer.userId : whoRaw;

  const { from, to } = rangeFor(view, date);
  const supabase = await createClient();
  const [items, { data: staff }] = await Promise.all([
    loadAgenda(from, to, { payments: can(viewer.access, "finances") }),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name"),
  ]);
  // "שלי" first, then the partners by name.
  const people = (staff ?? [])
    .map((p) => ({ id: p.id, name: p.id === viewer.userId ? "שלי" : (p.full_name || p.email).split(" ")[0] }))
    .sort((a, b) => (a.id === viewer.userId ? -1 : b.id === viewer.userId ? 1 : a.name.localeCompare(b.name, "he")));

  return <CalendarScreen params={{ view, date, f, who }} items={items} people={people} today={today} eventId={first(sp.event)} />;
}
