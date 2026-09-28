/**
 * Generates src/lib/supabase/database.types.ts (Supabase format) by applying
 * the migrations to an in-process Postgres and introspecting the result.
 * No Docker / Supabase CLI needed.
 *
 *   npm run db:types
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const OUT = join(ROOT, "src", "lib", "supabase", "database.types.ts");

const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
`;

type Col = { table: string; column: string; udt: string; data_type: string; nullable: boolean; has_default: boolean; generated: boolean; ordinal: number };

function tsType(udt: string, dataType: string, enums: Set<string>): string {
  if (dataType === "ARRAY") return `${tsType(udt.replace(/^_/, ""), "", enums)}[]`;
  if (enums.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  switch (udt) {
    case "uuid": case "text": case "varchar": case "date": case "timestamptz": case "timestamp": case "time": case "bpchar":
      return "string";
    case "int2": case "int4": case "int8": case "float4": case "float8": case "numeric":
      return "number";
    case "bool":
      return "boolean";
    case "json": case "jsonb":
      return "Json";
    case "void":
      return "undefined";
    default:
      return "unknown";
  }
}

async function main() {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }

  const enumRows = (await db.query<{ name: string; value: string }>(`
    select t.typname as name, e.enumlabel as value
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' order by t.typname, e.enumsortorder`)).rows;
  const enums = new Map<string, string[]>();
  for (const r of enumRows) enums.set(r.name, [...(enums.get(r.name) ?? []), r.value]);
  const enumNames = new Set(enums.keys());

  const rels = (await db.query<{ table: string; kind: string }>(`
    select c.relname as table, c.relkind as kind from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname`)).rows;

  const cols = (await db.query<Col>(`
    select table_name as table, column_name as column, udt_name as udt, data_type,
           is_nullable = 'YES' as nullable, column_default is not null as has_default,
           is_generated = 'ALWAYS' as generated, ordinal_position as ordinal
    from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`)).rows;

  const fks = (await db.query<{ name: string; table: string; columns: string[]; ref_table: string; ref_columns: string[]; one_to_one: boolean }>(`
    select con.conname as name, cl.relname as table,
      array(select a.attname from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k)::text[] as columns,
      rcl.relname as ref_table,
      array(select a.attname from unnest(con.confkey) k join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k)::text[] as ref_columns,
      exists (select 1 from pg_constraint u where u.conrelid = con.conrelid and u.contype in ('u','p') and u.conkey = con.conkey) as one_to_one
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rcl on rcl.oid = con.confrelid join pg_namespace rn on rn.oid = rcl.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
    order by con.conname`)).rows;

  const fns = (await db.query<{ name: string; args: string; arg_names: string[] | null; arg_types: string[]; defaults: number; returns: string; returns_set: boolean }>(`
    select p.proname as name, pg_get_function_arguments(p.oid) as args, p.proargnames as arg_names,
      array(select format_type(t, null) from unnest(p.proargtypes) t)::text[] as arg_types,
      p.pronargdefaults as defaults, format_type(p.prorettype, null) as returns, p.proretset as returns_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and format_type(p.prorettype, null) <> 'trigger'
      and p.proname not in ('log_activity', 'set_updated_at')
    order by p.proname`)).rows;

  const pgToUdt = (t: string) =>
    ({ "uuid": "uuid", "text": "text", "boolean": "bool", "jsonb": "jsonb", "json": "jsonb", "integer": "int4", "numeric": "numeric", "uuid[]": "_uuid", "void": "void" } as Record<string, string>)[t] ??
    t.replace(/^public\./, "");

  const out: string[] = [];
  out.push(`// AUTO-GENERATED by scripts/gen-db-types.ts — do not edit by hand. Run \`npm run db:types\`.`);
  out.push(`export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n`);
  out.push(`export type Database = {\n  public: {\n    Tables: {`);

  const relBlock = (table: string) => {
    const r = fks.filter((f) => f.table === table);
    if (!r.length) return "Relationships: []";
    return `Relationships: [\n${r
      .map(
        (f) =>
          `          { foreignKeyName: "${f.name}"; columns: [${f.columns.map((c) => `"${c}"`).join(", ")}]; isOneToOne: ${f.one_to_one}; referencedRelation: "${f.ref_table}"; referencedColumns: [${f.ref_columns.map((c) => `"${c}"`).join(", ")}] },`,
      )
      .join("\n")}\n        ]`;
  };

  for (const { table } of rels.filter((r) => r.kind === "r")) {
    const c = cols.filter((x) => x.table === table);
    const row = c.map((x) => `          ${x.column}: ${tsType(x.udt, x.data_type, enumNames)}${x.nullable ? " | null" : ""};`).join("\n");
    const ins = c
      .map((x) =>
        x.generated
          ? `          ${x.column}?: never;`
          : `          ${x.column}${x.nullable || x.has_default ? "?" : ""}: ${tsType(x.udt, x.data_type, enumNames)}${x.nullable ? " | null" : ""};`,
      )
      .join("\n");
    const upd = c
      .map((x) => (x.generated ? `          ${x.column}?: never;` : `          ${x.column}?: ${tsType(x.udt, x.data_type, enumNames)}${x.nullable ? " | null" : ""};`))
      .join("\n");
    out.push(`      ${table}: {\n        Row: {\n${row}\n        };\n        Insert: {\n${ins}\n        };\n        Update: {\n${upd}\n        };\n        ${relBlock(table)};\n      };`);
  }
  out.push(`    };\n    Views: {`);
  for (const { table } of rels.filter((r) => r.kind === "v")) {
    const c = cols.filter((x) => x.table === table);
    // View columns are reported nullable; our views never return null for these —
    // except last-payment dates and the relationship view's dates.
    const nullable = (col: string) => col === "last_payment_at" || (table === "client_relationship" && /(_date|_at)$/.test(col));
    const row = c.map((x) => `          ${x.column}: ${tsType(x.udt, x.data_type, enumNames)}${nullable(x.column) ? " | null" : ""};`).join("\n");
    out.push(`      ${table}: {\n        Row: {\n${row}\n        };\n        Relationships: [];\n      };`);
  }
  out.push(`    };\n    Functions: {`);
  for (const f of fns) {
    const names = f.arg_names ?? [];
    const firstDefault = f.arg_types.length - f.defaults;
    const args = f.arg_types
      .map((t, i) => `${names[i]}${i >= firstDefault ? "?" : ""}: ${tsType(pgToUdt(t), t.endsWith("[]") ? "ARRAY" : "", enumNames)}`)
      .join("; ");
    const ret = tsType(pgToUdt(f.returns), "", enumNames);
    out.push(`      ${f.name}: { Args: ${args ? `{ ${args} }` : "Record<PropertyKey, never>"}; Returns: ${ret}${f.returns_set ? "[]" : ""} };`);
  }
  out.push(`    };\n    Enums: {`);
  for (const [name, values] of enums) out.push(`      ${name}: ${values.map((v) => `"${v}"`).join(" | ")};`);
  out.push(`    };\n    CompositeTypes: Record<string, never>;\n  };\n};\n`);
  out.push(`type PublicSchema = Database["public"];`);
  out.push(`export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];`);
  out.push(`export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];`);
  out.push(`export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];`);
  out.push(`export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];`);
  out.push(`export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];\n`);

  writeFileSync(OUT, out.join("\n"));
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
