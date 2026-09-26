"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createRequest, markRequestSent } from "@/lib/actions/questionnaires";
import { projectType, type ProjectType } from "@/lib/domain/labels";
import { whatsappLink } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";

type Opt = { value: string; label: string };
type ProjectOpt = Opt & { clientId: string };
type TemplateOpt = { id: string; name: string; project_type: ProjectType | null };

export function formUrl(token: string) {
  return `${typeof window === "undefined" ? "" : window.location.origin}/form/${token}`;
}

/** Copy link — and mark the request as sent the first time. */
export function CopyLinkButton({ token, id, status, size = "sm", label = "העתקת קישור" }: { token: string; id: string; status: string; size?: "sm" | "md"; label?: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("הקישור הועתק — אפשר להדביק ללקוח");
      if (status === "created") {
        start(async () => {
          await markRequestSent(id);
          router.refresh();
        });
      }
    } catch {
      toast.error("הדפדפן חסם את ההעתקה. סמן את הקישור והעתק ידנית.");
    }
  };
  return (
    <Button variant="secondary" size={size} onClick={copy} aria-live="polite">
      {copied ? <Check className="text-ok" aria-hidden /> : <Copy aria-hidden />}
      {copied ? "הועתק" : label}
    </Button>
  );
}

function LinkReady({ id, url, phone, onDone }: { id: string; url: string; phone?: string | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const token = url.split("/form/")[1] ?? "";
  const fullUrl = formUrl(token);
  const wa = whatsappLink(phone, `היי! זה הקישור לשאלון האפיון לאתר שלך. אפשר למלא בקצב שלך — התשובות נשמרות אוטומטית:\n${fullUrl}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-ok/20 bg-ok-soft p-3 text-sm text-ok">הקישור מוכן. אף אחד לא יכול לנחש אותו — שלח אותו רק ללקוח.</div>
      <div className="flex items-center gap-2 rounded-md border border-line bg-sunken/60 p-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-ink-2">
          {fullUrl}
        </code>
        <CopyLinkButton token={token} id={id} status="created" label="העתקה" />
      </div>
      <div className="flex flex-wrap gap-2">
        {wa && (
          <Button asChild variant="secondary">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => start(async () => { await markRequestSent(id); router.refresh(); })}
            >
              <MessageCircle aria-hidden /> שליחה בוואטסאפ
            </a>
          </Button>
        )}
        <Button asChild variant="ghost">
          <a href={fullUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden /> תצוגה כמו הלקוח
          </a>
        </Button>
      </div>
      <div className="flex gap-2 border-t border-line pt-4">
        <Button onClick={onDone} loading={pending}>סיום</Button>
        <Button asChild variant="link">
          <Link href={`/questionnaires/${id}`}>למעקב אחרי השאלון</Link>
        </Button>
      </div>
    </div>
  );
}

export function SendQuestionnaireModal({
  templates,
  clients,
  projects,
  clientId,
  projectId,
  clientPhone,
  trigger,
  defaultOpen,
  closeHref,
  open: openProp,
  onOpenChange,
}: OpenProps & {
  templates: TemplateOpt[];
  clients?: Opt[];
  projects: ProjectOpt[];
  clientId?: string;
  projectId?: string;
  clientPhone?: string | null;
  trigger?: ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const [client, setClient] = useState(clientId ?? "");
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const clientProjects = useMemo(() => projects.filter((p) => !client || p.clientId === client), [projects, client]);
  const [project, setProject] = useState(projectId ?? "");
  const { pending, errors, onSubmit } = useFormAction(createRequest, {
    onSuccess: (d) => {
      setCreated(d);
      router.refresh();
    },
  });

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setCreated(null);
      if (defaultOpen && closeHref) router.replace(closeHref, { scroll: false });
    }
  };

  const noTemplates = templates.length === 0;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={created ? "הקישור לשאלון מוכן" : "שליחת שאלון אפיון"}
      description={created ? undefined : "בוחרים תבנית — המערכת יוצרת קישור אישי שהלקוח ממלא בלי להירשם."}
      footer={
        created ? undefined : (
          <>
            <Button type="submit" form="send-questionnaire" loading={pending} disabled={noTemplates}>
              יצירת קישור
            </Button>
            <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
              ביטול
            </Button>
          </>
        )
      }
    >
      {created ? (
        <LinkReady id={created.id} url={created.url} phone={clientPhone} onDone={() => close(false)} />
      ) : noTemplates ? (
        <p className="text-sm text-ink-2">
          עוד אין תבניות שאלון.{" "}
          <Link href="/questionnaires?tab=templates" className="font-medium text-accent hover:underline">
            יצירת תבנית ראשונה
          </Link>
        </p>
      ) : (
        <form id="send-questionnaire" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="תבנית" required error={errors.template_id}>
            {(p) => (
              <Select {...p} name="template_id" defaultValue={templates[0]?.id}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.project_type ? ` · ${projectType.label(t.project_type)}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {clientId ? (
            <input type="hidden" name="client_id" value={clientId} />
          ) : (
            <Field label="לקוח" error={errors.client_id} hint="אפשר להשאיר ריק — הלקוח ייווצר אוטומטית מהפרטים שימלא.">
              {(p) => (
                <Select
                  {...p}
                  name="client_id"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    setProject("");
                  }}
                >
                  <option value="">לקוח חדש (ייווצר מהשאלון)</option>
                  {clients?.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {(client || clientId) && (
            <Field label="פרויקט" error={errors.project_id} hint="התשובות והקבצים יקושרו לפרויקט, והסטטוס שלו יתעדכן.">
              {(p) => (
                <Select {...p} name="project_id" value={project} onChange={(e) => setProject(e.target.value)}>
                  <option value="">ללא פרויקט</option>
                  {clientProjects.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="כותרת לשאלון" hint="מה שהלקוח יראה בראש הטופס. ריק = שם התבנית." error={errors.title}>
            {(p) => <Input {...p} name="title" placeholder="לדוגמה: אפיון אתר — סטודיו דנה" />}
          </Field>
        </form>
      )}
    </Modal>
  );
}
