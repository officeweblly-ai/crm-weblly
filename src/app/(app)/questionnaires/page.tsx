import Link from "next/link";
import { ClipboardList, FilePlus2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/link-tabs";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { SendQuestionnaireModal } from "@/components/questionnaires/send-questionnaire";
import { SubmissionsList } from "@/components/questionnaires/submissions-list";
import { TemplateFormModal, TemplateMenu } from "@/components/questionnaires/template-controls";
import { clientOptions, listSubmissions, projectOptions, templateOptions } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { projectType, submissionStatus } from "@/lib/domain/labels";
import { timeAgo } from "@/lib/format";
import { first, parsePage, PAGE_SIZE } from "@/lib/utils";

export const metadata = { title: "שאלוני אפיון" };

export default async function QuestionnairesPage({ searchParams }: PageProps<"/questionnaires">) {
  const sp = await searchParams;
  const tab = first(sp.tab) === "templates" ? "templates" : "requests";
  const [templates, clients, projects] = await Promise.all([templateOptions(), clientOptions(), projectOptions()]);

  const send = (
    <SendQuestionnaireModal
      templates={templates}
      clients={clients}
      projects={projects}
      defaultOpen={first(sp.new) === "1"}
      closeHref="/questionnaires"
      trigger={<Button><Send aria-hidden />שליחת שאלון</Button>}
    />
  );

  return (
    <>
      <PageHeader
        title="שאלוני אפיון"
        description="תבניות לשימוש חוזר, וקישורים אישיים שהלקוחות ממלאים בלי להירשם."
        actions={tab === "templates" ? <TemplateFormModal trigger={<Button><FilePlus2 aria-hidden />תבנית חדשה</Button>} /> : send}
      />
      <LinkTabs
        tabs={[
          { key: "requests", label: "שאלונים שנשלחו" },
          { key: "templates", label: "תבניות", count: templates.length },
        ]}
        active={tab}
        hrefFor={(k) => (k === "requests" ? "/questionnaires" : "/questionnaires?tab=templates")}
      />
      {tab === "requests" ? <Requests sp={sp} send={send} hasTemplates={templates.length > 0} /> : <Templates />}
    </>
  );
}

async function Requests({ sp, send, hasTemplates }: { sp: Record<string, string | string[] | undefined>; send: React.ReactNode; hasTemplates: boolean }) {
  const f = { q: first(sp.q), status: first(sp.status), page: parsePage(sp.page) };
  const { rows, total } = await listSubmissions(f);
  const hrefFor = (page: number) => `/questionnaires?${new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <ListToolbar
        searchPlaceholder="חיפוש לפי כותרת"
        filters={[{ name: "status", label: "סטטוס", options: [{ value: "pending", label: "ממתינים למילוי" }, ...submissionStatus.list] }]}
      />
      {rows.length ? (
        <Card>
          <SubmissionsList rows={rows} showContext />
        </Card>
      ) : f.q || f.status ? (
        <Card><EmptyState icon={ClipboardList} title="לא נמצאו שאלונים" description="נסה לשנות את הסינון." /></Card>
      ) : (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="עוד לא נשלחו שאלונים"
            description={hasTemplates ? "שולחים ללקוח קישור אישי — הוא ממלא בנוחות מהטלפון, והתשובות נכנסות ישר לתיק." : "מתחילים מתבנית: שאלות שחוזרות על עצמן בכל פרויקט, פעם אחת."}
            action={hasTemplates ? send : <Button asChild><Link href="/questionnaires?tab=templates">יצירת תבנית</Link></Button>}
          />
        </Card>
      )}
      <Pagination page={f.page} total={total} pageSize={PAGE_SIZE} hrefFor={hrefFor} />
    </>
  );
}

async function Templates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_templates")
    .select("*, form_sections(id, form_questions(id))")
    .order("is_archived")
    .order("updated_at", { ascending: false });
  const templates = data ?? [];
  if (!templates.length)
    return (
      <Card>
        <EmptyState
          icon={FilePlus2}
          title="אין תבניות עדיין"
          description="בנה פעם אחת שאלון לאתר תדמית, לדף נחיתה או לחנות — ושלח אותו לכל לקוח בלחיצה."
          action={<TemplateFormModal trigger={<Button><FilePlus2 aria-hidden />תבנית ראשונה</Button>} />}
        />
      </Card>
    );
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {templates.map((t) => {
        const q = t.form_sections.reduce((n, s) => n + s.form_questions.length, 0);
        const { form_sections: _sections, ...row } = t;
        void _sections;
        return (
          <li key={t.id} className="flex flex-col rounded-lg border border-line bg-surface p-4 shadow-1">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/questionnaires/templates/${t.id}`} className="font-display text-lg font-bold text-ink hover:text-accent">
                {t.name}
              </Link>
              <TemplateMenu template={row} />
            </div>
            {t.description && <p className="mt-1 line-clamp-2 text-sm text-ink-3">{t.description}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-ink-3">
              {t.project_type && <Badge dot={false}>{projectType.label(t.project_type)}</Badge>}
              {t.is_archived && <Badge tone="warn" dot={false}>בארכיון</Badge>}
              {t.public_token && <Badge tone="ok">קישור כללי פעיל</Badge>}
              <span className="num">{t.form_sections.length} שלבים · {q} שאלות</span>
              <span>· עודכן {timeAgo(t.updated_at)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
