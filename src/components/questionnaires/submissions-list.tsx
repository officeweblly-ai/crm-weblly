"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ClipboardList, Eye, MoreHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem } from "@/components/ui/menu";
import { CopyLinkButton } from "./send-questionnaire";
import { cancelRequest, deleteRequest } from "@/lib/actions/questionnaires";
import { submissionStatus } from "@/lib/domain/labels";
import { timeAgo } from "@/lib/format";
import type { SubmissionRow } from "@/lib/data/crm";

function statusLine(s: SubmissionRow) {
  switch (s.status) {
    case "completed":
      return `נשלח ${timeAgo(s.completed_at)}`;
    case "in_progress":
      return `נשמר לאחרונה ${timeAgo(s.last_saved_at ?? s.started_at)}`;
    case "sent":
      return s.opened_at ? `נפתח ${timeAgo(s.opened_at)}` : `נשלח ${timeAgo(s.sent_at)} · עוד לא נפתח`;
    case "cancelled":
      return "הקישור בוטל";
    default:
      return `נוצר ${timeAgo(s.created_at)} · עוד לא נשלח`;
  }
}

function Row({ s, showContext }: { s: SubmissionRow; showContext: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const open = s.status !== "completed" && s.status !== "cancelled";

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-sunken text-ink-3">
          <ClipboardList className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/questionnaires/${s.id}`} className="font-medium text-ink hover:text-accent">
              {s.title}
            </Link>
            <Badge tone={submissionStatus.tone(s.status)}>{submissionStatus.label(s.status)}</Badge>
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {statusLine(s)}
            {showContext && s.clients && (
              <>
                {" · "}
                <Link href={`/clients/${s.clients.id}`} className="hover:text-accent">{s.clients.name}</Link>
              </>
            )}
            {showContext && !s.clients && " · לקוח חדש"}
            {s.projects && <> · {s.projects.name}</>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 ps-12 sm:ps-0">
        {s.status === "completed" ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/questionnaires/${s.id}`}>
              <Eye aria-hidden /> צפייה בתשובות
            </Link>
          </Button>
        ) : open ? (
          <CopyLinkButton token={s.token} id={s.id} status={s.status} />
        ) : null}
        <Menu trigger={<Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${s.title}`}><MoreHorizontal /></Button>}>
          <MenuItem onSelect={() => router.push(`/questionnaires/${s.id}`)}><Eye /> פרטים</MenuItem>
          {open && <MenuItem onSelect={() => setConfirm("cancel")}><Ban /> ביטול הקישור</MenuItem>}
          <MenuItem destructive onSelect={() => setConfirm("delete")}><Trash2 /> מחיקה</MenuItem>
        </Menu>
      </div>
      <Confirm
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="ביטול הקישור"
        description="הלקוח לא יוכל יותר לפתוח או לשלוח את השאלון. תשובות שכבר נשמרו כטיוטה יישארו במערכת."
        confirmLabel="ביטול הקישור"
        action={() => cancelRequest(s.id)}
        onDone={() => router.refresh()}
      />
      <Confirm
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="מחיקת שאלון"
        description={s.status === "completed" ? "כל התשובות והקבצים שהלקוח העלה בשאלון הזה יימחקו לצמיתות." : "הקישור והטיוטה יימחקו לצמיתות."}
        confirmLabel="מחיקה"
        action={() => deleteRequest(s.id)}
        onDone={() => router.refresh()}
      />
    </li>
  );
}

export function SubmissionsList({ rows, showContext = false }: { rows: SubmissionRow[]; showContext?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((s) => (
        <Row key={s.id} s={s} showContext={showContext} />
      ))}
    </ul>
  );
}
