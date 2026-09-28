"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Copy, Download, Loader2, MoreHorizontal, Pencil, Play, RotateCcw, Share, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Textarea } from "@/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { deleteFile, getFileUrl } from "@/lib/actions/files";
import { setReelCaption, setReelPosted } from "@/lib/actions/social";
import { formatDay, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Reel = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  posted_at: string | null;
  created_at: string;
  thumbUrl: string | null;
  album: { id: string; title: string } | null;
};

/** Fetches the file once (signed URL → blob) so it can go to the share sheet or be saved. */
async function fileBlob(r: Reel): Promise<File> {
  const res = await getFileUrl(r.id);
  if (!res.ok) throw new Error(res.error);
  const blob = await (await fetch(res.data.url)).blob();
  return new File([blob], r.original_name, { type: r.mime_type || blob.type });
}

function CaptionModal({ reel, open, onOpenChange }: { reel: Reel; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(reel.caption ?? "");
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await setReelCaption(reel.id, value);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "נשמר");
      onOpenChange(false);
      router.refresh();
    });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="כיתוב לריל"
      description="הטקסט שמדביקים באינסטגרם / בטיקטוק. עד 2,200 תווים."
      footer={
        <>
          <Button onClick={save} loading={pending}>שמירה</Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={7} maxLength={2200} autoFocus aria-label="כיתוב" placeholder={"כך בנינו את האתר של…\n\n#webdesign #עיצובאתרים"} />
      <p className="mt-1 text-start text-xs text-ink-3 num">{value.length}/2200</p>
    </Modal>
  );
}

function ReelCard({ reel }: { reel: Reel }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [pending, start] = useTransition();
  const [caption, setCaption] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const posted = Boolean(reel.posted_at);
  const isVideo = reel.mime_type.startsWith("video/");

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const copyCaption = async () => {
    if (!reel.caption) return;
    try {
      await navigator.clipboard.writeText(reel.caption);
      toast.success("הכיתוב הועתק — מדביקים באינסטגרם");
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  };

  // iPhone: the share sheet has "Instagram" and "Save Video". Elsewhere: a download.
  // Safari may refuse share() after a long download (the tap "expired") — then the
  // file stays ready and the next tap opens the sheet instantly.
  const [ready, setReady] = useState<File | null>(null);
  const openSheet = async (file: File) => {
    if (!navigator.canShare?.({ files: [file] })) return download(file);
    await navigator.share({ files: [file], title: reel.album?.title ?? reel.original_name });
  };
  const share = async () => {
    if (ready) {
      try {
        await openSheet(ready);
      } catch (e) {
        if ((e as Error).name !== "AbortError") toast.error("השיתוף נכשל. נסו ״הורדה״.");
      }
      return;
    }
    setBusy("share");
    let file: File | null = null;
    try {
      file = await fileBlob(reel);
      setReady(file);
      if (reel.caption) await navigator.clipboard.writeText(reel.caption).catch(() => undefined);
      await openSheet(file);
    } catch (e) {
      const name = (e as Error).name;
      if (name === "NotAllowedError" && file) toast.success("הסרטון מוכן — לחצו שוב על ״שיתוף״");
      else if (name !== "AbortError") toast.error("השיתוף נכשל. נסו ״הורדה״.");
    } finally {
      setBusy(null);
    }
  };
  const download = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const save = async () => {
    setBusy("save");
    try {
      download(await fileBlob(reel));
    } catch {
      toast.error("ההורדה נכשלה");
    } finally {
      setBusy(null);
    }
  };
  const markPosted = (v: boolean) =>
    start(async () => {
      const r = await setReelPosted(reel.id, v);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "עודכן");
      router.refresh();
    });

  return (
    <li className={cn("flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-1", posted && "opacity-75")}>
      <div className="relative aspect-[9/16] bg-ink">
        {isVideo && reel.thumbUrl ? (
          <>
            <video
              ref={video}
              src={`${reel.thumbUrl}#t=0.1`}
              className="size-full object-cover"
              playsInline
              muted
              loop
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={toggle}
              aria-label={`תצוגה מקדימה: ${reel.original_name}`}
            />
            {!playing && (
              <button type="button" onClick={toggle} className="absolute inset-0 grid place-items-center" aria-label="ניגון">
                <span className="grid size-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                  <Play className="size-5 translate-x-[-1px] fill-current" aria-hidden />
                </span>
              </button>
            )}
          </>
        ) : reel.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed private URL
          <img src={reel.thumbUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-sm text-white/70">אין תצוגה</span>
        )}
        {posted && (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-ok px-2 py-0.5 text-xs font-medium text-white">
            <CheckCheck className="size-3.5" aria-hidden />
            פורסם
          </span>
        )}
        <div className="absolute end-1 top-1">
          <Menu trigger={<Button variant="ghost" size="icon" aria-label="פעולות" className="text-white hover:bg-black/30 hover:text-white"><MoreHorizontal /></Button>}>
            <MenuItem onSelect={() => setCaption(true)}><Pencil /> {reel.caption ? "עריכת כיתוב" : "הוספת כיתוב"}</MenuItem>
            {reel.caption && <MenuItem onSelect={copyCaption}><Copy /> העתקת הכיתוב</MenuItem>}
            <MenuItem onSelect={save}><Download /> הורדה</MenuItem>
            <MenuItem onSelect={() => markPosted(!posted)}>{posted ? <><RotateCcw /> החזרה ל״מוכן״</> : <><Check /> סימון כפורסם</>}</MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> מחיקה</MenuItem>
          </Menu>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <button type="button" onClick={() => setCaption(true)} className="min-h-10 text-start">
          {reel.caption ? (
            <span className="line-clamp-2 text-xs leading-relaxed text-ink-2">{reel.caption}</span>
          ) : (
            <span className="text-xs text-ink-3">+ כיתוב</span>
          )}
        </button>
        <p className="truncate text-[11px] text-ink-3">
          {reel.album && (
            <Link href={`/social/${reel.album.id}`} className="hover:text-accent">
              {reel.album.title}
            </Link>
          )}
          {" · "}
          {posted ? `פורסם ${formatDay(reel.posted_at)}` : timeAgo(reel.created_at)}
        </p>
        <div className="mt-auto flex gap-1.5">
          <Button size="sm" className="h-10 flex-1" onClick={share} disabled={busy !== null}>
            {busy === "share" ? <Loader2 className="animate-spin" aria-hidden /> : <Share aria-hidden />}
            {busy === "share" ? "מכין…" : "שיתוף"}
          </Button>
          {!posted && (
            <Button size="icon" variant="secondary" className="size-10" onClick={() => markPosted(true)} loading={pending} aria-label="סימון כפורסם" title="סימון כפורסם">
              {!pending && <Check />}
            </Button>
          )}
        </div>
      </div>
      <CaptionModal reel={reel} open={caption} onOpenChange={setCaption} />
      <Confirm open={deleting} onOpenChange={setDeleting} title="מחיקת ריל" description={<>הקובץ &quot;{reel.original_name}&quot; יימחק לצמיתות.</>} confirmLabel="מחיקה" action={() => deleteFile(reel.id)} onDone={() => router.refresh()} />
    </li>
  );
}

export function ReelGrid({ reels, empty }: { reels: Reel[]; empty?: React.ReactNode }) {
  if (!reels.length) return <>{empty}</>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {reels.map((r) => (
        <ReelCard key={r.id} reel={r} />
      ))}
    </ul>
  );
}
