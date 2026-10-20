# Unfamous Years

Small, unglamorous attempts count, whether or not they lead anywhere.

Next.js 16 (App Router) · Supabase (Postgres, RLS, Auth) · Cloudflare Turnstile · Vercel.

## Setup

### 1. Supabase

1. Create a project (use a second, throwaway project for `npm run test:supabase`).
2. **SQL Editor** → paste and run `supabase/migrations/0001_init.sql`.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
4. **Authentication → Users → Add user**: create your admin user with email and password.
5. Copy that user's id, then in the SQL Editor run:
   ```sql
   insert into private.admins (user_id) values ('<your user id>');
   ```
6. **Project Settings → API Keys**: copy the URL, the publishable key and a secret key.

### 2. Turnstile

Cloudflare dashboard → Turnstile → add a widget for your domain (and `localhost`).
Copy the site key and the secret key.

### 3. Environment

```bash
cp .env.example .env.local
```

Fill it in. `.env.example` ships with Cloudflare's always-pass test keys for local dev.
Set the same variables in Vercel → Project → Settings → Environment Variables,
with the **real** Turnstile keys.

### 4. Run

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

Runs `tests/rls.local.test.ts` against the real migration in an in-process
Postgres (PGlite), with Supabase's roles and default grants stubbed in. It needs
no Docker and no Supabase project. It proves that anon:

- cannot read pending or rejected rows
- cannot insert an approved or famous row, or set `tried_too_count`, `approved_at`, `person` or `sources`
- cannot update or delete any row
- cannot call the server-only RPCs

It also checks the admin and non-admin signed-in cases, the tap cap, the 3-a-day
limit and the feed mix.

```bash
npm run test:supabase
```

Runs the same anon checks over the real Data API against whatever project is in
`.env.local`. It is skipped if the keys are missing. It creates and then deletes
rows tagged `rls-test-…`, so point it at a test project.

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Schema, RLS, RPCs | `supabase/migrations/0001_init.sql` | Column-level grants plus RLS. The admin is whoever is in `private.admins`. |
| Feed | `app/page.tsx`, `lib/feed.ts` | Reads as anon. "All" puts 1 famous story after every 4 others (`mixFeed`). |
| Submit | `app/submit/*` | Turnstile → 3/day per IP hash → insert **as anon**, so RLS is the final gate. |
| I tried something too | `components/TriedTooButton.tsx`, `app/api/tried-too/route.ts` | localStorage plus a server cap through the `record_tried_too` RPC. |
| Admin | `app/admin/*`, `proxy.ts` | Supabase password auth. The proxy only runs on `/admin`. |

IP addresses are HMAC-hashed with `IP_HASH_SECRET` and never stored raw. There
are no analytics and no cookies outside `/admin`.

## Known trade-offs

- **Turnstile and the rate limit run in the app, not the database.** The
  publishable key is public, so someone could POST straight to the Supabase API
  and skip both. They still can only create a **pending** row, which only you
  see. If the queue ever gets spammed, revoke anon's insert grant and insert with
  the secret key in `app/submit/actions.ts`.
- Long-view interviews reuse `person`/`period` for "first name, decade". The spec
  lists those columns as famous-only.
- The feed shows the newest 100 stories, with no pagination yet.
