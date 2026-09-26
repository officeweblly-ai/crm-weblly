import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpLeft, ChevronRight, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DataItem, DataList } from "@/components/ui/card";
import { EmailLink, Money, PageHeader, PhoneLink } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LeadFormModal } from "@/components/leads/lead-form";
import { ConvertLeadButton } from "@/components/leads/convert-lead";
import { LeadStatusControl, DeleteLeadButton } from "@/components/leads/lead-controls";
import { getLead } from "@/lib/data/leads";
import { leadSource, leadStatus, projectType } from "@/lib/domain/labels";
import { formatDate, formatDateTime, relativeDue, whatsappLink } from "@/lib/format";

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const converted = lead.status === "converted";
  const wa = whatsappLink(lead.phone);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/leads" className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronRight className="size-4" aria-hidden />
            לידים
          </Link>
        }
        title={lead.name}
        description={lead.business_name ?? undefined}
        actions={
          <>
            {!converted && <ConvertLeadButton lead={lead} />}
            {converted && lead.converted_client_id && (
              <Button asChild>
                <Link href={`/clients/${lead.converted_client_id}`}>
                  לתיק הלקוח
                  <ArrowUpLeft aria-hidden />
                </Link>
              </Button>
            )}
            <LeadFormModal
              lead={lead}
              trigger={
                <Button variant="secondary">
                  <Pencil aria-hidden />
                  עריכה
                </Button>
              }
            />
            <DeleteLeadButton id={lead.id} name={lead.name}>
              <Button variant="ghost" size="icon" aria-label="מחיקת ליד">
                <Trash2 className="text-danger" />
              </Button>
            </DeleteLeadButton>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="פרטי הליד" />
          <CardBody>
            <DataList>
              <DataItem label="טלפון">
                <span className="inline-flex items-center gap-2">
                  <PhoneLink phone={lead.phone} />
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="text-ok hover:underline" aria-label="שליחת וואטסאפ">
                      <MessageCircle className="size-4" />
                    </a>
                  )}
                </span>
              </DataItem>
              <DataItem label="אימייל"><EmailLink email={lead.email} /></DataItem>
              <DataItem label="סוג פרויקט">{projectType.label(lead.project_type) || null}</DataItem>
              <DataItem label="מחיר משוער">{lead.estimated_value != null ? <Money value={lead.estimated_value} /> : null}</DataItem>
              <DataItem label="מקור">{leadSource.label(lead.source)}</DataItem>
              <DataItem label="תאריך מעקב">
                {lead.follow_up_date ? `${formatDate(lead.follow_up_date)} (${relativeDue(lead.follow_up_date)})` : null}
              </DataItem>
            </DataList>
            {lead.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="text-xs font-medium text-ink-3">הערות</div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{lead.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader title="סטטוס" />
          <CardBody className="flex flex-col gap-4">
            {converted ? (
              <Badge tone="ok">הפך ללקוח</Badge>
            ) : (
              <LeadStatusControl id={lead.id} status={lead.status} />
            )}
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">נוצר</dt>
                <dd>{formatDateTime(lead.created_at)}</dd>
              </div>
              {lead.converted_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">הומר ללקוח</dt>
                  <dd>{formatDateTime(lead.converted_at)}</dd>
                </div>
              )}
            </dl>
            {!converted && (
              <p className="text-xs leading-relaxed text-ink-3">
                {leadStatus.label(lead.status)} · כשהעסקה נסגרת, &quot;הפוך ללקוח&quot; פותח תיק לקוח ופרויקט מהפרטים שכבר כאן.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
