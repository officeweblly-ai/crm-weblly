import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { StartQuestionnaire } from "./start";

export const metadata: Metadata = { title: "שאלון אפיון", robots: { index: false, follow: false }, referrer: "no-referrer" };

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** General questionnaire link: a welcome screen; the button opens a private copy. */
export default async function PublicTemplatePage({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const db = createAdminClient();
  const [{ data: t }, { data: ws }] = await Promise.all([
    TOKEN_RE.test(token)
      ? db.from("form_templates").select("id, name, is_archived, form_sections(id, form_questions(id))").eq("public_token", token).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("workspace_settings").select("business_name, form_intro").maybeSingle(),
  ]);

  if (!t || t.is_archived) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-5">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-line bg-surface">
            <Link2Off className="size-5 text-ink-3" aria-hidden />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-ink">הקישור לא פעיל</h1>
          <p className="mt-2 text-sm text-ink-3">בקשו מאיתנו קישור חדש לשאלון.</p>
        </div>
      </main>
    );
  }

  const sections = t.form_sections.filter((s) => s.form_questions.length > 0);
  const questions = sections.reduce((n, s) => n + s.form_questions.length, 0);
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-5">
          <span className="truncate text-lg font-bold text-ink">{ws?.business_name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-12 sm:pt-20">
        <p className="text-sm font-medium text-accent">שאלון אפיון</p>
        <h1 className="mt-2 text-4xl font-bold leading-[1.15] text-ink sm:text-5xl">{t.name}</h1>
        {ws?.form_intro && <p className="mt-5 max-w-xl whitespace-pre-line text-[17px] leading-relaxed text-ink-2">{ws.form_intro}</p>}
        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-y border-line py-4 text-sm">
          <div><dt className="text-ink-3">שלבים</dt><dd className="mt-0.5 text-lg font-semibold text-ink num">{sections.length}</dd></div>
          <div><dt className="text-ink-3">שאלות</dt><dd className="mt-0.5 text-lg font-semibold text-ink num">{questions}</dd></div>
          <div><dt className="text-ink-3">זמן משוער</dt><dd className="mt-0.5 text-lg font-semibold text-ink">כ-<span className="num">{Math.max(3, Math.round(questions * 0.5))}</span> דקות</dd></div>
        </dl>
        <p className="mt-4 text-sm text-ink-3">אחרי הלחיצה ייפתח לכם קישור אישי. אפשר לעצור ולחזור אליו — התשובות נשמרות.</p>
        <StartQuestionnaire token={token} />
      </main>
    </div>
  );
}
