import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { agreementNumber, hebLetter, signingSummary, type Block, type Party, type PartnerAgreement } from "@/lib/domain/partners";
import "./agreement.css";

export type DocSignature = { party: string; png: string; signedAt: string; typedName?: string | null };

const TZ = "Asia/Jerusalem";
const longDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const numDate = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const numTime = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
export const signedStamp = (ts: string) => `${numDate.format(new Date(ts))}, ${numTime.format(new Date(ts))}`;

/**
 * The partnership agreement as a legal document: letterhead, title, parties,
 * recitals (הואיל), numbered sections and clauses with hanging numbers,
 * signature block and a short audit line. Black on white; the same markup is
 * the screen view, the browser print and the server PDF (agreement.css).
 */
export function AgreementDocument({
  id,
  title,
  content,
  version,
  hash,
  signatures,
  signatureSlot,
}: {
  id: string;
  title: string;
  content: PartnerAgreement;
  version: number;
  hash: string;
  signatures: DocSignature[];
  /** Screen-only controls under each party's signature (hidden in print). */
  signatureSlot?: (party: Party) => ReactNode;
}) {
  const number = agreementNumber(id);
  const signedKeys = signatures.map((s) => s.party);
  const summary = signingSummary(content.parties, signedKeys);
  const complete = summary.state === "signed";
  const lastSigned = complete ? signatures.map((s) => s.signedAt).sort().at(-1) : null;
  const stateLine = complete ? "נחתם על ידי שני הצדדים" : summary.state === "partial" ? `נחתם חלקית — ${summary.waiting}` : "טיוטה — טרם נחתם";
  let clauseNo = 0;

  return (
    <article className="agr" data-state={summary.state}>
      {/* Running header/footer + page numbers for print/PDF (CSS page margin boxes). */}
      <style>{pageCss(number, version, complete ? "" : summary.state === "partial" ? "נחתם חלקית" : "טיוטה")}</style>

      <header className="agr-letterhead">
        <span className="agr-brand" dir="ltr">
          <LogoMark tone="mono" className="agr-brand-mark" />
          <span>{content.brand}</span>
        </span>
        <dl className="agr-meta">
          <div>
            <dt>מזהה הסכם</dt>
            <dd dir="ltr">{number}</dd>
          </div>
          <div>
            <dt>גרסה</dt>
            <dd>{version}</dd>
          </div>
        </dl>
      </header>

      {!complete && <p className="agr-state">{stateLine}</p>}

      <h1 className="agr-title">{title}</h1>
      <p className="agr-dateline">
        {lastSigned ? (
          <>שנערך ונחתם ביום {longDate.format(new Date(lastSigned))}</>
        ) : (
          <>
            שנערך ונחתם ביום <span className="agr-blank" aria-label="יושלם בעת החתימה" />
          </>
        )}
      </p>

      <section className="agr-parties" aria-label="הצדדים">
        {content.parties.map((p, i) => (
          <div key={p.key} className="agr-party">
            <span className="agr-party-label">{i === 0 ? "בין:" : i === content.parties.length - 1 ? "לבין:" : "ובין:"}</span>
            <div>
              <p className="agr-party-name">{p.name}</p>
              <p className="agr-party-term">(להלן: &quot;{p.short}&quot;)</p>
            </div>
            <span className="agr-party-side">{i === 0 ? "מצד אחד;" : i === content.parties.length - 1 ? "מצד שני;" : ""}</span>
          </div>
        ))}
        <p className="agr-together">({content.parties.map((p) => p.short).join(" ו")} יחד להלן: &quot;השותפים&quot;)</p>
      </section>

      {content.recitals.length > 0 && (
        <section className="agr-recitals" aria-label="מבוא">
          {content.recitals.map((r, i) => (
            <div key={i} className="agr-recital">
              <span className="agr-recital-word">{i === 0 ? "הואיל" : "והואיל"}</span>
              <p>{r}</p>
            </div>
          ))}
        </section>
      )}
      {content.operative && <p className="agr-operative">{content.operative}</p>}

      <div className="agr-body">
        {content.sections.map((s, si) => (
          <section key={si} className="agr-section">
            <h2 className="agr-h2">
              <span className="agr-num">{si + 1}.</span>
              <span>{s.title}</span>
            </h2>
            {s.clauses.map((c, ci) => {
              clauseNo++;
              const [first, ...rest] = c.blocks;
              const runIn = c.title && first?.t === "p";
              return (
                <div key={ci} className="agr-clause" id={`clause-${clauseNo}`}>
                  <span className="agr-num">
                    {si + 1}.{ci + 1}
                  </span>
                  <div className="agr-clause-body">
                    {runIn ? (
                      <p>
                        <strong className="agr-runin">{c.title}.</strong> {(first as Extract<Block, { t: "p" }>).text}
                      </p>
                    ) : (
                      c.title && <p className="agr-clause-title">{c.title}</p>
                    )}
                    {(runIn ? rest : c.blocks).map((b, bi) => (
                      <BlockView key={bi} block={b} parties={content.parties} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {!complete && content.notice && <p className="agr-notice">{content.notice}</p>}

      <section className="agr-signatures" aria-label="חתימות">
        <p className="agr-witness">ולראיה באו הצדדים על החתום:</p>
        <div className="agr-sig-grid">
          {content.parties.map((p) => {
            const sig = signatures.find((s) => s.party === p.key);
            return (
              <div key={p.key} className="agr-sig" data-signed={sig ? "true" : "false"}>
                <div className="agr-sig-area">
                  {sig ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL signature
                    <img src={sig.png} alt={`חתימת ${p.name}`} className="agr-sig-img" />
                  ) : (
                    <span className="agr-sig-pending">ממתין לחתימה</span>
                  )}
                </div>
                <p className="agr-sig-name">{p.name}</p>
                <p className="agr-sig-role">
                  {p.title}
                  {p.role ? ` · ${p.role}` : ""}
                </p>
                <p className="agr-sig-date">
                  {sig ? (
                    <>
                      נחתם: <span dir="ltr">{signedStamp(sig.signedAt)}</span>
                    </>
                  ) : (
                    <>
                      תאריך: <span className="agr-blank agr-blank-sm" />
                    </>
                  )}
                </p>
                {signatureSlot && <div className="agr-sig-slot">{signatureSlot(p)}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <footer className="agr-audit">
        <p>
          {content.brand} · {title} · מזהה <span dir="ltr">{number}</span> · גרסה {version}
        </p>
        <p>
          חתימה דיגיטלית מצוירת. כל חתימה נשמרת עם שם החותם, מועד החתימה וגרסת ההסכם, ונקשרת לנוסח המדויק באמצעות טביעת תוכן SHA-256:{" "}
          <span dir="ltr" className="agr-hash">
            {hash.slice(0, 16)}…{hash.slice(-8)}
          </span>
        </p>
      </footer>
    </article>
  );
}

function BlockView({ block, parties }: { block: Block; parties: Party[] }) {
  if (block.t === "p") return <p>{block.text}</p>;
  if (block.t === "list")
    return (
      <ol className="agr-list">
        {block.items.map((item, i) => (
          <li key={i}>
            <span className="agr-letter">({hebLetter(i)})</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  return (
    <table className="agr-equity">
      <caption className="sr-only">חלוקת הבעלות</caption>
      <thead>
        <tr>
          <th scope="col">השותף</th>
          <th scope="col">חלק בזכויות בעסק</th>
        </tr>
      </thead>
      <tbody>
        {parties.map((p) => (
          <tr key={p.key}>
            <td>{p.name}</td>
            <td dir="ltr">{p.equity}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** @page rules need the document's own values (id, version, state). */
function pageCss(number: string, version: number, state: string) {
  const q = (s: string) => `"${s.replace(/["\\\n]/g, "")}"`;
  const left = state ? `${number} · גרסה ${version} · ${state}` : `${number} · גרסה ${version}`;
  return `@page agreement {
  @bottom-right { content: ${q("WEBLLY · הסכם שותפות וניהול פעילות")}; }
  @bottom-left { content: ${q("עמוד ")} counter(page) ${q(" מתוך ")} counter(pages); }
  @top-left { content: ${q(left)}; }
}
@page agreement:first { @top-left { content: none; } @top-right { content: none; } }
@media print { html, body { page: agreement; } }`;
}
