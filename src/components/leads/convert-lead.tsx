"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { convertLead } from "@/lib/actions/leads";
import { projectType } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

export function ConvertLeadButton({ lead, size = "md" }: { lead: Tables<"leads">; size?: "sm" | "md" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [withProject, setWithProject] = useState(true);
  const { pending, errors, onSubmit } = useFormAction(convertLead, {
    onSuccess: ({ clientId }) => {
      setOpen(false);
      router.push(`/clients/${clientId}`);
    },
  });
  const suggested = `${projectType.label(lead.project_type ?? "business_site")} — ${lead.business_name ?? lead.name}`;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="sm"
      trigger={
        <Button size={size}>
          <UserCheck aria-hidden />
          הפוך ללקוח
        </Button>
      }
      title="המרת ליד ללקוח"
      description="כל הפרטים שכבר הוזנו יועברו לתיק הלקוח. אין צורך להקליד מחדש."
      footer={
        <>
          <Button type="submit" form={`convert-${lead.id}`} loading={pending}>
            פתיחת תיק לקוח
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            ביטול
          </Button>
        </>
      }
    >
      <form id={`convert-${lead.id}`} onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="lead_id" value={lead.id} />
        <ul className="rounded-lg border border-line bg-sunken/60 p-3 text-sm text-ink-2">
          <li><span className="text-ink-3">לקוח: </span>{lead.name}{lead.business_name ? ` · ${lead.business_name}` : ""}</li>
          {lead.estimated_value != null && (
            <li className="mt-1"><span className="text-ink-3">מחיר משוער: </span><bdi dir="ltr">{formatMoney(lead.estimated_value)}</bdi></li>
          )}
        </ul>
        <Checkbox name="create_project" label="לפתוח גם פרויקט עם המחיר המשוער" checked={withProject} onChange={(e) => setWithProject(e.target.checked)} />
        {withProject && (
          <Field label="שם הפרויקט" error={errors.project_name}>
            {(p) => <Input {...p} name="project_name" defaultValue={suggested} />}
          </Field>
        )}
        <p className="text-xs leading-relaxed text-ink-3">
          אם כבר קיים לקוח עם אותו אימייל או טלפון, הליד יצורף אליו במקום ליצור כפילות.
        </p>
      </form>
    </Modal>
  );
}
