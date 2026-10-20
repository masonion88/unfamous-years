"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { Turnstile } from "@/components/Turnstile";
import { AGE_RANGES, TAGS, charCount } from "@/lib/stories";
import { submitStory, type SubmitState } from "./actions";

const MAX = 280;

function Counter({ value }: { value: string }) {
  const n = charCount(value);
  return (
    <div className={`counter${n > MAX ? " over" : ""}`} aria-live="polite">
      {n}/{MAX}
    </div>
  );
}

export function SubmitForm({ siteKey, hasPrompt }: { siteKey: string; hasPrompt: boolean }) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(submitStory, {
    status: "idle",
  });
  const [whatTried, setWhatTried] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [attempts, setAttempts] = useState(0);

  // Turnstile tokens are single use, so get a fresh one after every attempt.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.status !== "idle") setAttempts((n) => n + 1);
  }, [state]);

  if (state.status === "ok") {
    return (
      <div className="notice ok" role="status">
        <p style={{ margin: 0 }}>
          <strong>Thanks, a human reads every post before it goes up.</strong>
        </p>
        <p style={{ margin: "8px 0 0" }}>Now go try the next thing.</p>
      </div>
    );
  }

  const tooLong = charCount(whatTried) > MAX || charCount(whatHappened) > MAX;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        // Submit manually so React doesn't clear the fields if there's an error.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="field">
        <label htmlFor="what_tried">What did you try?</label>
        <textarea
          id="what_tried"
          name="what_tried"
          required
          value={whatTried}
          onChange={(e) => setWhatTried(e.target.value)}
        />
        <Counter value={whatTried} />
      </div>

      <div className="field">
        <label htmlFor="what_happened">
          What happened? <span className="hint">(optional)</span>
        </label>
        <textarea
          id="what_happened"
          name="what_happened"
          placeholder="Nothing happened is a valid answer."
          value={whatHappened}
          onChange={(e) => setWhatHappened(e.target.value)}
        />
        <Counter value={whatHappened} />
      </div>

      <fieldset className="field">
        <legend>
          Tag <span className="hint">(optional)</span>
        </legend>
        <div className="chips">
          {TAGS.map((tag) => (
            <label key={tag} className="chip">
              <input type="radio" name="tag" value={tag} />
              <span>{tag}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>
          Age range <span className="hint">(optional)</span>
        </legend>
        <div className="chips">
          {AGE_RANGES.map((range) => (
            <label key={range} className="chip">
              <input type="radio" name="age_range" value={range} />
              <span>{range}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {hasPrompt && (
        <label className="check">
          <input type="checkbox" name="answering_prompt" />
          <span>I&apos;m answering this week&apos;s prompt</span>
        </label>
      )}

      <label className="check">
        <input type="checkbox" name="consent" required />
        <span>
          <strong>This will be public and anonymous. Don&apos;t name other people.</strong>
        </span>
      </label>

      <Turnstile siteKey={siteKey} resetKey={attempts} />

      {state.status === "error" && (
        <p className="notice error" role="alert">
          {state.message}
        </p>
      )}

      <div>
        <button type="submit" className="button" disabled={pending || tooLong}>
          {pending ? "Sending…" : "Share it"}
        </button>
      </div>
    </form>
  );
}
