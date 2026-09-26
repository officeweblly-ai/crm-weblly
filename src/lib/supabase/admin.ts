import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses RLS — use ONLY after the caller has been
 * authorized by other means (e.g. a validated questionnaire token).
 * Never import this from a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(env.supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
