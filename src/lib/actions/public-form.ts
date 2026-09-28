"use server";

/**
 * Public questionnaire endpoints. The caller is anonymous: the ONLY credential
 * is the 256-bit token in the URL. Every function re-validates the token and
 * the submission state on the server, and only ever touches that one
 * submission. The service-role client is used strictly after that check.
 */
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buildSnapshot } from "@/lib/questionnaire-snapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, recipientsFor } from "@/lib/push";
import {
  answersSchema,
  MAX_FILES_PER_QUESTION,
  normalizeAnswer,
  questionIndex,
  UPLOAD_TYPES,
  validateAnswers,
  visibleQuestionIds,
  type Answers,
  type FormSnapshot,
  type UploadedFileRef,
} from "@/lib/domain/forms";
import { BUCKET, IMAGE_MIME, MAX_FILE_BYTES, resolveMime } from "@/lib/storage";
import { fail, ok, type ActionResult } from "./result";
import type { Json } from "@/lib/supabase/database.types";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_FILES_PER_SUBMISSION = 80;

type OpenSubmission = { id: string; snapshot: FormSnapshot; project_id: string | null; client_id: string | null };

async function openSubmission(token: string): Promise<{ ok: true; s: OpenSubmission } | { ok: false; error: string }> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, error: "הקישור לא תקין." };
  const db = createAdminClient();
  const { data } = await db
    .from("form_submissions")
    .select("id, status, form_snapshot, project_id, client_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return { ok: false, error: "הקישור לא תקין או שכבר לא בתוקף." };
  if (data.status === "completed") return { ok: false, error: "השאלון כבר נשלח. תודה!" };
  if (data.status === "cancelled") return { ok: false, error: "הקישור בוטל. פנה אלינו לקבלת קישור חדש." };
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { ok: false, error: "תוקף הקישור פג. פנה אלינו לקבלת קישור חדש." };
  return { ok: true, s: { id: data.id, snapshot: data.form_snapshot as unknown as FormSnapshot, project_id: data.project_id, client_id: data.client_id } };
}

/** Keeps only answers for questions that exist in this questionnaire. */
function scopeAnswers(snapshot: FormSnapshot, raw: unknown): Answers | null {
  const parsed = answersSchema.safeParse(raw);
  if (!parsed.success) return null;
  const idx = questionIndex(snapshot);
  const out: Answers = {};
  for (const [k, v] of Object.entries(parsed.data)) if (idx.has(k)) out[k] = v as Answers[string];
  return out;
}

// ---------------------------------------------------------------------------
export async function saveDraft(token: string, rawAnswers: unknown, step: number): Promise<ActionResult<{ savedAt: string }>> {
  const r = await openSubmission(token);
  if (!r.ok) return fail(r.error);
  const answers = scopeAnswers(r.s.snapshot, rawAnswers);
  if (!answers) return fail("לא ניתן לשמור את הטיוטה — נתונים לא תקינים.");
  if (JSON.stringify(answers).length > 400_000) return fail("הטיוטה גדולה מדי.");

  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data: current } = await db.from("form_submissions").select("status, started_at").eq("id", r.s.id).single();
  const { error } = await db
    .from("form_submissions")
    .update({
      draft_answers: answers as Json,
      draft_step: Math.max(0, Math.min(200, Math.floor(step) || 0)),
      last_saved_at: now,
      started_at: current?.started_at ?? now,
      status: current && (current.status === "created" || current.status === "sent") ? "in_progress" : undefined,
    })
    .eq("id", r.s.id)
    .in("status", ["created", "sent", "in_progress"]);
  if (error) return fail("השמירה נכשלה. התשובות שמורות בדפדפן וננסה שוב.");
  return ok({ savedAt: now });
}

// ---------------------------------------------------------------------------
const uploadReq = z.object({
  questionId: z.uuid(),
  name: z.string().trim().min(1).max(300),
  mime: z.string().max(200),
  size: z.number().int().positive(),
});

