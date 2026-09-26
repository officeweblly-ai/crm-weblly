import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormBuilder } from "@/components/questionnaires/builder";
import { PublicLinkButton, TemplateMenu } from "@/components/questionnaires/template-controls";
import { getTemplate } from "@/lib/data/crm";
import { projectType } from "@/lib/domain/labels";

export const metadata = { title: "בונה שאלונים" };

export default async function TemplateBuilderPage({ params }: PageProps<"/questionnaires/templates/[id]">) {
  const { id } = await params;
  const data = await getTemplate(id);
  if (!data) notFound();
  const { template, sections } = data;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2">
        <Link href="/questionnaires?tab=templates" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden /> תבניות
        </Link>
      </div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold text-ink">{template.name}</h1>
            {template.project_type && <Badge dot={false}>{projectType.label(template.project_type)}</Badge>}
            {template.is_archived && <Badge tone="warn" dot={false}>בארכיון</Badge>}
          </div>
          {template.description && <p className="mt-1 text-sm text-ink-3">{template.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PublicLinkButton templateId={id} token={template.public_token} />
          <Button asChild variant="secondary">
            <Link href={`/questionnaires/templates/${id}/preview`}>
              <Eye aria-hidden /> תצוגה מקדימה
            </Link>
          </Button>
          <TemplateMenu template={template} withEdit={false} />
        </div>
      </header>
      <FormBuilder templateId={id} sections={sections} />
    </div>
  );
}
