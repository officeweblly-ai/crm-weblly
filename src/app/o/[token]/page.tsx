import type { Metadata } from "next";
import { CheckCircle2, Mail, Phone, XCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import { InvalidLink } from "@/components/public/invalid-link";
import { ProposalResponse } from "@/components/public/proposal-response";
import { getPublicProposal } from "@/lib/data/public";
import { formatDate, formatDay, formatPhone, todayISO } from "@/lib/format";

export const metadata: Metadata = {
  title: "הצעת מחיר",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function PublicProposalPage({ params }: PageProps<"/o/[token]">) {
  const { token } = await params;
  const data = await getPublicProposal(token);
  if (data.state !== "open") return <InvalidLink />;
  const p = data.proposal;
  const expired = p.valid_until !== null && p.valid_until < todayISO() && (p.status === "sent" || p.status === "viewed");
  const open = (p.status === "sent" || p.status === "viewed") && !expired;

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-3 pb-16 pt-4 sm:px-6 sm:pt-10">
        <ProposalDocument studio={{ name: data.businessName, phone: data.contactPhone, email: data.contactEmail }} p={{ ...p, date: p.sent_at?.slice(0, 10) ?? null }} />

        <section className="rounded-xl border border-line bg-surface p-5 shadow-2 print:hidden" aria-labelledby="respond-h">
          {open ? (
            <>
              <h2 id="respond-h" className="text-lg font-semibold text-ink">מה אומרים?</h2>
              <p className="mb-4 mt-1 text-sm text-ink-2">
                {p.valid_until ? `ההצעה בתוקף עד ${formatDate(p.valid_until)}. ` : ""}אחרי האישור נשלח לכם הסכם עבודה לחתימה דיגיטלית.
              </p>
              <ProposalResponse token={token} />
            </>
          ) : p.status === "accepted" ? (
            <p id="respond-h" className="flex items-start gap-2 text-base text-ink">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
              <span>
                ההצעה אושרה{p.response_name ? ` ע״י ${p.response_name}` : ""}{p.responded_at ? ` ב-${formatDay(p.responded_at)}` : ""}. תודה! נחזור אליכם עם ההסכם.
              </span>
            </p>
          ) : p.status === "rejected" ? (
            <p id="respond-h" className="flex items-start gap-2 text-base text-ink-2">
              <XCircle className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
              קיבלנו את תשובתכם. תודה, ונשמח לעזור בעתיד.
            </p>
          ) : (
            <p id="respond-h" className="text-base text-ink-2">תוקף ההצעה פג. צרו איתנו קשר ונשלח הצעה מעודכנת.</p>
          )}
        </section>

        <footer className="flex flex-col items-center gap-3 pt-4 text-center print:hidden">
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {data.contactPhone && (
              <a href={`tel:${data.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-accent">
                <Phone className="size-4" aria-hidden />
                <bdi dir="ltr">{formatPhone(data.contactPhone)}</bdi>
              </a>
            )}
            {data.contactEmail && (
              <a href={`mailto:${data.contactEmail}`} className="inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-accent">
                <Mail className="size-4" aria-hidden />
                <bdi dir="ltr">{data.contactEmail}</bdi>
              </a>
            )}
          </div>
          <Logo size="sm" className="opacity-80" />
        </footer>
      </main>
    </div>
  );
}
