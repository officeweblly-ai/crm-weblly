import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { clientStatus, projectStatus, projectType, taskPriority, type ClientStatus, type ProjectStatus, type ProjectType } from "@/lib/domain/labels";
import { pageRange, PAGE_SIZE, searchPattern } from "@/lib/utils";
import { isoDateOffset, todayISO } from "@/lib/format";
import type { Tables, Views } from "@/lib/supabase/database.types";

function orSearch(q: string, cols: string[], withPhone = true) {
  const p = searchPattern(q);
  const digits = q.replace(/\D/g, "");
  return [...cols.map((c) => `${c}.ilike.${p}`), withPhone && digits.length >= 3 ? `phone_digits.ilike.%${digits}%` : null].filter(Boolean).join(",");
}

// ===========================================================================
// Clients
// ===========================================================================
export type ClientRow = Tables<"clients"> & {
  financials: Views<"client_financials"> | null;
  currentProject: { id: string; name: string; status: Tables<"projects">["status"] } | null;
  questionnaire: { id: string; status: Tables<"form_submissions">["status"] } | null;
};

export async function listClients(f: { q?: string; status?: string; sort?: string; page: number }) {
  const supabase = await createClient();
  let query = supabase.from("clients").select("*", { count: "exact" });
  if (f.q) query = query.or(orSearch(f.q, ["name", "business_name", "email", "website"]));
  if (f.status === "current") query = query.in("status", ["active", "maintenance", "on_hold"]);
  else if (f.status === "past") query = query.in("status", ["completed", "archived"]);
  else if (f.status && (clientStatus.values as string[]).includes(f.status)) query = query.eq("status", f.status as ClientStatus);
  else if (f.status !== "all") query = query.neq("status", "archived");

  switch (f.sort) {
    case "name":
      query = query.order("name");
      break;
    case "updated":
      query = query.order("updated_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  const [from, to] = pageRange(f.page);
  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const ids = data.map((c) => c.id);
  const [{ data: fin }, { data: projects }, { data: subs }] = ids.length
    ? await Promise.all([
        supabase.from("client_financials").select("*").in("client_id", ids),
        supabase.from("projects").select("id, name, status, client_id, updated_at").in("client_id", ids).order("updated_at", { ascending: false }),
        supabase.from("form_submissions").select("id, status, client_id, created_at").in("client_id", ids).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const byId = new Map((fin ?? []).map((x) => [x.client_id, x]));
  // Current project = most recently updated unfinished one, else the latest.
  const projectOf = new Map<string, ClientRow["currentProject"]>();
  for (const p of projects ?? []) {
    const existing = projectOf.get(p.client_id);
    if (!existing || (existing.status === "completed" && p.status !== "completed")) projectOf.set(p.client_id, { id: p.id, name: p.name, status: p.status });
  }
  const subOf = new Map<string, ClientRow["questionnaire"]>();
  for (const s of subs ?? []) if (s.client_id && !subOf.has(s.client_id)) subOf.set(s.client_id, { id: s.id, status: s.status });
  const rows: ClientRow[] = data.map((c) => ({ ...c, financials: byId.get(c.id) ?? null, currentProject: projectOf.get(c.id) ?? null, questionnaire: subOf.get(c.id) ?? null }));
  return { rows, total: count ?? 0, pageSize: PAGE_SIZE };
}

export const getClient = cache(async (id: string) => {
  const supabase = await createClient();
  const [{ data: client, error }, { data: fin }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_financials").select("*").eq("client_id", id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!client) return null;
  return { client, financials: fin };
});

/** Minimal list for pickers (select boxes). */
export async function clientOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name, business_name").neq("status", "archived").order("name").limit(1000);
  return (data ?? []).map((c) => ({ value: c.id, label: c.business_name ? `${c.name} · ${c.business_name}` : c.name }));
}

export async function projectOptions(clientId?: string) {
  const supabase = await createClient();
  let q = supabase.from("projects").select("id, name, client_id, clients(name)").order("created_at", { ascending: false }).limit(1000);
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  return (data ?? []).map((p) => ({ value: p.id, label: clientId ? p.name : `${p.name} · ${p.clients?.name ?? ""}`, clientId: p.client_id }));
}

// ===========================================================================
// Projects
// ===========================================================================
export type ProjectWithMoney = Tables<"projects"> & {
  client: { id: string; name: string; business_name: string | null } | null;
  financials: Views<"project_financials"> | null;
  open_tasks?: number;
};

async function attachFinancials(supabase: Awaited<ReturnType<typeof createClient>>, projects: (Tables<"projects"> & { clients: { id: string; name: string; business_name: string | null } | null })[]) {
  const ids = projects.map((p) => p.id);
  const { data: fin } = ids.length ? await supabase.from("project_financials").select("*").in("project_id", ids) : { data: [] };
  const byId = new Map((fin ?? []).map((f) => [f.project_id, f]));
  return projects.map(({ clients, ...p }) => ({ ...p, client: clients, financials: byId.get(p.id) ?? null })) as ProjectWithMoney[];
}

export async function listProjects(f: { q?: string; status?: string; type?: string; sort?: string; page: number; clientId?: string; all?: boolean }) {
  const supabase = await createClient();
  let query = supabase.from("projects").select("*, clients(id, name, business_name)", { count: "exact" });
  if (f.clientId) query = query.eq("client_id", f.clientId);
  if (f.q) query = query.or(`name.ilike.${searchPattern(f.q)},next_action.ilike.${searchPattern(f.q)}`);
  if (f.status === "active") query = query.not("status", "in", "(lead,completed)");
  else if (f.status === "attention") {
    const today = todayISO();
    const stale = new Date(Date.now() - 14 * 86400_000).toISOString();
    query = query.not("status", "in", "(lead,completed)").or(`deadline.lt.${today},status_changed_at.lt.${stale}`);
  } else if (f.status === "awaiting_payment") query = query.in("status", ["awaiting_deposit", "awaiting_final_payment"]);
  else if (f.status && (projectStatus.values as string[]).includes(f.status)) query = query.eq("status", f.status as ProjectStatus);
  if (f.type && (projectType.values as string[]).includes(f.type)) query = query.eq("project_type", f.type as ProjectType);

  switch (f.sort) {
    case "deadline":
      query = query.order("deadline", { ascending: true, nullsFirst: false });
      break;
    case "price":
      query = query.order("total_price", { ascending: false });
      break;
    case "updated":
      query = query.order("updated_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  if (!f.all) {
    const [from, to] = pageRange(f.page);
    query = query.range(from, to);
  } else {
    query = query.limit(500);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: await attachFinancials(supabase, data), total: count ?? 0, pageSize: PAGE_SIZE };
}

/** Kanban: every non-archived project, ordered inside its column. */
export async function boardProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, clients!inner(id, name, business_name, status)")
    .neq("clients.status", "archived")
    .order("board_position")
    .limit(500);
  if (error) throw new Error(error.message);
  const withMoney = await attachFinancials(supabase, data.map(({ clients, ...p }) => ({ ...p, clients: clients ? { id: clients.id, name: clients.name, business_name: clients.business_name } : null })));
  const ids = withMoney.map((p) => p.id);
  const { data: tasks } = ids.length ? await supabase.from("tasks").select("project_id").in("project_id", ids).neq("status", "done") : { data: [] };
  const counts = new Map<string, number>();
  for (const t of tasks ?? []) if (t.project_id) counts.set(t.project_id, (counts.get(t.project_id) ?? 0) + 1);
  return withMoney.map((p) => ({ ...p, open_tasks: counts.get(p.id) ?? 0 }));
}

export const getProject = cache(async (id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("*, clients(id, name, business_name)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [p] = await attachFinancials(supabase, [data]);
  return p;
});

// ===========================================================================
// Children (payments, tasks, files, contracts, notes, activity, questionnaires)
// ===========================================================================
type Scope = { clientId?: string; projectId?: string };

export async function listPayments(scope: Scope & { limit?: number }) {
  const supabase = await createClient();
  let q = supabase.from("payments").select("*, projects!inner(id, name, client_id)").order("paid_at", { ascending: false }).order("created_at", { ascending: false });
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("projects.client_id", scope.clientId);
  const { data, error } = await q.limit(scope.limit ?? 200);
  if (error) throw new Error(error.message);
  return data;
}

export type TaskRow = Tables<"tasks"> & {
  projects: { id: string; name: string } | null;
  clients: { id: string; name: string } | null;
  assignee: { id: string; full_name: string; email: string } | null;
  checklist: { id: string; title: string; is_done: boolean; position: number }[];
  task_files: { id: string; original_name: string; mime_type: string }[];
  blocker: { id: string; title: string; status: Tables<"tasks">["status"] } | null;
};

const TASK_SELECT =
  "*, projects(id, name), clients(id, name), assignee:profiles!tasks_assigned_to_fkey(id, full_name, email), checklist:task_checklist_items(id, title, is_done, position), task_files:files(id, original_name, mime_type)";

export type TaskFilter = Scope & {
  /** open = everything not done. A specific status narrows further. */
  status?: "open" | "done" | "all" | Tables<"tasks">["status"];
  due?: "overdue" | "week" | "today";
  assignee?: string;
  priority?: string;
  limit?: number;
  q?: string;
};

export async function listTasks(scope: TaskFilter) {
  const supabase = await createClient();
  let q = supabase.from("tasks").select(TASK_SELECT);
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  if (scope.status === "open" || !scope.status) q = q.neq("status", "done");
  else if (scope.status !== "all") q = q.eq("status", scope.status);
  if (scope.assignee === "none") q = q.is("assigned_to", null);
  else if (scope.assignee) q = q.eq("assigned_to", scope.assignee);
  if (scope.priority && (taskPriority.values as string[]).includes(scope.priority)) q = q.eq("priority", scope.priority as Tables<"tasks">["priority"]);
  if (scope.q) q = q.ilike("title", searchPattern(scope.q));
  const today = todayISO();
  if (scope.due === "overdue") q = q.lt("due_date", today);
  if (scope.due === "today") q = q.lte("due_date", today);
  if (scope.due === "week") q = q.gte("due_date", today).lte("due_date", isoDateOffset(7));
  q =
    scope.status === "done"
      ? q.order("completed_at", { ascending: false })
      : q.order("due_date", { ascending: true, nullsFirst: false }).order("position");
  const { data, error } = await q.limit(scope.limit ?? 300);
  if (error) throw new Error(error.message);
  const rows = data as unknown as Omit<TaskRow, "blocker">[];

  // Blocking tasks may live outside this page of results — fetch their titles once.
  const blockerIds = [...new Set(rows.map((t) => t.blocked_by_task_id).filter((id): id is string => Boolean(id)))];
  const { data: blockers } = blockerIds.length ? await supabase.from("tasks").select("id, title, status").in("id", blockerIds) : { data: [] };
  const byId = new Map((blockers ?? []).map((b) => [b.id, b]));
  return rows.map((t) => ({
    ...t,
    checklist: [...(t.checklist ?? [])].sort((a, b) => a.position - b.position),
    task_files: t.task_files ?? [],
    blocker: t.blocked_by_task_id ? (byId.get(t.blocked_by_task_id) ?? null) : null,
  })) as TaskRow[];
}

/** Active staff, for assignee pickers and filters. */
export async function staffOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name");
  return (data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email }));
}

export type FileRow = Tables<"files"> & { projects: { id: string; name: string } | null; clients: { id: string; name: string } | null };

export async function listFiles(scope: Scope & { category?: string; q?: string; page?: number; limit?: number }) {
  const supabase = await createClient();
  let q = supabase.from("files").select("*, projects(id, name), clients(id, name)", { count: "exact" }).order("created_at", { ascending: false });
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  // Uploads from an unfinished questionnaire are not shown until submitted.
  q = q.not("client_id", "is", null);
  if (scope.category) q = q.eq("category", scope.category as Tables<"files">["category"]);
  if (scope.q) q = q.ilike("original_name", searchPattern(scope.q));
  if (scope.page) {
    const [from, to] = pageRange(scope.page, 30);
    q = q.range(from, to);
  } else q = q.limit(scope.limit ?? 200);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { rows: data as FileRow[], total: count ?? 0 };
}

export type ContractRow = Tables<"contracts"> & { projects: { id: string; name: string } | null; files: Tables<"files"> | null; clients: { id: string; name: string } | null };

export async function listContracts(scope: Scope) {
  const supabase = await createClient();
  let q = supabase.from("contracts").select("*, projects(id, name), files(*), clients(id, name)").order("created_at", { ascending: false });
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  return data as ContractRow[];
}

export async function listNotes(scope: Scope) {
  const supabase = await createClient();
  let q = supabase.from("notes").select("*, projects(id, name), profiles(full_name, email)").order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  return data;
}

export type ActivityRow = Tables<"activity_logs"> & {
  profiles: { full_name: string; email: string } | null;
  clients: { id: string; name: string } | null;
  projects: { id: string; name: string } | null;
};

export async function listActivity(scope: Scope & { limit?: number; before?: string }) {
  const supabase = await createClient();
  let q = supabase.from("activity_logs").select("*, profiles(full_name, email), clients(id, name), projects(id, name)").order("created_at", { ascending: false });
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  if (scope.before) q = q.lt("created_at", scope.before);
  const { data, error } = await q.limit(scope.limit ?? 50);
  if (error) throw new Error(error.message);
  return data as ActivityRow[];
}

export type SubmissionRow = Omit<Tables<"form_submissions">, "form_snapshot" | "draft_answers"> & {
  clients: { id: string; name: string } | null;
  projects: { id: string; name: string } | null;
};

export async function listSubmissions(scope: Scope & { status?: string; q?: string; page?: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("form_submissions")
    .select(
      "id, token, template_id, client_id, project_id, title, status, draft_step, internal_notes, sent_at, opened_at, started_at, last_saved_at, completed_at, expires_at, created_by, created_at, updated_at, clients(id, name), projects(id, name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  if (scope.status === "pending") q = q.in("status", ["created", "sent", "in_progress"]);
  else if (scope.status) q = q.eq("status", scope.status as Tables<"form_submissions">["status"]);
  if (scope.q) q = q.ilike("title", searchPattern(scope.q));
  if (scope.page) {
    const [from, to] = pageRange(scope.page);
    q = q.range(from, to);
  } else q = q.limit(100);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { rows: data as SubmissionRow[], total: count ?? 0 };
}

export async function templateOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("form_templates").select("id, name, project_type").eq("is_archived", false).order("name");
  return data ?? [];
}

export async function workspaceSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("workspace_settings").select("*").maybeSingle();
  return data;
}

/** Batch-signs thumbnails for image files (one request, 10 min). */
export async function withThumbs<T extends { storage_path: string; mime_type: string; bucket: string }>(files: T[]): Promise<(T & { thumbUrl: string | null })[]> {
  const images = files.filter((f) => (f.mime_type.startsWith("image/") && !/heic|heif|photoshop/.test(f.mime_type)) || f.mime_type.startsWith("video/"));
  if (!images.length) return files.map((f) => ({ ...f, thumbUrl: null }));
  const supabase = await createClient();
  const { data } = await supabase.storage.from(images[0].bucket).createSignedUrls(images.map((f) => f.storage_path), 600);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return files.map((f) => ({ ...f, thumbUrl: byPath.get(f.storage_path) ?? null }));
}

export type AnswerFile = Tables<"files"> & { thumbUrl: string | null };

/** A submission with its preserved answers, grouped by section, plus files. */
export async function getSubmission(id: string) {
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from("form_submissions")
    .select("*, clients(id, name, business_name, phone), projects(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return null;
  const [{ data: answers }, { data: files }] = await Promise.all([
    supabase.from("form_answers").select("*").eq("submission_id", id).order("section_position").order("position"),
    supabase.from("files").select("*").eq("submission_id", id),
  ]);
  const signed = await withThumbs(files ?? []);
  const sections: { title: string; answers: Tables<"form_answers">[] }[] = [];
  for (const a of answers ?? []) {
    const last = sections[sections.length - 1];
    if (last && last.title === a.section_title) last.answers.push(a);
    else sections.push({ title: a.section_title, answers: [a] });
  }
  return { submission: s, sections, files: new Map(signed.map((f) => [f.id, f])) as Map<string, AnswerFile> };
}

/** Template with ordered sections/questions, for the builder and preview. */
export async function getTemplate(id: string) {
  const { toSnapshotQuestion } = await import("@/lib/questionnaire-snapshot");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_templates")
    .select("*, form_sections(id, title, description, position, form_questions(*))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { form_sections, ...template } = data;
  const sections = [...form_sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      questions: [...s.form_questions].sort((a, b) => a.position - b.position).map(toSnapshotQuestion),
    }));
  return { template, sections };
}

// ===========================================================================
// Social albums
// ===========================================================================
export async function listAlbums() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_albums")
    .select("*, clients(id, name), projects(id, name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const ids = data.map((a) => a.id);
  const { data: files } = ids.length
    ? await supabase.from("files").select("id, album_id, storage_path, mime_type, bucket, created_at").in("album_id", ids).order("created_at", { ascending: false })
    : { data: [] };
  const counts = new Map<string, number>();
  const covers = new Map<string, NonNullable<typeof files>[number]>();
  for (const f of files ?? []) {
    if (!f.album_id) continue;
    counts.set(f.album_id, (counts.get(f.album_id) ?? 0) + 1);
    if (!covers.has(f.album_id) && f.mime_type.startsWith("image/")) covers.set(f.album_id, f);
  }
  const signed = await withThumbs([...covers.values()]);
  const coverUrl = new Map(signed.map((f) => [f.album_id!, f.thumbUrl]));
  return data.map((a) => ({ ...a, fileCount: counts.get(a.id) ?? 0, coverUrl: coverUrl.get(a.id) ?? null }));
}

export async function getAlbum(id: string) {
  const supabase = await createClient();
  const { data: album, error } = await supabase.from("social_albums").select("*, clients(id, name), projects(id, name)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!album) return null;
  const { data: files } = await supabase.from("files").select("*, projects(id, name), clients(id, name)").eq("album_id", id).order("created_at");
  return { album, files: await withThumbs((files ?? []) as FileRow[]) };
}

/** Pre-fills a new agreement from the studio settings, the client and (optionally) a project. */
export async function initialContract(clientId: string, projectId: string | null) {
  const { defaultClauses, defaultScope } = await import("@/lib/domain/contracts");
  const { projectType } = await import("@/lib/domain/labels");
  const { todayISO } = await import("@/lib/format");
  const supabase = await createClient();
  const [{ data: ws }, { data: client }, { data: project }] = await Promise.all([
    supabase.from("workspace_settings").select("*").maybeSingle(),
    supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
    projectId ? supabase.from("projects").select("*").eq("id", projectId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!client) return null;
  const typeLabel = project ? projectType.label(project.project_type) : "אתר";
  const base = {
    studio: {
      name: ws?.business_name ?? "weblly",
      legal_name: ws?.legal_name ?? "",
      business_id: ws?.business_id ?? "",
      address: ws?.address ?? "",
      phone: ws?.contact_phone ?? "",
      email: ws?.contact_email ?? "",
      signatory: ws?.signatory_name ?? "",
    },
    client: { name: client.name, business: client.business_name ?? "", business_id: "", address: "", phone: client.phone ?? "", email: client.email ?? "" },
    project: {
      name: project?.name ?? "",
      type_label: typeLabel,
      total: Number(project?.total_price ?? 0),
      deposit: Number(project?.deposit_amount ?? 0),
      vat_note: "בתוספת מע״מ כדין",
      start_date: project?.start_date ?? "",
      deadline: project?.deadline ?? "",
    },
  };
  return {
    title: `הסכם לבניית ${typeLabel}${client.business_name ? ` — ${client.business_name}` : ` — ${client.name}`}`,
    content: { ...base, scope: defaultScope(typeLabel), clauses: defaultClauses(base), date: todayISO() },
  };
}

// ===========================================================================
// V2 — everything that lives inside a project page
// ===========================================================================
export async function getProjectHub(projectId: string) {
  const supabase = await createClient();
  const [links, references, approvals, handoff, portfolio, album, sharedNotes] = await Promise.all([
    supabase.from("project_links").select("*").eq("project_id", projectId).order("position"),
    supabase.from("project_references").select("*").eq("project_id", projectId).order("position"),
    supabase
      .from("project_approvals")
      .select("*, approval_feedback(decision, comment, author_name, created_at)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_ai_handoffs")
      .select("id, mega_prompt, created_at, project_ai_handoff_files(name, content, position)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("portfolio_items").select("id").eq("project_id", projectId).maybeSingle(),
    supabase.from("social_albums").select("id").eq("project_id", projectId).limit(1).maybeSingle(),
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("share_with_ai", true),
  ]);
  const h = handoff.data;
  return {
    links: links.data ?? [],
    references: references.data ?? [],
    approvals: approvals.data ?? [],
    latestHandoff: h
      ? {
          files: [...h.project_ai_handoff_files].sort((a, b) => a.position - b.position).map(({ name, content }) => ({ name, content })),
          megaPrompt: h.mega_prompt,
          createdAt: h.created_at,
        }
      : null,
    portfolioId: portfolio.data?.id ?? null,
    albumId: album.data?.id ?? null,
    sharedNotes: sharedNotes.count ?? 0,
  };
}

// ===========================================================================
// Portfolio
// ===========================================================================
export async function listPortfolio() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("*, projects(id, name), portfolio_media(file_id, kind)")
    .order("position")
    .limit(300);
  if (error) throw new Error(error.message);
  const coverIds = data.map((i) => i.portfolio_media.find((m) => m.kind === "cover")?.file_id ?? i.portfolio_media[0]?.file_id).filter((x): x is string => Boolean(x));
  const { data: files } = coverIds.length ? await supabase.from("files").select("id, storage_path, mime_type, bucket").in("id", coverIds) : { data: [] };
  const signed = await withThumbs(files ?? []);
  const urlOf = new Map(signed.map((f) => [f.id, f.thumbUrl]));
  return data.map(({ portfolio_media, ...i }) => {
    const cover = portfolio_media.find((m) => m.kind === "cover")?.file_id ?? portfolio_media[0]?.file_id;
    return { ...i, mediaCount: portfolio_media.length, coverUrl: cover ? (urlOf.get(cover) ?? null) : null };
  });
}

export async function getPortfolioItem(id: string) {
  const supabase = await createClient();
  const { data: item, error } = await supabase.from("portfolio_items").select("*, projects(id, name, client_id)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return null;
  const [{ data: media }, { data: images }] = await Promise.all([
    supabase.from("portfolio_media").select("file_id, kind, position").eq("item_id", id),
    item.project_id
      ? supabase.from("files").select("*").eq("project_id", item.project_id).like("mime_type", "image/%").is("album_id", null).order("created_at", { ascending: false }).limit(120)
      : Promise.resolve({ data: [] as Tables<"files">[] }),
  ]);
  const kindOf = new Map((media ?? []).map((m) => [m.file_id, m.kind]));
  const withUrls = await withThumbs(images ?? []);
  return { item, images: withUrls.map((f) => ({ ...f, portfolioKind: kindOf.get(f.id) ?? null })) };
}
