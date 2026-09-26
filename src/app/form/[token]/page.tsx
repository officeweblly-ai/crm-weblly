import type { Metadata } from "next";
import { CheckCircle2, Link2Off } from "lucide-react";
import { QuestionnaireForm } from "@/components/form/questionnaire-form";
import { getPublicForm } from "@/lib/data/public";

export const metadata: Metadata = {
  title: "שאלון אפיון",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PublicFormPage({ params, searchParams }: PageProps<"/form/[token]">) {
  const { token } = await params;
  const { start } = await searchParams;
  const form = await getPublicForm(token);

  if (form.state !== "open") {
    const completed = form.state === "closed" && form.reason === "completed";
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-5">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-line bg-surface">
            {completed ? <CheckCircle2 className="size-6 text-ok" aria-hidden /> : <Link2Off className="size-5 text-ink-3" aria-hidden />}
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-ink">
            {form.state === "invalid" ? "הקישור לא נמצא" : completed ? "השאלון כבר נשלח" : form.reason === "expired" ? "תוקף הקישור פג" : "הקישור בוטל"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            {form.state === "invalid"
              ? "ייתכן שהקישור הועתק באופן חלקי. בדקו שהעתקתם אותו במלואו, או בקשו קישור חדש."
              : completed
                ? "קיבלנו את כל התשובות. תודה! נחזור אליכם בקרוב עם הצעדים הבאים."
                : "צרו איתנו קשר ונשלח קישור חדש."}
          </p>
          {form.state === "closed" && form.businessName && <p className="mt-6 font-display text-base font-bold text-ink-2">{form.businessName}</p>}
        </div>
      </main>
    );
  }

  return (
    <QuestionnaireForm
      token={token}
      title={form.title}
      businessName={form.businessName}
      intro={form.intro}
      contact={{ phone: form.contactPhone, email: form.contactEmail }}
      snapshot={form.snapshot}
      initialAnswers={form.draft}
      initialStep={form.step}
      hasDraft={Boolean(form.lastSavedAt) || start === "1"}
    />
  );
}
