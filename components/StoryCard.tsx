import type { FeedStory } from "@/lib/feed";
import { TriedTooButton } from "./TriedTooButton";

const TYPE_LABEL = { community: "Community", long_view: "Long view", famous: "Famous" } as const;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function StoryCard({ story }: { story: FeedStory }) {
  const attribution =
    story.type === "long_view" ? [story.person, story.period].filter(Boolean).join(", ") : null;

  return (
    <article className="card">
      <div className="card-meta">
        <span className={`pill ${story.type}`}>{TYPE_LABEL[story.type]}</span>
        {story.tag && <span>{story.tag}</span>}
        {story.type === "long_view" && <span>looking back, 60+</span>}
        {attribution && <span>{attribution}</span>}
      </div>

      {story.type === "famous" && (
        <p className="card-person">
          {story.person}
          {story.period && <span className="muted">, {story.period}</span>}
        </p>
      )}

      {story.prompt && (
        <p className="small muted" style={{ margin: "0 0 6px" }}>
          Answering: “{story.prompt.text}”
        </p>
      )}

      <p className="card-tried">{story.what_tried}</p>

      {story.what_happened && (
        <p className="card-happened">
          <strong>What happened: </strong>
          {story.what_happened}
        </p>
      )}

      {story.type === "famous" && story.sources && story.sources.length > 0 && (
        <p className="card-sources">
          Sources:{" "}
          {story.sources.map((url, i) => (
            <span key={url}>
              {i > 0 && " · "}
              <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                {hostname(url)}
              </a>
            </span>
          ))}
        </p>
      )}

      <TriedTooButton storyId={story.id} initialCount={story.tried_too_count} />
    </article>
  );
}
