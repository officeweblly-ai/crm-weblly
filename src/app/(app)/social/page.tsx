import Link from "next/link";
import { Clapperboard, FolderPlus, Images, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { AlbumFormModal } from "@/components/social/album-controls";
import { ReelGrid } from "@/components/social/reels";
import { clientOptions, listAlbums, listReels, projectOptions } from "@/lib/data/crm";
import { socialAlbumStatus } from "@/lib/domain/labels";
import { timeAgo } from "@/lib/format";
import { cn, first } from "@/lib/utils";

export const metadata = { title: "סושיאל" };

function Segment({ items }: { items: { href: string; label: string; count?: number; on: boolean }[] }) {
  return (
    <div className="mb-5 inline-flex w-full rounded-lg border border-line-strong bg-surface p-0.5 text-sm sm:w-auto" role="group" aria-label="תצוגה">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          aria-current={i.on ? "page" : undefined}
          className={cn("inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-4 sm:flex-none", i.on ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}
        >
          {i.label}
          {i.count !== undefined && i.count > 0 && <span className={cn("rounded-full px-1.5 text-xs num", i.on ? "bg-accent text-white" : "bg-sunken text-ink-3")}>{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export default async function SocialPage({ searchParams }: PageProps<"/social">) {
  const sp = await searchParams;
  const tab = first(sp.tab) === "ready" ? "ready" : "albums";
  const posted = first(sp.posted) === "1";
  const [albums, clients, projects, waiting, shown] = await Promise.all([
    listAlbums(),
    clientOptions(),
    projectOptions(),
    listReels({ posted: false }),
    tab === "ready" && posted ? listReels({ posted: true }) : Promise.resolve(null),
  ]);
  const reels = shown ?? waiting;
  // Only the header instance auto-opens (?new=1); the empty-state copy must not, or two dialogs open.
  const add = (autoOpen = false) => (
    <AlbumFormModal clients={clients} projects={projects} defaultOpen={autoOpen && first(sp.new) === "1"} trigger={<Button><FolderPlus aria-hidden />תיקייה חדשה</Button>} />
  );

  return (
    <>
      <PageHeader title="סושיאל" description="חומרים מתהליך הבנייה, וסרטונים מוכנים לעלות כרילס — מהטלפון, בלחיצה." actions={add(true)} />
      <Segment
        items={[
          { href: "/social?tab=ready", label: "מוכן לעלות", count: waiting.length, on: tab === "ready" },
          { href: "/social", label: "תיקיות", count: albums.length, on: tab === "albums" },
        ]}
      />

      {tab === "ready" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5 text-sm">
              <Link href="/social?tab=ready" scroll={false} aria-current={!posted ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3.5", !posted ? "border-accent/30 bg-accent-soft font-medium text-accent-ink" : "border-line-strong text-ink-2")}>
                ממתינים לפרסום
              </Link>
              <Link href="/social?tab=ready&posted=1" scroll={false} aria-current={posted ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3.5", posted ? "border-accent/30 bg-accent-soft font-medium text-accent-ink" : "border-line-strong text-ink-2")}>
                פורסמו
              </Link>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              <Smartphone className="size-3.5" aria-hidden />
              באייפון: ״שיתוף״ ← אינסטגרם, או ״שמירת סרטון״
            </p>
          </div>
          <ReelGrid
            reels={reels.map((r) => ({ ...r, album: r.social_albums }))}
            empty={
              <Card>
                <EmptyState
                  compact
                  icon={Clapperboard}
                  title={posted ? "עוד לא סומנו רילס כפורסמו" : "אין כרגע רילס שמחכים"}
                  description={posted ? undefined : "מעלים סרטון ערוך לתוך תיקייה, בחלק ״מוכן לעלות כריל״ — והוא מופיע כאן, מוכן לשיתוף מהטלפון."}
                  action={!posted && albums[0] ? <Button asChild variant="secondary"><Link href={`/social/${albums[0].id}?s=reels`}>לתיקייה האחרונה</Link></Button> : undefined}
                />
              </Card>
            }
          />
        </>
      ) : albums.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="עוד אין תיקיות"
            description="פותחים תיקייה לכל עבודה (למשל: בניית מערכת CRM ללקוח), מעלים אליה צילומי מסך וסרטונים מהתהליך — ומי שעורך את הסרטונים מוריד מכאן."
            action={add()}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          {albums.map((a) => {
            const ready = waiting.filter((r) => r.album_id === a.id).length;
            return (
              <li key={a.id}>
                <Link href={`/social/${a.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface shadow-1 transition-shadow hover:shadow-2">
                  <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-sunken sm:aspect-[16/10]">
                    {a.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                      <img src={a.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <Images className="size-7 text-ink-3" aria-hidden />
                    )}
                    <span className="absolute start-2 top-2 hidden sm:block"><Badge tone={socialAlbumStatus.tone(a.status)}>{socialAlbumStatus.label(a.status)}</Badge></span>
                    {ready > 0 && (
                      <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-white">
                        <Clapperboard className="size-3" aria-hidden />
                        {ready} מוכנים
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 sm:p-3.5">
                    <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-accent sm:truncate sm:text-base">{a.title}</div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">
                      <span className="num">{a.fileCount}</span> קבצים<span className="hidden sm:inline">{a.clients ? ` · ${a.clients.name}` : ""}</span> · {timeAgo(a.created_at)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
