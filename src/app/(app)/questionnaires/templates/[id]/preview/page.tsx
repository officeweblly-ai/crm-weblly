import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { QuestionnaireForm } from "@/components/form/questionnaire-form";
import { getTemplate, workspaceSettings } from "@/lib/data/crm";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "תצוגה מקדימה" };

export default async function TemplatePreviewPage({ params }: PageProps<"/questionnaires/templates/[id]/preview">) {
  await requireArea("questionnaires");
  const { id } = await params;
  const [data, settings] = await Promise.all([getTemplate(id), workspaceSettings()]);
  if (!data) notFound();
  const snapshot = { template_name: data.template.name, sections: data.sections.filter((s) => s.questions.length > 0) };

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8 lg:-mt-8">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-warn-soft px-4 py-2 text-sm text-warn sm:px-6 lg:px-8">
        <span>כך הלקוח יראה את השאלון. שום דבר לא נשמר בתצוגה מקדימה.</span>
        <Link href={`/questionnaires/templates/${id}`} className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline">
          <ChevronRight className="size-4" aria-hidden /> חזרה לעריכה
        </Link>
      </div>
      {snapshot.sections.length ? (
        <QuestionnaireForm
          preview
          token="preview"
          title={data.template.name}
          businessName={settings?.business_name ?? ""}
          intro={settings?.form_intro ?? ""}
          snapshot={snapshot}
          initialAnswers={{}}
          initialStep={0}
          hasDraft={false}
        />
      ) : (
        <p className="p-10 text-center text-sm text-ink-3">בתבנית אין שאלות עדיין.</p>
      )}
    </div>
  );
}
