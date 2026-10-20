import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns a Supabase client acting as the signed-in admin, or sends the
 * visitor to the login page. The database enforces the same rule through RLS
 * (private.admins), so this check is for UX, not the only line of defence.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/admin/login");

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) redirect("/admin/login?denied=1");

  return supabase;
}
