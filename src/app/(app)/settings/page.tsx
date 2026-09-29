import Link from "next/link";
import { ChevronLeft, UsersRound } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { daysSummary } from "@/lib/domain/labels";
import { PageHeader } from "@/components/ui/misc";
import { NotificationSettings } from "@/components/shell/push-setup";
import { ClearDemoButton, PasswordForm, ProfileForm, WorkspaceForm } from "@/components/settings/settings-forms";
import { requireStaff } from "@/lib/auth";
import { workspaceSettings } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const [settings, { data: members }, { count: demoCount }] = await Promise.all([
    workspaceSettings(),
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  const isOwner = viewer.profile.role === "owner";

  return (
    <div className="max-w-3xl">
      <PageHeader title="הגדרות" />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="פרטי העסק" />
          <CardBody>{settings && <WorkspaceForm settings={settings} canEdit={isOwner} />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="הפרופיל שלי" />
          <CardBody className="flex flex-col gap-4"><ProfileForm profile={viewer.profile} /><PasswordForm /></CardBody>
        </Card>
        <Link href="/team" className="group flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-4 shadow-1 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-2 sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent" aria-hidden>
            <UsersRound className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">צוות, תפקידים והרשאות</span>
            <span className="block text-sm text-ink-3">{(members ?? []).filter((m) => m.is_active).length} אנשים פעילים · הוספת עובדים, תפקידים, תחומי אחריות ועומס</span>
          </span>
          <ChevronLeft className="size-5 shrink-0 text-ink-3 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </Link>
        <Card id="notifications" className="scroll-mt-24">
          <CardHeader title="אפליקציה והתראות" description="מתקינים את weblly במסך הבית של האייפון ומקבלים התראות גם כשהאפליקציה סגורה." />
          <CardBody>
            <NotificationSettings
              prefs={(viewer.profile.notify_prefs ?? {}) as Record<string, unknown>}
              morningLabel={`סיכום הבוקר שלך: ${viewer.profile.morning_time.slice(0, 5)}, ימים ${daysSummary(viewer.profile.working_days)} (משנים ב״צוות ותחומי אחריות״).`}
            />
          </CardBody>
        </Card>
        {isOwner && (demoCount ?? 0) > 0 && (
          <Card>
            <CardHeader title="נתוני דמו" description={`במערכת יש ${demoCount} לקוחות לדוגמה (מסומנים "נתוני דמו"). כשמתחילים לעבוד באמת — מוחקים בלחיצה.`} action={<ClearDemoButton />} />
          </Card>
        )}
        <Card>
          <CardHeader title="אבטחה ונתונים" />
          <CardBody className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
            <p>כל הנתונים מוגנים ב-Row Level Security — רק משתמשי צוות פעילים יכולים לקרוא או לשנות אותם.</p>
            <p>קבצים נשמרים בדלי פרטי, ונפתחים רק דרך קישורים חתומים שתוקפם דקות ספורות.</p>
            <p>קישורי שאלון הם אקראיים (256 ביט) ונותנים גישה רק לשאלון אחד — בלי מידע על לקוחות אחרים ובלי הערות פנימיות.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
