import type { Enums } from "@/lib/supabase/database.types";

/** Visual tone of a status. Always rendered together with its text label. */
export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

type Option<T extends string> = { value: T; label: string; tone?: Tone };

function options<T extends string>(list: Option<T>[]) {
  const map = Object.fromEntries(list.map((o) => [o.value, o])) as Record<T, Option<T>>;
  return {
    list,
    values: list.map((o) => o.value) as [T, ...T[]],
    label: (v: T | null | undefined) => (v ? (map[v]?.label ?? v) : ""),
    tone: (v: T | null | undefined): Tone => (v ? (map[v]?.tone ?? "neutral") : "neutral"),
  };
}

export type ProjectStatus = Enums<"project_status">;
export type LeadStatus = Enums<"lead_status">;
export type LeadSource = Enums<"lead_source">;
export type ProjectType = Enums<"project_type">;
export type ClientStatus = Enums<"client_status">;
export type SubmissionStatus = Enums<"submission_status">;
export type QuestionType = Enums<"question_type">;
export type PaymentMethod = Enums<"payment_method">;
export type PaymentKind = Enums<"payment_kind">;
export type FileCategory = Enums<"file_category">;
export type ContractStatus = Enums<"contract_status">;
export type TaskStatus = Enums<"task_status">;
export type TaskPriority = Enums<"task_priority">;

/** Ordered — this is the Kanban column order and the lifecycle rail. */
export const projectStatus = options<ProjectStatus>([
  { value: "lead", label: "ליד", tone: "neutral" },
  { value: "questionnaire_sent", label: "אפיון נשלח", tone: "info" },
  { value: "questionnaire_received", label: "אפיון התקבל", tone: "info" },
  { value: "awaiting_deposit", label: "ממתין למקדמה", tone: "warn" },
  { value: "design", label: "עיצוב", tone: "accent" },
  { value: "development", label: "פיתוח", tone: "accent" },
  { value: "testing", label: "בדיקות", tone: "accent" },
  { value: "awaiting_approval", label: "ממתין לאישור לקוח", tone: "warn" },
  { value: "awaiting_final_payment", label: "ממתין ליתרת תשלום", tone: "warn" },
  { value: "completed", label: "הסתיים", tone: "ok" },
]);

export const leadStatus = options<LeadStatus>([
  { value: "new", label: "חדש", tone: "accent" },
  { value: "contacted", label: "נוצר קשר", tone: "info" },
  { value: "qualified", label: "רלוונטי", tone: "info" },
  { value: "proposal_sent", label: "נשלחה הצעה", tone: "warn" },
  { value: "converted", label: "הפך ללקוח", tone: "ok" },
  { value: "lost", label: "לא רלוונטי", tone: "neutral" },
]);

export const leadSource = options<LeadSource>([
  { value: "website", label: "אתר" },
  { value: "referral", label: "המלצה" },
  { value: "instagram", label: "אינסטגרם" },
  { value: "facebook", label: "פייסבוק" },
  { value: "google", label: "גוגל" },
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "returning_client", label: "לקוח חוזר" },
  { value: "other", label: "אחר" },
]);

export const projectType = options<ProjectType>([
  { value: "business_site", label: "אתר תדמית" },
  { value: "landing_page", label: "דף נחיתה" },
  { value: "ecommerce", label: "חנות אונליין" },
  { value: "web_app", label: "מערכת / אפליקציית ווב" },
  { value: "other", label: "אחר" },
]);

/** Where the relationship with the client stands (projects have their own stage). */
export const clientStatus = options<ClientStatus>([
  { value: "lead", label: "ליד", tone: "neutral" },
  { value: "new", label: "לקוח חדש", tone: "accent" },
  { value: "active", label: "בעבודה פעילה", tone: "ok" },
  { value: "maintenance", label: "תפעול ותחזוקת אתר", tone: "accent" },
  { value: "on_hold", label: "בהמתנה", tone: "warn" },
  { value: "returning", label: "לקוח חוזר", tone: "ok" },
  { value: "completed", label: "לקוח עבר", tone: "info" },
  { value: "inactive", label: "לא פעיל", tone: "neutral" },
  { value: "archived", label: "בארכיון", tone: "neutral" },
]);
/** "Current" in lists and filters: the relationship is live. */
export const CURRENT_CLIENT_STATUSES: ClientStatus[] = ["new", "active", "maintenance", "on_hold", "returning"];
export const PAST_CLIENT_STATUSES: ClientStatus[] = ["completed", "inactive", "archived"];

