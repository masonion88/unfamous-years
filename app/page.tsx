import Link from "next/link";
import { StoryCard } from "@/components/StoryCard";
import { getActivePrompt, getFeed, isConfigured } from "@/lib/feed";
import { STORY_TYPES, type StoryType } from "@/lib/stories";

const TABS: { key: StoryType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "community", label: "Community" },
  { key: "long_view", label: "Long view" },
  { key: "famous", label: "Famous" },
];

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const { type } = await searchParams;
  const filter: StoryType | "all" = STORY_TYPES.includes(type as StoryType)
    ? (type as StoryType)
    : "all";

  const [prompt, stories] = await Promise.all([getActivePrompt(), getFeed(filter)]);

  return (
    <main className="wrap">
      {prompt && (
        <section className="prompt" aria-label="This week's prompt">
          <div className="prompt-label">This week</div>
          <p className="prompt-text">{prompt.text}</p>
          <Link href="/submit" className="text-link">
            Share yours →
          </Link>
        </section>
      )}

      <nav className="tabs" aria-label="Filter stories">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/" : `/?type=${tab.key}`}
            className="tab"
            aria-current={tab.key === filter ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {!isConfigured() && (
        <p className="notice error">
          Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code> and fill it in.
        </p>
      )}

      {stories.length === 0 ? (
        <p className="empty">
          Nothing here yet.{" "}
          <Link href="/submit" className="text-link">
            Be the first to share an attempt.
          </Link>
        </p>
      ) : (
        <ul className="feed">
          {stories.map((story) => (
            <li key={story.id}>
              <StoryCard story={story} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
