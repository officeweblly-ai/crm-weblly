import { Check, Minus } from "lucide-react";
import { Logo, BRAND } from "@/components/brand/logo";
import { formatDate, formatMoney } from "@/lib/format";

export type ProposalDoc = {
  number: string | null;
  title: string;
  client: string;
  intro: string | null;
  scope: string | null;
  included: string[];
  excluded: string[];
  price: number;
  deposit: number;
  milestones: { label: string; amount: number | null; when: string }[];
  delivery_estimate: string | null;
  valid_until: string | null;
  notes: string | null;
  date: string | null;
};

/** The proposal as the client reads it — on screen, on the phone and in "Save as PDF". */
export function ProposalDocument({ p, studio }: { p: ProposalDoc; studio: { name: string; phone: string | null; email: string | null } }) {
  const balance = Math.max(0, p.price - p.deposit);
  const scope = (p.scope ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white text-[#141824] shadow-2 print:max-w-none print:shadow-none" dir="rtl">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${BRAND.navy} 0 88%, ${BRAND.spark} 88% 100%)` }} aria-hidden />
      <div className="px-5 pb-8 pt-6 sm:px-[14mm] sm:pb-[14mm] sm:pt-[10mm] print:px-0 print:pt-2">
        <header className="flex items-start justify-between gap-4 border-b border-[#e3e6eb] pb-5">
          <div className="min-w-0">
            <p className="text-[12.5px] text-[#6b7383]">הצעת מחיר{p.client ? ` עבור ${p.client}` : ""}</p>
            <h1 className="mt-1 text-[22px] font-bold leading-tight text-balance sm:text-[24px]">{p.title}</h1>
            <p className="mt-1 text-[12.5px] text-[#6b7383]">
              {p.number && (
                <>
                  <bdi dir="ltr">{p.number}</bdi> ·{" "}
                </>
              )}
              {p.date ? formatDate(p.date) : ""}
              {p.valid_until && ` · בתוקף עד ${formatDate(p.valid_until)}`}
            </p>
          </div>
          <Logo size="md" className="shrink-0" />
        </header>

        {p.intro && <p className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-[#2c3240]">{p.intro}</p>}

        <section className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[#e3e6eb] bg-[#e3e6eb] text-[12.5px]">
          {[
            ["המחיר", formatMoney(p.price)],
            ["מקדמה", formatMoney(p.deposit)],
            ["יתרה", formatMoney(balance)],
          ].map(([k, v]) => (
            <div key={k} className="bg-[#f7f8fa] px-3 py-3">
              <div className="text-[11px] text-[#6b7383]">{k}</div>
              <div className="mt-0.5 text-[15px] font-semibold"><bdi dir="ltr">{v}</bdi></div>
            </div>
          ))}
        </section>

        {scope.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-[14px] font-bold">תכולת העבודה</h2>
            <div className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed text-[#2c3240]">
              {scope.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </section>
        )}

        {(p.included.length > 0 || p.excluded.length > 0) && (
          <section className="mt-6 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
            {p.included.length > 0 && (
              <div className="break-inside-avoid">
                <h2 className="text-[14px] font-bold">כלול בהצעה</h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-[#2c3240]">
                  {p.included.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#1d7a52]" aria-hidden />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.excluded.length > 0 && (
              <div className="break-inside-avoid">
                <h2 className="text-[14px] font-bold">לא כלול</h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-[#6b7383]">
                  {p.excluded.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {p.milestones.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-[14px] font-bold">אבני דרך לתשלום</h2>
            <ol className="mt-2 divide-y divide-[#e3e6eb] rounded-md border border-[#e3e6eb] text-[13px]">
              {p.milestones.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{m.label || `שלב ${i + 1}`}</span>
                    {m.when && <span className="text-[#6b7383]"> · {m.when}</span>}
                  </span>
                  {m.amount !== null && <bdi dir="ltr" className="shrink-0 font-semibold">{formatMoney(m.amount)}</bdi>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {(p.delivery_estimate || p.notes) && (
          <section className="mt-6 flex flex-col gap-3 break-inside-avoid text-[13px] leading-relaxed text-[#2c3240]">
            {p.delivery_estimate && (
              <p>
                <span className="font-bold text-[#141824]">זמן אספקה משוער: </span>
                {p.delivery_estimate}
              </p>
            )}
            {p.notes && <p className="whitespace-pre-wrap">{p.notes}</p>}
          </section>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-[#e3e6eb] pt-3 text-[10.5px] text-[#9aa1ad]">
          <span>
            {studio.name}
            {studio.phone && (
              <>
                {" · "}
                <bdi dir="ltr">{studio.phone}</bdi>
              </>
            )}
            {studio.email && (
              <>
                {" · "}
                <bdi dir="ltr">{studio.email}</bdi>
              </>
            )}
          </span>
        </footer>
      </div>
    </article>
  );
}
