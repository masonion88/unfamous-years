"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap">
      <h1>Something went wrong</h1>
      <p className="muted">That one&apos;s on us, not you.</p>
      <button className="button secondary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
