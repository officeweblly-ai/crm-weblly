import { redirect } from "next/navigation";

/** Team moved to its own area (/team) with roles and permissions. */
export default function OldTeamPage() {
  redirect("/team");
}
