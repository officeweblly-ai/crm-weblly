import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_FIELD_MAPPINGS, conditionSchema, optionSchema, type FormSnapshot, type SnapshotQuestion } from "@/lib/domain/forms";
import type { Database, Tables } from "@/lib/supabase/database.types";

type Row = Tables<"form_questions">;

export function toSnapshotQuestion(q: Row): SnapshotQuestion {
  return {
    id: q.id,
    type: q.type,
    label: q.label,
    description: q.description,
    placeholder: q.placeholder,
    required: q.required,
    options: optionSchema.array().catch([]).parse(q.options),
    condition: conditionSchema.nullable().catch(null).parse(q.condition),
    maps_to: (CLIENT_FIELD_MAPPINGS as readonly string[]).includes(q.maps_to ?? "") ? (q.maps_to as SnapshotQuestion["maps_to"]) : null,
    max_choices: q.type === "multi_select" ? q.max_choices : null,
  };
}

/** Freezes a template into the structure a questionnaire link is filled against. */
export async function buildSnapshot(supabase: SupabaseClient<Database>, templateId: string): Promise<FormSnapshot | null> {
  const { data: t } = await supabase
    .from("form_templates")
    .select("name, form_sections(id, title, description, position, form_questions(*))")
    .eq("id", templateId)
    .maybeSingle();
  if (!t) return null;
  const sections = [...t.form_sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      questions: [...s.form_questions].sort((a, b) => a.position - b.position).map(toSnapshotQuestion),
    }))
    .filter((s) => s.questions.length > 0);
  return { template_name: t.name, sections };
}
