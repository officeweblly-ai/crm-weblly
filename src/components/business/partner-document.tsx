import { Logo } from "@/components/brand/logo";
import { formatDate, formatDateTime } from "@/lib/format";
import type { PartnerAgreement } from "@/lib/domain/partners";

export type PartnerSignature = { user_id: string; signer_name: string; id_number: string | null; signature: string; signed_at: string; version: number };

/** The printable agreement (A4). Signature boxes fill in as each partner signs. */
export function PartnerDocument({ title, content, version, signatures }: { title: string; content: PartnerAgreement; version: number; signatures: PartnerSignature[] }) {
  const b = content.business;
  return (
    <article className="mx-auto max-w-[210mm] rounded-md bg-white px-6 py-8 text-[15px] leading-relaxed text-ink shadow-2 sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-3">הסכם שותפות · גרסה {version}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">בתוקף מיום {content.effective_date ? formatDate(content.effective_date) : "—"}</p>
        </div>
        <Logo size="sm" />
      </header>

      <section className="mt-6">
        <h2 className="text-base font-bold">הצדדים</h2>
        <p className="mt-1 text-sm text-ink-2">
          שותפים ב־{b.legal_name || b.name}
          {b.business_id ? ` (ע.מ / ח.פ ${b.business_id})` : ""}
          {b.address ? `, ${b.address}` : ""}.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {content.partners.map((p) => (
            <div key={p.user_id} className="rounded-md border border-line p-3 text-sm break-inside-avoid">
              <p className="font-semibold">{p.name}</p>
              <p className="text-ink-2">ת.ז: {p.id_number || "________"}</p>
              {p.address && <p className="text-ink-2">{p.address}</p>}
              {(p.phone || p.email) && <p className="text-ink-2"><bdi dir="ltr">{[p.phone, p.email].filter(Boolean).join(" · ")}</bdi></p>}
              <p className="mt-1.5 font-medium">בעלות: <bdi className="num">{p.equity}%</bdi></p>
              {p.role && <p className="mt-0.5 text-ink-2">אחריות: {p.role}</p>}
            </div>
          ))}
        </div>
      </section>

      <ol className="mt-6 flex flex-col gap-4">
        {content.clauses.map((c, i) => (
          <li key={i} className="break-inside-avoid">
            <h2 className="text-base font-bold">
              {i + 1}. {c.title}
            </h2>
            <p className="mt-1 whitespace-pre-line text-ink-2">{c.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-10 grid gap-6 sm:grid-cols-2 print:grid-cols-2 break-inside-avoid">
        {content.partners.map((p) => {
          const sig = signatures.find((s) => s.user_id === p.user_id && s.version === version);
          return (
            <div key={p.user_id}>
              <div className="grid h-24 place-items-center border-b border-ink/40">
                {sig ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL signature
                  <img src={sig.signature} alt={`חתימה של ${sig.signer_name}`} className="max-h-20 w-auto" />
                ) : (
                  <span className="text-xs text-ink-3">ממתין לחתימה</span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-medium">{p.name}</p>
              {sig && <p className="text-xs text-ink-3">נחתם {formatDateTime(sig.signed_at)}{sig.id_number ? ` · ת.ז ${sig.id_number}` : ""}</p>}
            </div>
          );
        })}
      </section>

      <p className="mt-10 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
        נוסח זה הוא נקודת פתיחה מעשית ואינו ייעוץ משפטי. מומלץ שעורך/ת דין יעבור/תעבור עליו. חתימה במערכת: חתימה מצוירת + שם, זמן וטביעת תוכן (SHA-256) של הגרסה.
      </p>
    </article>
  );
}
