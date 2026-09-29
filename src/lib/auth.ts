import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { can, type Access, type Permission } from "@/lib/domain/permissions";

export type Viewer = {
  userId: string;
  email: string;
  profile: Tables<"profiles">;
  role: Pick<Tables<"team_roles">, "id" | "name" | "color" | "permissions"> | null;
  access: Access;
};

/** Signed-in + active staff, or redirect. Cached per request. */
export const requireStaff = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*, team_roles(id, name, color, permissions)").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) redirect("/pending");

  const { team_roles: role, ...rest } = profile;
  // Owner: everything. No role: everything. Otherwise only the role's areas.
  const access: Access = rest.role === "owner" || !role ? { all: true } : { all: false, allowed: new Set(role.permissions) };
  return { userId, email: rest.email, profile: rest, role: rest.role === "owner" ? null : role, access };
});

/** Page guard for an area a custom role may not include. */
export async function requireArea(area: Permission): Promise<Viewer> {
  const viewer = await requireStaff();
  if (!can(viewer.access, area)) redirect("/?denied=1");
  return viewer;
}
