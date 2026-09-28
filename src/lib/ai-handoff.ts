import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { fileCategory, projectLinkKind, projectStatus, projectType, referenceCategory, taskPriority, taskStatus, type ProjectLinkKind, type ReferenceCategory } from "@/lib/domain/labels";
import { formatDate, todayISO } from "@/lib/format";

/**
 * AI development handoff: collects everything the project already knows and
 * turns it into three Markdown files + one paste-ready "mega prompt" for
 * Claude Code / Codex. Pure data → text; nothing here calls an AI service.
 *
 * Privacy defaults: no money, no payments, no contracts, no client phone/email
 * and only the internal notes the team explicitly marked "share with AI".
 */
export type HandoffOptions = {
  /** Client phone + email (and phone/email answers from the questionnaire). */
  includeContacts: boolean;
  /** Temporary (7-day) download links for client files, so the AI can fetch assets. */
  includeFileLinks: boolean;
};

export type HandoffFile = { name: "PROJECT_CONTEXT.md" | "CLIENT_BRIEF.md" | "BUILD_INSTRUCTIONS.md" | "CODEX_PROMPT.md"; content: string };
export type HandoffPackage = { files: HandoffFile[]; megaPrompt: string };

const ASSET_CATEGORIES = ["branding", "images", "site_texts", "references", "client_materials", "deliverables", "questionnaire", "other"] as const;
const FILE_LINK_TTL = 7 * 24 * 3600;

type AnswerValue = unknown;

function oneLine(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Keeps multi-line text readable inside Markdown bullets. */
function block(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\n/g, "\n  ");
}

function formatAnswer(type: string, v: AnswerValue): string | null {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  switch (type) {
    case "yes_no":
      return v === "yes" ? "כן" : "לא";
    case "date":
      return formatDate(String(v));
    case "multi_select":
    case "single_select":
      return (Array.isArray(v) ? v : [v]).map(String).join(", ");
    case "reference_links":
      return (v as { url: string; note?: string }[]).map((l) => `\n  - ${l.url}${l.note ? ` — ${oneLine(l.note)}` : ""}`).join("");
    case "image_upload":
    case "file_upload":
      return (v as { name: string }[]).map((f) => f.name).join(", ") + " (קבצים — ראו רשימת החומרים)";
    default:
      return block(String(v));
  }
}

