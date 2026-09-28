import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PortalView } from "@/components/portal/portal-view";
import { getPublicProject } from "@/lib/data/public";

export const metadata: Metadata = {
  title: "עדכון פרויקט",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

function Invalid() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-5">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-line bg-surface">
          <Link2Off className="size-5 text-ink-3" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-ink">הקישור לא פעיל</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">ייתכן שהקישור הוחלף בקישור חדש או שהועתק באופן חלקי. בקשו מאיתנו את הקישור העדכני.</p>
        <div className="mt-8 flex justify-center">
          <Logo size="sm" />
        </div>
      </div>
    </main>
  );
}

export default async function ProjectPortalPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const data = await getPublicProject(token);
  if (data.state !== "open") return <Invalid />;
  return <PortalView token={token} data={data} />;
}
