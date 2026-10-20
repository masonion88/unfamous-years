import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Secret-key client, used only to call the two server-only RPCs
 * (record_tried_too and take_submission_slot). Never import this from a
 * Client Component.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
