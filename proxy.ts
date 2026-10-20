import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Only the admin area has sessions. Public pages never touch auth cookies.
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
