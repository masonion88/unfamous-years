import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Keyed hash, so stored values can't be reversed by hashing every IPv4 address. Raw IPs are never stored. */
export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) throw new Error("IP_HASH_SECRET is not set");
  return createHmac("sha256", secret).update(ip).digest("hex");
}
