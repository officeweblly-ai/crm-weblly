import Link from "next/link";
import { ChevronLeft, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { MemberCard, Responsibilities } from "@/components/settings/team";
import { AddMemberForm, MemberAccessButton } from "@/components/settings/settings-forms";
import { MemberRoleSelect, RoleList, type Role } from "@/components/team/roles";
import { WorkloadList } from "@/components/work/workload";
import { requireStaff } from "@/lib/auth";
import { loadWorkInput } from "@/lib/data/work";
import { createClient } from "@/lib/supabase/server";
import { workloadFor } from "@/lib/work-engine";

export const metadata = { title: "צוות ועובדים" };

const systemRole = { owner: "בעלים", admin: "מנהל", member: "צוות" } as const;

export default async function TeamPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const [{ data: members }, { data: roles }, { data: responsibilities }, { input }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("team_roles").select("id, name, description, color, permissions").order("position"),
    supabase.from("team_responsibilities").select("*").order("position"),
    loadWorkInput(supabase),
  ]);
  const isOwner = viewer.profile.role === "owner";
  const all = members ?? [];
  const active = all.filter((m) => m.is_active);
  const pending = all.filter((m) => !m.is_active);
  const roleList: Role[] = roles ?? [];
  const roleById = new Map(roleList.map((r) => [r.id, r]));
  const holders: Record<string, string[]> = {};
  for (const m of active) if (m.team_role_id) (holders[m.team_role_id] ??= []).push((m.full_name || m.email).split(" ")[0]);
  const staff = active.map((m) => ({ value: m.id, label: m.full_name || m.email }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="צוות ועובדים"
        description="מי עובד איתנו, באיזה תפקיד, מה כל אחד רואה ועל מה הוא אחראי."
      />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="אנשי הצוות" description={isOwner ? "בוחרים לכל אחד תפקיד — התפקיד קובע אילו אזורים הוא רואה." : "רק בעל החשבון משייך תפקידים."} />
          <ul className="divide-y divide-line">
            {active.map((m) => {
              const role = m.team_role_id ? roleById.get(m.team_role_id) : null;
              return (
                <MemberCard
                  key={m.id}
                  member={m}
                  responsibilities={responsibilities ?? []}
                  canEdit={isOwner || m.id === viewer.userId}
                  isMe={m.id === viewer.userId}
                  footer={
                    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
                      <Badge tone={m.role === "owner" ? "accent" : "neutral"} dot={false}>{systemRole[m.role]}</Badge>
                      {m.role === "owner" ? (
                        <span className="text-xs text-ink-3">גישה מלאה תמיד</span>
                      ) : isOwner ? (
                        <MemberRoleSelect userId={m.id} roleId={m.team_role_id} roles={roleList} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                          {role && <span className="size-2.5 rounded-full" style={{ background: role.color }} aria-hidden />}
                          {role?.name ?? "גישה מלאה"}
                        </span>
                      )}
                      {isOwner && m.id !== viewer.userId && m.role !== "owner" && <span className="ms-auto"><MemberAccessButton id={m.id} active /></span>}
                    </div>
                  }
                />
              );
            })}
          </ul>
          {pending.length > 0 && (
            <div className="border-t border-line bg-warn-soft/40 px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-ink">ממתינים לאישור / מושבתים</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {pending.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{m.full_name || "ללא שם"}</span>
                      <bdi dir="ltr" className="ms-2 font-mono text-xs text-ink-3">{m.email}</bdi>
                    </span>
                    {isOwner && <MemberAccessButton id={m.id} active={false} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isOwner && (
            <CardBody className="border-t border-line">
              <AddMemberForm roles={roleList.map((r) => ({ value: r.id, label: r.name }))} />
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="תפקידים והרשאות" description="לקוחות, פרויקטים, משימות וקבצים — פתוחים לכל הצוות. התפקיד פותח או סוגר את האזורים הרגישים." />
          <RoleList roles={roleList} holders={holders} isOwner={isOwner} />
        </Card>

        <Card>
          <CardHeader title="תחומי אחריות" description="מי אחראי על מה — לפי זה המערכת משייכת משימות ושולחת התראות." />
          <Responsibilities items={responsibilities ?? []} staff={staff} />
        </Card>

        <Card>
          <CardHeader title="עומס עבודה" description="משימות פתוחות לכל אחד. לחיצה על מספר פותחת את הרשימה." />
          <WorkloadList rows={workloadFor(input)} colors={Object.fromEntries(active.map((m) => [m.id, m.avatar_color]))} meId={viewer.userId} />
        </Card>

        <Link href="/settings" className="group flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-1 hover:border-line-strong sm:px-5">
          <UsersRound className="size-5 text-ink-3" aria-hidden />
          <span className="flex-1 text-ink-2">הפרופיל שלי, סיסמה והתראות — בהגדרות</span>
          <ChevronLeft className="size-4 text-ink-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
