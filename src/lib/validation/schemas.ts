import { z } from "zod";
import {
  clientStatus,
  contractStatus,
  fileCategory,
  leadSource,
  leadStatus,
  paymentKind,
  paymentMethod,
  approvalKind,
  portfolioStatus,
  projectLinkKind,
  referenceCategory,
  projectStatus,
  projectType,
  taskPriority,
  taskStatus,
  interactionKind,
  proposalStatus,
  workCategory,
} from "@/lib/domain/labels";

// ---------------------------------------------------------------------------
// Field helpers. Form values arrive as strings (or undefined when empty).
// ---------------------------------------------------------------------------
const text = (max: number, msg = "הטקסט ארוך מדי") => z.string().trim().max(max, msg);
const optText = (max: number) => text(max).optional().transform((v) => v || null);
const required = (label: string, max = 200) => z.string({ error: `יש להזין ${label}` }).trim().min(1, `יש להזין ${label}`).max(max, "הטקסט ארוך מדי");

const optEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "כתובת אימייל לא תקינה")
  .optional()
  .transform((v) => v || null);

const optPhone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => {
    const d = v.replace(/\D/g, "");
    return d.length >= 9 && d.length <= 15;
  }, "מספר טלפון לא תקין")
  .optional()
  .transform((v) => v || null);

const optUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v), "כתובת לא תקינה — לדוגמה: example.co.il")
  .optional()
  .transform((v) => v || null);

const money = (label: string) =>
  z
    .string({ error: `יש להזין ${label}` })
    .trim()
    .transform((v) => Number(v.replace(/[,\s₪]/g, "")))
    .refine((n) => Number.isFinite(n) && n >= 0, `${label} חייב להיות מספר חיובי`)
    .refine((n) => n <= 9_999_999_999, `${label} גבוה מדי`)
    .refine((n) => Math.round(n * 100) === n * 100, "עד שתי ספרות אחרי הנקודה");

const optMoney = (label: string) => money(label).optional().transform((v) => (v === undefined ? null : v));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין");
const optDate = isoDate.optional().transform((v) => v || null);

const uuid = z.uuid("בחירה לא תקינה");
const optUuid = uuid.optional().transform((v) => v || null);

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export const leadSchema = z.object({
  name: required("שם"),
  business_name: optText(200),
  phone: optPhone,
  email: optEmail,
  source: z.enum(leadSource.values).default("other"),
  project_type: z.enum(projectType.values).optional().transform((v) => v ?? null),
  estimated_value: optMoney("מחיר משוער"),
  status: z.enum(leadStatus.values).default("new"),
  notes: optText(5000),
  follow_up_date: optDate,
});
export type LeadInput = z.infer<typeof leadSchema>;

export const convertLeadSchema = z.object({
  lead_id: uuid,
  create_project: z.enum(["on"]).optional().transform((v) => v === "on"),
  project_name: optText(200),
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export const clientSchema = z.object({
  name: required("שם איש קשר"),
  business_name: optText(200),
  phone: optPhone,
  email: optEmail,
  website: optUrl,
  status: z.enum(clientStatus.values).default("active"),
  source: z.enum(leadSource.values).optional().transform((v) => v ?? null),
  notes: optText(5000),
  services: optText(500),
});
export type ClientInput = z.infer<typeof clientSchema>;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projectSchema = z
  .object({
    client_id: uuid,
    name: required("שם פרויקט"),
    project_type: z.enum(projectType.values),
    description: optText(5000),
    total_price: money("מחיר כולל"),
    deposit_amount: money("מקדמה"),
    status: z.enum(projectStatus.values).default("lead"),
    start_date: optDate,
    deadline: optDate,
    next_action: optText(300),
    notes: optText(5000),
    tech_stack: optText(500),
  })
  .superRefine((v, ctx) => {
    if (v.total_price > 0 && v.deposit_amount > v.total_price) {
      ctx.addIssue({ code: "custom", path: ["deposit_amount"], message: "המקדמה גבוהה מהמחיר הכולל" });
    }
    if (v.start_date && v.deadline && v.deadline < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: "תאריך היעד לפני תאריך ההתחלה" });
    }
  });
export type ProjectInput = z.infer<typeof projectSchema>;

export const projectStatusSchema = z.object({ id: uuid, status: z.enum(projectStatus.values), board_position: z.number().finite().optional() });

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export const paymentSchema = z.object({
  project_id: uuid,
  amount: money("סכום").refine((n) => n > 0, "הסכום חייב להיות גדול מאפס"),
  paid_at: isoDate,
  method: z.enum(paymentMethod.values),
  kind: z.enum(paymentKind.values).default("installment"),
  reference: optText(200),
  note: optText(1000),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
/** "label | url" or just "url", one per line → [{label, url}]. */
export function parseLinkLines(text: string | undefined): { label: string; url: string }[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const i = line.lastIndexOf("|");
      const url = (i >= 0 ? line.slice(i + 1) : line).trim().slice(0, 500);
      const label = (i >= 0 ? line.slice(0, i) : "").trim().slice(0, 120);
      return { label, url };
    });
}

