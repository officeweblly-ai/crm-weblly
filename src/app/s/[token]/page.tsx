import type { Metadata } from "next";
import { Clock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ContractDocument } from "@/components/contracts/contract-document";
import { PdfButton } from "@/components/ui/pdf-button";
import { InvalidLink } from "@/components/public/invalid-link";
import { SignForm } from "@/components/public/sign-form";
import { getPublicContract } from "@/lib/data/public";
import { contractContentSchema } from "@/lib/domain/contracts";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "הסכם לחתימה",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

/** Read → confirm → draw a signature → sign. Always the frozen version, never the live draft. */
export default async function SignPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const data = await getPublicContract(token);
  if (data.state === "invalid") return <InvalidLink />;
  if (data.state === "updating") {
    return (
      <InvalidLink
        title="ההסכם בעדכון"
        text={`אנחנו מעדכנים את "${data.title}". כשהגרסה החדשה תהיה מוכנה נשלח לכם קישור לחתימה.`}
      />
    );
  }
  const parsed = contractContentSchema.safeParse(data.content);
  if (!parsed.success) return <InvalidLink />;
  const signed = data.state === "signed";

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex h-14 max-w-[860px] items-center justify-between gap-3 px-4">
          <Logo size="sm" />
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <ShieldCheck className="size-4 text-ok" aria-hidden />
            קישור מאובטח
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-2 pb-16 pt-4 sm:px-6 sm:pt-8">
        {signed && data.signature ? (
          <section className="rounded-xl border border-ok/25 bg-ok-soft/60 p-5 print:hidden">
            <p className="flex items-center gap-2 text-base font-semibold text-ink">
              <ShieldCheck className="size-5 text-ok" aria-hidden />
              ההסכם נחתם. תודה!
            </p>
            <p className="mt-1 text-sm text-ink-2">
              נחתם ע״י {data.signature.name} · {formatDateTime(data.signature.signedAt)}. אפשר לשמור עותק:
            </p>
            <div className="mt-3">
              <PdfButton path={`/s/${token}`} name="הסכם חתום" label="שמירת עותק PDF" />
            </div>
          </section>
        ) : (
          <p className="flex items-center gap-2 px-2 text-sm text-ink-2 print:hidden">
            <Clock className="size-4 text-ink-3" aria-hidden />
            קראו את ההסכם עד הסוף. בסוף העמוד — חתימה עם האצבע.
          </p>
        )}

        <ContractDocument content={parsed.data} number={data.number} title={data.title} version={data.version} signature={data.signature} />

        {!signed && (
          <section className="rounded-xl border border-line bg-surface p-4 shadow-2 sm:p-6 print:hidden" aria-labelledby="sign-h">
            <h2 id="sign-h" className="text-lg font-semibold text-ink">אישור וחתימה</h2>
            <p className="mb-4 mt-1 text-sm text-ink-3">החתימה נשמרת יחד עם הגרסה שקראתם (גרסה {data.version}), התאריך והשעה.</p>
            <SignForm token={token} version={data.version} hash={data.hash} defaultName={parsed.data.client.name} />
          </section>
        )}
      </main>
    </div>
  );
}
