import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous client: the same role a stranger's browser would have, so RLS is
 * what decides what it can read and insert. No cookies, no session.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