export const submissionStatus = options<SubmissionStatus>([
  { value: "created", label: "נוצר", tone: "neutral" },
  { value: "sent", label: "נשלח", tone: "info" },
  { value: "in_progress", label: "בתהליך מילוי", tone: "warn" },
  { value: "completed", label: "הושלם", tone: "ok" },
  { value: "cancelled", label: "בוטל", tone: "neutral" },
]);

export const questionType = options<QuestionType>([
  { value: "short_text", label: "טקסט קצר" },
  { value: "long_text", label: "טקסט ארוך" },
  { value: "email", label: "אימייל" },
  { value: "phone", label: "טלפון" },
  { value: "yes_no", label: "כן / לא" },
  { value: "single_select", label: "בחירה יחידה" },
  { value: "multi_select", label: "בחירה מרובה" },
  { value: "number", label: "מספר" },
  { value: "url", label: "קישור" },
  { value: "date", label: "תאריך" },
  { value: "color", label: "צבע" },
  { value: "image_upload", label: "העלאת תמונה" },
  { value: "file_upload", label: "העלאת קובץ" },
  { value: "reference_links", label: "קישורי השראה" },
]);

export const paymentMethod = options<PaymentMethod>([
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "bit", label: "ביט" },
  { value: "cash", label: "מזומן" },
  { value: "credit_card", label: "כרטיס אשראי" },
  { value: "other", label: "אחר" },
]);

export const paymentKind = options<PaymentKind>([
  { value: "deposit", label: "מקדמה" },
  { value: "installment", label: "תשלום ביניים" },
  { value: "final", label: "תשלום סופי" },
  { value: "other", label: "אחר" },
]);

export const fileCategory = options<FileCategory>([
  { value: "branding", label: "מיתוג" },
  { value: "references", label: "רפרנסים" },
  { value: "site_texts", label: "טקסטים לאתר" },
  { value: "images", label: "תמונות" },
  { value: "contracts", label: "חוזים" },
  { value: "questionnaire", label: "אפיון" },
  { value: "invoices", label: "חשבוניות" },
  { value: "client_materials", label: "חומרים מהלקוח" },
  { value: "deliverables", label: "תוצרים" },
  { value: "social", label: "סושיאל" },
  { value: "other", label: "אחר" },
]);

export type SocialAlbumStatus = Enums<"social_album_status">;
export const socialAlbumStatus = options<SocialAlbumStatus>([
  { value: "collecting", label: "אוספים חומרים", tone: "info" },
  { value: "editing", label: "בעריכה", tone: "warn" },
  { value: "published", label: "פורסם", tone: "ok" },
]);

export type AlbumSection = "reels" | "process" | "before_after" | "final" | "behind_scenes" | "other";
export const albumSection = options<AlbumSection>([
  { value: "reels", label: "מוכן לעלות כריל" },
  { value: "process", label: "תהליך הבנייה" },
  { value: "before_after", label: "לפני / אחרי" },
  { value: "final", label: "התוצר הסופי" },
  { value: "behind_scenes", label: "מאחורי הקלעים" },
  { value: "other", label: "אחר" },
]);

export const contractStatus = options<ContractStatus>([
  { value: "draft", label: "טיוטה", tone: "neutral" },
  { value: "sent", label: "נשלח לחתימה", tone: "warn" },
  { value: "signed", label: "נחתם", tone: "ok" },
  { value: "cancelled", label: "בוטל", tone: "neutral" },
]);

export const taskStatus = options<TaskStatus>([
  { value: "todo", label: "לא התחיל", tone: "neutral" },
  { value: "in_progress", label: "בטיפול", tone: "accent" },
  { value: "waiting_client", label: "ממתין ללקוח", tone: "warn" },
  { value: "waiting_team", label: "ממתין לצוות", tone: "info" },
  { value: "blocked", label: "חסום", tone: "danger" },
  { value: "done", label: "הושלם", tone: "ok" },
]);

export const taskPriority = options<TaskPriority>([
  { value: "low", label: "נמוכה", tone: "neutral" },
  { value: "medium", label: "רגילה", tone: "info" },
  { value: "high", label: "גבוהה", tone: "warn" },
  { value: "urgent", label: "דחוף", tone: "danger" },
]);

