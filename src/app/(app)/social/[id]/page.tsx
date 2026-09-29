import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clapperboard } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { FileGrid } from "@/components/files/file-list";
import { FileUploader } from "@/components/files/file-uploader";
import { AlbumMenu, AlbumStatusControl } from "@/components/social/album-controls";
import { ReelGrid } from "@/components/social/reels";
import { clientOptions, getAlbum, projectOptions } from "@/lib/data/crm";
import { albumSection, type AlbumSection } from "@/lib/domain/labels";
import { ACCEPT_MEDIA } from "@/lib/storage";
import { cn, first } from "@/lib/utils";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "תיקיית סושיאל" };

const HINTS: Record<AlbumSection, string> = {
  reels: "סרטונים ערוכים ומוכנים — אנכיים (9:16), MP4 או MOV עד 50MB. מכאן משתפים ישר לאינסטגרם.",
  process: "צילומי מסך של קוד, מסד הנתונים, העיצוב בעבודה",
  before_after: "האתר הישן מול החדש",
  final: "הקלטות מסך של התוצר הגמור, מובייל ודסקטופ",
  behind_scenes: "אתם מול המחשב, שיחות עם הלקוח, סטודיו",
  other: "כל השאר",
};

export default async function AlbumPage({ params, searchParams }: PageProps<"/social/[id]">) {
  await requireArea("social");
  const { id } = await params;
  const sp = await searchParams;
  const [data, clients, projects] = await Promise.all([getAlbum(id), clientOptions(), projectOptions()]);
  if (!data) notFound();
  const { album, files } = data;
  const { clients: client, projects: project, ...albumRow } = album;

  const count = (s: AlbumSection) => files.filter((f) => (f.album_section ?? "other") === s).length;
  const requested = first(sp.s) as AlbumSection | undefined;
  // Default: finished reels if there are any, otherwise where material is being collected.
  const section: AlbumSection = requested && albumSection.values.includes(requested) ? requested : count("reels") ? "reels" : "process";
  const items = files.filter((f) => (f.album_section ?? "other") === section);

  return (
    <>
      <div className="mb-2">
        <Link href="/social" className="inline-flex min-h-9 items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden /> סושיאל
        </Link>
      </div>
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">{album.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
            <AlbumStatusControl id={album.id} status={album.status} />
            {client && <Link href={`/clients/${client.id}`} className="hover:text-accent">{client.name}</Link>}
            {project && <Link href={`/projects/${project.id}`} className="text-ink-3 hover:text-accent">{project.name}</Link>}
            <span className="text-ink-3 num">{files.length} קבצים</span>
          </div>
        </div>
        <div className="flex gap-2">
          <AlbumMenu album={albumRow} clients={clients} projects={projects} />
        </div>
      </header>

      {(album.description || album.notes) && (
        <details className="group mb-4 rounded-lg border border-line bg-surface shadow-1 sm:open:pb-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-medium text-ink-2 hover:text-ink">רעיון לסרטון והערות לעריכה</summary>
          <CardBody className="grid gap-4 pt-0 sm:grid-cols-2">
            {album.description && <div><div className="text-xs font-medium text-ink-3">רעיון לסרטון</div><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{album.description}</p></div>}
            {album.notes && <div><div className="text-xs font-medium text-ink-3">הערות לעריכה</div><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{album.notes}</p></div>}
          </CardBody>
        </details>
      )}

      {/* One section at a time — a calm screen on the phone instead of six stacked lists. */}
      <nav aria-label="חלקי התיקייה" className="scrollbar-thin sticky top-14 z-10 -mx-4 mb-4 overflow-x-auto border-b border-line bg-paper/95 px-4 py-2 backdrop-blur-sm lg:top-16 lg:mx-0 lg:rounded-lg lg:border lg:px-2">
        <ul className="flex min-w-max gap-1.5">
          {albumSection.list.map((sec) => {
            const on = sec.value === section;
            const n = count(sec.value);
            return (
              <li key={sec.value}>
                <Link
                  href={`/social/${id}?s=${sec.value}`}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                    on ? "border-accent/30 bg-accent-soft font-medium text-accent-ink" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken",
                    sec.value === "reels" && !on && "border-ink/15",
                  )}
                >
                  {sec.value === "reels" && <Clapperboard className="size-3.5" aria-hidden />}
                  {sec.label}
                  {n > 0 && <span className={cn("rounded-full px-1.5 text-xs num", on ? "bg-accent text-white" : "bg-sunken text-ink-3")}>{n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-label={albumSection.label(section)} className="flex flex-col gap-4">
        <Card>
          <CardBody className="flex flex-col gap-3">
            <p className="text-sm text-ink-3">{HINTS[section]}</p>
            <FileUploader
              category="social"
              albumId={album.id}
              albumSection={section}
              accept={ACCEPT_MEDIA}
              compact
              hint={section === "reels" ? "סרטון מוכן (MP4 / MOV) — עד 50MB" : "תמונות, סרטונים (MP4, MOV) ו-PDF"}
            />
          </CardBody>
        </Card>
        {section === "reels" ? (
          <ReelGrid
            reels={items.map((f) => ({ ...f, album: null }))}
            empty={<p className="py-6 text-center text-sm text-ink-3">עוד אין כאן סרטונים מוכנים.</p>}
          />
        ) : items.length > 0 ? (
          <FileGrid files={items} />
        ) : (
          <p className="py-6 text-center text-sm text-ink-3">עוד אין קבצים בחלק הזה.</p>
        )}
      </section>
    </>
  );
}
