// Runs the real migration in an in-process Postgres (PGlite) with Supabase's
// roles and default grants stubbed in, then checks the access rules as each
// role. No Supabase project or Docker needed: `npm test`.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_ID = "00000000-0000-0000-0000-00000000a0a0";
const OTHER_USER_ID = "00000000-0000-0000-0000-00000000b0b0";

// The parts of a Supabase database the migration relies on.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

type Role = "anon" | "authenticated" | "service_role";

let db: PGlite;
const ids: Record<string, string> = {};

async function as<T>(
  role: Role,
  fn: (tx: Transaction) => Promise<T>,
  userId?: string,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    if (userId) {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    }
    return fn(tx);
  });
}

async function seed(status: string, type = "community") {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.stories (type, status, what_tried, person, sources)
     values ($1, $2, 'seeded ' || $2, $3, $4) returning id`,
    [
      type,
      status,
      type === "famous" ? "Someone" : null,
      type === "famous" ? ["https://example.com"] : null,
    ],
  );
  return rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(
    readFileSync(join(__dirname, "..", "supabase", "migrations", "0001_init.sql"), "utf8"),
  );
  await db.query(`insert into private.admins (user_id) values ($1)`, [ADMIN_ID]);
  ids.pending = await seed("pending");
  ids.rejected = await seed("rejected");
  ids.approved = await seed("approved");
  ids.famous = await seed("approved", "famous");
});

afterAll(async () => {
  await db.close();
});

describe("anonymous reads", () => {
  it("cannot read pending or rejected rows", async () => {
    const { rows } = await as("anon", (tx) =>
      tx.query<{ id: string; status: string }>(`select id, status from public.stories`),
    );
    const seen = rows.map((r) => r.id);
    expect(seen).not.toContain(ids.pending);
    expect(seen).not.toContain(ids.rejected);
    expect(rows.every((r) => r.status === "approved")).toBe(true);
  });

  it("cannot read pending rows by id either", async () => {
    const { rows } = await as("anon", (tx) =>
      tx.query(`select * from public.stories where id = $1`, [ids.pending]),
    );
    expect(rows).toHaveLength(0);
  });

  it("can read approved stories and prompts", async () => {
    const { rows } = await as("anon", (tx) => tx.query<{ id: string }>(`select id from public.stories`));
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([ids.approved, ids.famous]));
    await expect(as("anon", (tx) => tx.query(`select * from public.prompts`))).resolves.toBeTruthy();
  });

  it("cannot read tried_too or the private tables", async () => {
    await expect(as("anon", (tx) => tx.query(`select * from public.tried_too`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as("anon", (tx) => tx.query(`select * from private.submission_log`)),
    ).rejects.toThrow(/permission denied/);
    await expect(as("anon", (tx) => tx.query(`select * from private.admins`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("anonymous inserts", () => {
  it("can submit a pending community story", async () => {
    await as("anon", (tx) =>
      tx.query(
        `insert into public.stories (type, what_tried, what_happened, tag)
         values ('community', 'Went to an open mic', 'Nothing happened', 'creative')`,
      ),
    );
    const { rows } = await db.query<{ status: string; tried_too_count: number }>(
      `select status, tried_too_count from public.stories where what_tried = 'Went to an open mic'`,
    );
    expect(rows).toEqual([{ status: "pending", tried_too_count: 0 }]);
  });

  it("can submit a pending long_view story only with the 60+ age range", async () => {
    await as("anon", (tx) =>
      tx.query(
        `insert into public.stories (type, what_tried, age_range) values ('long_view', 'Pottery', '60+')`,
      ),
    );
    await expect(
      as("anon", (tx) =>
        tx.query(
          `insert into public.stories (type, what_tried, age_range) values ('long_view', 'Pottery', '25–39')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("anon", (tx) =>
        tx.query(
          `insert into public.stories (type, what_tried, age_range) values ('community', 'Pottery', '60+')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot insert an approved row", async () => {
    await expect(
      as("anon", (tx) =>
        tx.query(
          `insert into public.stories (type, status, what_tried) values ('community', 'approved', 'x')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot insert a famous row", async () => {
    await expect(
      as("anon", (tx) =>
        tx.query(`insert into public.stories (type, what_tried) values ('famous', 'x')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot set tried_too_count, approved_at, person or sources", async () => {
    for (const [col, val] of [
      ["tried_too_count", "99"],
      ["approved_at", "now()"],
      ["person", "'Someone'"],
      ["sources", "array['https://example.com']"],
    ]) {
      await expect(
        as("anon", (tx) =>
          tx.query(
            `insert into public.stories (type, what_tried, ${col}) values ('community', 'x', ${val})`,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("cannot go over 280 characters", async () => {
    await expect(
      as("anon", (tx) =>
        tx.query(`insert into public.stories (type, what_tried) values ('community', $1)`, [
          "a".repeat(281),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot insert into tried_too or prompts", async () => {
    await expect(
      as("anon", (tx) =>
        tx.query(`insert into public.tried_too (story_id, ip_hash) values ($1, 'h')`, [ids.approved]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", (tx) =>
        tx.query(`insert into public.prompts (text, week_start) values ('x', current_date)`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("anonymous updates and deletes", () => {
  it("cannot update any row", async () => {
    for (const id of [ids.pending, ids.rejected, ids.approved, ids.famous]) {
      await expect(
        as("anon", (tx) =>
          tx.query(`update public.stories set status = 'approved', tried_too_count = 999 where id = $1`, [id]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        as("anon", (tx) => tx.query(`update public.stories set what_tried = 'hacked' where id = $1`, [id])),
      ).rejects.toThrow(/permission denied/);
    }
    const { rows } = await db.query(`select 1 from public.stories where what_tried = 'hacked' or tried_too_count = 999`);
    expect(rows).toHaveLength(0);
    await expect(
      as("anon", (tx) => tx.query(`update public.prompts set active = true`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot delete any row", async () => {
    await expect(
      as("anon", (tx) => tx.query(`delete from public.stories where id = $1`, [ids.approved])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("RPCs", () => {
  it("anon cannot call the server-only RPCs", async () => {
    await expect(
      as("anon", (tx) => tx.query(`select public.record_tried_too($1, 'made-up')`, [ids.approved])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", (tx) => tx.query(`select public.take_submission_slot('made-up')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", (tx) => tx.query(`select public.set_active_prompt(gen_random_uuid())`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("record_tried_too counts once per IP hash per story", async () => {
    const tap = (hash: string) =>
      as("service_role", (tx) =>
        tx.query<{ n: number }>(`select public.record_tried_too($1, $2) as n`, [ids.approved, hash]),
      ).then((r) => r.rows[0].n);
    expect(await tap("hash-a")).toBe(1);
    expect(await tap("hash-a")).toBe(1);
    expect(await tap("hash-b")).toBe(2);
  });

  it("record_tried_too refuses stories that are not approved", async () => {
    await expect(
      as("service_role", (tx) => tx.query(`select public.record_tried_too($1, 'h')`, [ids.pending])),
    ).rejects.toThrow(/story not found/);
  });

  it("take_submission_slot allows 3 per IP hash per day", async () => {
    const take = (hash: string) =>
      as("service_role", (tx) =>
        tx.query<{ ok: boolean }>(`select public.take_submission_slot($1) as ok`, [hash]),
      ).then((r) => r.rows[0].ok);
    expect([await take("ip-1"), await take("ip-1"), await take("ip-1"), await take("ip-1")]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(await take("ip-2")).toBe(true);
  });
});

describe("signed-in users", () => {
  it("a non-admin user gets no more than anon", async () => {
    const { rows } = await as(
      "authenticated",
      (tx) => tx.query<{ id: string }>(`select id from public.stories`),
      OTHER_USER_ID,
    );
    expect(rows.map((r) => r.id)).not.toContain(ids.pending);
    const res = await as(
      "authenticated",
      (tx) => tx.query(`update public.stories set status = 'approved' where id = $1`, [ids.pending]),
      OTHER_USER_ID,
    );
    expect(res.affectedRows).toBe(0);
    await expect(
      as(
        "authenticated",
        (tx) => tx.query(`insert into public.stories (type, what_tried, person, sources) values ('famous', 'x', 'y', array['https://e.com'])`),
        OTHER_USER_ID,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("authenticated", (tx) => tx.query(`select public.set_active_prompt(gen_random_uuid())`), OTHER_USER_ID),
    ).rejects.toThrow(/not allowed/);
  });

  it("the admin can read pending, approve, and write famous stories", async () => {
    const { rows } = await as(
      "authenticated",
      (tx) => tx.query<{ id: string }>(`select id from public.stories where status = 'pending'`),
      ADMIN_ID,
    );
    expect(rows.map((r) => r.id)).toContain(ids.pending);
    const res = await as(
      "authenticated",
      (tx) =>
        tx.query(`update public.stories set status = 'approved', approved_at = now() where id = $1`, [
          ids.pending,
        ]),
      ADMIN_ID,
    );
    expect(res.affectedRows).toBe(1);
    await as(
      "authenticated",
      (tx) =>
        tx.query(
          `insert into public.stories (type, status, what_tried, person, period, sources)
           values ('famous', 'approved', 'Body', 'Person', '1990–1995', array['https://example.com'])`,
        ),
      ADMIN_ID,
    );
  });

  it("a famous story needs a person and at least one source", async () => {
    await expect(
      as(
        "authenticated",
        (tx) => tx.query(`insert into public.stories (type, what_tried, person) values ('famous', 'x', 'y')`),
        ADMIN_ID,
      ),
    ).rejects.toThrow(/famous_needs_person_and_sources/);
  });

  it("the admin can switch the active prompt", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.prompts (text, week_start, active) values ('a', '2026-10-19', true), ('b', '2026-10-26', false) returning id`,
    );
    await as("authenticated", (tx) => tx.query(`select public.set_active_prompt($1)`, [rows[1].id]), ADMIN_ID);
    const active = await db.query<{ text: string }>(`select text from public.prompts where active`);
    expect(active.rows).toEqual([{ text: "b" }]);
  });
});
