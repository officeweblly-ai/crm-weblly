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
  { value: "active", label: "בעבודה פעילה", tone: "ok" },
  { value: "maintenance", label: "תפעול ותחזוקת אתר", tone: "accent" },
  { value: "on_hold", label: "בהמתנה", tone: "warn" },
  { value: "completed", label: "סיים עבודה", tone: "info" },
  { value: "archived", label: "בארכיון", tone: "neutral" },
]);

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

export type AlbumSection = "process" | "before_after" | "final" | "behind_scenes" | "other";
export const albumSection = options<AlbumSection>([
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
  { value: "todo", label: "לביצוע", tone: "neutral" },
  { value: "in_progress", label: "בעבודה", tone: "accent" },
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
