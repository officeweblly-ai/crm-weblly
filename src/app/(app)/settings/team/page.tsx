import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { MemberCard, Responsibilities } from "@/components/settings/team";
import { WorkloadList } from "@/components/work/workload";
import { requireStaff } from "@/lib/auth";
import { loadWorkInput } from "@/lib/data/work";
import { createClient } from "@/lib/supabase/server";
import { workloadFor } from "@/lib/work-engine";

export const metadata = { title: "צוות ותחומי אחריות" };

export default async function TeamPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const [{ data: members }, { data: responsibilities }, { input }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("team_responsibilities").select("*").order("position"),
    loadWorkInput(supabase),
  ]);
  const isOwner = viewer.profile.role === "owner";
  const active = (members ?? []).filter((m) => m.is_active);
  const staff = active.map((m) => ({ value: m.id, label: m.full_name || m.email }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href="/settings" className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronRight className="size-4" aria-hidden /> הגדרות
          </Link>
        }
        title="צוות ותחומי אחריות"
        description="מי אחראי על מה. לפי זה המערכת משייכת משימות, שולחת התראות ובונה לכל שותף את ״היום שלי״."
      />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="שותפים" description="כל שותף עורך את הפרטים שלו; בעל החשבון יכול לערוך את כולם." />
          <ul className="divide-y divide-line">
            {active.map((m) => (
              <MemberCard key={m.id} member={m} responsibilities={responsibilities ?? []} canEdit={isOwner || m.id === viewer.userId} isMe={m.id === viewer.userId} />
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="תחומי אחריות" description="לא קבועים בקוד — מוסיפים, משנים ומעבירים בין שותפים מתי שרוצים." />
          <Responsibilities items={responsibilities ?? []} staff={staff} />
        </Card>

        <Card>
          <CardHeader title="עומס עבודה" description="משימות פתוחות לכל שותף. לחיצה על מספר פותחת את הרשימה." />
          <WorkloadList rows={workloadFor(input)} colors={Object.fromEntries(active.map((m) => [m.id, m.avatar_color]))} meId={viewer.userId} />
        </Card>
      </div>
    </div>
  );
}
