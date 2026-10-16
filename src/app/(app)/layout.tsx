import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/nav";
import { AppPrompt } from "@/components/shell/push-setup";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const [{ data: settings }, { count: unread }, { data: staff }, { data: clients }, { data: projects }, jar] = await Promise.all([
    supabase.from("workspace_settings").select("business_name").maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewer.userId).is("read_at", null),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name"),
    supabase.from("clients").select("id, name, business_name").not("status", "in", "(archived)").order("name").limit(500),
    supabase.from("projects").select("id, name, client_id").neq("status", "completed").order("updated_at", { ascending: false }).limit(300),
    cookies(),
  ]);
  const businessName = settings?.business_name ?? "הסטודיו";
  const allowed = viewer.access.all ? ("all" as const) : [...viewer.access.allowed];
  // Options for the global "+ משימה" / "+ אירוע" forms.
  const options = {
    me: viewer.userId,
    staff: (staff ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email })),
    clients: (clients ?? []).map((c) => ({ value: c.id, label: c.business_name ? `${c.name} · ${c.business_name}` : c.name })),
    projects: (projects ?? []).map((p) => ({ value: p.id, label: p.name, clientId: p.client_id })),
  };

  return (
    <AppShell
      businessName={businessName}
      user={{ id: viewer.userId, name: viewer.profile.full_name, email: viewer.email, color: viewer.profile.avatar_color }}
      allowed={allowed}
      unread={unread ?? 0}
      collapsed={jar.get("sidebar")?.value === "collapsed"}
      options={options}
    >
      <AppPrompt />
      {children}
    </AppShell>
  );
}
