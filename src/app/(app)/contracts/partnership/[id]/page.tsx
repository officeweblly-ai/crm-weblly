import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ExternalLink, Pencil } from "lucide-react";
import { AgreementDocument, signedStamp } from "@/components/agreement/agreement-document";
import { CopyLinkButton, SignedPdfButton } from "@/components/agreement/agreement-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DataItem, DataList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PdfButton } from "@/components/ui/pdf-button";
import { requireArea } from "@/lib/auth";
import { getAgreementForStaff, getAgreementHistory } from "@/lib/data/agreement";
import { partnerAgreementStatus } from "@/lib/domain/labels";
import { agreementNumber, signingSummary } from "@/lib/domain/partners";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "הסכם שותפות WEBLLY" };

/** Admin view of the partnership agreement: preview, status, link, PDF, versions. */
export default async function PartnershipPage({ params }: PageProps<"/contracts/partnership/[id]">) {
  await requireArea("partners");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [view, history] = await Promise.all([getAgreementForStaff(id), getAgreementHistory(id)]);
  if (!view) notFound();

  const { content } = view;
  const summary = signingSummary(content.parties, view.signatures.map((s) => s.party));
  const link = view.token ? `/agreement/${view.token}` : null;
  const pdfName = `הסכם שותפות WEBLLY — גרסה ${view.version}${summary.state === "signed" ? " — חתום" : summary.state === "partial" ? " — נחתם חלקית" : " — טיוטה"}`;
  const nameOf = new Map(content.parties.map((p) => [p.key, p.name]));

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link href="/contracts" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowRight className="size-4" aria-hidden />
            חוזים
          </Link>
        }
        title="הסכם שותפות WEBLLY"
        description={`${view.title} · מזהה ${agreementNumber(view.id)} · גרסה ${view.version}`}
        actions={
          <>
            {link && <CopyLinkButton path={link} label="העתקת קישור חתימה" size="md" />}
            {link && (
              <Button asChild variant="secondary">
                <a href={link} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden />
                  עמוד החתימה
                </a>
              </Button>
            )}
            {link && <PdfButton path={link} name={pdfName} label="הורדת PDF" />}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-lg bg-[#ededeb] p-1.5 sm:p-6">
          <div className="mx-auto max-w-[210mm] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.18)]">
            <AgreementDocument id={view.id} title={view.title} content={content} version={view.version} hash={view.hash} signatures={view.signatures} />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader
              title="סטטוס"
              description={summary.state === "signed" ? "ההסכם נחתם על ידי שני הצדדים" : summary.waiting}
              action={<Badge tone={partnerAgreementStatus.tone(view.status)}>{partnerAgreementStatus.label(view.status)}</Badge>}
            />
            <ul className="divide-y divide-line">
              {content.parties.map((p) => {
                const s = view.signatures.find((x) => x.party === p.key);
                return (
                  <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{p.name}</span>
                      <span className="block text-xs text-ink-3">
                        {p.title} · {p.role}
                      </span>
                    </span>
                    {s ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ok">
                        <Check className="size-4" aria-hidden />
                        <span dir="ltr">{signedStamp(s.signedAt)}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-3">ממתין לחתימה</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="פרטים" />
            <CardBody>
              <DataList className="sm:grid-cols-2 xl:grid-cols-2">
                <DataItem label="סוג">הסכם שותפות</DataItem>
                <DataItem label="מזהה">
                  <bdi dir="ltr">{agreementNumber(view.id)}</bdi>
                </DataItem>
                <DataItem label="גרסה נוכחית">{view.version}</DataItem>
                <DataItem label="בעלות">{content.parties.map((p) => `${p.short} ${p.equity}%`).join(" · ")}</DataItem>
                <DataItem label="נוצר">{formatDateTime(view.createdAt)}</DataItem>
                <DataItem label="עודכן">{formatDateTime(view.updatedAt)}</DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="נוסח וגרסאות"
              description="גרסה שנחתמה לא משתנה. עריכה אחרי חתימה פותחת גרסה חדשה לחתימה מחדש."
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/contracts/partnership/${view.id}/edit`}>
                    <Pencil aria-hidden />
                    עריכה
                  </Link>
                </Button>
              }
            />
            {history.length ? (
              <ul className="divide-y divide-line">
                {history.map((v) => (
                  <li key={v.version} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">
                        גרסה {v.version}
                        <span className="font-normal text-ink-3"> · {v.completedAt ? "נחתמה במלואה" : v.version === view.version ? "בחתימה" : "נחתמה חלקית, הוחלפה בגרסה חדשה"}</span>
                      </span>
                      {link && (
                        <a href={v.version === view.version ? link : `${link}?v=${v.version}`} target="_blank" rel="noopener" className="text-xs font-medium text-accent hover:underline">
                          צפייה
                        </a>
                      )}
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {v.signatures.map((s, i) => (
                        <li key={i} className={s.replacedAt ? "text-xs text-ink-3 line-through decoration-ink-3/50" : "text-xs text-ink-2"}>
                          {nameOf.get(s.party) ?? s.name} · <span dir="ltr">{signedStamp(s.signedAt)}</span>
                          {s.replacedAt && <span className="no-underline"> (הוחלפה)</span>}
                        </li>
                      ))}
                    </ul>
                    {v.completedAt && (
                      <div className="mt-2">
                        <SignedPdfButton id={view.id} version={v.version} stored={!!v.signedPdfPath} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-ink-3">עוד אין חתימות. שלחו את קישור החתימה לשני השותפים — כל אחד בוחר את שמו וחותם.</p>
              </CardBody>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
