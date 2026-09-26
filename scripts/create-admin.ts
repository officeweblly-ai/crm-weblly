/**
 * Creates the first staff user (becomes the active owner automatically).
 *
 *   npm run create-admin -- you@studio.co.il "a-strong-password" "השם שלך"
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

async function main() {
  const [email, password, fullName = ""] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> ["Full name"]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Use a password of at least 10 characters.");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  const { data: profile } = await db.from("profiles").select("role, is_active").eq("id", data.user.id).single();
  console.log(`Created ${email} — role: ${profile?.role}, active: ${profile?.is_active}`);
  if (!profile?.is_active) console.log("This user is pending. The owner can activate it in Settings → Team.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
