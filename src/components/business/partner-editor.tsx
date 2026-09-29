"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Handshake, PenLine, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, LtrInput, Textarea } from "@/components/ui/field";
import { SignaturePad } from "@/components/public/sign-form";
import { createPartnerAgreement, signPartnerAgreement, updatePartnerAgreement } from "@/lib/actions/business";
import type { PartnerAgreement } from "@/lib/domain/partners";
import { useFormAction } from "@/lib/use-form-action";

export function CreatePartnerAgreement({ title, content }: { title: string; content: PartnerAgreement }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await createPartnerAgreement({ title, content });
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Handshake aria-hidden />
      יצירת טיוטה מלאה
    </Button>
  );
}

/** Edits every part of the agreement. Saving a signed version opens a new one. */
export function PartnerEditor({ id, title: initialTitle, content: initial, signed, onClose }: { id: string; title: string; content: PartnerAgreement; signed: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [c, setC] = useState<PartnerAgreement>(initial);
  const [pending, start] = useTransition();
  const total = Math.round(c.partners.reduce((n, p) => n + (Number(p.equity) || 0), 0) * 100) / 100;

  const setPartner = (i: number, patch: Partial<PartnerAgreement["partners"][number]>) =>
    setC((x) => ({ ...x, partners: x.partners.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setClause = (i: number, patch: Partial<PartnerAgreement["clauses"][number]>) =>
    setC((x) => ({ ...x, clauses: x.clauses.map((k, j) => (j === i ? { ...k, ...patch } : k)) }));
  const moveClause = (i: number, d: -1 | 1) =>
    setC((x) => {
      const list = [...x.clauses];
      const j = i + d;
      if (j < 0 || j >= list.length) return x;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...x, clauses: list };
    });

  const save = () =>
    start(async () => {
      const r = await updatePartnerAgreement(id, { title, content: c });
      if (r.ok) {
        toast.success(r.message);
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-5">
      {signed && (
        <p role="note" className="rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-sm text-warn">
          ההסכם כבר נחתם. שמירה של שינוי תפתח גרסה חדשה — וכל השותפים יצטרכו לחתום שוב. הגרסה החתומה נשמרת.
        </p>
      )}
      <section className="rounded-lg border border-line bg-surface p-4 shadow-1 sm:p-5">
        <FormGrid>
          <Field label="כותרת">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="בתוקף מתאריך">{(p) => <Input {...p} type="date" value={c.effective_date} onChange={(e) => setC({ ...c, effective_date: e.target.value })} />}</Field>
          <Field label="שם העסק הרשמי">{(p) => <Input {...p} value={c.business.legal_name} onChange={(e) => setC({ ...c, business: { ...c.business, legal_name: e.target.value } })} />}</Field>
          <Field label="ע.מ / ח.פ">{(p) => <LtrInput {...p} value={c.business.business_id} onChange={(e) => setC({ ...c, business: { ...c.business, business_id: e.target.value } })} />}</Field>
        </FormGrid>
      </section>

      <section className="rounded-lg border border-line bg-surface shadow-1">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink">השותפים</h2>
          <span className={total === 100 ? "text-sm text-ok" : "text-sm font-medium text-danger"}>סה״כ בעלות: <bdi className="num">{total}%</bdi></span>
        </header>
        <div className="divide-y divide-line">
          {c.partners.map((p, i) => (
            <div key={p.user_id} className="px-4 py-4 sm:px-5">
              <FormGrid>
                <Field label="שם מלא">{(f) => <Input {...f} value={p.name} onChange={(e) => setPartner(i, { name: e.target.value })} />}</Field>
                <Field label="ת.ז">{(f) => <LtrInput {...f} inputMode="numeric" value={p.id_number} onChange={(e) => setPartner(i, { id_number: e.target.value })} />}</Field>
                <Field label="כתובת">{(f) => <Input {...f} value={p.address} onChange={(e) => setPartner(i, { address: e.target.value })} />}</Field>
                <Field label="אחוז בעלות">{(f) => <LtrInput {...f} inputMode="decimal" value={String(p.equity)} onChange={(e) => setPartner(i, { equity: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />}</Field>
              </FormGrid>
              <Field label="תחומי אחריות" className="mt-4">{(f) => <Textarea {...f} rows={2} value={p.role} onChange={(e) => setPartner(i, { role: e.target.value })} />}</Field>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface shadow-1">
        <header className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink">סעיפים</h2>
        </header>
        <ol className="divide-y divide-line">
          {c.clauses.map((k, i) => (
            <li key={i} className="flex flex-col gap-2 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-semibold text-ink-3 num">{i + 1}.</span>
                <Input value={k.title} onChange={(e) => setClause(i, { title: e.target.value })} aria-label={`כותרת סעיף ${i + 1}`} className="font-semibold" />
                <div className="flex shrink-0">
                  <Button type="button" size="icon" variant="ghost" aria-label="למעלה" disabled={i === 0} onClick={() => moveClause(i, -1)}><ArrowUp aria-hidden /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="למטה" disabled={i === c.clauses.length - 1} onClick={() => moveClause(i, 1)}><ArrowDown aria-hidden /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="מחיקת הסעיף" onClick={() => setC({ ...c, clauses: c.clauses.filter((_, j) => j !== i) })}><Trash2 aria-hidden /></Button>
                </div>
              </div>
              <Textarea value={k.body} onChange={(e) => setClause(i, { body: e.target.value })} rows={Math.min(10, Math.max(3, k.body.split("\n").length + 1))} aria-label={`נוסח סעיף ${i + 1}`} />
            </li>
          ))}
        </ol>
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <Button type="button" size="sm" variant="secondary" onClick={() => setC({ ...c, clauses: [...c.clauses, { title: "סעיף חדש", body: "" }] })}>
            <Plus aria-hidden /> סעיף
          </Button>
        </div>
      </section>

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 lg:bottom-4">
        <Button variant="secondary" onClick={onClose} disabled={pending} className="shadow-2"><X aria-hidden />ביטול</Button>
        <Button onClick={save} loading={pending} disabled={total !== 100} className="shadow-2 sm:min-w-40"><Save aria-hidden />שמירה</Button>
      </div>
    </div>
  );
}

export function PartnerSignForm({ id, version, hash, defaultName }: { id: string; version: number; hash: string; defaultName: string }) {
  const router = useRouter();
  const [signature, setSignature] = useState<string | null>(null);
  const { pending, errors, onSubmit } = useFormAction(signPartnerAgreement.bind(null, id), { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="hash" value={hash} />
      <input type="hidden" name="signature" value={signature ?? ""} />
      <FormGrid>
        <Field label="שם מלא" required error={errors.name}>{(p) => <Input {...p} name="name" defaultValue={defaultName} />}</Field>
        <Field label="ת.ז" hint="לא חובה" error={errors.id_number}>{(p) => <LtrInput {...p} name="id_number" inputMode="numeric" maxLength={9} />}</Field>
      </FormGrid>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-2">חתימה <span className="text-danger" aria-hidden>*</span></p>
        <SignaturePad onChange={setSignature} />
        {errors.signature && <p className="text-xs font-medium text-danger" role="alert">{errors.signature}</p>}
      </div>
      <Checkbox name="agree" label="קראתי את ההסכם בגרסה הזו ואני מסכים/ה לתנאיו" />
      {errors.agree && <p className="-mt-3 text-xs font-medium text-danger" role="alert">{errors.agree}</p>}
      <Button type="submit" loading={pending} disabled={!signature} className="sm:self-start sm:min-w-44">
        <PenLine aria-hidden /> חתימה
      </Button>
    </form>
  );
}
