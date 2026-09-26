import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FileGrid } from "@/components/files/file-list";
import { FileUploader } from "@/components/files/file-uploader";
import { AlbumMenu, AlbumStatusControl } from "@/components/social/album-controls";
import { clientOptions, getAlbum, projectOptions } from "@/lib/data/crm";
import { albumSection } from "@/lib/domain/labels";
import { ACCEPT_MEDIA } from "@/lib/storage";

export const metadata = { title: "תיקיית סושיאל" };

const HINTS: Record<string, string> = {
  process: "צילומי מסך של קוד, מסד הנתונים, העיצוב בעבודה",
  before_after: "האתר הישן מול החדש",
  final: "הקלטות מסך של התוצר הגמור, מובייל ודסקטופ",
  behind_scenes: "אתם מול המחשב, שיחות עם הלקוח, סטודיו",
  other: "כל השאר",
};

export default async function AlbumPage({ params }: PageProps<"/social/[id]">) {
  const { id } = await params;
  const [data, clients, projects] = await Promise.all([getAlbum(id), clientOptions(), projectOptions()]);
  if (!data) notFound();
  const { album, files } = data;
  const { clients: client, projects: project, ...albumRow } = album;

  return (
    <>
      <div className="mb-2">
        <Link href="/social" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden /> סושיאל
        </Link>
      </div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold leading-tight text-ink">{album.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-2">
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
        <Card className="mb-5">
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {album.description && <div><div className="text-xs font-medium text-ink-3">רעיון לסרטון</div><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{album.description}</p></div>}
            {album.notes && <div><div className="text-xs font-medium text-ink-3">הערות לעריכה</div><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{album.notes}</p></div>}
          </CardBody>
        </Card>
      )}

      <div className="flex flex-col gap-5">
        {albumSection.list.map((sec) => {
          const items = files.filter((f) => (f.album_section ?? "other") === sec.value);
          return (
            <Card key={sec.value}>
              <CardHeader title={<span className="flex items-center gap-2">{sec.label}<span className="rounded-full bg-sunken px-1.5 text-xs font-medium text-ink-3 num">{items.length}</span></span>} description={HINTS[sec.value]} />
              <CardBody className="flex flex-col gap-4">
                {items.length > 0 && <FileGrid files={items} />}
                <FileUploader category="social" albumId={album.id} albumSection={sec.value} accept={ACCEPT_MEDIA} compact hint="תמונות, סרטונים (MP4, MOV) ו-PDF" />
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
