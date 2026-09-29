import Link from "next/link";
import { AlertCircle, Building2, FileSignature, Handshake, UserRound } from "lucide-react";
import { EmailLink, Money, PhoneLink, UrlLink } from "@/components/ui/misc";
import { businessType, leadSource, type BusinessType } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tables, Views } from "@/lib/supabase/database.types";
import { ClientFormModal } from "./client-form";

export type Commitment = {
  financials: Views<"client_financials"> | null;
  signedContracts: number;
  openContracts: number;
  acceptedProposal: { id: string; title: string; price: number } | null;
  activeProjects: number;
};

/** The facts that make a client file "complete" for contracts and invoices. */
export function missingDetails(c: Tables<"clients">): string[] {
  const miss: string[] = [];
  if (!c.phone) miss.push("טלפון");
  if (!c.email) miss.push("אימייל");
  if (!c.company_id) miss.push("ח.פ / ע.מ");
  if (!c.address) miss.push("כתובת");
  return miss;
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  // Empty facts are listed once in the "missing" banner — not as rows of dashes.
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink">{children}</dd>
    </div>
  );
}

function Block({ icon: Icon, title, children, className }: { icon: typeof UserRound; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 px-4 py-3.5 sm:px-5 sm:py-4", className)}>
      <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-2">
        <Icon className="size-4 text-ink-3" aria-hidden />
        {title}
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

/**
 * Everything about the client, first: who to talk to, the legal/billing
 * identity used in contracts, and what they committed to. The tabs come after.
 */
export function ClientProfile({ client, commitment }: { client: Tables<"clients">; commitment: Commitment }) {
  const missing = missingDetails(client);
  const f = commitment.financials;
  const address = [client.address, client.city].filter(Boolean).join(", ");
  const retainer = Number(client.retainer_amount ?? 0);

  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-line bg-surface shadow-1">
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/20 bg-warn-soft px-4 py-2.5 text-sm text-warn sm:px-5">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            חסר בתיק: {missing.join(" · ")}
          </span>
          <ClientFormModal client={client} trigger={<button type="button" className="font-semibold underline underline-offset-2">להשלמה</button>} />
        </div>
      )}
      <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:divide-x-reverse">
        <Block icon={UserRound} title="איש קשר">
          <Row label="שם">{client.name}</Row>
          <Row label="תפקיד">{client.contact_role}</Row>
          <Row label="טלפון">{client.phone ? <PhoneLink phone={client.phone} /> : null}</Row>
          <Row label="אימייל" wide>{client.email ? <EmailLink email={client.email} /> : null}</Row>
          <Row label="איש קשר נוסף" wide>
            {client.alt_contact_name || client.alt_contact_phone ? (
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                {client.alt_contact_name}
                {client.alt_contact_phone && <PhoneLink phone={client.alt_contact_phone} />}
              </span>
            ) : null}
          </Row>
        </Block>

        <Block icon={Building2} title="פרטי העסק">
          <Row label="שם העסק">{client.business_name}</Row>
          <Row label="ח.פ / ע.מ">{client.company_id ? <bdi className="num">{client.company_id}</bdi> : null}</Row>
          <Row label="סוג עוסק">{client.business_type ? businessType.label(client.business_type as BusinessType) : null}</Row>
          <Row label="תחום">{client.industry}</Row>
          <Row label="כתובת" wide>{address || null}</Row>
          <Row label="אתר" wide>{client.website ? <UrlLink url={client.website} /> : null}</Row>
          <Row label="מקור · לקוח מאז" wide>
            {[client.source ? leadSource.label(client.source) : null, formatDate(client.created_at.slice(0, 10))].filter(Boolean).join(" · ")}
          </Row>
        </Block>

        <Block icon={Handshake} title="התחייבות">
          {!(f && f.project_count > 0) && retainer <= 0 && !commitment.acceptedProposal && commitment.signedContracts + commitment.openContracts === 0 && (
            <p className="col-span-2 text-sm text-ink-3">עוד אין הסכם, הצעה מאושרת או ריטיינר.</p>
          )}
          <Row label="סוכם בפרויקטים">{f && f.project_count > 0 ? <Money value={f.total_price} /> : null}</Row>
          <Row label="שולם · יתרה">
            {f && f.project_count > 0 ? (
              <span>
                <Money value={f.amount_paid} className="text-ok" /> · <Money value={f.balance_due} className={f.balance_due > 0 ? "font-semibold text-warn" : ""} />
              </span>
            ) : null}
          </Row>
          <Row label="ריטיינר חודשי">
            {retainer > 0 ? (
              <span>
                <Money value={retainer} />
                {client.retainer_start && <span className="text-ink-3"> · מ־{formatDate(client.retainer_start)}</span>}
              </span>
            ) : null}
          </Row>
          <Row label="סוף התחייבות">{client.commitment_end ? formatDate(client.commitment_end) : retainer > 0 ? "ללא הגבלה" : null}</Row>
          <Row label="הסכמים" wide>
            {commitment.signedContracts + commitment.openContracts > 0 ? (
              <Link href={`/clients/${client.id}?tab=contracts`} className="inline-flex items-center gap-1 hover:text-accent">
                <FileSignature className="size-3.5 text-ink-3" aria-hidden />
                {commitment.signedContracts} חתומים{commitment.openContracts ? ` · ${commitment.openContracts} פתוחים` : ""}
              </Link>
            ) : null}
          </Row>
          <Row label="הצעה מאושרת" wide>
            {commitment.acceptedProposal ? (
              <Link href={`/proposals/${commitment.acceptedProposal.id}`} className="hover:text-accent">
                <Money value={commitment.acceptedProposal.price} /> · {commitment.acceptedProposal.title}
              </Link>
            ) : null}
          </Row>
        </Block>
      </div>
      {(client.services || client.commitment_notes) && (
        <div className="border-t border-line px-4 py-3 text-sm text-ink-2 sm:px-5">
          {client.services && <p><span className="text-ink-3">שירותים: </span>{client.services}</p>}
          {client.commitment_notes && <p className="mt-1 whitespace-pre-wrap"><span className="text-ink-3">תנאים: </span>{client.commitment_notes}</p>}
        </div>
      )}
    </div>
  );
}
