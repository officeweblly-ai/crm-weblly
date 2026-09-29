"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PdfButton } from "@/components/ui/pdf-button";
import { toast } from "sonner";
import { Copy, CopyPlus, FileSignature, FolderPlus, MessageCircle, MoreHorizontal, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { StatusSelect } from "@/components/ui/status-select";
import { convertProposalToProject, deleteProposal, duplicateProposal, sendProposal, setProposalStatus } from "@/lib/actions/proposals";
import { proposalStatus, type ProposalStatus } from "@/lib/domain/labels";
import { whatsappLink } from "@/lib/format";

export function ProposalActions({
  id,
  status,
  link,
  clientPhone,
  clientName,
  convertedProjectId,
  contractId,
  pdfName,
}: {
  pdfName: string;
  id: string;
  status: ProposalStatus;
  link: string | null;
  clientPhone: string | null;
  clientName: string;
  convertedProjectId: string | null;
  contractId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(link);
  const [deleting, setDeleting] = useState(false);

  const copy = async (u: string) => {
    try {
      await navigator.clipboard.writeText(u);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("ההעתקה נכשלה — סמנו את הקישור והעתיקו ידנית");
    }
  };
  const send = () =>
    start(async () => {
      const r = await sendProposal(id);
      if (!r.ok) return void toast.error(r.error);
      setUrl(r.data.url);
      toast.success(r.message ?? "מוכן");
      router.refresh();
    });
  const act = <T,>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, go?: (d: T) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      if (go) router.push(go(r.data));
      else router.refresh();
    });
  const wa = url ? whatsappLink(clientPhone, `היי ${clientName}, מצורפת הצעת המחיר שלנו. אפשר לקרוא ולאשר כאן: ${url}`) : null;
  const accepted = status === "accepted";

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <StatusSelect label="סטטוס ההצעה" value={status} options={proposalStatus.list.filter((o) => o.value !== "viewed" || status === "viewed")} toneOf={proposalStatus.tone} onChange={(v) => setProposalStatus(id, v)} />
        {!accepted && (
          <Button onClick={send} loading={pending}>
            <Send aria-hidden />
            {status === "draft" ? "שליחה ללקוח" : "קישור ללקוח"}
          </Button>
        )}
        {accepted && !convertedProjectId && (
          <Button onClick={() => act(() => convertProposalToProject(id), (d) => `/projects/${d.projectId}`)} loading={pending}>
            <FolderPlus aria-hidden />
            המרה לפרויקט
          </Button>
        )}
        {accepted && convertedProjectId && (
          <Button asChild variant="secondary">
            <Link href={`/projects/${convertedProjectId}`}><FolderPlus aria-hidden />לפרויקט</Link>
          </Button>
        )}
        {accepted && (
          <Button asChild variant={convertedProjectId ? "primary" : "secondary"}>
            <Link href={contractId ? `/contracts/${contractId}` : `/contracts/new?proposal=${id}`}>
              <FileSignature aria-hidden />
              {contractId ? "לחוזה" : "יצירת חוזה מההצעה"}
            </Link>
          </Button>
        )}
        <PdfButton path={`/proposals/${id}`} name={pdfName} variant="secondary" label="PDF" />
        <Menu trigger={<Button variant="secondary" size="icon" aria-label="פעולות נוספות"><MoreHorizontal /></Button>}>
          {!accepted && <MenuItem onSelect={() => router.push(`/proposals/${id}/edit`)}><Pencil /> עריכה</MenuItem>}
          <MenuItem onSelect={() => act(() => duplicateProposal(id), (d) => `/proposals/${d.id}/edit`)}><CopyPlus /> שכפול</MenuItem>
          <MenuItem onSelect={() => window.print()}><Printer /> הדפסה</MenuItem>
          {!accepted && (
            <>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> מחיקה</MenuItem>
            </>
          )}
        </Menu>
      </div>
      {url && !accepted && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center">
          <bdi dir="ltr" className="min-w-0 flex-1 truncate text-right font-mono text-xs text-ink-2">{url}</bdi>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => copy(url)}><Copy aria-hidden />העתקה</Button>
            {wa && (
              <Button asChild size="sm" variant="secondary">
                <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />וואטסאפ</a>
              </Button>
            )}
          </div>
        </div>
      )}
      <Confirm open={deleting} onOpenChange={setDeleting} title="מחיקת הצעת מחיר" description="ההצעה והקישור שלה יימחקו." confirmLabel="מחיקה" action={() => deleteProposal(id)} onDone={() => router.push("/proposals")} />
    </div>
  );
}
