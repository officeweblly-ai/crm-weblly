import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { NotificationSettings } from "@/components/shell/push-setup";
import { AddMemberForm, ClearDemoButton, PasswordForm, ProfileForm, TeamList, WorkspaceForm } from "@/components/settings/settings-forms";
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
        <Card id="notifications" className="scroll-mt-24">
          <CardHeader title="אפליקציה והתראות" description="מתקינים את weblly במסך הבית של האייפון ומקבלים התראות גם כשהאפליקציה סגורה." />
          <CardBody>
            <NotificationSettings prefs={(viewer.profile.notify_prefs ?? {}) as Record<string, unknown>} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="צוות" description="כל מי שברשימה עובד על אותם נתונים בזמן אמת — לקוחות, פרויקטים, קבצים ותשלומים. בלי להעביר דברים בוואטסאפ." />
          <CardBody className="flex flex-col gap-4">
            <TeamList members={members ?? []} meId={viewer.userId} isOwner={isOwner} />
            {isOwner && <AddMemberForm />}
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
