import Link from "next/link";
import { CheckCircle2, Settings2, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { WorkList } from "@/components/work/work-list";
import { WorkloadList } from "@/components/work/workload";
import { requireStaff } from "@/lib/auth";
import { loadWork } from "@/lib/data/work";
import { createClient } from "@/lib/supabase/server";
import { cn, first } from "@/lib/utils";

export const metadata = { title: "היום" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  return "ערב טוב";
}

function Section({ title, count, description, children, tone }: { title: string; count?: number; description?: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            {count !== undefined && <span className={cn("rounded-full px-1.5 text-xs font-medium num", tone === "warn" && count > 0 ? "bg-warn-soft text-warn" : "bg-sunken text-ink-3")}>{count}</span>}
          </span>
        }
        description={description}
      />
      {children}
    </Card>
  );
}

function Clear({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-3">
      <CheckCircle2 className="size-4 text-ok" aria-hidden />
      {children}
    </p>
  );
}

/**
 * "היום שלי": a personal work list calculated from real data by the work
 * engine (src/lib/work-engine.ts) — the same one that writes the morning push.
 * Real work first; proactive suggestions only on a quiet day.
 */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const team = first(sp.view) === "team";
  const supabase = await createClient();
  const { plan, team: people, workload, items } = await loadWork(supabase, team ? null : viewer.userId);

  const firstName = (viewer.profile.full_name || "").trim().split(/\s+/)[0];
  const names = Object.fromEntries(people.map((p) => [p.id, (p.full_name || p.email).split(" ")[0]]));
  const colors = Object.fromEntries(people.map((p) => [p.id, p.avatar_color]));
  const staff = people.map((p) => ({ value: p.id, label: p.full_name || p.email }));
  const health = items.filter((i) => i.alertKey);
  // Client alerts have their own card; suggestions show the rest.
  const ideas = plan.ideas.filter((i) => !i.alertKey);
  const dateLabel = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());
  // In the team view the owner names help; in "mine" everything is already mine.
  const ownerNames = team ? names : {};

  return (
    <>
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {team ? "היום של הצוות" : `${greeting()}${firstName ? `, ${firstName}` : ""}`}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-ink-2">
            {plan.now.length ? (
              <>
                <span className="font-medium text-ink">{plan.now.length === 1 ? "דבר אחד דורש טיפול" : `${plan.now.length} דברים דורשים טיפול`}</span>
                {plan.countsLine && <span className="text-ink-3"> · {plan.countsLine}</span>}
              </>
            ) : (
              "אין כרגע משהו דחוף. הכול מטופל."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5 text-sm" role="group" aria-label="תצוגה">
            <Link href="/today" aria-current={!team ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded px-3", !team ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}>
              היום שלי
            </Link>
            <Link href="/today?view=team" aria-current={team ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded px-3", team ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}>
              כל הצוות
            </Link>
          </div>
          <Link href="/team" className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink" aria-label="צוות ותחומי אחריות" title="צוות ותחומי אחריות">
            <Settings2 className="size-5" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="דורש טיפול עכשיו" count={plan.now.length} tone="warn">
            {plan.now.length ? <WorkList items={plan.now} staff={staff} people={ownerNames} limit={12} /> : <Clear>אין משהו דחוף — כל הכבוד.</Clear>}
          </Section>

          {ideas.length > 0 && (
            <Section title="הצעות להיום" description="אין עבודה דחופה, אז הנה דברים אמיתיים שיקדמו את העסק.">
              <div className="flex items-center gap-2 border-b border-line bg-accent-soft/40 px-5 py-2 text-xs text-accent-ink">
                <Sparkles className="size-3.5" aria-hidden />
                מבוסס על נתוני המערכת — לא המלצות כלליות
              </div>
              <WorkList items={ideas} staff={staff} people={ownerNames} />
            </Section>
          )}

          {plan.later.length > 0 && (
            <Section title="בהמשך" count={plan.later.length} description="השבוע הקרוב">
              <WorkList items={plan.later} staff={staff} people={ownerNames} limit={5} />
            </Section>
          )}

          <Section title="ממתין ללקוח" count={plan.waiting.length} description="הכדור אצל הלקוח — כשמשהו מתעכב יותר מדי, הוא עובר ל״דורש טיפול״.">
            {plan.waiting.length ? <WorkList items={plan.waiting} staff={staff} people={ownerNames} limit={6} /> : <Clear>לא מחכים לאף לקוח.</Clear>}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="עומס הצוות" description="מי מחזיק מה — לא מדידה, רק בהירות." />
            <WorkloadList rows={workload} colors={colors} meId={viewer.userId} />
          </Card>
          <Card>
            <CardHeader title="לקוחות שנעלמו" description="בלי קשר או רכישה זמן רב. דחייה או הסרה חלה על כל הצוות." />
            {health.length ? <WorkList items={health} staff={staff} people={{}} limit={5} /> : <Clear>כל הלקוחות בקשר.</Clear>}
          </Card>
        </aside>
      </div>
    </>
  );
}
