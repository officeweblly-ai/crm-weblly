/**
 * Adds the shared "עיצוב, תחושה וקופי" step to every template that doesn't
 * have it yet (idempotent). Existing sent questionnaires are not affected —
 * each one is a frozen snapshot.
 *
 *   npm run templates:add-design
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/supabase/database.types";
import { DESIGN_STEP } from "./design-step";

config({ path: ".env.local" });
config();

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: templates, error } = await db.from("form_templates").select("id, name, form_sections(id, title, position)");
  if (error) throw error;
  for (const t of templates ?? []) {
    if (t.form_sections.some((s) => s.title === DESIGN_STEP.title)) {
      console.log(`  "${t.name}" — already has the design step`);
      continue;
    }
    const position = Math.max(-1, ...t.form_sections.map((s) => s.position)) + 1;
    const { data: sec, error: e1 } = await db
      .from("form_sections")
      .insert({ template_id: t.id, title: DESIGN_STEP.title, description: DESIGN_STEP.description, position })
      .select("id")
      .single();
    if (e1 || !sec) throw e1;
    const ids = new Map<string, string>();
    for (const [i, q] of DESIGN_STEP.questions.entries()) {
      const options = (q.options ?? []).map((label, j) => ({ value: `opt_${j + 1}`, label }));
      const condition = q.when ? { question_id: ids.get(q.when.key)!, operator: q.when.operator, value: q.when.value } : null;
      const { data: row, error: e2 } = await db
        .from("form_questions")
        .insert({
          section_id: sec.id,
          type: q.type,
          label: q.label,
          description: q.description ?? null,
          required: q.required ?? false,
          options,
          condition: condition as Json,
          max_choices: q.type === "multi_select" ? (q.max ?? null) : null,
          position: i,
        })
        .select("id")
        .single();
      if (e2 || !row) throw e2;
      ids.set(q.key, row.id);
    }
    console.log(`  "${t.name}" — added "${DESIGN_STEP.title}" (${DESIGN_STEP.questions.length} questions) as step ${position + 1}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
