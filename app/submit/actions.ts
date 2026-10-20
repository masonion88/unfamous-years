"use server";

import { getClientIp, hashIp } from "@/lib/ip";
import { AGE_RANGES, TAGS, charCount } from "@/lib/stories";
import { createPublicClient } from "@/lib/supabase/public";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyTurnstile } from "@/lib/turnstile";

export type SubmitState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

const MAX = 280;

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export async function submitStory(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const whatTried = text(formData, "what_tried");
  const whatHappened = text(formData, "what_happened");
  const tag = oneOf(text(formData, "tag"), TAGS);
  const ageRange = oneOf(text(formData, "age_range"), AGE_RANGES);
  const answeringPrompt = formData.get("answering_prompt") === "on";

  if (formData.get("consent") !== "on") {
    return { status: "error", message: "Please tick the box to confirm you're OK with this being public." };
  }
  if (!whatTried) {
    return { status: "error", message: "Tell us what you tried. One sentence is plenty." };
  }
  if (charCount(whatTried) > MAX || charCount(whatHappened) > MAX) {
    return { status: "error", message: `Each answer can be up to ${MAX} characters.` };
  }

  const ip = await getClientIp();
  const token = text(formData, "cf-turnstile-response");
  if (!(await verifyTurnstile(token, ip))) {
    return { status: "error", message: "We couldn't confirm you're human. Please try the check again." };
  }

  try {
    const { data: gotSlot, error: slotError } = await createServiceClient().rpc(
      "take_submission_slot",
      { p_ip_hash: hashIp(ip) },
    );
    if (slotError) throw slotError;
    if (!gotSlot) {
      return {
        status: "error",
        message: "You've shared 3 attempts today, which is the daily limit. Come back tomorrow.",
      };
    }

    // Insert as the anonymous role, so RLS is the final gate on what gets in.
    const supabase = createPublicClient();

    let promptId: string | null = null;
    if (answeringPrompt) {
      const { data } = await supabase.from("prompts").select("id").eq("active", true).maybeSingle();
      promptId = data?.id ?? null;
    }

    const { error } = await supabase.from("stories").insert({
      type: ageRange === "60+" ? "long_view" : "community",
      what_tried: whatTried,
      what_happened: whatHappened || null,
      tag,
      age_range: ageRange,
      prompt_id: promptId,
    });
    if (error) throw error;
  } catch (err) {
    console.error("submitStory failed", err);
    return { status: "error", message: "Something went wrong on our end. Please try again in a bit." };
  }

  return { status: "ok" };
}
