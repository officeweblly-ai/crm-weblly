"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { createProposal, updateProposal } from "@/lib/actions/proposals";
import { projectType } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type ProposalInitial = {
  client_id: string;
  project_id: string | null;
  submission_id: string | null;
  title: string;
  project_type: string | null;
  intro: string;
  scope: string;
  included: string[];
  excluded: string[];
  price: number;
  deposit: number;
  milestones: { label: string; amount: number | null; when: string }[];
  delivery_estimate: string;
  valid_until: string;
  notes: string;
  internal_notes: string;
};

function milestonesToText(m: ProposalInitial["milestones"]): string {
  return m.map((x) => [x.label, x.amount ?? "", x.when].join(" | ").replace(/( \| )+$/, "")).join("\n");
}

/**
 * The proposal builder. Plain fields, one per concern, with the list fields
 * as "one line per item" so it stays fast on a phone.
 */
export function ProposalEditor({ id, initial, projects }: { id?: string; initial: ProposalInitial; projects: { value: string; label: string }[] }) {
  const router = useRouter();
  const [price, setPrice] = useState(initial.price ? String(initial.price) : "");
  const [deposit, setDeposit] = useState(initial.deposit ? String(initial.deposit) : "");
  const action = id ? updateProposal.bind(null, id) : createProposal;
  const { pending, errors, onSubmit } = useFormAction(action, { onSuccess: ({ id: newId }) => router.push(`/proposals/${newId}`) });
  const num = (v: string) => Number(v.replace(/[,\s₪]/g, "")) || 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 pb-24 sm:pb-0" noValidate>
      <input type="hidden" name="client_id" value={initial.client_id} />
      {initial.submission_id && <input type="hidden" name="submission_id" value={initial.submission_id} />}

      <Card>
        <CardHeader title="פרטי ההצעה" />
        <CardBody className="flex flex-col gap-4">
          <Field label="כותרת" required error={errors.title}>
            {(p) => <Input {...p} name="title" defaultValue={initial.title} />}
          </Field>
          <FormGrid>
            <Field label="פרויקט" error={errors.project_id} hint="לא חובה — אם אין, ייפתח פרויקט כשההצעה תאושר">
              {(p) => (
                <Select {...p} name="project_id" defaultValue={initial.project_id ?? ""}>
                  <option value="">ללא פרויקט עדיין</option>
                  {projects.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="סוג הפרויקט" error={errors.project_type}>
              {(p) => (
                <Select {...p} name="project_type" defaultValue={initial.project_type ?? ""}>
                  <option value="">—</option>
                  {projectType.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
          </FormGrid>
          <Field label="פתיח ללקוח" error={errors.intro}>
            {(p) => <Textarea {...p} name="intro" rows={2} defaultValue={initial.intro} placeholder="משפט או שניים אישיים — למה ההצעה מתאימה לו" />}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="תכולה" description="מה בונים, מה כלול ומה לא — שורה לכל פריט." />
        <CardBody className="flex flex-col gap-4">
          <Field label="תכולת העבודה" error={errors.scope}>
            {(p) => <Textarea {...p} name="scope" rows={6} defaultValue={initial.scope} />}
          </Field>
          <FormGrid>
            <Field label="כלול בהצעה" error={errors.included}>
              {(p) => <Textarea {...p} name="included" rows={8} defaultValue={initial.included.join("\n")} />}
            </Field>
            <Field label="לא כלול" error={errors.excluded}>
              {(p) => <Textarea {...p} name="excluded" rows={8} defaultValue={initial.excluded.join("\n")} />}
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="מחיר ותשלומים" />
        <CardBody className="flex flex-col gap-4">
          <FormGrid>
            <Field label="מחיר כולל (₪)" required error={errors.price}>
              {(p) => <Input {...p} name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />}
            </Field>
            <Field
              label="מקדמה (₪)"
              required
              error={errors.deposit}
              hint={
                num(price) > 0 ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {[30, 40, 50].map((pct) => (
                      <button key={pct} type="button" className="min-h-8 rounded-full border border-line-strong px-2.5 text-xs text-ink-2 hover:bg-sunken" onClick={() => setDeposit(String(Math.round((num(price) * pct) / 100)))}>
                        {pct}%
                      </button>
                    ))}
                    <span>יתרה: {formatMoney(Math.max(0, num(price) - num(deposit)))}</span>
                  </span>
                ) : undefined
              }
            >
              {(p) => <Input {...p} name="deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />}
            </Field>
          </FormGrid>
          <Field label="אבני דרך לתשלום" error={errors.milestones} hint="שורה לכל שלב: שם | סכום | מתי. לדוגמה: מקדמה | 4000 | בחתימה">
            {(p) => <Textarea {...p} name="milestones" rows={3} defaultValue={milestonesToText(initial.milestones)} />}
          </Field>
          <FormGrid>
            <Field label="זמן אספקה משוער" error={errors.delivery_estimate}>
              {(p) => <Input {...p} name="delivery_estimate" defaultValue={initial.delivery_estimate} placeholder="לדוגמה: 4–6 שבועות מקבלת החומרים" />}
            </Field>
            <Field label="בתוקף עד" error={errors.valid_until}>
              {(p) => <Input {...p} name="valid_until" type="date" defaultValue={initial.valid_until} />}
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="הערות" />
        <CardBody className="flex flex-col gap-4">
          <Field label="הערות ללקוח" hint="מופיע בהצעה" error={errors.notes}>
            {(p) => <Textarea {...p} name="notes" rows={3} defaultValue={initial.notes} />}
          </Field>
          <Field label="הערות פנימיות" hint="לצוות בלבד — הלקוח לא רואה" error={errors.internal_notes}>
            {(p) => <Textarea {...p} name="internal_notes" rows={2} defaultValue={initial.internal_notes} />}
          </Field>
        </CardBody>
      </Card>

      {/* On phones the save button stays within reach above the bottom bar. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <Button type="submit" loading={pending} className="w-full sm:w-auto sm:min-w-40">
          {id ? "שמירת השינויים" : "שמירת ההצעה"}
        </Button>
      </div>
    </form>
  );
}
