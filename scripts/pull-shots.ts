// Dev helper: downloads screenshots uploaded to general/_shots/ into docs/shots, then removes them from storage.
import { config } from "dotenv"; import { createClient } from "@supabase/supabase-js"; import { writeFileSync } from "node:fs";
config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await db.storage.from("crm-files").list("general/_shots");
  for (const f of data ?? []) {
    const { data: blob } = await db.storage.from("crm-files").download(`general/_shots/${f.name}`);
    if (blob) { writeFileSync(`docs/shots/${f.name}`, Buffer.from(await blob.arrayBuffer())); console.log("saved", f.name); }
    await db.storage.from("crm-files").remove([`general/_shots/${f.name}`]);
  }
})();