/** Suggested checklist — offered, never forced, when a project starts. */
export const DEFAULT_CHECKLIST: { title: string; priority: TaskPriority }[] = [
  { title: "קבלת לוגו", priority: "high" },
  { title: "קבלת חומרי מיתוג", priority: "medium" },
  { title: "קבלת תמונות", priority: "medium" },
  { title: "עיצוב אזור ה-Hero", priority: "medium" },
  { title: "עיצוב דסקטופ", priority: "medium" },
  { title: "התאמה למובייל", priority: "medium" },
  { title: "חיבור דומיין", priority: "medium" },
  { title: "SEO בסיסי", priority: "low" },
  { title: "התקנת Analytics", priority: "low" },
  { title: "הגדרת מעקב המרות", priority: "low" },
  { title: "אישור לקוח", priority: "high" },
  { title: "גביית יתרת תשלום", priority: "high" },
  { title: "עלייה לאוויר", priority: "high" },
];

/** Offered (never forced) once the client approved the design. */
export const DEV_CHECKLIST: { title: string; priority: TaskPriority }[] = [
  { title: "הקמת ריפו ופרויקט פיתוח", priority: "high" },
  { title: "פיתוח אזור ה-Hero", priority: "high" },
  { title: "פיתוח עמודי התוכן", priority: "medium" },
  { title: "התאמה מלאה למובייל", priority: "high" },
  { title: "טפסים וחיבורים", priority: "medium" },
  { title: "אנימציות ומיקרו-אינטראקציות", priority: "low" },
  { title: "בדיקות דפדפנים ומכשירים", priority: "medium" },
  { title: "בדיקת מהירות ונגישות", priority: "medium" },
];

// ---------------------------------------------------------------------------
// V2 — project links, references, approvals, portfolio
// ---------------------------------------------------------------------------
export type ProjectLinkKind =
  | "github" | "production" | "staging" | "vercel" | "supabase" | "figma" | "claude" | "claude_code" | "codex"
  | "analytics" | "search_console" | "google_ads" | "domain" | "dns" | "custom";
export const projectLinkKind = options<ProjectLinkKind>([
  { value: "github", label: "GitHub Repository" },
  { value: "production", label: "Production (האתר החי)" },
  { value: "staging", label: "Staging / Preview" },
  { value: "vercel", label: "Vercel" },
  { value: "supabase", label: "Supabase" },
  { value: "figma", label: "Figma" },
  { value: "claude", label: "Claude" },
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "analytics", label: "Analytics" },
  { value: "search_console", label: "Search Console" },
  { value: "google_ads", label: "Google Ads" },
  { value: "domain", label: "דומיין" },
  { value: "dns", label: "DNS" },
  { value: "custom", label: "קישור אחר" },
]);
/** Only these can be shown to the client — never admin consoles. */
export const CLIENT_SAFE_LINK_KINDS: ProjectLinkKind[] = ["production", "staging", "figma", "custom"];

export type ReferenceCategory = "website" | "hero" | "animation" | "mobile" | "competitor" | "pinterest" | "dribbble" | "awwwards" | "video" | "general" | "other";
export const referenceCategory = options<ReferenceCategory>([
  { value: "website", label: "אתר", tone: "neutral" },
  { value: "hero", label: "Hero", tone: "accent" },
  { value: "animation", label: "אנימציה", tone: "info" },
  { value: "mobile", label: "מובייל", tone: "info" },
  { value: "competitor", label: "מתחרה", tone: "warn" },
  { value: "pinterest", label: "Pinterest", tone: "neutral" },
  { value: "dribbble", label: "Dribbble", tone: "neutral" },
  { value: "awwwards", label: "Awwwards", tone: "neutral" },
  { value: "video", label: "וידאו", tone: "neutral" },
  { value: "general", label: "כללי", tone: "neutral" },
  { value: "other", label: "אחר", tone: "neutral" },
]);

