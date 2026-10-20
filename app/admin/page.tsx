import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/admin";
import { TAGS, type Prompt, type Story } from "@/lib/stories";
import {
  createFamousStory,
  createLongViewStory,
  createPrompt,
  setActivePrompt,
  signOut,
  updateStory,
} from "./actions";

export const metadata: Metadata = {
  title: "Admin · Unfamous Years",
  robots: { index: false },
};

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 1 ? 0 : (8 - day) % 7));
  return d.toISOString().slice(0, 10);
}

function TagSelect({ value }: { value?: string | null }) {
  return (
    <select name="tag" defaultValue={value ?? ""} aria-label="Tag">
      <option value="">No tag</option>
      {TAGS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function StoryEditor({ story }: { story: Story }) {
  const isPending = story.status === "pending";
  return (
    <li className="admin-card">
      <div className="card-meta">
        <span className={`pill ${story.type}`}>{story.type}</span>
        {story.age_range && <span>{story.age_range}</span>}
        <span>{new Date(story.created_at).toLocaleString("en-US")}</span>
        {!isPending && <span>· {story.tried_too_count} tried too</span>}
      </div>
      <ActionForm action={updateStory} className="form">
        <input type="hidden" name="id" value={story.id} />
        <input type="hidden" name="type" value={story.type} />

        {(story.type === "famous" || story.type === "long_view") && (
          <div className="row" style={{ alignItems: "stretch" }}>
            <input
              type="text"
              name="person"
              defaultValue={story.person ?? ""}
              placeholder={story.type === "famous" ? "Person" : "First name (optional)"}
              aria-label="Person"
              style={{ flex: 2 }}
            />
            <input
              type="text"
              name="period"
              defaultValue={story.period ?? ""}
              placeholder={story.type === "famous" ? "1993–1999" : "Decade, e.g. 1970s"}
              aria-label="Period"
              style={{ flex: 1 }}
            />
          </div>
        )}

        <textarea name="what_tried" defaultValue={story.what_tried} aria-label="What they tried" />
        {story.type !== "famous" && (
          <textarea
            name="what_happened"
            defaultValue={story.what_happened ?? ""}
            placeholder="What happened (optional)"
            aria-label="What happened"
          />
        )}
        {story.type === "famous" && (
          <textarea
            name="sources"
            defaultValue={(story.sources ?? []).join("\n")}
            placeholder="Source URLs, one per line"
            aria-label="Sources"
          />
        )}
        <TagSelect value={story.tag} />

        <div className="admin-actions">
          {isPending ? (
            <>
              <button type="submit" name="intent" value="approve" className="button">
                Approve
              </button>
              <button type="submit" name="intent" value="save" className="button secondary">
                Save edits
              </button>
              <button type="submit" name="intent" value="reject" className="button danger">
                Reject
              </button>
            </>
          ) : (
            <>
              <button type="submit" name="intent" value="save" className="button secondary">
                Save edits
              </button>
              <button type="submit" name="intent" value="reject" className="button danger">
                Unpublish
              </button>
            </>
          )}
        </div>
      </ActionForm>
    </li>
  );
}

export default async function AdminPage() {
  const supabase = await requireAdmin();

  const [pendingRes, approvedRes, promptsRes] = await Promise.all([
    supabase
      .from("stories")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("stories")
      .select("*")
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(30),
    supabase.from("prompts").select("*").order("week_start", { ascending: false }).limit(20),
  ]);

  const error = pendingRes.error ?? approvedRes.error ?? promptsRes.error;
  if (error) throw error;

  const pending = (pendingRes.data ?? []) as Story[];
  const approved = (approvedRes.data ?? []) as Story[];
  const prompts = (promptsRes.data ?? []) as Prompt[];

  return (
    <main className="wrap-wide">
      <div className="row" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <form action={signOut}>
          <button type="submit" className="button secondary">
            Sign out
          </button>
        </form>
      </div>

      <section className="admin-section">
        <h2>Pending ({pending.length})</h2>
        <p className="muted small">
          Reject: names or identifying details (or edit them out), links, hate, harassment, sexual
          content, spam, promotion. Never publish suicide or self-harm content. Edit only to remove
          identifying details. Never change what someone meant.
        </p>
        {pending.length === 0 ? (
          <p className="muted">Queue is empty.</p>
        ) : (
          <ul className="admin-list admin-grid">
            {pending.map((s) => (
              <StoryEditor key={s.id} story={s} />
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section">
        <h2>Weekly prompt</h2>
        <div className="admin-grid">
          <div className="admin-card">
            <h3>New prompt</h3>
            <ActionForm action={createPrompt}>
              <input type="text" name="text" placeholder="Something you started and quit." required aria-label="Prompt text" />
              <label className="field">
                <span className="label">Week starting (Monday)</span>
                <input type="date" name="week_start" defaultValue={nextMonday()} required />
              </label>
              <label className="check">
                <input type="checkbox" name="make_active" />
                <span>Make it the active prompt now</span>
              </label>
              <div>
                <button type="submit" className="button">
                  Add prompt
                </button>
              </div>
            </ActionForm>
          </div>
          <div className="admin-card">
            <h3>All prompts</h3>
            {prompts.length === 0 ? (
              <p className="muted small">None yet.</p>
            ) : (
              <ul className="admin-list">
                {prompts.map((p) => (
                  <li key={p.id} className="row">
                    <span>
                      <span className="muted small">{p.week_start}</span>
                      <br />
                      {p.text}
                    </span>
                    {p.active ? (
                      <span className="pill">Active</span>
                    ) : (
                      <ActionForm action={setActivePrompt} className="">
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="button secondary">
                          Set active
                        </button>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <h2>Add a story</h2>
        <div className="admin-grid">
          <div className="admin-card">
            <h3>Famous</h3>
            <p className="muted small">
              Lead with the unglamorous parts. Every claim must trace to a listed source, with no
              unsourced quotes. The breakthrough is never the punchline: one short closing line at
              most.
            </p>
            <ActionForm action={createFamousStory}>
              <input type="text" name="person" placeholder="Person" required aria-label="Person" />
              <input type="text" name="period" placeholder="Period, e.g. 1993–1999" aria-label="Period" />
              <textarea name="what_tried" placeholder="Story" required aria-label="Story" style={{ minHeight: 160 }} />
              <textarea name="sources" placeholder="Source URLs, one per line" required aria-label="Sources" />
              <TagSelect />
              <label className="check">
                <input type="checkbox" name="publish" defaultChecked />
                <span>Publish now</span>
              </label>
              <div>
                <button type="submit" className="button">
                  Add famous story
                </button>
              </div>
            </ActionForm>
          </div>

          <div className="admin-card">
            <h3>Long view interview</h3>
            <p className="muted small">
              First name and decade at most, and only if they agree. No last names. No location
              finer than a state or country.
            </p>
            <ActionForm action={createLongViewStory}>
              <div className="row" style={{ alignItems: "stretch" }}>
                <input type="text" name="person" placeholder="First name (optional)" aria-label="First name" style={{ flex: 2 }} />
                <input type="text" name="period" placeholder="Decade, e.g. 1970s" aria-label="Decade" style={{ flex: 1 }} />
              </div>
              <textarea name="what_tried" placeholder="What they tried" required aria-label="What they tried" />
              <textarea name="what_happened" placeholder="What happened, and what it meant anyway" aria-label="What happened" />
              <TagSelect />
              <label className="check">
                <input type="checkbox" name="consent" required />
                <span>They agreed to have this published</span>
              </label>
              <label className="check">
                <input type="checkbox" name="publish" defaultChecked />
                <span>Publish now</span>
              </label>
              <div>
                <button type="submit" className="button">
                  Add interview
                </button>
              </div>
            </ActionForm>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <h2>Recently approved</h2>
        {approved.length === 0 ? (
          <p className="muted">Nothing approved yet.</p>
        ) : (
          <ul className="admin-list admin-grid">
            {approved.map((s) => (
              <StoryEditor key={s.id} story={s} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
