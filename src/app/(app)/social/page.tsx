import Link from "next/link";
import { Clapperboard, FolderPlus, Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { AlbumFormModal } from "@/components/social/album-controls";
import { clientOptions, listAlbums, projectOptions } from "@/lib/data/crm";
import { socialAlbumStatus } from "@/lib/domain/labels";
import { timeAgo } from "@/lib/format";
import { first } from "@/lib/utils";

export const metadata = { title: "סושיאל" };

export default async function SocialPage({ searchParams }: PageProps<"/social">) {
  const sp = await searchParams;
  const [albums, clients, projects] = await Promise.all([listAlbums(), clientOptions(), projectOptions()]);
  // Only the header instance auto-opens (?new=1); the empty-state copy must not, or two dialogs open.
  const add = (autoOpen = false) => (
    <AlbumFormModal clients={clients} projects={projects} defaultOpen={autoOpen && first(sp.new) === "1"} trigger={<Button><FolderPlus aria-hidden />תיקייה חדשה</Button>} />
  );
  return (
    <>
      <PageHeader title="סושיאל" description="חומרים מתהליך הבנייה — לכל עבודה תיקייה משלה, ומשם יוצאים הסרטונים לטיקטוק ולאינסטגרם." actions={add(true)} />
      {albums.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="עוד אין תיקיות"
            description="פותחים תיקייה לכל עבודה (למשל: בניית מערכת CRM ללקוח), מעלים אליה צילומי מסך וסרטונים מהתהליך — ומי שעורך את הסרטונים מוריד מכאן."
            action={add()}
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/social/${a.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface shadow-1 transition-shadow hover:shadow-2">
                <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-sunken">
                  {a.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                    <img src={a.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                  ) : (
                    <Images className="size-8 text-ink-3" aria-hidden />
                  )}
                  <span className="absolute start-2 top-2"><Badge tone={socialAlbumStatus.tone(a.status)}>{socialAlbumStatus.label(a.status)}</Badge></span>
                </div>
                <div className="p-3.5">
                  <div className="truncate font-semibold text-ink group-hover:text-accent">{a.title}</div>
                  <div className="mt-0.5 truncate text-xs text-ink-3">
                    <span className="num">{a.fileCount}</span> קבצים{a.clients ? ` · ${a.clients.name}` : ""} · {timeAgo(a.created_at)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