export async function requestPublicUpload(token: string, input: z.input<typeof uploadReq>): Promise<ActionResult<{ path: string; signedUrl: string; mime: string }>> {
  const r = await openSubmission(token);
  if (!r.ok) return fail(r.error);
  const p = uploadReq.safeParse(input);
  if (!p.success) return fail("פרטי הקובץ לא תקינים.");
  const q = questionIndex(r.s.snapshot).get(p.data.questionId)?.q;
  if (!q || !UPLOAD_TYPES.includes(q.type)) return fail("השאלה הזו לא מקבלת קבצים.");

  const mime = resolveMime(p.data.name, p.data.mime);
  if (!mime) return fail("סוג הקובץ לא נתמך. אפשר להעלות תמונות, PDF, מסמכי Office, ZIP וקבצי עיצוב.");
  if (q.type === "image_upload" && !IMAGE_MIME.includes(mime)) return fail("בשאלה הזו אפשר להעלות רק תמונות.");
  if (p.data.size > MAX_FILE_BYTES) return fail("הקובץ גדול מ-50MB.");

  const db = createAdminClient();
  const [{ count: perQuestion }, { count: total }] = await Promise.all([
    db.from("files").select("id", { count: "exact", head: true }).eq("submission_id", r.s.id).eq("question_id", q.id),
    db.from("files").select("id", { count: "exact", head: true }).eq("submission_id", r.s.id),
  ]);
  if ((perQuestion ?? 0) >= MAX_FILES_PER_QUESTION * 2) return fail("הגעת למספר הקבצים המרבי לשאלה הזו.");
  if ((total ?? 0) >= MAX_FILES_PER_SUBMISSION) return fail("הגעת למספר הקבצים המרבי לשאלון.");

  const ext = /\.([a-z0-9]{1,8})$/i.exec(p.data.name)?.[1]?.toLowerCase();
  const path = `submissions/${r.s.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail("לא ניתן להתחיל את ההעלאה כרגע. נסה שוב בעוד רגע.");
  return ok({ path, signedUrl: data.signedUrl, mime });
}

const confirmReq = uploadReq.extend({ path: z.string().max(300) });

export async function confirmPublicUpload(token: string, input: z.input<typeof confirmReq>): Promise<ActionResult<UploadedFileRef>> {
  const r = await openSubmission(token);
  if (!r.ok) return fail(r.error);
  const p = confirmReq.safeParse(input);
  if (!p.success) return fail("פרטי הקובץ לא תקינים.");
  const q = questionIndex(r.s.snapshot).get(p.data.questionId)?.q;
  if (!q || !UPLOAD_TYPES.includes(q.type)) return fail("השאלה הזו לא מקבלת קבצים.");
  const prefix = `submissions/${r.s.id}/`;
  if (!p.data.path.startsWith(prefix) || !/^[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/.test(p.data.path.slice(prefix.length))) return fail("נתיב לא תקין.");

  const db = createAdminClient();
  const { data: info, error: infoError } = await db.storage.from(BUCKET).info(p.data.path);
  if (infoError || !info) return fail("הקובץ לא הגיע לשרת. נסה להעלות שוב.");
  const mime = info.contentType ?? resolveMime(p.data.name, p.data.mime) ?? "application/octet-stream";
  const size = info.size ?? p.data.size;

  const { data, error } = await db
    .from("files")
    .insert({
      storage_path: p.data.path,
      original_name: p.data.name,
      mime_type: mime,
      size_bytes: size,
      category: q.type === "image_upload" && /לוגו|logo|מיתוג/i.test(q.label) ? "branding" : q.type === "image_upload" ? "images" : "questionnaire",
      submission_id: r.s.id,
      question_id: q.id,
      project_id: r.s.project_id,
      source: "questionnaire",
      uploaded_by: null,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(BUCKET).remove([p.data.path]);
    return fail("שמירת הקובץ נכשלה. נסה שוב.");
  }
  return ok({ file_id: data.id, name: p.data.name, size, mime });
}

// ---------------------------------------------------------------------------
export async function submitQuestionnaire(token: string, rawAnswers: unknown): Promise<ActionResult<{ done: true }>> {
  const r = await openSubmission(token);
  if (!r.ok) return fail(r.error);
  const { snapshot } = r.s;
  const answers = scopeAnswers(snapshot, rawAnswers);
  if (!answers) return fail("התשובות לא תקינות. רענן את העמוד ונסה שוב.");

  const errors = validateAnswers(snapshot, answers);
  if (Object.keys(errors).length) return fail("יש שאלות שצריך להשלים או לתקן.", errors);

  const db = createAdminClient();
  const { data: files } = await db.from("files").select("id").eq("submission_id", r.s.id);
  const ownFiles = new Set((files ?? []).map((f) => f.id));

  const visible = visibleQuestionIds(snapshot, answers);
  const client: Record<string, string> = {};
  const payload: Json[] = [];
  snapshot.sections.forEach((section, si) => {
    section.questions.forEach((q, qi) => {
      if (!visible.has(q.id)) return; // answers to hidden questions are discarded
      let value = answers[q.id] ?? null;
      if (value !== null) value = normalizeAnswer(q, value);
      if (UPLOAD_TYPES.includes(q.type) && Array.isArray(value)) {
        value = (value as UploadedFileRef[]).filter((f) => ownFiles.has(f.file_id));
      }
      // Store option labels so the preserved answer reads naturally forever.
      if (q.type === "single_select" && typeof value === "string") value = q.options.find((o) => o.value === value)?.label ?? value;
      if (q.type === "multi_select" && Array.isArray(value)) value = (value as string[]).map((v) => q.options.find((o) => o.value === v)?.label ?? v);
      if (q.maps_to && typeof value === "string" && value) client[q.maps_to.replace("client.", "")] = value;
      payload.push({
        question_id: q.id,
        section_title: section.title,
        section_position: si,
        question_label: q.label,
        question_type: q.type,
        position: qi,
        value: value as Json,
      });
    });
  });

  const { data, error } = await db.rpc("finalize_questionnaire", { p_submission_id: r.s.id, p_answers: payload, p_client: client });
  if (error) {
    if (error.hint === "closed") return fail("השאלון כבר נשלח.");
    console.error("[finalize]", error);
    return fail("השליחה נכשלה בגלל תקלה בשרת. התשובות שמורות — נסה שוב בעוד רגע.");
  }
  const result = data as { orphan_paths?: string[]; client_id?: string; created_client?: boolean } | null;
  const orphans = (result?.orphan_paths ?? []).filter(Boolean);
  if (orphans.length) await db.storage.from(BUCKET).remove(orphans);
  const { data: who } = result?.client_id ? await db.from("clients").select("name, business_name").eq("id", result.client_id).maybeSingle() : { data: null };
  notify(async () => {
    const owner = await recipientsFor("proposals");
    return owner === "staff" ? recipientsFor("sales") : owner;
  }, "questionnaire_submitted", {
    title: result?.created_client ? "לקוח חדש מילא שאלון" : "שאלון אפיון התקבל",
    body: `${who?.business_name || who?.name || "לקוח"} שלח/ה את "${r.s.snapshot.template_name}"`,
    url: `/questionnaires/${r.s.id}`,
    tag: `q-${r.s.id}`,
  });
  return ok({ done: true });
}

// ---------------------------------------------------------------------------
/**
 * General template link (/q/<public_token>): creates a private submission for
 * this visitor and sends them to it. Requires a POST (button), so crawlers
 * and link previews never create submissions.
 */
export async function startPublicQuestionnaire(publicToken: string): Promise<ActionResult<never>> {
  if (typeof publicToken !== "string" || !TOKEN_RE.test(publicToken)) return fail("הקישור לא תקין.");
  const db = createAdminClient();
  const { data: t } = await db.from("form_templates").select("id, name, is_archived").eq("public_token", publicToken).maybeSingle();
  if (!t || t.is_archived) return fail("הקישור כבר לא פעיל. פנו אלינו לקבלת קישור חדש.");

  // Basic abuse guard: at most 60 anonymous starts per template per hour.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("form_submissions").select("id", { count: "exact", head: true }).eq("template_id", t.id).is("client_id", null).gte("created_at", since);
  if ((count ?? 0) >= 60) return fail("יש עומס זמני. נסו שוב בעוד כמה דקות.");

  const snapshot = await buildSnapshot(db, t.id);
  if (!snapshot?.sections.length) return fail("השאלון עוד לא מוכן. פנו אלינו.");
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const { error } = await db.from("form_submissions").insert({
    token,
    template_id: t.id,
    title: t.name,
    form_snapshot: snapshot as unknown as Json,
    status: "sent",
    sent_at: now,
    opened_at: now,
    created_by: null,
  });
  if (error) return fail("לא הצלחנו לפתוח את השאלון. נסו שוב.");
  redirect(`/form/${token}?start=1`);
}
