// The same guarantees as rls.local.test.ts, checked against a real Supabase
// project through the Data API, exactly as a stranger's browser would hit it.
// Point it at a test project (not production) and run: `npm run test:supabase`.
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// SUPABASE_SECRET_KEY in .env.local. Rows it creates are deleted afterwards.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const MARKER = `rls-test-${Date.now()}`;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!url || !publishable || !secret)("RLS on the hosted Supabase project", () => {
  let anon: SupabaseClient;
  let admin: SupabaseClient; // secret key: bypasses RLS, used only to seed and clean up
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    anon = createClient(url!, publishable!, opts);
    admin = createClient(url!, secret!, opts);
    const { data, error } = await admin
      .from("stories")
      .insert([
        { type: "community", status: "pending", what_tried: `${MARKER} pending` },
        { type: "community", status: "rejected", what_tried: `${MARKER} rejected` },
        { type: "community", status: "approved", what_tried: `${MARKER} approved`, approved_at: new Date().toISOString() },
      ])
      .select("id, status");
    if (error) throw error;
    for (const row of data) ids[row.status] = row.id;
  });

  afterAll(async () => {
    await admin.from("stories").delete().like("what_tried", `${MARKER}%`);
  });

  it("anon cannot read pending or rejected rows", async () => {
    const { data, error } = await anon
      .from("stories")
      .select("id")
      .in("id", [ids.pending, ids.rejected, ids.approved]);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toEqual([ids.approved]);
  });

  it("anon cannot insert an approved row", async () => {
    const { error } = await anon
      .from("stories")
      .insert({ type: "community", status: "approved", what_tried: `${MARKER} sneaky` });
    expect(error).not.toBeNull();
  });

  it("anon cannot insert a famous row", async () => {
    const { error } = await anon
      .from("stories")
      .insert({ type: "famous", what_tried: `${MARKER} sneaky famous` });
    expect(error).not.toBeNull();
  });

  it("anon cannot set tried_too_count", async () => {
    const { error } = await anon
      .from("stories")
      .insert({ type: "community", what_tried: `${MARKER} sneaky count`, tried_too_count: 500 });
    expect(error).not.toBeNull();
  });

  it("anon cannot update any row", async () => {
    for (const id of [ids.pending, ids.rejected, ids.approved]) {
      const { error } = await anon
        .from("stories")
        .update({ status: "approved", tried_too_count: 999, what_tried: `${MARKER} hacked` })
        .eq("id", id);
      expect(error).not.toBeNull();
    }
    const { data } = await admin.from("stories").select("id").like("what_tried", `${MARKER} hacked`);
    expect(data).toEqual([]);
  });

  it("anon cannot call the server-only RPCs", async () => {
    const tap = await anon.rpc("record_tried_too", { p_story_id: ids.approved, p_ip_hash: "x" });
    expect(tap.error).not.toBeNull();
    const slot = await anon.rpc("take_submission_slot", { p_ip_hash: "x" });
    expect(slot.error).not.toBeNull();
  });

  it("anon can submit a pending community story", async () => {
    const { error } = await anon
      .from("stories")
      .insert({ type: "community", what_tried: `${MARKER} real submission` });
    expect(error).toBeNull();
    const { data } = await admin
      .from("stories")
      .select("status")
      .eq("what_tried", `${MARKER} real submission`)
      .single();
    expect(data!.status).toBe("pending");
  });
});
