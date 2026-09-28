"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { ContractDocument } from "./contract-document";
import { saveGeneratedContract } from "@/lib/actions/contracts";
import { defaultClauses, type ContractContent } from "@/lib/domain/contracts";
import { cn } from "@/lib/utils";

const VAT_OPTIONS = ["בתוספת מע״מ כדין", "כולל מע״מ", "(עוסק פטור — ללא מע״מ)", ""];

export function ContractEditor({
  id,
  number,
  clientId,
  projectId,
  proposalId,
  initialTitle,
  initial,
}: {
  id?: string;
  number?: string | null;
  clientId: string;
  projectId: string | null;
  /** Set when the agreement is created from an accepted proposal. */
  proposalId?: string | null;
  initialTitle: string;
  initial: ContractContent;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [c, setC] = useState<ContractContent>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [pending, start] = useTransition();

  const setClient = (k: keyof ContractContent["client"], v: string) => setC((s) => ({ ...s, client: { ...s.client, [k]: v } }));
  const setProject = <K extends keyof ContractContent["project"]>(k: K, v: ContractContent["project"][K]) => setC((s) => ({ ...s, project: { ...s.project, [k]: v } }));
  const setClause = (i: number, patch: Partial<ContractContent["clauses"][number]>) =>
    setC((s) => ({ ...s, clauses: s.clauses.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const moveClause = (i: number, d: -1 | 1) =>
    setC((s) => {
      const list = [...s.clauses];
      const j = i + d;
      if (j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...s, clauses: list };
    });

  const save = () =>
    start(async () => {
      const r = await saveGeneratedContract({ id, client_id: clientId, project_id: projectId, ...(proposalId ? { proposal_id: proposalId } : {}), title, content: c });
      if (r.ok) {
        toast.success(r.message ?? "נשמר");
        router.push(`/contracts/${r.data.id}`);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });

  const num = (v: string) => {
    const n = Number(v.replace(/[,\s₪]/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-4 mb-5 flex items-center justify-between gap-2 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-16 lg:-mx-8 lg:px-8">
        <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5 xl:hidden" role="group" aria-label="תצוגה">
          {(["edit", "preview"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("h-8 rounded px-3 text-sm", view === v ? "bg-sunken font-medium text-ink" : "text-ink-3")}>
              {v === "edit" ? "עריכה" : "תצוגה"}
            </button>
          ))}
        </div>
        <span className="hidden text-sm text-ink-3 xl:inline">התצוגה מתעדכנת תוך כדי הקלדה</span>
        <Button onClick={save} loading={pending}>
          <Save aria-hidden /> {id ? "שמירת שינויים" : "יצירת ההסכם"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <div className={cn("flex flex-col gap-5", view === "preview" && "max-xl:hidden")}>
          <section className="rounded-lg border border-line bg-surface p-4 shadow-1">
            <h2 className="mb-3 font-semibold text-ink">כותרת</h2>
            <Field label="שם ההסכם" error={errors.title}>
              {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="תאריך ההסכם" className="mt-3">
              {(p) => <Input {...p} type="date" value={c.date} onChange={(e) => setC((s) => ({ ...s, date: e.target.value }))} />}
            </Field>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 shadow-1">
            <h2 className="mb-3 font-semibold text-ink">פרטי הלקוח</h2>
            <FormGrid>
              <Field label="שם" required error={errors["content.client.name"]}>
                {(p) => <Input {...p} value={c.client.name} onChange={(e) => setClient("name", e.target.value)} />}
              </Field>
              <Field label="עסק">
                {(p) => <Input {...p} value={c.client.business} onChange={(e) => setClient("business", e.target.value)} />}
              </Field>
              <Field label="ח.פ / ת.ז" hint="לא חובה">
                {(p) => <LtrInput {...p} value={c.client.business_id} onChange={(e) => setClient("business_id", e.target.value)} />}
              </Field>
              <Field label="כתובת">
                {(p) => <Input {...p} value={c.client.address} onChange={(e) => setClient("address", e.target.value)} />}
              </Field>
              <Field label="טלפון">
                {(p) => <LtrInput {...p} value={c.client.phone} onChange={(e) => setClient("phone", e.target.value)} />}
              </Field>
              <Field label="אימייל">
                {(p) => <LtrInput {...p} value={c.client.email} onChange={(e) => setClient("email", e.target.value)} />}
              </Field>
            </FormGrid>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 shadow-1">
            <h2 className="mb-3 font-semibold text-ink">העבודה והתשלום</h2>
            <FormGrid>
              <Field label="שם העבודה">
                {(p) => <Input {...p} value={c.project.name} onChange={(e) => setProject("name", e.target.value)} />}
              </Field>
              <Field label="סוג">
                {(p) => <Input {...p} value={c.project.type_label} onChange={(e) => setProject("type_label", e.target.value)} />}
              </Field>
              <Field label="מחיר כולל (₪)">
                {(p) => <LtrInput {...p} inputMode="decimal" value={String(c.project.total)} onChange={(e) => setProject("total", num(e.target.value))} />}
              </Field>
              <Field label="מקדמה (₪)">
                {(p) => <LtrInput {...p} inputMode="decimal" value={String(c.project.deposit)} onChange={(e) => setProject("deposit", num(e.target.value))} />}
              </Field>
              <Field label="מע״מ">
                {(p) => (
                  <Select {...p} value={c.project.vat_note} onChange={(e) => setProject("vat_note", e.target.value)}>
                    {VAT_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o || "בלי הערה"}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <div />
              <Field label="תחילת עבודה">
                {(p) => <Input {...p} type="date" value={c.project.start_date} onChange={(e) => setProject("start_date", e.target.value)} />}
              </Field>
              <Field label="יעד למסירה">
                {(p) => <Input {...p} type="date" value={c.project.deadline} onChange={(e) => setProject("deadline", e.target.value)} />}
              </Field>
            </FormGrid>
            <Button
              variant="link"
              size="sm"
              className="mt-3"
              onClick={() => {
                setC((s) => ({ ...s, clauses: defaultClauses(s) }));
                toast.message("הסעיפים נבנו מחדש לפי הסכומים והתאריכים");
              }}
            >
              <RotateCcw aria-hidden /> לעדכן את הסעיפים לפי הסכומים והתאריכים
            </Button>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 shadow-1">
            <h2 className="mb-1 font-semibold text-ink">תכולת העבודה</h2>
            <p className="mb-2 text-xs text-ink-3">כל שורה תופיע כסעיף בנקודה.</p>
            <Textarea rows={8} value={c.scope} onChange={(e) => setC((s) => ({ ...s, scope: e.target.value }))} aria-label="תכולת העבודה" />
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 shadow-1">
            <h2 className="mb-3 font-semibold text-ink">סעיפי ההסכם</h2>
            <ol className="flex flex-col gap-3">
              {c.clauses.map((cl, i) => (
                <li key={i} className="rounded-md border border-line bg-sunken/40 p-3">
                  <div className="flex items-center gap-1">
                    <span className="w-6 text-sm text-ink-3 num">{i + 2}.</span>
                    <Input value={cl.title} onChange={(e) => setClause(i, { title: e.target.value })} aria-label={`כותרת סעיף ${i + 2}`} className="h-9 font-medium" />
                    <Button variant="ghost" size="icon-sm" aria-label="להזיז למעלה" onClick={() => moveClause(i, -1)} disabled={i === 0}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="להזיז למטה" onClick={() => moveClause(i, 1)} disabled={i === c.clauses.length - 1}><ArrowDown /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="מחיקת סעיף" onClick={() => setC((s) => ({ ...s, clauses: s.clauses.filter((_, j) => j !== i) }))}>
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                  <Textarea rows={3} className="mt-2" value={cl.body} onChange={(e) => setClause(i, { body: e.target.value })} aria-label={`תוכן סעיף ${i + 2}`} />
                </li>
              ))}
            </ol>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setC((s) => ({ ...s, clauses: [...s.clauses, { title: "סעיף חדש", body: "" }] }))}>
              <Plus aria-hidden /> הוספת סעיף
            </Button>
          </section>
          <p className="text-xs leading-relaxed text-ink-3">
            הסעיפים הם תבנית עבודה מקובלת לסטודיו, לא ייעוץ משפטי. מומלץ שעורך דין יעבור עליהם פעם אחת — ואחר כך הם ישמשו לכל הלקוחות.
          </p>
        </div>

        <div className={cn("min-w-0", view === "edit" && "max-xl:hidden")}>
          <div className="xl:sticky xl:top-32">
            <div className="mb-2 flex items-center gap-1.5 text-sm text-ink-3">
              <Eye className="size-4" aria-hidden /> תצוגה מקדימה
            </div>
            <div className="scrollbar-thin overflow-auto rounded-lg border border-line bg-sunken p-3 xl:max-h-[calc(100dvh-10rem)]">
              <ContractDocument content={c} number={number ?? null} title={title} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
