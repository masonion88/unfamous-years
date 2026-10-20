"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { AGE_RANGES, TAGS } from "@/lib/stories";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok?: string; error?: string };

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function optional(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function oneOf(value: string | null, allowed: readonly string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}

/** One URL per line; each must be http(s). Returns null if any line isn't. */
function parseSources(raw: string): string[] | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    try {
      const url = new URL(line);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    } catch {
      return null;
    }
  }
  return lines;
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: text(formData, "email"),
    password: typeof formData.get("password") === "string" ? (formData.get("password") as string) : "",
  });
  if (error?.code === "email_not_confirmed") {
    return { error: "This email isn't confirmed yet. Confirm the user in Supabase → Authentication → Users." };
  }
  if (error) return { error: "That email and password didn't work." };

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { error: "This account isn't the admin." };
  }
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export async function updateStory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await requireAdmin();
  const id = text(formData, "id");
  const type = text(formData, "type");
  const intent = text(formData, "intent");

  const whatTried = text(formData, "what_tried");
  if (!whatTried) return { error: "“What did you try” can't be empty." };

  const patch: Record<string, unknown> = {
    what_tried: whatTried,
    what_happened: optional(formData, "what_happened"),
    tag: oneOf(optional(formData, "tag"), TAGS),
  };

  if (type === "famous" || type === "long_view") {
    patch.person = optional(formData, "person");
    patch.period = optional(formData, "period");
  }
  if (type === "famous") {
    const sources = parseSources(text(formData, "sources"));
    if (!sources || sources.length === 0) {
      return { error: "Famous stories need at least one valid http(s) source URL, one per line." };
    }
    if (!patch.person) return { error: "Famous stories need a person." };
    patch.sources = sources;
  }

  if (intent === "approve") {
    patch.status = "approved";
    patch.approved_at = new Date().toISOString();
  } else if (intent === "reject") {
    patch.status = "rejected";
  }

  const { error } = await supabase.from("stories").update(patch).eq("id", id);
  if (error) return { error: error.message };

  refresh();
  return {
    ok: intent === "approve" ? "Approved." : intent === "reject" ? "Rejected." : "Saved.",
  };
}

export async function createFamousStory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await requireAdmin();
  const person = text(formData, "person");
  const body = text(formData, "what_tried");
  const sources = parseSources(text(formData, "sources"));
  const publish = formData.get("publish") === "on";

  if (!person || !body) return { error: "Person and story are required." };
  if (!sources || sources.length === 0) {
    return { error: "Add at least one valid http(s) source URL, one per line." };
  }

  const { error } = await supabase.from("stories").insert({
    type: "famous",
    person,
    period: optional(formData, "period"),
    what_tried: body,
    sources,
    tag: oneOf(optional(formData, "tag"), TAGS),
    status: publish ? "approved" : "pending",
    approved_at: publish ? new Date().toISOString() : null,
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: publish ? "Published." : "Saved to the pending queue." };
}

export async function createLongViewStory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await requireAdmin();
  const whatTried = text(formData, "what_tried");
  const publish = formData.get("publish") === "on";

  if (formData.get("consent") !== "on") {
    return { error: "Only add interviews the person agreed to publish." };
  }
  if (!whatTried) return { error: "Add what they tried." };

  const { error } = await supabase.from("stories").insert({
    type: "long_view",
    what_tried: whatTried,
    what_happened: optional(formData, "what_happened"),
    tag: oneOf(optional(formData, "tag"), TAGS),
    age_range: AGE_RANGES[3],
    person: optional(formData, "person"),
    period: optional(formData, "period"),
    status: publish ? "approved" : "pending",
    approved_at: publish ? new Date().toISOString() : null,
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: publish ? "Published." : "Saved to the pending queue." };
}

// ---------------------------------------------------------------------------
// Weekly prompts
// ---------------------------------------------------------------------------

export async function createPrompt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await requireAdmin();
  const promptText = text(formData, "text");
  const weekStart = text(formData, "week_start");
  if (!promptText || !weekStart) return { error: "Prompt text and week are required." };

  const { data, error } = await supabase
    .from("prompts")
    .insert({ text: promptText, week_start: weekStart })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (formData.get("make_active") === "on") {
    const { error: activeError } = await supabase.rpc("set_active_prompt", { p_prompt_id: data.id });
    if (activeError) return { error: activeError.message };
  }

  refresh();
  return { ok: "Prompt added." };
}

export async function setActivePrompt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc("set_active_prompt", { p_prompt_id: text(formData, "id") });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Active." };
}
