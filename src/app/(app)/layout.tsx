import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MobileNav, Sidebar, TopBar } from "@/components/shell/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("workspace_settings").select("business_name").maybeSingle();
  const businessName = settings?.business_name ?? "הסטודיו";

  return (
    <div className="min-h-dvh">
      <Sidebar businessName={businessName} userName={viewer.profile.full_name} email={viewer.email} />
      <div className="lg:ps-60 print:ps-0">
        <TopBar businessName={businessName} />
        <main id="main" className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
      <MobileNav businessName={businessName} userName={viewer.profile.full_name} email={viewer.email} />
    </div>
  );
}
