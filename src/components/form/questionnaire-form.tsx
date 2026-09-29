"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CloudOff, Loader2, Send } from "lucide-react";
import { saveDraft, submitQuestionnaire } from "@/lib/actions/public-form";
import { isEmptyAnswer, validateAnswers, visibleSections, type AnswerValue, type Answers, type FormSnapshot } from "@/lib/domain/forms";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { QuestionControl } from "./fields";
import { Logo } from "@/components/brand/logo";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error" };

type Props = {
  token: string;
  title: string;
  businessName: string;
  intro: string;
  contact?: { phone: string | null; email: string | null };
  snapshot: FormSnapshot;
  initialAnswers: Answers;
  initialStep: number;
  hasDraft: boolean;
  /** Admin preview: nothing is saved or submitted. */
  preview?: boolean;
};

const AUTOSAVE_MS = 1200;

export function QuestionnaireForm({ token, title, businessName, intro, contact, snapshot, initialAnswers, initialStep, hasDraft, preview = false }: Props) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [step, setStep] = useState<number>(hasDraft ? Math.max(0, initialStep) : -1); // -1 = welcome screen
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [done, setDone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const dirty = useRef(false);
  // Always-current copies so async callbacks (uploads, timers) never merge into stale state.
  const answersRef = useRef(answers);
  const stepRef = useRef(step);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const storageKey = `qf:${token}`;

  const sections = useMemo(() => visibleSections(snapshot, answers), [snapshot, answers]);
  // step === sections.length → the review screen before sending.
  const reviewing = step >= 0 && step >= sections.length;
  const current = step >= 0 && !reviewing ? sections[step] : undefined;
  const isLast = step === sections.length - 1;
  const totalQuestions = snapshot.sections.reduce((n, s) => n + s.questions.length, 0);

  // ---- persistence -------------------------------------------------------
  const persist = useCallback(
    async (next: Answers, nextStep: number) => {
      if (preview) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ answers: next, step: nextStep, t: Date.now() }));
      } catch {
        /* storage full or blocked — the server copy still applies */
      }
      setSave({ kind: "saving" });
      try {
        const r = await saveDraft(token, next, Math.max(0, nextStep));
        if (r.ok) {
          dirty.current = false;
          setSave({ kind: "saved", at: r.data.savedAt });
        } else setSave({ kind: "error" });
      } catch {
        setSave({ kind: "error" });
      }
    },
    [preview, storageKey, token],
  );

  const schedule = (next: Answers, nextStep: number) => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next, nextStep), AUTOSAVE_MS);
  };

  // Restore a newer local backup (e.g. the connection dropped before the last save).
  useEffect(() => {
    if (preview) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const local = JSON.parse(raw) as { answers: Answers; step: number; t: number };
      const serverHasMore = Object.keys(initialAnswers).length > Object.keys(local.answers ?? {}).length;
      if (local.answers && !serverHasMore && JSON.stringify(local.answers) !== JSON.stringify(initialAnswers)) {
        answersRef.current = local.answers;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage
        setAnswers(local.answers);
        schedule(local.answers, local.step ?? 0);
      }
    } catch {
      /* ignore corrupt backup */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current && !done) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [done]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setAnswer = (id: string, v: AnswerValue) => {
    const next = { ...answersRef.current, [id]: v };
    answersRef.current = next;
    setAnswers(next);
    setErrors((e) => {
      if (!(id in e)) return e;
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
    schedule(next, stepRef.current);
  };

  // ---- navigation ---------------------------------------------------------
  const goTo = (n: number) => {
    stepRef.current = n;
    setStep(n);
    setErrors({});
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      headingRef.current?.focus({ preventScroll: true });
    });
    if (!preview && n >= 0) {
      if (timer.current) clearTimeout(timer.current);
      void persist(answersRef.current, n);
    }
  };

  const focusFirstError = (errs: Record<string, string>) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`q-${first}`) ?? document.getElementById(`q-${first}-label`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
    });
  };

  const next = () => {
    if (!current) return;
    const errs = validateAnswers(snapshot, answers, current.id);
    if (Object.keys(errs).length) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    goTo(step + 1);
  };

  const submit = () =>
    startSubmit(async () => {
      if (preview) {
        setConfirmOpen(false);
        setDone(true);
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      setSubmitError(null);
      try {
        const r = await submitQuestionnaire(token, answersRef.current);
        if (r.ok) {
          dirty.current = false;
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
          setConfirmOpen(false);
          setDone(true);
          window.scrollTo({ top: 0 });
          return;
        }
        setConfirmOpen(false);
        if (r.fieldErrors && Object.keys(r.fieldErrors).length) {
          const firstId = Object.keys(r.fieldErrors)[0];
          const idx = sections.findIndex((s) => s.questions.some((q) => q.id === firstId));
          if (idx >= 0) {
            stepRef.current = idx;
            setStep(idx);
          }
          setErrors(r.fieldErrors);
          focusFirstError(r.fieldErrors);
        } else setSubmitError(r.error);
      } catch {
        setConfirmOpen(false);
        setSubmitError("אין חיבור לאינטרנט. התשובות שמורות — נסו לשלוח שוב כשהחיבור יחזור.");
      }
    });

  // ---- screens ------------------------------------------------------------
  const ConfirmDialog = (
    <>
      <AlertDialog.Root open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
          <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 rounded-xl bg-surface p-6 shadow-3 outline-none">
            <AlertDialog.Title className="font-display text-2xl font-bold text-ink">לשלוח את השאלון?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[15px] leading-relaxed text-ink-2">
              אחרי השליחה לא ניתן לערוך את התשובות דרך הקישור. אם תרצו להוסיף משהו אחר כך — פשוט כתבו לנו.
            </AlertDialog.Description>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <Button size="lg" onClick={submit} loading={submitting} className="sm:flex-1">
                <Check aria-hidden /> כן, לשלוח
              </Button>
              <AlertDialog.Cancel asChild>
                <Button size="lg" variant="secondary" disabled={submitting}>
                  לחזור לבדוק
                </Button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );

  const Header = (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-5">
        <span className="flex items-center" aria-label={businessName}><Logo size="sm" /></span>
        {!preview && step >= 0 && !done && <SaveIndicator state={save} />}
        {preview && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">תצוגה מקדימה</span>}
      </div>
    </header>
  );

  if (done) {
    return (
      <div className="min-h-dvh bg-paper">
        {Header}
        <main className="mx-auto max-w-2xl px-5 py-16 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft">
            <CheckCircle2 className="size-7 text-ok" aria-hidden />
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold text-ink">תודה, קיבלנו הכול!</h1>
          <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-ink-2">
            התשובות והקבצים הגיעו אלינו. נעבור עליהם ונחזור אליכם עם הצעדים הבאים.
          </p>
          {(contact?.phone || contact?.email) && (
            <p className="mt-6 text-sm text-ink-3">
              שכחתם משהו? אפשר לפנות אלינו
              {contact.phone && <> · <a href={`tel:${contact.phone}`} className="font-mono text-ink-2 hover:text-accent"><bdi dir="ltr">{contact.phone}</bdi></a></>}
              {contact.email && <> · <a href={`mailto:${contact.email}`} className="font-mono text-ink-2 hover:text-accent"><bdi dir="ltr">{contact.email}</bdi></a></>}
            </p>
          )}
        </main>
      </div>
    );
  }

  if (step < 0) {
    const minutes = Math.max(3, Math.round(totalQuestions * 0.6));
    return (
      <div className="min-h-dvh bg-paper">
        {Header}
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-12 sm:pt-20">
          <p className="text-sm font-medium text-accent">שאלון אפיון</p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.15] text-ink sm:text-5xl">{title}</h1>
          {intro && <p className="mt-5 max-w-xl whitespace-pre-line text-[17px] leading-relaxed text-ink-2">{intro}</p>}
          <p className="mt-8 text-sm text-ink-3">
            <span className="num">{sections.length}</span> שלבים · כ-<span className="num">{minutes}</span> דקות · נשמר אוטומטית, אפשר לעצור ולחזור לאותו קישור
          </p>
          <ol className="mt-4 flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
            {sections.map((sec, i) => (
              <li key={sec.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-ink-2 num">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">{sec.title || `שלב ${i + 1}`}</span>
                <span className="shrink-0 text-xs text-ink-3"><span className="num">{sec.questions.length}</span> שאלות</span>
              </li>
            ))}
          </ol>
          <Button size="lg" className="mt-8 w-full sm:w-auto sm:min-w-48" onClick={() => goTo(0)}>
            {Object.keys(answers).some((k) => !isEmptyAnswer(answers[k])) ? "המשך מאיפה שעצרתי" : "בואו נתחיל"}
            <ArrowLeft aria-hidden />
          </Button>
        </main>
      </div>
    );
  }

  if (reviewing) {
    const allErrors = validateAnswers(snapshot, answers);
    const missingBySection = sections.map((sec) => sec.questions.filter((q) => allErrors[q.id]).length);
    const blocked = missingBySection.some((n) => n > 0);
    return (
      <div className="min-h-dvh bg-paper">
        {Header}
        <main className="mx-auto max-w-2xl px-5 pb-40 pt-8 sm:pt-12">
          <p className="text-sm font-medium text-accent">כמעט סיימנו</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 font-display text-3xl font-bold leading-tight text-ink outline-none">בדיקה אחרונה לפני השליחה</h1>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2">עברו על התשובות. אפשר לחזור לכל שלב ולתקן — שום דבר לא נמחק.</p>
          <ol className="mt-8 flex flex-col gap-3">
            {sections.map((sec, i) => {
              const answered = sec.questions.filter((q) => !isEmptyAnswer(answers[q.id]));
              return (
                <li key={sec.id} className="rounded-xl border border-line bg-surface">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold num", missingBySection[i] ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok")}>
                      {missingBySection[i] ? i + 1 : <Check className="size-4" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{sec.title || `שלב ${i + 1}`}</p>
                      <p className={cn("text-xs", missingBySection[i] ? "font-medium text-danger" : "text-ink-3")}>
                        {missingBySection[i] ? `חסרות ${missingBySection[i]} תשובות חובה` : `${answered.length} מתוך ${sec.questions.length} נענו`}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => goTo(i)}>עריכה</Button>
                  </div>
                  {answered.length > 0 && (
                    <dl className="grid gap-x-6 gap-y-2 border-t border-line px-4 py-3 text-sm sm:grid-cols-2">
                      {answered.slice(0, 6).map((q) => (
                        <div key={q.id} className="min-w-0">
                          <dt className="truncate text-xs text-ink-3">{q.label}</dt>
                          <dd className="truncate text-ink">{summarize(q, answers[q.id])}</dd>
                        </div>
                      ))}
                      {answered.length > 6 && <p className="text-xs text-ink-3 sm:col-span-2">ועוד {answered.length - 6} תשובות</p>}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
          {submitError && (
            <div role="alert" className="mt-6 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
              <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              {submitError}
            </div>
          )}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm" aria-label="שליחה">
          <div className="mx-auto flex max-w-2xl gap-3 px-5">
            <Button variant="secondary" size="lg" onClick={() => goTo(sections.length - 1)} className="shrink-0" aria-label="לשלב הקודם">
              <ArrowRight aria-hidden />
              <span className="max-sm:sr-only">חזרה</span>
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                if (blocked) {
                  const idx = missingBySection.findIndex((n) => n > 0);
                  goTo(idx);
                } else setConfirmOpen(true);
              }}
            >
              {blocked ? "להשלמת החסר" : <>שליחת השאלון <Send aria-hidden /></>}
            </Button>
          </div>
        </nav>
        {ConfirmDialog}
      </div>
    );
  }

  if (!current) return null;
  const stepIndex = step;
  const pct = Math.round(((stepIndex + 1) / sections.length) * 100);
  const nextTitle = sections[stepIndex + 1]?.title;
  const remaining = sections.slice(stepIndex + 1).reduce((n, sec) => n + sec.questions.length, 0);
  const SHORT = new Set(["short_text", "email", "phone", "number", "url", "date"]);

  return (
    <div className="min-h-dvh bg-paper">
      {Header}
      <main className="mx-auto max-w-2xl px-5 pb-40 pt-6 sm:pt-10">
        <div className="mb-8">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-ink-2">
              שלב <span className="num">{stepIndex + 1}</span> מתוך <span className="num">{sections.length}</span>
            </span>
            <span className="text-ink-3">
              {remaining > 0 ? <>עוד כ-<span className="num">{Math.max(1, Math.round(remaining * 0.6))}</span> דק׳</> : "שלב אחרון"}
            </span>
          </div>
          <ol className="mt-2 flex gap-1" aria-label="התקדמות">
            {sections.map((s, i) => (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  disabled={i >= stepIndex}
                  onClick={() => goTo(i)}
                  className={cn("block h-1.5 w-full rounded-full transition-colors duration-300 disabled:cursor-default", i < stepIndex ? "bg-ink/70 hover:bg-accent" : i === stepIndex ? "bg-accent" : "bg-line")}
                  aria-label={`${s.title}${i < stepIndex ? " — הושלם, חזרה לשלב" : i === stepIndex ? " — שלב נוכחי" : ""}`}
                />
              </li>
            ))}
          </ol>
          <span className="sr-only" aria-live="polite">{pct}%</span>
        </div>

        <section key={current.id} className="animate-[pop-in_260ms_ease-out]" aria-labelledby="section-title">
          <h1 id="section-title" ref={headingRef} tabIndex={-1} className="font-display text-3xl font-bold leading-tight text-ink outline-none">
            {current.title || title}
          </h1>
          {current.description && <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed text-ink-2">{current.description}</p>}

          <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2">
            {current.questions.map((q) => {
              const err = errors[q.id];
              const descId = q.description ? `q-${q.id}-desc` : undefined;
              const errId = err ? `q-${q.id}-err` : undefined;
              // Short fields (name, phone, email…) sit side by side on wider screens; everything else takes the full row.
              const half = SHORT.has(q.type);
              return (
                <div key={q.id} className={cn("flex min-w-0 flex-col gap-2.5", !half && "sm:col-span-2")}>
                  <label id={`q-${q.id}-label`} htmlFor={`q-${q.id}`} className="text-[17px] font-medium leading-snug text-ink">
                    {q.label}
                    {q.required ? <span className="text-danger" aria-hidden> *</span> : <span className="ms-2 text-sm font-normal text-ink-3">(לא חובה)</span>}
                  </label>
                  {q.description && <p id={descId} className="-mt-1 text-sm leading-relaxed text-ink-3">{q.description}</p>}
                  <QuestionControl q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} invalid={Boolean(err)} describedBy={[descId, errId].filter(Boolean).join(" ") || undefined} token={token} preview={preview} />
                  {err && (
                    <p id={errId} role="alert" className="text-sm font-medium text-danger">
                      {err}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {submitError && (
            <div role="alert" className="mt-8 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
              <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              {submitError}
            </div>
          )}
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm" aria-label="ניווט בין שלבים">
        <div className="mx-auto flex max-w-2xl gap-3 px-5">
          <Button variant="secondary" size="lg" onClick={() => goTo(step - 1)} disabled={step <= 0} className="shrink-0" aria-label="לשלב הקודם">
            <ArrowRight aria-hidden />
            <span className="max-sm:sr-only">הקודם</span>
          </Button>
          <Button size="lg" className="flex-1" onClick={next}>
            {isLast ? (
              <>
                לבדיקה ושליחה <ArrowLeft aria-hidden />
              </>
            ) : (
              <>
                <span className="truncate">המשך{nextTitle ? <span className="font-normal opacity-80 max-sm:hidden">: {nextTitle}</span> : null}</span> <ArrowLeft aria-hidden />
              </>
            )}
          </Button>
        </div>
      </nav>

      {ConfirmDialog}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3" role="status" aria-live="polite">
      {state.kind === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> שומר…
        </>
      )}
      {state.kind === "saved" && (
        <>
          <Check className="size-3.5 text-ok" aria-hidden /> נשמר {formatTime(state.at)}
        </>
      )}
      {state.kind === "error" && (
        <>
          <CloudOff className="size-3.5 text-warn" aria-hidden /> נשמר בדפדפן בלבד
        </>
      )}
    </span>
  );
}

/** One-line, human summary of an answer for the review screen. */
function summarize(q: FormSnapshot["sections"][number]["questions"][number], v: AnswerValue | undefined): string {
  if (v === null || v === undefined) return "";
  const label = (x: string) => q.options.find((o) => o.value === x)?.label ?? x;
  if (q.type === "yes_no") return v === "yes" ? "כן" : v === "no" ? "לא" : String(v);
  if (typeof v === "string") return q.type === "single_select" ? label(v) : v;
  if (typeof v === "number") return String(v);
  if (q.type === "image_upload" || q.type === "file_upload") return `${v.length} קבצים`;
  if (q.type === "reference_links") return `${v.length} קישורים`;
  return (v as string[]).map((x) => (typeof x === "string" ? label(x) : "")).filter(Boolean).join(", ");
}
