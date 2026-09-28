import Link from "next/link";
import { BriefcaseBusiness, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { AddFromProject, OrderButtons } from "@/components/portfolio/portfolio-controls";
import { listPortfolio } from "@/lib/data/crm";
import { portfolioStatus, type PortfolioStatus } from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import { first } from "@/lib/utils";

export const metadata = { title: "תיק עבודות" };

export default async function PortfolioPage({ searchParams }: PageProps<"/portfolio">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [items, { data: projects }] = await Promise.all([
    listPortfolio(),
    supabase.from("projects").select("id, name, status, clients(name)").order("updated_at", { ascending: false }).limit(500),
  ]);
  const taken = new Set(items.map((i) => i.project_id));
  // Finished projects first — they're the natural candidates.
  const candidates = (projects ?? [])
    .filter((p) => !taken.has(p.id))
    .sort((a, b) => Number(b.status === "completed") - Number(a.status === "completed"))
    .map((p) => ({ value: p.id, label: `${p.name}${p.clients?.name ? ` · ${p.clients.name}` : ""}${p.status === "completed" ? " ✓" : ""}` }));
  const published = items.filter((i) => i.status === "published").length;

  return (
    <>
      <PageHeader
        title="תיק עבודות"
        description={items.length ? `${items.length} פרויקטים · ${published} מפורסמים. הסדר כאן הוא סדר ההצגה.` : "עבודות נבחרות, נבנות מתוך הפרויקטים הקיימים — בלי להקליד הכול מחדש."}
        actions={<AddFromProject projects={candidates} defaultOpen={first(sp.new) === "1"} />}
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title="תיק העבודות ריק"
            description="מוסיפים פרויקט (בדרך כלל כשהוא מסתיים) — השם, התיאור, הטכנולוגיות והקישור לאתר נמשכים מהפרויקט, ונשאר לבחור תמונות."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i, idx) => (
            <li key={i.id} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-2">
              <Link href={`/portfolio/${i.id}`} className="relative block aspect-[16/10] overflow-hidden bg-sunken">
                {i.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                  <img src={i.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                ) : (
                  <span className="grid size-full place-items-center text-ink-3">
                    <span className="flex flex-col items-center gap-1 text-xs">
                      <ImageOff className="size-6" aria-hidden />
                      אין תמונת שער
                    </span>
                  </span>
                )}
                <span className="absolute start-2 top-2 flex gap-1">
                  <Badge tone={portfolioStatus.tone(i.status as PortfolioStatus)} className="bg-surface/95">{portfolioStatus.label(i.status as PortfolioStatus)}</Badge>
                  {i.is_featured && <Badge tone="accent" className="bg-surface/95">מוביל</Badge>}
                </span>
              </Link>
              <div className="flex items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/portfolio/${i.id}`} className="block truncate text-base font-semibold text-ink hover:text-accent">{i.title}</Link>
                  <p className="truncate text-sm text-ink-3">
                    {[i.category, i.mediaCount ? `${i.mediaCount} תמונות` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {i.projects && (
                    <Link href={`/projects/${i.projects.id}`} className="mt-1 block truncate text-xs text-ink-3 hover:text-accent">
                      פרויקט: {i.projects.name}
                    </Link>
                  )}
                </div>
                <OrderButtons id={i.id} first={idx === 0} last={idx === items.length - 1} title={i.title} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
