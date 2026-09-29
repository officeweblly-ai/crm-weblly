import Link from "next/link";
import { Bell, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { NotificationRow } from "@/components/shell/notification-bell";
import { InboxActions } from "@/components/shell/inbox-actions";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "התראות" };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  if (key === today) return "היום";
  if (key === yesterday) return "אתמול";
  return d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" });
}

export default async function NotificationsPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, read_at, created_at")
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  const groups: { label: string; items: typeof items }[] = [];
  for (const n of items) {
    const label = dayLabel(n.created_at);
    const g = groups.at(-1);
    if (g && g.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="התראות"
        description={unread ? `${unread} חדשות` : "הכול נקרא"}
        actions={
          <>
            <InboxActions hasUnread={unread > 0} hasRead={items.some((n) => n.read_at)} />
            <Button asChild variant="ghost" size="icon" aria-label="הגדרות התראות">
              <Link href="/settings#notifications"><Settings2 aria-hidden /></Link>
            </Button>
          </>
        }
      />
      {items.length ? (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold text-ink-3">{g.label}</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <NotificationRow n={n} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Bell} title="אין התראות עדיין" description="לידים, תשלומים, חתימות, משימות ושינויים בפרויקטים — כל מה שקורה במערכת יופיע כאן, וגם בהתראות לטלפון אם הפעלתם." />
        </Card>
      )}
    </div>
  );
}
