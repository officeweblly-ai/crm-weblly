"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { updatePartnershipAgreement } from "@/lib/actions/agreement";
import { blocksToText, EQUITY_TOKEN, textToBlocks, type PartnerAgreement } from "@/lib/domain/partners";

type Draft = {
  title: string;
  parties: PartnerAgreement["parties"];
  recitals: string;
  operative: string;
  sections: { title: string; clauses: { title: string; body: string }[] }[];
  notice: string;
  brand: string;
};

const toDraft = (title: string, c: PartnerAgreement): Draft => ({
  title,
  brand: c.brand,
  parties: c.parties,
  recitals: c.recitals.join("\n\n"),
  operative: c.operative,
  sections: c.sections.map((s) => ({ title: s.title, clauses: s.clauses.map((cl) => ({ title: cl.title, body: blocksToText(cl.blocks) })) })),
  notice: c.notice,
});

const fromDraft = (d: Draft): { title: string; content: PartnerAgreement } => ({
  title: d.title.trim(),
  content: {
    brand: d.brand,
    parties: d.parties,
    recitals: d.recitals.split(/\n\s*\n/).map((r) => r.trim().replace(/\s*\n\s*/g, " ")).filter(Boolean),
    operative: d.operative.trim(),
    sections: d.sections.map((s) => ({ title: s.title.trim(), clauses: s.clauses.map((c) => ({ title: c.title.trim(), blocks: textToBlocks(c.body) })) })),
    notice: d.notice.trim(),
  },
});

