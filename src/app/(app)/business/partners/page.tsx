import { CheckCircle2, Handshake, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PartnerDocument, type PartnerSignature } from "@/components/business/partner-document";
import { CreatePartnerAgreement, PartnerSignForm } from "@/components/business/partner-editor";
import { PartnerView } from "@/components/business/partner-view";
import { requireArea } from "@/lib/auth";
import { contentHash } from "@/lib/contract-hash";
import { partnerAgreementStatus, workCategory, type PartnerAgreementStatus, type WorkCategory } from "@/lib/domain/labels";
import { defaultPartnerAgreement, partnerAgreementSchema } from "@/lib/domain/partners";
import { formatDateTime, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "הסכם שותפים" };

export default async function PartnersPage() {
  const viewer = await requireArea("partners");
  const supabase = await createClient();
  const { data: agreement } = await supabase.from("partner_agreements").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!agreement) {
    const [{ data: ws }, { data: people }, { data: resp }] = await Promise.all([
      supabase.from("workspace_settings").select("business_name, legal_name, business_id, address").maybeSingle(),
      supabase.from("profiles").select("id, full_name, email, phone, role, is_active").eq("is_active", true).order("created_at"),
      supabase.from("team_responsibilities").select("title, category, assigned_to").eq("is_active", true),
    ]);
    const partners = (people ?? []).map((p) => ({
      user_id: p.id,
      name: p.full_name || p.email,
      email: p.email,
      phone: p.phone ?? "",
      responsibilities: (resp ?? []).filter((r) => r.assigned_to === p.id).map((r) => r.title || workCategory.label(r.category as WorkCategory)),
    }));
    const draft = defaultPartnerAgreement({
      business: { name: ws?.business_name ?? "", legal_name: ws?.legal_name ?? "", business_id: ws?.business_id ?? "", address: ws?.address ?? "" },
      partners,
      today: todayISO(),
    });
    return (
      <Card className="max-w-2xl">
        <CardBody className="flex flex-col items-start gap-4 py-8">
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><Handshake className="size-6" aria-hidden /></span>
          <div>
            <h2 className="text-xl font-semibold text-ink">הסכם השותפות שלכם</h2>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-2">
              המערכת תכין טיוטה מלאה עם {partners.length} השותפים ({partners.map((p) => p.name.split(" ")[0]).join(" ו")}), חלוקת בעלות שווה, תחומי האחריות מ״צוות ועובדים״,
              חלוקת רווחים, הוצאות, קבלת החלטות, קניין רוחני, יציאה של שותף ויישוב מחלוקות. עורכים כל סעיף — ואז כל אחד חותם מהטלפון.
            </p>
          </div>
          {partners.length < 2 ? (
            <p className="text-sm text-warn">צריך לפחות שני אנשי צוות פעילים כדי ליצור הסכם שותפים.</p>
          ) : (
            <CreatePartnerAgreement title={draft.title} content={draft.content} />
          )}
          <p className="flex items-start gap-2 text-xs text-ink-3"><Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden />נקודת פתיחה מעשית, לא ייעוץ משפטי — מומלץ להעביר לעורך דין לפני חתימה.</p>
        </CardBody>
      </Card>
    );
  }

  const parsed = partnerAgreementSchema.safeParse(agreement.content);
  if (!parsed.success) return <p className="text-sm text-danger">תוכן ההסכם לא תקין.</p>;
  const content = parsed.data;
  const { data: sigRows } = await supabase
    .from("partner_agreement_signatures")
    .select("user_id, signer_name, id_number, signature, signed_at, version")
    .eq("agreement_id", agreement.id)
    .order("signed_at");
  const signatures: PartnerSignature[] = sigRows ?? [];
  const current = signatures.filter((s) => s.version === agreement.version);
  const isParty = content.partners.some((p) => p.user_id === viewer.userId);
  const mine = current.find((s) => s.user_id === viewer.userId);
  const me = content.partners.find((p) => p.user_id === viewer.userId);
  const status = agreement.status as PartnerAgreementStatus;
  const hash = contentHash({ title: agreement.title, content: agreement.content });
  const older = [...new Set(signatures.filter((s) => s.version < agreement.version).map((s) => s.version))];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <PartnerView
          id={agreement.id}
          title={agreement.title}
          content={content}
          signed={current.length > 0}
          status={
            <>
              <Badge tone={partnerAgreementStatus.tone(status)}>{partnerAgreementStatus.label(status)}</Badge>
              <span className="text-sm text-ink-3">גרסה {agreement.version} · חתמו {current.length}/{content.partners.length}</span>
            </>
          }
        >
          <div className="rounded-lg bg-sunken p-1.5 sm:p-5 print:bg-transparent print:p-0">
            <PartnerDocument title={agreement.title} content={content} version={agreement.version} signatures={signatures} />
          </div>
        </PartnerView>
      </div>
      <aside className="flex min-w-0 flex-col gap-4 print:hidden xl:sticky xl:top-24 xl:self-start">
        <Card>
          <CardHeader title="חתימות" description={`גרסה ${agreement.version}`} />
          <ul className="divide-y divide-line">
            {content.partners.map((p) => {
              const s = current.find((x) => x.user_id === p.user_id);
              return (
                <li key={p.user_id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                  <span className="font-medium text-ink">{p.name}</span>
                  {s ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ok"><CheckCircle2 className="size-4" aria-hidden />{formatDateTime(s.signed_at)}</span>
                  ) : (
                    <span className="text-xs text-ink-3">ממתין</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        {isParty && !mine && (
          <Card>
            <CardHeader title="החתימה שלך" description="קראו את כל הסעיפים. החתימה נקשרת לנוסח המדויק של הגרסה הזו." />
            <CardBody>
              <PartnerSignForm id={agreement.id} version={agreement.version} hash={hash} defaultName={me?.name ?? viewer.profile.full_name} />
            </CardBody>
          </Card>
        )}
        {older.length > 0 && (
          <p className="px-1 text-xs text-ink-3">גרסאות קודמות שנחתמו: {older.join(", ")} — החתימות עליהן נשמרות במערכת.</p>
        )}
      </aside>
    </div>
  );
}
