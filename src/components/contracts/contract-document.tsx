import { Logo, BRAND } from "@/components/brand/logo";
import type { ContractContent } from "@/lib/domain/contracts";
import { formatDate, formatMoney } from "@/lib/format";

function Party({ title, rows }: { title: string; rows: [string, string][] }) {
  const filled = rows.filter(([, v]) => v.trim());
  return (
    <div className="min-w-0 flex-1 rounded-md border border-[#e3e6eb] px-4 py-3">
      <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-[#6b7383]">{title}</div>
      <dl className="flex flex-col gap-0.5 text-[12.5px]">
        {filled.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-20 shrink-0 text-[#6b7383]">{k}</dt>
            <dd className="min-w-0 break-words text-[#141824]">{/[@0-9]/.test(v) && !/[א-ת]/.test(v) ? <bdi dir="ltr">{v}</bdi> : v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The printable agreement. Pure markup — renders the same on screen and in
 * the browser's "Save as PDF". Sized for A4.
 */
export type DocumentSignature = { name: string; idNumber: string | null; png: string; signedAt: string; version: number };

export function ContractDocument({
  content,
  number,
  title,
  version,
  signature,
}: {
  content: ContractContent;
  number: string | null;
  title: string;
  /** Shown when the agreement has more than one version. */
  version?: number;
  /** Client's digital signature (from contract_signatures). */
  signature?: DocumentSignature | null;
}) {
  const { studio, client, project } = content;
  const balance = Math.max(0, project.total - project.deposit);
  const scopeLines = content.scope.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <article className="contract-doc mx-auto w-full max-w-[210mm] bg-white text-[#141824] shadow-2 print:max-w-none print:shadow-none" dir="rtl">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${BRAND.navy} 0 88%, ${BRAND.spark} 88% 100%)` }} aria-hidden />
      <div className="px-[14mm] pb-[14mm] pt-[10mm] print:px-0 print:pt-2">
        <header className="flex items-start justify-between gap-6 border-b border-[#e3e6eb] pb-5">
          <div>
            <h1 className="text-[24px] font-bold leading-tight">{title}</h1>
            <p className="mt-1 text-[12.5px] text-[#6b7383]">
              {number && (
                <>
                  הסכם מס׳ <bdi dir="ltr">{number}</bdi> ·{" "}
                </>
              )}
              {version && version > 1 && <>גרסה {version} · </>}
              נחתם ביום {content.date ? formatDate(content.date) : "__________"}
            </p>
          </div>
          <Logo size="md" />
        </header>

        <section className="mt-5 flex flex-col gap-3 sm:flex-row print:flex-row">
          <Party
            title="מצד אחד — נותן השירות"
            rows={[
              ["שם", studio.legal_name || studio.name],
              ["ח.פ / ע.מ", studio.business_id],
              ["כתובת", studio.address],
              ["טלפון", studio.phone],
              ["אימייל", studio.email],
            ]}
          />
          <Party
            title="מצד שני — הלקוח"
            rows={[
              ["שם", client.name],
              ["עסק", client.business],
              ["ח.פ / ת.ז", client.business_id],
              ["כתובת", client.address],
              ["טלפון", client.phone],
              ["אימייל", client.email],
            ]}
          />
        </section>

        <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[#e3e6eb] bg-[#e3e6eb] text-[12.5px] sm:grid-cols-4 print:grid-cols-4">
          {[
            ["העבודה", project.name || project.type_label || "—"],
            ["סה״כ לתשלום", `${formatMoney(project.total)}${project.vat_note ? ` ${project.vat_note}` : ""}`],
            ["מקדמה", formatMoney(project.deposit)],
            ["יתרה", formatMoney(balance)],
          ].map(([k, v]) => (
            <div key={k} className="bg-[#f7f8fa] px-3 py-2.5">
              <div className="text-[11px] text-[#6b7383]">{k}</div>
              <div className="mt-0.5 font-semibold">{v}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-[14px] font-bold">1. תכולת העבודה</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-[12.5px] leading-relaxed text-[#2c3240]">
            {scopeLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>

        {content.clauses.map((c, i) => (
          <section key={i} className="mt-4 break-inside-avoid">
            <h2 className="text-[14px] font-bold">
              {i + 2}. {c.title}
            </h2>
            <div className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-relaxed text-[#2c3240]">
              {c.body
                .split("\n")
                .filter((l) => l.trim())
                .map((l, j) => (
                  <p key={j}>{l}</p>
                ))}
            </div>
          </section>
        ))}

        <section className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid text-[12.5px]">
          {[
            ["נותן השירות", studio.signatory || studio.legal_name || studio.name, null],
            ["הלקוח", client.name + (client.business ? ` — ${client.business}` : ""), signature ?? null],
          ].map(([role, name, sig]) => {
            const s = sig as DocumentSignature | null;
            return (
              <div key={role as string}>
                <div className="flex h-14 items-end border-b border-[#141824]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
                  {s && <img src={s.png} alt={`חתימת ${s.name}`} className="max-h-14 max-w-full object-contain" />}
                </div>
                <div className="mt-1.5 font-semibold">{role as string}</div>
                <div className="text-[#6b7383]">{s ? s.name : (name as string)}</div>
                {s?.idNumber && <div className="text-[#6b7383]">ת.ז / ח.פ: <bdi dir="ltr">{s.idNumber}</bdi></div>}
                <div className="mt-3 text-[#6b7383]">
                  {s ? (
                    <>נחתם דיגיטלית: {new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(s.signedAt))} · גרסה {s.version}</>
                  ) : (
                    "תאריך: ____________"
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <footer className="mt-10 flex items-center justify-between border-t border-[#e3e6eb] pt-3 text-[10.5px] text-[#9aa1ad]">
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
          {number && <bdi dir="ltr">{number}</bdi>}
        </footer>
      </div>
    </article>
  );
}