/** Clause-by-clause editor. Saving a signed version creates the next version. */
export function AgreementEditor({ id, title, content, version, signedCount }: { id: string; title: string; content: PartnerAgreement; version: number; signedCount: number }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => toDraft(title, content));
  const [pending, start] = useTransition();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setSection = (si: number, patch: Partial<Draft["sections"][number]>) => set({ sections: d.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  const setClause = (si: number, ci: number, patch: Partial<{ title: string; body: string }>) =>
    setSection(si, { clauses: d.sections[si].clauses.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });

  const save = () =>
    start(async () => {
      const r = await updatePartnershipAgreement(id, fromDraft(d));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "נשמר");
      router.push(`/contracts/partnership/${id}`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {signedCount > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <span>
            על גרסה {version} כבר יש {signedCount === 1 ? "חתימה אחת" : `${signedCount} חתימות`}. שמירת שינוי בנוסח תיצור <strong>גרסה {version + 1}</strong> שצריך לחתום עליה מחדש.
            גרסה {version} והחתימות עליה נשמרות כפי שהן.
          </span>
        </p>
      )}

      <Card>
        <CardHeader title="כותרת והצדדים" />
        <CardBody className="flex flex-col gap-4">
          <Field label="כותרת ההסכם" required>
            {(p) => <Input {...p} value={d.title} onChange={(e) => set({ title: e.target.value })} />}
          </Field>
          {d.parties.map((party, i) => (
            <fieldset key={party.key} className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr]">
              <legend className="px-1 text-xs font-medium text-ink-3">צד {i + 1}</legend>
              <Field label="שם מלא">
                {(p) => <Input {...p} value={party.name} onChange={(e) => set({ parties: d.parties.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />}
              </Field>
              <Field label="כינוי בהסכם">
                {(p) => <Input {...p} value={party.short} onChange={(e) => set({ parties: d.parties.map((x, j) => (j === i ? { ...x, short: e.target.value } : x)) })} />}
              </Field>
              <Field label="תואר">
                {(p) => <Input {...p} value={party.title} onChange={(e) => set({ parties: d.parties.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />}
              </Field>
              <Field label="בעלות %">
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    dir="ltr"
                    value={String(party.equity)}
                    onChange={(e) => set({ parties: d.parties.map((x, j) => (j === i ? { ...x, equity: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)) })}
                  />
                )}
              </Field>
              <Field label="תפקיד (מופיע בבלוק החתימה)" className="sm:col-span-4">
                {(p) => <Input {...p} value={party.role} onChange={(e) => set({ parties: d.parties.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} />}
              </Field>
            </fieldset>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="מבוא" description="כל פסקה (מופרדת בשורה ריקה) היא ״הואיל״. מתחילים ב-״ו״ — ״הואיל ו…״." />
        <CardBody className="flex flex-col gap-4">
          <Field label="הואיל">{(p) => <Textarea {...p} rows={6} value={d.recitals} onChange={(e) => set({ recitals: e.target.value })} />}</Field>
          <Field label="משפט הפתיחה לסעיפים">{(p) => <Input {...p} value={d.operative} onChange={(e) => set({ operative: e.target.value })} />}</Field>
        </CardBody>
      </Card>

      {d.sections.map((s, si) => (
        <Card key={si}>
          <CardHeader
            title={`פרק ${si + 1}`}
            action={
              d.sections.length > 1 && (
                <Button size="sm" variant="danger-ghost" onClick={() => set({ sections: d.sections.filter((_, i) => i !== si) })}>
                  <Trash2 aria-hidden />
                  מחיקת פרק
                </Button>
              )
            }
          />
          <CardBody className="flex flex-col gap-4">
            <Field label="כותרת הפרק" required>
              {(p) => <Input {...p} value={s.title} onChange={(e) => setSection(si, { title: e.target.value })} />}
            </Field>
            {s.clauses.map((c, ci) => (
              <div key={ci} className="flex flex-col gap-2 border-s-2 border-line ps-3">
                <div className="flex items-end gap-2">
                  <Field label={`סעיף ${si + 1}.${ci + 1} — כותרת`} className="flex-1">
                    {(p) => <Input {...p} value={c.title} onChange={(e) => setClause(si, ci, { title: e.target.value })} />}
                  </Field>
                  <Button size="icon" variant="ghost" aria-label="מחיקת הסעיף" onClick={() => setSection(si, { clauses: s.clauses.filter((_, i) => i !== ci) })}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <Textarea
                  aria-label={`נוסח סעיף ${si + 1}.${ci + 1}`}
                  rows={Math.min(14, Math.max(3, c.body.split("\n").length + 2))}
                  value={c.body}
                  onChange={(e) => setClause(si, ci, { body: e.target.value })}
                  className="leading-relaxed"
                />
              </div>
            ))}
            <Button size="sm" variant="secondary" className="self-start" onClick={() => setSection(si, { clauses: [...s.clauses, { title: "", body: "" }] })}>
              <Plus aria-hidden />
              הוספת סעיף
            </Button>
          </CardBody>
        </Card>
      ))}

      <Button variant="secondary" className="self-start" onClick={() => set({ sections: [...d.sections, { title: "", clauses: [{ title: "", body: "" }] }] })}>
        <Plus aria-hidden />
        הוספת פרק
      </Button>

      <Card>
        <CardHeader title="הערה בראש ההסכם" description="מוצגת עד ששני הצדדים חותמים." />
        <CardBody>
          <Textarea aria-label="הערה" rows={2} value={d.notice} onChange={(e) => set({ notice: e.target.value })} />
        </CardBody>
      </Card>

      <p className="text-xs leading-relaxed text-ink-3">
        עיצוב הטקסט: פסקאות מופרדות בשורה ריקה · שורה שמתחילה ב-״- ״ היא פריט ברשימה ממוספרת (א), (ב)… · השורה {EQUITY_TOKEN} מציגה את טבלת הבעלות.
      </p>

      <div className="sticky bottom-20 z-10 flex gap-2 rounded-lg border border-line bg-surface/95 p-3 shadow-2 backdrop-blur-sm lg:bottom-4">
        <Button onClick={save} loading={pending} className="min-w-36">
          {signedCount > 0 ? `שמירה כגרסה ${version + 1}` : "שמירה"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
