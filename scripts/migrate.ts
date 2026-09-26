/**
 * Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL, in
 * order, each in its own transaction. Already-applied files are skipped
 * (tracked in internal.app_migrations).
 *
 *   npm run db:migrate
 */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Missing SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler connection string).");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
  try {
    await sql`create schema if not exists internal`;
    await sql`create table if not exists internal.app_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ name: string }[]>`select name from internal.app_migrations`).map((r) => r.name));
    const dir = join(__dirname, "..", "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (applied.has(f)) {
        console.log(`  ✓ ${f} (already applied)`);
        continue;
      }
      const body = readFileSync(join(dir, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into internal.app_migrations (name) values (${f})`;
      });
      console.log(`  ✓ ${f}`);
    }
    console.log("Database is up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