const linkLines = z
  .string()
  .max(10000)
  .optional()
  .transform((v) => parseLinkLines(v))
  .refine((links) => links.every((l) => /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(l.url)), "יש קישור לא תקין — שורה לכל קישור, לדוגמה: עיצוב | https://figma.com/…");

export const taskSchema = z
  .object({
    title: required("כותרת", 300),
    description: optText(5000),
    project_id: optUuid,
    client_id: optUuid,
    start_date: optDate,
    due_date: optDate,
    priority: z.enum(taskPriority.values).default("medium"),
    status: z.enum(taskStatus.values).default("todo"),
    assigned_to: optUuid,
    secondary_assigned_to: optUuid,
    category: z.enum(workCategory.values).optional().transform((v) => v ?? null),
    blocked_by_task_id: optUuid,
    internal_notes: optText(5000),
    links: linkLines,
  })
  .superRefine((v, ctx) => {
    if (v.start_date && v.due_date && v.due_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["due_date"], message: "תאריך היעד לפני תאריך ההתחלה" });
    }
    if (v.secondary_assigned_to && v.secondary_assigned_to === v.assigned_to) {
      ctx.addIssue({ code: "custom", path: ["secondary_assigned_to"], message: "זה כבר האחראי הראשי" });
    }
  });
export type TaskInput = z.infer<typeof taskSchema>;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export const noteSchema = z.object({
  client_id: uuid,
  project_id: optUuid,
  body: required("תוכן", 10000),
});

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export const contractSchema = z.object({
  client_id: uuid,
  project_id: optUuid,
  title: required("שם החוזה"),
  status: z.enum(contractStatus.values).default("draft"),
  contract_date: optDate,
  signed_at: optDate,
  file_id: optUuid,
  notes: optText(5000),
});
export type ContractInput = z.infer<typeof contractSchema>;

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
export const uploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(300),
  mime: z.string().max(200),
  size: z.number().int().positive(),
  category: z.enum(fileCategory.values).default("other"),
  client_id: optUuid,
  project_id: optUuid,
  album_id: optUuid,
  album_section: z.enum(["reels", "process", "before_after", "final", "behind_scenes", "other"]).optional().transform((v) => v ?? null),
  task_id: optUuid,
});

export const albumSchema = z.object({
  title: required("שם התיקייה"),
  description: optText(2000),
  client_id: optUuid,
  project_id: optUuid,
  notes: optText(5000),
});

export const fileMetaSchema = z.object({
  id: uuid,
  category: z.enum(fileCategory.values),
  project_id: optUuid,
});

// ---------------------------------------------------------------------------
// Questionnaires
// ---------------------------------------------------------------------------
export const createRequestSchema = z.object({
  template_id: uuid,
  client_id: optUuid,
  project_id: optUuid,
  title: optText(200),
});

export const templateSchema = z.object({
  name: required("שם תבנית"),
  description: optText(1000),
  project_type: z.enum(projectType.values).optional().transform((v) => v ?? null),
});

export const settingsSchema = z.object({
  business_name: required("שם העסק", 120),
  contact_email: optEmail,
  contact_phone: optPhone,
  form_intro: required("טקסט פתיחה", 2000),
  legal_name: optText(200),
  business_id: optText(50),
  address: optText(300),
  signatory_name: optText(200),
});

export const profileSchema = z.object({ full_name: required("שם", 120) });

