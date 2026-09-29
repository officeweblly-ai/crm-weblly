"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, LtrInput, Textarea } from "@/components/ui/field";
import { saveStrategy } from "@/lib/actions/business";
import { useFormAction } from "@/lib/use-form-action";
import type { Tables } from "@/lib/supabase/database.types";

type S = Tables<"business_strategy">;

const BLOCKS: { title: string; hint: string; fields: { name: keyof S; label: string; hint: string; rows?: number }[] }[] = [
  {
    title: "לאן העסק הולך",
    hint: "משפט-שניים שמכוונים כל החלטה.",
    fields: [
      { name: "vision", label: "חזון — איפה נהיה בעוד שנתיים", hint: "למשל: סטודיו מוביל לאתרים לעסקים קטנים בצפון, 8 פרויקטים בחודש, צוות של 4.", rows: 3 },
      { name: "focus", label: "הפוקוס ברבעון הזה", hint: "עד שלושה דברים. מופיע בסקירה כדי שלא נשכח.", rows: 3 },
    ],
  },
  {
    title: "למי ומה",
    hint: "מי הלקוח האידיאלי ומה מוכרים לו.",
    fields: [
      { name: "target_audience", label: "קהל יעד", hint: "תחום, גודל עסק, אזור, תקציב טיפוסי, איפה הם נמצאים.", rows: 3 },
      { name: "offering", label: "השירותים והחבילות", hint: "דף נחיתה, אתר תדמית, חנות, מערכת, תחזוקה חודשית…", rows: 3 },
      { name: "pricing", label: "תמחור", hint: "טווחי מחירים, מקדמה, מה כלול ומה בתוספת.", rows: 3 },
      { name: "channels", label: "ערוצי שיווק ומכירה", hint: "אינסטגרם, טיקטוק, המלצות, גוגל, שיתופי פעולה — ומה עובד הכי טוב.", rows: 3 },
    ],
  },
  {
    title: "ניתוח מצב (SWOT)",
    hint: "כנות עדיפה על יופי. חוזרים לזה פעם ברבעון.",
    fields: [
      { name: "strengths", label: "חוזקות", hint: "מה אנחנו עושים טוב יותר מאחרים." },
      { name: "weaknesses", label: "חולשות", hint: "מה מעכב אותנו." },
      { name: "opportunities", label: "הזדמנויות", hint: "מגמות, קהלים או שירותים שאפשר לתפוס." },
      { name: "threats", label: "איומים", hint: "מתחרים, AI, תלות בלקוח אחד, עונתיות." },
    ],
  },
];

export function StrategyForm({ strategy }: { strategy: S | null }) {
  const router = useRouter();
  const { pending, errors, onSubmit } = useFormAction(saveStrategy, { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {BLOCKS.map((b) => (
        <section key={b.title} className="rounded-lg border border-line bg-surface shadow-1">
          <header className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-ink">{b.title}</h2>
            <p className="mt-0.5 text-sm text-ink-3">{b.hint}</p>
          </header>
          <div className={b.title.startsWith("ניתוח") ? "grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5" : "flex flex-col gap-4 px-4 py-4 sm:px-5"}>
            {b.fields.map((f) => (
              <Field key={f.name} label={f.label} hint={f.hint} error={errors[f.name]}>
                {(p) => <Textarea {...p} name={f.name} defaultValue={(strategy?.[f.name] as string | null) ?? ""} rows={f.rows ?? 4} />}
              </Field>
            ))}
          </div>
        </section>
      ))}
      <section className="rounded-lg border border-line bg-surface px-4 py-4 shadow-1 sm:px-5">
        <Field label="יעד הכנסות חודשי (₪)" hint="מופיע בסקירה מול ההכנסות בפועל של החודש." error={errors.monthly_revenue_target}>
          {(p) => <LtrInput {...p} name="monthly_revenue_target" inputMode="decimal" defaultValue={strategy?.monthly_revenue_target ?? ""} className="max-w-48" />}
        </Field>
      </section>
      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <Button type="submit" loading={pending} className="shadow-2 sm:min-w-40">שמירת האסטרטגיה</Button>
      </div>
    </form>
  );
}
