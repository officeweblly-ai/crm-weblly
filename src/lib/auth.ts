import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Viewer = { userId: string; email: string; profile: Tables<"profiles"> };

/** Signed-in + active staff, or redirect. Cached per request. */
export const requireStaff = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) redirect("/pending");

  return { userId, email: profile.email, profile };
});
