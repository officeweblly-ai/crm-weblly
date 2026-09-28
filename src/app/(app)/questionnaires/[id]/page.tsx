import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AnswersView } from "@/components/questionnaires/answers-view";
import { CopyLinkButton } from "@/components/questionnaires/send-questionnaire";
import { SubmissionNotes } from "@/components/questionnaires/submission-notes";
import { getSubmission } from "@/lib/data/crm";
import { isEmptyAnswer, answersSchema, type FormSnapshot } from "@/lib/domain/forms";
import { submissionStatus } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "שאלון" };

export default async function SubmissionPage({ params }: PageProps<"/questionnaires/[id]">) {
  const { id } = await params;
  const data = await getSubmission(id);
  if (!data) notFound();
  const { submission: s, sections, files } = data;
  const supabase = await createClient();
  const { data: proposal } = await supabase.from("proposals").select("id, status").eq("submission_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const completed = s.status === "completed";
  const open = s.status !== "completed" && s.status !== "cancelled";
  const snapshot = s.form_snapshot as unknown as FormSnapshot;
  const totalQ = snapshot.sections?.reduce((n, sec) => n + sec.questions.length, 0) ?? 0;
  const draft = answersSchema.safeParse(s.draft_answers);
  const answered = draft.success ? Object.values(draft.data).filter((v) => !isEmptyAnswer(v as never)).length : 0;

  const timeline: [string, string | null][] = [
    ["נוצר", s.created_at],
    ["נשלח", s.sent_at],
    ["נפתח לראשונה", s.opened_at],
    ["התחיל למלא", s.started_at],
    ["נשמר לאחרונה", completed ? null : s.last_saved_at],
    ["נשלח על ידי הלקוח", s.completed_at],
  ];

  return (
    <>
      <div className="mb-2">
        <Link href={s.clients ? `/clients/${s.clients.id}?tab=questionnaires` : "/questionnaires"} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden />
          {s.clients ? s.clients.name : "שאלוני אפיון"}
        </Link>
      </div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-ink">{s.title}</h1>
            <Badge tone={submissionStatus.tone(s.status)}>{submissionStatus.label(s.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-3">
            {s.clients ? <Link href={`/clients/${s.clients.id}`} className="hover:text-accent">{s.clients.name}{s.clients.business_name ? ` · ${s.clients.business_name}` : ""}</Link> : "לקוח חדש — ייווצר מהתשובות"}
            {s.projects && <> · <Link href={`/projects/${s.projects.id}`} className="hover:text-accent">{s.projects.name}</Link></>}
          </p>
        </div>
        {completed && s.client_id && (
          <Button asChild>
            <Link href={proposal ? `/proposals/${proposal.id}` : `/proposals/new?submission=${s.id}`}>
              <ReceiptText aria-hidden />
              {proposal ? "להצעת המחיר" : "יצירת הצעת מחיר"}
            </Link>
          </Button>
        )}
        {open && (
          <div className="flex gap-2">
            <CopyLinkButton token={s.token} id={s.id} status={s.status} size="md" />
            <Button asChild variant="ghost">
              <a href={`/form/${s.token}`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> פתיחה</a>
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {completed ? (
            <Card>
              <CardHeader title="תשובות הלקוח" description={`נשלח ${formatDateTime(s.completed_at)}`} />
              <CardBody>
                <AnswersView sections={sections} files={Object.fromEntries(files)} />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="עוד לא נשלח" />
              <CardBody className="flex flex-col gap-4">
                <p className="text-sm text-ink-2">
                  {s.status === "cancelled"
                    ? "הקישור בוטל. הלקוח לא יכול לפתוח אותו."
                    : answered > 0
                      ? `הלקוח ענה עד עכשיו על ${answered} מתוך ${totalQ} שאלות. התשובות יופיעו כאן אחרי השליחה.`
                      : "הלקוח עוד לא התחיל למלא. אפשר להעתיק את הקישור ולשלוח לו שוב."}
                </p>
                {totalQ > 0 && open && (
                  <div className="h-2 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={totalQ} aria-label="התקדמות המילוי">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (answered / totalQ) * 100)}%` }} />
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader title="הערות פנימיות" />
            <CardBody>
              <SubmissionNotes id={s.id} value={s.internal_notes} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="מעקב" />
            <CardBody>
              <ol className="flex flex-col gap-3 text-sm">
                {timeline.map(([label, at]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span className={at ? "text-ink-2" : "text-ink-3"}>{label}</span>
                    <span className={at ? "text-ink" : "text-ink-3"}>{at ? formatDateTime(at) : "—"}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
