/**
 * Sets a new password for an existing staff user. The password is typed
 * hidden in the terminal — it is never passed as an argument or logged.
 *
 *   npm run set-password -- you@example.com
 */
import { config } from "dotenv";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("שימוש: npm run set-password -- <אימייל>");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("חסרים משתני סביבה ב-.env.local");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) {
    console.error(`לא נמצא משתמש עם האימייל ${email}`);
    process.exit(1);
  }
  const p1 = await askHidden("סיסמה חדשה (לא תוצג על המסך): ");
  const p2 = await askHidden("שוב, לאימות: ");
  if (p1 !== p2) return void console.error("הסיסמאות לא תואמות. לא שונה דבר.");
  if (p1.length < 10) return void console.error("צריך לפחות 10 תווים. לא שונה דבר.");
  const { error } = await db.auth.admin.updateUserById(profile.id, { password: p1 });
  if (error) throw error;
  console.log("✓ הסיסמה שונתה. אפשר להתחבר עם הסיסמה החדשה.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
