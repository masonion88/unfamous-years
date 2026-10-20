import type { Metadata } from "next";
import { getActivePrompt } from "@/lib/feed";
import { SubmitForm } from "./SubmitForm";

export const metadata: Metadata = { title: "Share an attempt · Unfamous Years" };

export default async function SubmitPage() {
  const prompt = await getActivePrompt();

  return (
    <main className="wrap">
      <h1>Something new you tried</h1>
      <p className="muted">Even if it went nowhere. Especially if it went nowhere.</p>

      <p className="crisis" role="note">
        If you&apos;re struggling or thinking about ending your life, call or text{" "}
        <a href="tel:988">
          <strong>988</strong>
        </a>{" "}
        (US).
      </p>

      {prompt && (
        <p className="optional-prompt">
          This week&apos;s angle: <q>{prompt.text}</q>
          <br />
          <span className="small">Not required, any attempt counts.</span>
        </p>
      )}

      <SubmitForm
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        hasPrompt={Boolean(prompt)}
      />
    </main>
  );
}
