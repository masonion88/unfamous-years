import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About · Unfamous Years" };

export default function AboutPage() {
  const corrections = process.env.CORRECTIONS_EMAIL;

  return (
    <main className="wrap prose">
      <h1>About</h1>
      <p>
        Unfamous Years is for anyone who feels stuck. It collects small, unglamorous attempts: the
        class you went to once, the song nobody heard, the thing you started and quit. They count
        whether or not they lead anywhere. Trying something isn&apos;t worthwhile because it might
        turn into success. It&apos;s worthwhile because you tried it. Read a few, then close the tab
        and{" "}
        <Link href="/submit" className="text-link">
          try something
        </Link>
        .
      </p>

      <h2>Three kinds of stories</h2>
      <ul>
        <li>
          <strong>Community:</strong> anonymous attempts from anyone.
        </li>
        <li>
          <strong>Long view:</strong> people over 60 looking back on things that went nowhere, and
          what those things meant anyway. Interviews are published only with the person&apos;s
          consent, with first name and decade at most.
        </li>
        <li>
          <strong>Famous:</strong> well-known people, told through the parts nobody saw: day jobs,
          rejections, years of practice, and attempts that went nowhere, sometimes long after they
          were famous. They&apos;re here as context, not proof.
        </li>
      </ul>

      <h2>Sources and corrections</h2>
      <p>
        Every claim in a famous story comes from a source listed on the story. There are no
        unsourced anecdotes or quotes.
        {corrections ? (
          <>
            {" "}
            If something is wrong, email <a href={`mailto:${corrections}`}>{corrections}</a>.
          </>
        ) : null}
      </p>

      <h2>How posts are moderated</h2>
      <p>A person reads every post before it goes up. We don&apos;t publish posts that:</p>
      <ul>
        <li>name or identify a real person (we may remove the detail instead)</li>
        <li>include links</li>
        <li>contain hate, harassment, sexual content or spam</li>
        <li>promote something</li>
      </ul>
      <p>
        We never publish posts about suicide or self-harm. If you&apos;re struggling or thinking
        about ending your life, call or text <a href="tel:988">988</a> (US).
      </p>
      <p>
        We only edit to remove identifying details. We never rewrite what you meant.
      </p>

      <h2>Privacy</h2>
      <p>
        No accounts, no tracking cookies, no analytics. To limit spam we keep a one-way hash of your
        IP address, never the address itself.
      </p>
    </main>
  );
}
