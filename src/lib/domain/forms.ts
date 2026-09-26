/**
 * Questionnaire domain — shared by the builder, the public form (client) and
 * the server-side submission validator. Pure functions only.
 */
import { z } from "zod";
import type { QuestionType } from "./labels";

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
export const CONDITION_OPERATORS = ["equals", "not_equals", "includes", "not_includes", "answered", "not_answered"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const conditionOperatorLabel: Record<ConditionOperator, string> = {
  equals: "שווה ל",
  not_equals: "שונה מ",
  includes: "כולל את",
  not_includes: "לא כולל את",
  answered: "נענתה",
  not_answered: "לא נענתה",
};

export const conditionSchema = z.object({
  question_id: z.uuid(),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string().nullable().optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const optionSchema = z.object({ value: z.string().min(1), label: z.string().min(1) });
export type QuestionOption = z.infer<typeof optionSchema>;

export const CLIENT_FIELD_MAPPINGS = ["client.name", "client.business_name", "client.email", "client.phone", "client.website"] as const;
export type ClientFieldMapping = (typeof CLIENT_FIELD_MAPPINGS)[number];
export const clientFieldLabel: Record<ClientFieldMapping, string> = {
  "client.name": "שם הלקוח",
  "client.business_name": "שם העסק",
  "client.email": "אימייל",
  "client.phone": "טלפון",
  "client.website": "אתר",
};

export type SnapshotQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  options: QuestionOption[];
  condition: Condition | null;
  maps_to: ClientFieldMapping | null;
  /** multi_select only: "choose up to N". */
  max_choices?: number | null;
};

export type SnapshotSection = {
  id: string;
  title: string;
  description: string | null;
  questions: SnapshotQuestion[];
};

export type FormSnapshot = {
  template_name: string;
  sections: SnapshotSection[];
};

export const OPTION_TYPES: QuestionType[] = ["single_select", "multi_select"];
export const UPLOAD_TYPES: QuestionType[] = ["image_upload", "file_upload"];
export const MAX_FILES_PER_QUESTION = 10;
export const MAX_REFERENCE_LINKS = 10;

// ---------------------------------------------------------------------------
// Answer values
// ---------------------------------------------------------------------------
export type UploadedFileRef = { file_id: string; name: string; size: number; mime: string };
export type ReferenceLink = { url: string; note?: string };
export type AnswerValue = string | number | string[] | UploadedFileRef[] | ReferenceLink[] | null;
export type Answers = Record<string, AnswerValue>;

export function isEmptyAnswer(v: AnswerValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Normalizes any answer into comparable strings for condition checks. */
function answerStrings(v: AnswerValue | undefined): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === "string") return [v];
  if (typeof v === "number") return [String(v)];
  return v.map((x) => (typeof x === "string" ? x : "url" in x ? x.url : x.name));
}

export function evaluateCondition(condition: Condition | null, answers: Answers): boolean {
  if (!condition) return true;
  const current = answers[condition.question_id];
  const values = answerStrings(current);
  const target = (condition.value ?? "").trim();
  switch (condition.operator) {
    case "answered":
      return !isEmptyAnswer(current);
    case "not_answered":
      return isEmptyAnswer(current);
    case "equals":
      return values.length === 1 && values[0] === target;
    case "not_equals":
      return !(values.length === 1 && values[0] === target);
    case "includes":
      return values.includes(target);
    case "not_includes":
      return !values.includes(target);
  }
}

/**
 * A question is visible when its condition holds AND the question it depends
 * on is itself visible (conditions chain). Cycles resolve to hidden.
 */
export function visibleQuestionIds(snapshot: FormSnapshot, answers: Answers): Set<string> {
  const all = new Map(snapshot.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();

  const isVisible = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const q = all.get(id);
    if (!q) return false;
    if (visiting.has(id)) return false;
    visiting.add(id);
    let result = true;
    if (q.condition) {
      const parentVisible = all.has(q.condition.question_id) ? isVisible(q.condition.question_id) : true;
      const effective = parentVisible ? answers : { ...answers, [q.condition.question_id]: null };
      result = evaluateCondition(q.condition, effective);
    }
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  return new Set([...all.keys()].filter(isVisible));
}

/** Sections that have at least one visible question. */
export function visibleSections(snapshot: FormSnapshot, answers: Answers): SnapshotSection[] {
  const visible = visibleQuestionIds(snapshot, answers);
  return snapshot.sections
    .map((s) => ({ ...s, questions: s.questions.filter((q) => visible.has(q.id)) }))
    .filter((s) => s.questions.length > 0);
}

// ---------------------------------------------------------------------------
// Validation — runs in the browser for UX and again on the server for trust.
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 10_000;

export function normalizeUrl(v: string): string {
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function isValidUrl(v: string): boolean {
  try {
    const u = new URL(normalizeUrl(v));
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Returns an error message (Hebrew) or null when the answer is acceptable. */
export function validateAnswer(q: SnapshotQuestion, v: AnswerValue | undefined): string | null {
  if (isEmptyAnswer(v)) return q.required ? "זו שאלת חובה" : null;
  switch (q.type) {
    case "short_text":
    case "long_text":
      if (typeof v !== "string") return "תשובה לא תקינה";
      if (v.length > (q.type === "short_text" ? 500 : MAX_TEXT)) return "התשובה ארוכה מדי";
      return null;
    case "email":
      return typeof v === "string" && EMAIL_RE.test(v.trim()) ? null : "כתובת האימייל לא תקינה";
    case "phone":
      return typeof v === "string" && v.replace(/\D/g, "").length >= 9 && v.replace(/\D/g, "").length <= 15 ? null : "מספר הטלפון לא תקין";
    case "url":
      return typeof v === "string" && isValidUrl(v) ? null : "הקישור לא תקין — לדוגמה: example.co.il";
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? null : "יש להזין מספר";
    case "date":
      return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? null : "תאריך לא תקין";
    case "color":
      return typeof v === "string" && COLOR_RE.test(v) ? null : "צבע לא תקין";
    case "yes_no":
      return v === "yes" || v === "no" ? null : "יש לבחור כן או לא";
    case "single_select":
      return typeof v === "string" && q.options.some((o) => o.value === v) ? null : "יש לבחור אפשרות מהרשימה";
    case "multi_select":
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && q.options.some((o) => o.value === x))) return "בחירה לא תקינה";
      if (q.max_choices && v.length > q.max_choices) return `אפשר לבחור עד ${q.max_choices} אפשרויות`;
      return null;
    case "reference_links": {
      if (!Array.isArray(v) || v.length > MAX_REFERENCE_LINKS) return "רשימת קישורים לא תקינה";
      for (const item of v) {
        if (typeof item !== "object" || item === null || !("url" in item)) return "רשימת קישורים לא תקינה";
        if (!isValidUrl(item.url)) return `הקישור "${item.url}" לא תקין`;
      }
      return null;
    }
    case "image_upload":
    case "file_upload": {
      if (!Array.isArray(v) || v.length > MAX_FILES_PER_QUESTION) return "רשימת קבצים לא תקינה";
      const ok = v.every((f) => typeof f === "object" && f !== null && "file_id" in f && typeof f.file_id === "string");
      return ok ? null : "רשימת קבצים לא תקינה";
    }
  }
}

/** Validates all visible questions. Hidden questions are ignored (and dropped on submit). */
export function validateAnswers(snapshot: FormSnapshot, answers: Answers, onlySectionId?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const visible = visibleQuestionIds(snapshot, answers);
  for (const section of snapshot.sections) {
    if (onlySectionId && section.id !== onlySectionId) continue;
    for (const q of section.questions) {
      if (!visible.has(q.id)) continue;
      const err = validateAnswer(q, answers[q.id]);
      if (err) errors[q.id] = err;
    }
  }
  return errors;
}

/** Cleans an answer before persisting (trims, normalizes URLs). */
export function normalizeAnswer(q: SnapshotQuestion, v: AnswerValue): AnswerValue {
  if (typeof v === "string") {
    const t = v.trim();
    if (q.type === "url") return normalizeUrl(t);
    if (q.type === "color") return t.toLowerCase();
    return t;
  }
  if (q.type === "reference_links" && Array.isArray(v)) {
    return (v as ReferenceLink[]).map((l) => ({ url: normalizeUrl(l.url), ...(l.note?.trim() ? { note: l.note.trim() } : {}) }));
  }
  return v;
}

/** Parses untrusted JSON (draft or submission) into an Answers map. */
export const answersSchema = z.record(
  z.string(),
  z.union([
    z.string().max(MAX_TEXT),
    z.number(),
    z.null(),
    z.array(z.string().max(500)).max(50),
    z.array(z.object({ file_id: z.uuid(), name: z.string().max(300), size: z.number().nonnegative(), mime: z.string().max(200) })).max(MAX_FILES_PER_QUESTION),
    z.array(z.object({ url: z.string().max(2000), note: z.string().max(500).optional() })).max(MAX_REFERENCE_LINKS),
  ]),
);

export function questionIndex(snapshot: FormSnapshot) {
  return new Map(snapshot.sections.flatMap((s, si) => s.questions.map((q, qi) => [q.id, { q, section: s, si, qi }] as const)));
}
