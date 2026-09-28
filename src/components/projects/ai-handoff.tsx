"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Copy, Download, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { generateAiHandoff } from "@/lib/actions/project-hub";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createZip, downloadBlob } from "@/lib/zip";

export type HandoffView = { files: { name: string; content: string }[]; megaPrompt: string; createdAt: string };

const MEGA = "MEGA_PROMPT";

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} הועתק — אפשר להדביק ב-Claude Code או ב-Codex`);
  } catch {
    toast.error("ההעתקה נכשלה. אפשר להוריד את החבילה במקום.");
  }
}

function slug(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 40) || "project"
  );
}

/**
 * "Prepare for Claude / Codex": builds a real context package from this
 * project's data (brief, answers, references, tasks, links). No fake
 * integration — the user pastes the prompt or drops the files into the repo.
 */
export function AiHandoffCard({ projectId, projectName, latest, sharedNotes }: { projectId: string; projectName: string; latest: HandoffView | null; sharedNotes: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pkg, setPkg] = useState<HandoffView | null>(latest);
  const [viewing, setViewing] = useState(false);
  const [tab, setTab] = useState<string>(MEGA);
  const [includeContacts, setIncludeContacts] = useState(false);
  const [includeFileLinks, setIncludeFileLinks] = useState(false);

  const generate = () =>
    start(async () => {
      const r = await generateAiHandoff(projectId, { includeContacts, includeFileLinks });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "מוכן");
      setPkg({ files: r.data.files, megaPrompt: r.data.megaPrompt, createdAt: r.data.createdAt });
      setTab(MEGA);
      setViewing(true);
      router.refresh();
    });

  const download = () => {
    if (!pkg) return;
    const files = [...pkg.files, { name: "MEGA_PROMPT.md", content: pkg.megaPrompt }];
    downloadBlob(createZip(files), `${slug(projectName)}-ai-handoff.zip`);
  };

  const current = tab === MEGA ? pkg?.megaPrompt : pkg?.files.find((f) => f.name === tab)?.content;

  return (
    <Card id="ai-handoff" className="scroll-mt-24">
      <CardHeader title="פיתוח עם AI" description="חבילת הקשר מלאה ל-Claude Code / Codex — בלי להסביר את הפרויקט מחדש." />
      <CardBody className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">
          נאסף אוטומטית: פרטי העסק, סוג ויעדי הפרויקט, כל תשובות האפיון לפי סקשנים, רפרנסים, רשימת חומרים מהלקוח, משימות פתוחות וסגורות, קישורים ו-Tech stack.
          {sharedNotes > 0 ? ` כולל ${sharedNotes} הערות פנימיות שסימנתם לשיתוף.` : " הערות פנימיות לא נכללות, אלא אם מסמנים אותן לשיתוף."}
        </p>
        <fieldset className="flex flex-col">
          <legend className="sr-only">אפשרויות</legend>
          <Checkbox checked={includeContacts} onChange={(e) => setIncludeContacts(e.target.checked)} label="לכלול טלפון ואימייל של הלקוח" />
          <Checkbox checked={includeFileLinks} onChange={(e) => setIncludeFileLinks(e.target.checked)} label="לכלול קישורי הורדה זמניים לקבצים (7 ימים)" />
        </fieldset>
        <p className="text-xs text-ink-3">כספים, תשלומים וחוזים אף פעם לא נכללים.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} loading={pending}>
            <Bot aria-hidden />
            הכן ל-Claude / Codex
          </Button>
          {pkg && (
            <Button variant="secondary" onClick={() => setViewing(true)}>
              <FileCode2 aria-hidden />
              החבילה האחרונה
            </Button>
          )}
        </div>
        {pkg && <p className="text-xs text-ink-3">הוכנה לאחרונה: {formatDateTime(pkg.createdAt)}</p>}
      </CardBody>

      <Modal
        open={viewing && pkg !== null}
        onOpenChange={setViewing}
        size="lg"
        title="חבילת פיתוח ל-AI"
        description="הדביקו את ה-Mega Prompt בכלי, או הורידו את הקבצים לשורש הריפו."
        footer={
          <>
            <Button onClick={() => pkg && copyText(pkg.megaPrompt, "ה-Mega Prompt")}>
              <Copy aria-hidden />
              העתקת Mega Prompt
            </Button>
            <Button variant="secondary" onClick={download}>
              <Download aria-hidden />
              הורדת חבילה (ZIP)
            </Button>
          </>
        }
      >
        {pkg && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div role="tablist" aria-label="קבצי החבילה" className="scrollbar-thin -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1">
                {[MEGA, ...pkg.files.map((f) => f.name)].map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className={cn(
                      "h-9 shrink-0 rounded-md border px-3 font-mono text-xs transition-colors",
                      tab === name ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:bg-sunken",
                    )}
                  >
                    {name === MEGA ? "Mega Prompt" : name}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="secondary" className="mb-1" onClick={() => current && copyText(current, tab === MEGA ? "ה-Mega Prompt" : tab)}>
                <Copy aria-hidden />
                העתקה
              </Button>
            </div>
            <pre dir="auto" role="tabpanel" className="scrollbar-thin max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken/60 p-4 font-sans text-sm leading-relaxed text-ink">{current}</pre>
          </div>
        )}
      </Modal>
    </Card>
  );
}
