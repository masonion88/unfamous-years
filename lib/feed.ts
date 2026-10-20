import "server-only";
import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { mixFeed, type Prompt, type Story, type StoryType } from "@/lib/stories";

export type FeedStory = Story & { prompt: { text: string } | null };

const FEED_COLUMNS = "*, prompt:prompts(text)";
const PAGE_SIZE = 100;

export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export async function getActivePrompt(): Promise<Prompt | null> {
  // Always read at request time: the prompt changes weekly.
  await connection();
  if (!isConfigured()) return null;
  const { data, error } = await createPublicClient()
    .from("prompts")
    .select("id, text, week_start, active")
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function approved(types: StoryType[], limit: number): Promise<FeedStory[]> {
  // RLS only returns approved rows to anon; the status filter just says so.
  const { data, error } = await createPublicClient()
    .from("stories")
    .select(FEED_COLUMNS)
    .eq("status", "approved")
    .in("type", types)
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FeedStory[];
}

export async function getFeed(filter: StoryType | "all"): Promise<FeedStory[]> {
  if (!isConfigured()) return [];
  if (filter !== "all") return approved([filter], PAGE_SIZE);
  const [others, famous] = await Promise.all([
    approved(["community", "long_view"], PAGE_SIZE),
    approved(["famous"], Math.ceil(PAGE_SIZE / 4)),
  ]);
  return mixFeed(others, famous);
}