export type ApprovalKind = "hero" | "design_desktop" | "design_mobile" | "page" | "feature" | "full_site" | "other";
export const approvalKind = options<ApprovalKind>([
  { value: "hero", label: "אזור ה-Hero" },
  { value: "design_desktop", label: "עיצוב דסקטופ" },
  { value: "design_mobile", label: "עיצוב מובייל" },
  { value: "page", label: "עמוד מסוים" },
  { value: "feature", label: "פיצ׳ר" },
  { value: "full_site", label: "האתר המלא" },
  { value: "other", label: "אחר" },
]);
export const DESIGN_APPROVAL_KINDS: ApprovalKind[] = ["hero", "design_desktop", "design_mobile", "full_site"];

export type ApprovalStatus = "pending" | "approved" | "changes_requested" | "cancelled";
export const approvalStatus = options<ApprovalStatus>([
  { value: "pending", label: "ממתין ללקוח", tone: "warn" },
  { value: "approved", label: "אושר", tone: "ok" },
  { value: "changes_requested", label: "התבקשו שינויים", tone: "danger" },
  { value: "cancelled", label: "בוטל", tone: "neutral" },
]);

export type PortfolioStatus = "draft" | "published";
export const portfolioStatus = options<PortfolioStatus>([
  { value: "draft", label: "טיוטה", tone: "neutral" },
  { value: "published", label: "מפורסם", tone: "ok" },
]);

export type PortfolioMediaKind = "cover" | "desktop" | "mobile" | "before" | "after" | "other";
export const portfolioMediaKind = options<PortfolioMediaKind>([
  { value: "cover", label: "תמונת שער" },
  { value: "desktop", label: "צילום דסקטופ" },
  { value: "mobile", label: "צילום מובייל" },
  { value: "before", label: "לפני" },
  { value: "after", label: "אחרי" },
  { value: "other", label: "אחר" },
]);

// ---------------------------------------------------------------------------
// V3 — team, relationship, proposals, signatures
// ---------------------------------------------------------------------------
/** Work areas: a responsibility owns one, a task can belong to one. Same list in SQL. */
export type WorkCategory =
  | "development" | "design" | "client_communication" | "sales" | "proposals" | "contracts" | "finance"
  | "project_management" | "social" | "content" | "deployment" | "domains" | "maintenance" | "other";
export const workCategory = options<WorkCategory>([
  { value: "development", label: "פיתוח" },
  { value: "design", label: "עיצוב" },
  { value: "client_communication", label: "תקשורת עם לקוחות" },
  { value: "sales", label: "מכירות ולידים" },
  { value: "proposals", label: "הצעות מחיר" },
  { value: "contracts", label: "חוזים" },
  { value: "finance", label: "גבייה וכספים" },
  { value: "project_management", label: "ניהול פרויקטים" },
  { value: "social", label: "סושיאל" },
  { value: "content", label: "תוכן וחומרים" },
  { value: "deployment", label: "העלאה לאוויר" },
  { value: "domains", label: "דומיינים ו-DNS" },
  { value: "maintenance", label: "תחזוקה" },
  { value: "other", label: "אחר" },
]);

/** Sunday-first, like the Israeli work week. Index = JS getDay(). */
export const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;
export const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

/** "א׳–ה׳" for the usual week, otherwise the day letters. */
export function daysSummary(days: number[]): string {
  const d = [...days].sort();
  if (!d.length) return "ללא ימי עבודה";
  if (d.join() === "0,1,2,3,4") return "א׳–ה׳";
  if (d.join() === "0,1,2,3,4,5") return "א׳–ו׳";
  return d.map((x) => WEEKDAYS[x]).join(" ");
}

export type InteractionKind = "phone" | "whatsapp" | "meeting" | "email" | "proposal" | "follow_up" | "internal_note" | "other";
export const interactionKind = options<InteractionKind>([
  { value: "phone", label: "שיחת טלפון" },
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "meeting", label: "פגישה" },
  { value: "email", label: "מייל" },
  { value: "proposal", label: "הצעת מחיר" },
  { value: "follow_up", label: "מעקב" },
  { value: "internal_note", label: "הערה פנימית" },
  { value: "other", label: "אחר" },
]);

export type ProposalStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
export const proposalStatus = options<ProposalStatus>([
  { value: "draft", label: "טיוטה", tone: "neutral" },
  { value: "sent", label: "נשלחה", tone: "info" },
  { value: "viewed", label: "נצפתה", tone: "warn" },
  { value: "accepted", label: "אושרה", tone: "ok" },
  { value: "rejected", label: "נדחתה", tone: "danger" },
  { value: "expired", label: "פג תוקף", tone: "neutral" },
]);
