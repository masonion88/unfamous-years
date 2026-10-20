export const TAGS = ["creative", "social", "physical", "career", "learning", "other"] as const;
export const AGE_RANGES = ["under 25", "25–39", "40–59", "60+"] as const;
export const STORY_TYPES = ["community", "long_view", "famous"] as const;

export type StoryType = (typeof STORY_TYPES)[number];

export type Story = {
  id: string;
  type: StoryType;
  status: "pending" | "approved" | "rejected";
  what_tried: string;
  what_happened: string | null;
  tag: string | null;
  age_range: string | null;
  prompt_id: string | null;
  person: string | null;
  period: string | null;
  sources: string[] | null;
  tried_too_count: number;
  created_at: string;
  approved_at: string | null;
};

export type Prompt = {
  id: string;
  text: string;
  week_start: string;
  active: boolean;
};

/** Counts characters the way Postgres char_length does (code points). */
export function charCount(s: string): number {
  return [...s].length;
}

/**
 * The "All" feed: newest non-famous stories with famous ones interleaved, one
 * after every `every - 1` others. So any run of `every` cards holds at most
 * one famous story, and a famous story never comes first.
 */
export function mixFeed<T>(others: T[], famous: T[], every = 5): T[] {
  const out: T[] = [];
  let f = 0;
  others.forEach((story, i) => {
    out.push(story);
    if ((i + 1) % (every - 1) === 0 && f < famous.length) out.push(famous[f++]);
  });
  return out;
}
