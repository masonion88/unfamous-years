"use client";

import { useEffect, useState } from "react";

const storageKey = (id: string) => `tried-too:${id}`;

function readTapped(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

export function TriedTooButton({ storyId, initialCount }: { storyId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [tapped, setTapped] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // localStorage only exists in the browser, so this has to wait for mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTapped(readTapped(storyId));
  }, [storyId]);

  async function tap() {
    if (tapped || busy) return;
    setBusy(true);
    setTapped(true);
    setCount((c) => c + 1);
    try {
      localStorage.setItem(storageKey(storyId), "1");
    } catch {
      // Private mode etc. The server-side cap still applies.
    }
    try {
      const res = await fetch("/api/tried-too", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      if (!res.ok) throw new Error(`tried-too failed: ${res.status}`);
      const { count: serverCount } = (await res.json()) as { count: number };
      setCount(serverCount);
    } catch {
      // Didn't land, so let them tap again later.
      setTapped(false);
      setCount((c) => c - 1);
      try {
        localStorage.removeItem(storageKey(storyId));
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="tried-too" aria-pressed={tapped} onClick={tap} disabled={busy}>
      <span>I tried something too</span>
      <span className="count" aria-label={`${count} people`}>
        {count}
      </span>
    </button>
  );
}
