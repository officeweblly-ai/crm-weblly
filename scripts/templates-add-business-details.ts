/**
 * Makes the first step of every template collect what a contract and an
 * invoice need — ח.פ / ע.מ, address, the contact's role, an extra contact —
 * each mapped to the client file (filled automatically on submit, never
 * overwriting what the team typed). Idempotent; existing sent questionnaires
 * are frozen snapshots and are not affected.
 *
 *   npm run templates:add-business
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

config({ path: ".env.local" });
config();

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Q = { maps_to: string; type: "short_text" | "email" | "phone"; label: string; description?: string; placeholder?: string; required?: boolean; match: RegExp };

const WANTED: Q[] = [
  { maps_to: "client.email", type: "email", label: "דואר אלקטרוני", required: true, match: /אימייל|דואר אלקטרוני|email/i },
  { maps_to: "client.contact_role", type: "short_text", label: "התפקיד שלך בעסק", placeholder: "בעלים, מנכ״ל, מנהלת שיווק…", match: /תפקיד/ },
  {
    maps_to: "client.company_id",
    type: "short_text",
    label: "ח.פ / ע.מ",
    description: "לחשבונית ולהסכם. לעוסק פטור — מספר ת.ז.",
    placeholder: "515000000",
    match: /ח\.?פ|ע\.?מ|ת\.?ז/,
  },
  { maps_to: "client.address", type: "short_text", label: "כתובת העסק", description: "רחוב, מספר ועיר — כפי שיופיע בהסכם.", match: /כתובת/ },
  { maps_to: "client.alt_contact_name", type: "short_text", label: "איש קשר נוסף לפרויקט", description: "מי עוד מעורב — שותף, מנהלת שיווק, הנהלת חשבונות.", match: /איש קשר נוסף/ },
  { maps_to: "client.alt_contact_phone", type: "phone", label: "הטלפון של איש הקשר הנוסף", match: /טלפון של איש הקשר הנוסף/ },
];

async function main() {
  const { data: templates, error } = await db
    .from("form_templates")
    .select("id, name, form_sections(id, title, description, position, form_questions(id, label, type, maps_to, position))");
  if (error) throw error;
  for (const t of templates ?? []) {
    const first = [...t.form_sections].sort((a, b) => a.position - b.position)[0];
    if (!first) continue;
    const qs = first.form_questions;
    let pos = Math.max(-1, ...qs.map((q) => q.position)) + 1;
    const done: string[] = [];
    for (const w of WANTED) {
      if (qs.some((q) => q.maps_to === w.maps_to)) continue;
      // An existing question that asks the same thing (e.g. "ח.פ / ת.ז") gets mapped instead of duplicated.
      const same = qs.find((q) => !q.maps_to && w.match.test(q.label));
      if (same) {
        const { error: e } = await db.from("form_questions").update({ maps_to: w.maps_to }).eq("id", same.id);
        if (e) throw e;
        done.push(`mapped "${same.label}" → ${w.maps_to}`);
        continue;
      }
      const { error: e } = await db.from("form_questions").insert({
        section_id: first.id,
        type: w.type,
        label: w.label,
        description: w.description ?? null,
        placeholder: w.placeholder ?? null,
        required: w.required ?? false,
        options: [],
        maps_to: w.maps_to,
        position: pos++,
      });
      if (e) throw e;
      done.push(`added "${w.label}"`);
    }
    // Natural order: who you are → how to reach you → billing identity → extra contact.
    const ORDER = ["client.name", "client.business_name", "client.contact_role", "client.phone", "client.email", "client.company_id", "client.address", "client.alt_contact_name", "client.alt_contact_phone"];
    const { data: fresh } = await db.from("form_questions").select("id, maps_to, position").eq("section_id", first.id).order("position");
    const rank = (m: string | null) => (m && ORDER.includes(m) ? ORDER.indexOf(m) : ORDER.length);
    const sorted = [...(fresh ?? [])].sort((a, b) => rank(a.maps_to) - rank(b.maps_to) || a.position - b.position);
    for (const [i, q] of sorted.entries()) if (q.position !== i) await db.from("form_questions").update({ position: i }).eq("id", q.id);
    if (!first.description) {
      await db.from("form_sections").update({ description: "הפרטים נכנסים ישר להצעת המחיר ולהסכם — כדי שלא נצטרך לשאול שוב." }).eq("id", first.id);
    }
    console.log(`  "${t.name}": ${done.length ? done.join(", ") : "already complete"}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
