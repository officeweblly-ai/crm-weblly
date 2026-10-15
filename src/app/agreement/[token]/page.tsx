import type { Metadata } from "next";
import { AgreementSigning } from "@/components/agreement/agreement-signing";
import { InvalidLink } from "@/components/public/invalid-link";
import { getAgreementByToken } from "@/lib/data/agreement";

export const metadata: Metadata = {
  title: "הסכם שותפות וניהול פעילות",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
// Signing the last signature also renders and stores the final PDF (after()).
export const maxDuration = 60;

/**
 * The partners' secure signing link. Always shows the live version, or an older
 * frozen version with ?v=N (read-only). The token is the only credential.
 */
export default async function AgreementPage({ params, searchParams }: PageProps<"/agreement/[token]">) {
  const { token } = await params;
  const { v } = await searchParams;
  const wanted = typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : null;
  const view = await getAgreementByToken(token, wanted);
  if (!view || !view.token) return <InvalidLink />;

  return (
    <AgreementSigning
      view={{
        id: view.id,
        token: view.token,
        title: view.title,
        content: view.content,
        version: view.version,
        currentVersion: view.currentVersion,
        isCurrent: view.isCurrent,
        hash: view.hash,
        signatures: view.signatures.map((s) => ({ party: s.party, png: s.png, signedAt: s.signedAt, typedName: s.typedName })),
      }}
    />
  );
}