// ---------------------------------------------------------------------------
// V2 — project links, references, approvals, client presentation, portfolio
// ---------------------------------------------------------------------------
const reqUrl = z
  .string({ error: "יש להזין כתובת" })
  .trim()
  .min(1, "יש להזין כתובת")
  .max(1000)
  .refine((v) => /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v), "כתובת לא תקינה — לדוגמה: example.co.il")
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`));

export const projectLinkSchema = z.object({
  project_id: uuid,
  kind: z.enum(projectLinkKind.values).default("custom"),
  label: optText(120),
  url: reqUrl,
  note: optText(1000),
  client_visible: z.enum(["on"]).optional().transform((v) => v === "on"),
});

export const referenceSchema = z.object({
  project_id: uuid,
  title: required("שם הרפרנס", 200),
  url: reqUrl,
  category: z.enum(referenceCategory.values).default("general"),
  note: optText(2000),
});

export const approvalSchema = z.object({
  project_id: uuid,
  title: required("כותרת", 200),
  kind: z.enum(approvalKind.values).default("other"),
  description: optText(3000),
  preview_url: reqUrl.optional().transform((v) => v ?? null),
  file_ids: z.array(uuid).max(20).optional().transform((v) => v ?? []),
  create_task_on_changes: z.enum(["on"]).optional().transform((v) => v === "on"),
});

export const clientPresentationSchema = z.object({
  client_update: optText(2000),
  client_action: optText(1000),
});

export const portfolioSchema = z.object({
  title: required("שם הפרויקט", 200),
  category: optText(120),
  summary: optText(1000),
  work_done: optText(3000),
  technologies: z
    .string()
    .max(1000)
    .optional()
    .transform((v) => (v ?? "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 30)),
  site_url: reqUrl.optional().transform((v) => v ?? null),
  status: z.enum(portfolioStatus.values).default("draft"),
  client_display_name: optText(200),
  services: z
    .string()
    .max(1000)
    .optional()
    .transform((v) => (v ?? "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 20)),
  is_featured: z.enum(["on"]).optional().transform((v) => v === "on"),
});

/** The client's answer from the presentation page. */
export const approvalResponseSchema = z
  .object({
    approval_id: uuid,
    decision: z.enum(["approved", "changes_requested"]),
    comment: optText(5000),
    author: optText(120),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "changes_requested" && !v.comment) {
      ctx.addIssue({ code: "custom", path: ["comment"], message: "כתבו בקצרה מה תרצו לשנות" });
    }
  });

// ---------------------------------------------------------------------------
// V3 — team, relationship, proposals
// ---------------------------------------------------------------------------
const optTime = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "שעה לא תקינה")
  .optional()
  .transform((v) => (v ? v.slice(0, 5) : null));

const weekdays = z
  .array(z.coerce.number().int().min(0).max(6))
  .max(7)
  .optional()
  .transform((v) => [...new Set(v ?? [])].sort());

/** A team member's working profile (the person themself, or the owner). */
export const memberProfileSchema = z
  .object({
    full_name: required("שם", 120),
    job_title: optText(120),
    phone: optPhone,
    avatar_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין").optional().transform((v) => v ?? null),
    working_days: weekdays,
    work_start: optTime,
    work_end: optTime,
    morning_time: z.string().regex(/^\d{2}:\d{2}$/, "שעה לא תקינה").default("08:30"),
  })
  .superRefine((v, ctx) => {
    if (v.work_start && v.work_end && v.work_end <= v.work_start) {
      ctx.addIssue({ code: "custom", path: ["work_end"], message: "סוף היום לפני תחילתו" });
    }
  });

export const responsibilitySchema = z.object({
  title: required("שם תחום האחריות", 120),
  description: optText(1000),
  category: z.enum(workCategory.values).default("other"),
  assigned_to: optUuid,
  is_active: z.enum(["on"]).optional().transform((v) => v === "on"),
});

export const interactionSchema = z.object({
  client_id: uuid,
  project_id: optUuid,
  kind: z.enum(interactionKind.values).default("phone"),
  occurred_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "תאריך לא תקין")
    .optional()
    .transform((v) => v ?? null),
  summary: required("מה היה", 3000),
  result: optText(2000),
  next_action: optText(300),
  follow_up_date: optDate,
});

export const followUpSchema = z.object({
  client_id: uuid,
  project_id: optUuid,
  assigned_to: optUuid,
  due_date: isoDate,
  reason: required("סיבה", 300),
  note: optText(2000),
});

/** "label | amount | when" per line → milestones. */
export function parseMilestones(text: string | undefined): { label: string; amount: number | null; when: string }[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => {
      const [label = "", amount = "", when = ""] = line.split("|").map((x) => x.trim());
      const n = Number(amount.replace(/[,\s₪]/g, ""));
      return { label: label.slice(0, 120), amount: amount && Number.isFinite(n) ? n : null, when: when.slice(0, 120) };
    });
}

const itemLines = z
  .string()
  .max(20000)
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
      .filter(Boolean)
      .slice(0, 60)
      .map((l) => l.slice(0, 300)),
  );

export const proposalSchema = z
  .object({
    client_id: uuid,
    project_id: optUuid,
    submission_id: optUuid,
    title: required("כותרת", 200),
    project_type: z.enum(projectType.values).optional().transform((v) => v ?? null),
    intro: optText(3000),
    scope: optText(20000),
    included: itemLines,
    excluded: itemLines,
    price: money("מחיר"),
    deposit: money("מקדמה"),
    milestones: z.string().max(5000).optional().transform((v) => parseMilestones(v)),
    delivery_estimate: optText(200),
    valid_until: optDate,
    notes: optText(5000),
    internal_notes: optText(5000),
    status: z.enum(proposalStatus.values).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.price > 0 && v.deposit > v.price) ctx.addIssue({ code: "custom", path: ["deposit"], message: "המקדמה גבוהה מהמחיר" });
  });

export const proposalResponseSchema = z
  .object({
    decision: z.enum(["accepted", "rejected"]),
    name: optText(120),
    note: optText(3000),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "accepted" && !v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "כתבו את שמכם לאישור" });
  });

export const signatureSchema = z.object({
  version: z.coerce.number().int().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  name: required("שם מלא", 120),
  id_number: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^\d{5,9}$/.test(v), "מספר ת.ז / ח.פ לא תקין"),
  email: optEmail,
  signature: z
    .string()
    .startsWith("data:image/png;base64,", "חסרה חתימה")
    .max(390000, "החתימה גדולה מדי — נסו שוב"),
  agree: z.enum(["on"], { error: "יש לאשר שקראתם את ההסכם" }),
});