export async function buildHandoff(supabase: ServerClient, projectId: string, opts: HandoffOptions): Promise<HandoffPackage | null> {
  const { data: project } = await supabase.from("projects").select("*, clients(id, name, business_name, website, phone, email)").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const client = project.clients;

  const [{ data: ws }, { data: links }, { data: refs }, { data: tasks }, { data: notes }, { data: subs }, { data: files }, { data: proposal }] = await Promise.all([
    supabase.from("workspace_settings").select("business_name").maybeSingle(),
    supabase.from("project_links").select("kind, label, url, note").eq("project_id", projectId).order("position"),
    supabase.from("project_references").select("title, url, category, note").eq("project_id", projectId).order("position"),
    supabase.from("tasks").select("title, description, status, priority, due_date, checklist:task_checklist_items(title, is_done, position)").eq("project_id", projectId).order("position"),
    supabase.from("notes").select("body, created_at").eq("project_id", projectId).eq("share_with_ai", true).order("created_at"),
    supabase.from("form_submissions").select("id, title, completed_at").eq("project_id", projectId).eq("status", "completed").order("completed_at"),
    supabase.from("files").select("id, original_name, mime_type, category, storage_path, bucket").eq("project_id", projectId).is("album_id", null).order("created_at"),
    // The agreed scope (never the price) from the accepted proposal, if there is one.
    supabase
      .from("proposals")
      .select("scope, delivery_estimate, proposal_items(kind, title, position)")
      .or(`project_id.eq.${projectId},converted_project_id.eq.${projectId}`)
      .eq("status", "accepted")
      .order("responded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const subIds = (subs ?? []).map((s) => s.id);
  const { data: answers } = subIds.length
    ? await supabase.from("form_answers").select("submission_id, section_title, section_position, question_label, question_type, position, value").in("submission_id", subIds).order("section_position").order("position")
    : { data: [] };

  let signed = new Map<string, string>();
  if (opts.includeFileLinks && files?.length) {
    const { data } = await supabase.storage.from(files[0].bucket).createSignedUrls(files.map((f) => f.storage_path), FILE_LINK_TTL);
    signed = new Map((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as [string, string]] : [])));
  }

  const studio = ws?.business_name ?? "weblly";
  const business = client?.business_name || client?.name || "";
  const today = formatDate(todayISO());
  const typeLabel = projectType.label(project.project_type);
  const open = (tasks ?? []).filter((t) => t.status !== "done");
  const done = (tasks ?? []).filter((t) => t.status === "done");

  // -------------------------------------------------------------------------
  // PROJECT_CONTEXT.md
  // -------------------------------------------------------------------------
  const ctx: string[] = [];
  ctx.push(`# PROJECT_CONTEXT — ${project.name}`, "");
  ctx.push(`> נוצר אוטומטית ממערכת ${studio} בתאריך ${today}. זה מקור האמת לגבי הפרויקט — אל תמציא מידע שלא מופיע כאן או בקבצים הנלווים.`, "");
  ctx.push("## הפרויקט");
  ctx.push(`- **שם:** ${project.name}`);
  ctx.push(`- **סוג:** ${typeLabel}`);
  ctx.push(`- **שלב נוכחי:** ${projectStatus.label(project.status)}`);
  if (project.start_date) ctx.push(`- **תאריך התחלה:** ${formatDate(project.start_date)}`);
  if (project.deadline) ctx.push(`- **יעד לסיום:** ${formatDate(project.deadline)}`);
  if (project.next_action) ctx.push(`- **הפעולה הבאה:** ${oneLine(project.next_action)}`);
  ctx.push(`- **Tech stack:** ${project.tech_stack ? oneLine(project.tech_stack) : "לא הוגדר לפרויקט — יש לאשר מול הסטודיו לפני שמתחילים"}`);
  if (project.description) ctx.push(`- **תיאור:** ${block(project.description)}`);
  ctx.push("");
  ctx.push("## הלקוח והעסק");
  if (business) ctx.push(`- **עסק:** ${business}`);
  if (client?.name && client.name !== business) ctx.push(`- **איש קשר:** ${client.name}`);
  if (client?.website) ctx.push(`- **אתר קיים:** ${client.website}`);
  if (opts.includeContacts) {
    if (client?.phone) ctx.push(`- **טלפון:** ${client.phone}`);
    if (client?.email) ctx.push(`- **אימייל:** ${client.email}`);
  }
  ctx.push("");
  if (proposal) {
    const items = [...proposal.proposal_items].sort((a, b) => a.position - b.position);
    ctx.push("## תכולה שסוכמה עם הלקוח (מהצעת המחיר שאושרה)");
    if (proposal.scope) ctx.push(block(proposal.scope));
    for (const i of items.filter((x) => x.kind === "included")) ctx.push(`- [כלול] ${oneLine(i.title)}`);
    for (const i of items.filter((x) => x.kind === "excluded")) ctx.push(`- [לא כלול — לא לבנות] ${oneLine(i.title)}`);
    if (proposal.delivery_estimate) ctx.push(`- **זמן אספקה שסוכם:** ${oneLine(proposal.delivery_estimate)}`);
    ctx.push("");
  }
  ctx.push("## קישורים");
  if (links?.length) {
    for (const l of links) ctx.push(`- **${l.label || projectLinkKind.label(l.kind as ProjectLinkKind)}:** ${l.url}${l.note ? ` — ${oneLine(l.note)}` : ""}`);
  } else ctx.push("- עדיין לא נשמרו קישורים (GitHub / Production / Staging וכו׳).");
  ctx.push("");
  ctx.push("## משימות פיתוח");
  if (open.length) {
    ctx.push("### פתוחות");
    for (const t of open) {
      const meta = [taskStatus.label(t.status), t.priority === "high" || t.priority === "urgent" ? `עדיפות ${taskPriority.label(t.priority)}` : null, t.due_date ? `יעד ${formatDate(t.due_date)}` : null].filter(Boolean).join(" · ");
      ctx.push(`- [ ] ${t.title} _(${meta})_`);
      if (t.description) ctx.push(`  ${block(t.description)}`);
      for (const c of [...(t.checklist ?? [])].sort((a, b) => a.position - b.position)) ctx.push(`  - [${c.is_done ? "x" : " "}] ${c.title}`);
    }
  } else ctx.push("- אין משימות פתוחות במערכת.");
  if (done.length) {
    ctx.push("", "### כבר הושלמו");
    for (const t of done) ctx.push(`- [x] ${t.title}`);
  }
  if (notes?.length) {
    ctx.push("", "## הערות מהצוות");
    for (const n of notes) ctx.push(`- ${block(n.body)}`);
  }

  // -------------------------------------------------------------------------
  // CLIENT_BRIEF.md
  // -------------------------------------------------------------------------
  const brief: string[] = [];
  brief.push(`# CLIENT_BRIEF — ${business || project.name}`, "");
  brief.push("> כל מה שהלקוח מסר: תשובות שאלון האפיון לפי הסקשנים המקוריים, רפרנסים וחומרים. ציטוטים — לא פרשנות.", "");
  if (answers?.length) {
    for (const s of subs ?? []) {
      const own = answers.filter((a) => a.submission_id === s.id);
      if (!own.length) continue;
      brief.push(`## שאלון: ${s.title}`);
      if (s.completed_at) brief.push(`_נשלח ע״י הלקוח: ${formatDate(s.completed_at.slice(0, 10))}_`);
      let section = "";
      for (const a of own) {
        if (!opts.includeContacts && (a.question_type === "phone" || a.question_type === "email")) continue;
        if (a.section_title !== section) {
          section = a.section_title;
          brief.push("", `### ${section || "כללי"}`);
        }
        const v = formatAnswer(a.question_type, a.value);
        brief.push(`- **${oneLine(a.question_label)}** ${v ? v : "_(לא נענה)_"}`);
      }
      brief.push("");
    }
  } else {
    brief.push("## שאלון אפיון", "- עדיין לא התקבל שאלון מלא לפרויקט. יש לבקש מהסטודיו את האפיון לפני עבודה על תוכן.", "");
  }
  brief.push("## רפרנסים והשראה");
  if (refs?.length) {
    for (const r of refs) brief.push(`- **${r.title}** (${referenceCategory.label(r.category as ReferenceCategory)}): ${r.url}${r.note ? `\n  מה אהבנו: ${oneLine(r.note)}` : ""}`);
  } else brief.push("- לא נשמרו רפרנסים בפרויקט (ייתכן שיש קישורי השראה בתשובות השאלון למעלה).");
  brief.push("");
  brief.push("## חומרים מהלקוח (לוגו, תמונות, טקסטים)");
  const relevant = (files ?? []).filter((f) => (ASSET_CATEGORIES as readonly string[]).includes(f.category));
  if (relevant.length) {
    for (const cat of ASSET_CATEGORIES) {
      const inCat = relevant.filter((f) => f.category === cat);
      if (!inCat.length) continue;
      brief.push(`### ${fileCategory.label(cat)}`);
      for (const f of inCat) {
        const url = signed.get(f.storage_path);
        brief.push(`- ${f.original_name}${url ? ` — [הורדה (זמני, 7 ימים)](${url})` : ""}`);
      }
    }
    if (!opts.includeFileLinks) brief.push("", "_הקבצים עצמם זמינים במערכת הסטודיו — יש לבקש אותם או להוריד ולהוסיף לריפו (למשל public/assets)._");
  } else brief.push("- עדיין לא הועלו חומרים לפרויקט.");

  // -------------------------------------------------------------------------
  // BUILD_INSTRUCTIONS.md
  // -------------------------------------------------------------------------
  const build: string[] = [];
  build.push(`# BUILD_INSTRUCTIONS — ${project.name}`, "");
  build.push("## המטרה");
  build.push(`לבנות ${typeLabel} עבור ${business || "הלקוח"}, בהתאם ל-CLIENT_BRIEF.md ולמצב הפרויקט ב-PROJECT_CONTEXT.md.`, "");
  build.push("## סדר עבודה");
  build.push("1. קרא את שלושת הקבצים עד הסוף לפני שכותבים קוד.");
  build.push("2. אם יש ריפו קיים (ראו קישור GitHub) — בדוק אותו קודם ושמור על המבנה והסגנון שלו. אל תבנה מחדש מה שכבר עובד.");
  build.push("3. הצג תוכנית קצרה: מבנה עמודים/סקשנים, רכיבים, והנחות פתוחות — ורק אז ממש.");
  build.push("4. עבוד לפי המשימות הפתוחות ב-PROJECT_CONTEXT.md, לפי סדר העדיפות.");
  build.push("5. בסיום כל שלב: הרץ build/lint, בדוק בדפדפן בדסקטופ ובמובייל, ותאר מה נעשה ומה נשאר.", "");
  build.push("## Tech stack");
  build.push(project.tech_stack ? `- ${oneLine(project.tech_stack)}` : "- לא הוגדר. אל תבחר לבד — הצע 1–2 אפשרויות עם נימוק וחכה לאישור.");
  build.push("");
  build.push("## דרישות קבועות של הסטודיו");
  build.push("- **שפה וכיווניות:** האתר בעברית (RTL) אלא אם האפיון אומר אחרת. להשתמש במאפיינים לוגיים (start/end), לא left/right.");
  build.push("- **מובייל:** עיצוב mobile-first; כל סקשן צריך להיראות מתוכנן גם ב-375px, לא רק \"נערם\". מטרות מגע ≥ 44px.");
  build.push("- **נגישות:** תקן ישראלי 5568 / WCAG 2.1 AA — ניגודיות, פוקוס נראה, טקסט חלופי, ניווט מקלדת, prefers-reduced-motion.");
  build.push("- **ביצועים:** תמונות מותאמות (גודל/פורמט), טעינה עצלה, בלי ספריות כבדות בלי צורך.");
  build.push("- **SEO בסיסי:** כותרות ותיאורי מטא לכל עמוד, היררכיית כותרות תקינה, Open Graph.");
  build.push("- **תוכן:** להשתמש בטקסטים ובחומרים מה-CLIENT_BRIEF.md. תוכן חסר מסמנים כ-`TODO(תוכן)` — לא ממציאים טקסט שיווקי או פרטי עסק.");
  build.push("- **עיצוב:** לכבד את הצבעים, הסגנון והרפרנסים מהאפיון. לא תבנית גנרית.");
  build.push("");
  build.push("## מה לא לעשות");
  build.push("- לא להמציא מחירים, המלצות, נתונים או פרטי קשר.");
  build.push("- לא לשמור סודות (מפתחות API, סיסמאות) בקוד — רק במשתני סביבה.");
  build.push("- לא למחוק או לשכתב קוד קיים שעובד בלי סיבה.");
  build.push("");
  build.push("## Definition of Done");
  build.push("- כל המשימות הפתוחות הרלוונטיות בוצעו או סומנו מה חסר.");
  build.push("- build ו-lint עוברים בלי שגיאות.");
  build.push("- נבדק בדסקטופ ובמובייל (RTL תקין, בלי גלילה אופקית).");
  build.push("- סיכום בסוף: מה נבנה, מה נשאר פתוח, ואילו חומרים עדיין חסרים מהלקוח.");

  const out: HandoffFile[] = [
    { name: "PROJECT_CONTEXT.md", content: ctx.join("\n").trim() + "\n" },
    { name: "CLIENT_BRIEF.md", content: brief.join("\n").trim() + "\n" },
    { name: "BUILD_INSTRUCTIONS.md", content: build.join("\n").trim() + "\n" },
  ];

  const megaPrompt = [
    `אתה מפתח Frontend בכיר שעובד עבור הסטודיו ${studio}. המשימה: לבנות ${typeLabel} עבור ${business || "הלקוח"} — "${project.name}".`,
    "",
    "למטה שלושה מסמכים: הקשר הפרויקט, בריף הלקוח והוראות הבנייה. קרא את כולם לפני שמתחילים, עבוד לפי BUILD_INSTRUCTIONS.md, והתחל בתוכנית קצרה לאישור.",
    "אם משהו חסר או לא ברור — שאל, אל תנחש.",
    "",
    ...out.flatMap((f) => [`===== ${f.name} =====`, "", f.content, ""]),
  ].join("\n");

  // Codex works best with the context in the repo and a clear, testable task.
  const repo = (links ?? []).find((l) => l.kind === "github")?.url;
  const codex = [
    `# Mega Prompt ל-Codex — ${project.name}`,
    "",
    `הקשר: ${typeLabel} עבור ${business || "הלקוח"}, עבור הסטודיו ${studio}.${repo ? ` ריפו: ${repo}` : " עדיין אין ריפו — צור פרויקט חדש לפי ה-Tech stack."}`,
    "",
    "## לפני הכול",
    "1. שמור את PROJECT_CONTEXT.md, CLIENT_BRIEF.md ו-BUILD_INSTRUCTIONS.md בתיקייה docs/ בריפו.",
    "2. צור (או עדכן) AGENTS.md בשורש הריפו: סיכום של BUILD_INSTRUCTIONS.md + פקודות build / lint / test של הפרויקט.",
    "3. קרא את שלושת המסמכים. אל תמציא תוכן, מחירים או פרטי עסק — מה שחסר מסמנים TODO(תוכן).",
    "",
    "## איך לעבוד",
    "- משימה אחת בכל פעם, לפי הסדר של המשימות הפתוחות ב-PROJECT_CONTEXT.md.",
    "- כל שינוי: הרץ build ו-lint, ותקן עד שהם עוברים. אם יש בדיקות — הרץ אותן.",
    "- RTL עברית, mobile-first (375px), נגישות WCAG 2.1 AA, בלי סודות בקוד.",
    "- לא לגעת במה שמסומן [לא כלול — לא לבנות].",
    "- בסוף כל משימה: סיכום קצר — מה שונה, איך בדקת, מה נשאר.",
    "",
    "## המשימה הראשונה",
    open[0] ? `${open[0].title}${open[0].description ? ` — ${oneLine(open[0].description)}` : ""}` : "הקמת מבנה הפרויקט והעמוד הראשי לפי CLIENT_BRIEF.md.",
    "",
    "המסמכים המלאים מצורפים בחבילה (PROJECT_CONTEXT.md, CLIENT_BRIEF.md, BUILD_INSTRUCTIONS.md).",
  ].join("\n");
  out.push({ name: "CODEX_PROMPT.md", content: codex + "\n" });

  return { files: out, megaPrompt };
}
