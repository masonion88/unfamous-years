-- Unfamous Years — v1 schema, row-level security and RPCs.
--
-- Security model in one paragraph:
--   anon          can read approved stories and all prompts, and can insert a
--                 pending community/long_view story (column grants + RLS).
--   authenticated is treated like anon unless the user is in private.admins,
--                 in which case they can read and write everything.
--   service_role  (server only, never shipped to the browser) calls the two
--                 RPCs that need a trusted IP hash: the "I tried something
--                 too" counter and the submission rate limit.

-- ---------------------------------------------------------------------------
-- Private schema (not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- The single allowed admin. After creating your user in Supabase Auth, run:
--   insert into private.admins (user_id) values ('<your auth.users id>');
create table private.admins (
  user_id uuid primary key
);

-- One row per accepted submission attempt, keyed by a salted IP hash.
create table private.submission_log (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index submission_log_ip_hash_created_at_idx
  on private.submission_log (ip_hash, created_at);

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admins where user_id = (select auth.uid())
  );
$$;

revoke all on all tables in schema private from anon, authenticated;
grant usage on schema private to anon, authenticated;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 280),
  week_start date not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one active prompt at a time.
create unique index prompts_one_active_idx on public.prompts (active) where active;

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('famous', 'long_view', 'community')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  what_tried text not null check (char_length(what_tried) >= 1),
  what_happened text,
  tag text check (tag in ('creative', 'social', 'physical', 'career', 'learning', 'other')),
  age_range text check (age_range in ('under 25', '25–39', '40–59', '60+')),
  prompt_id uuid references public.prompts (id) on delete set null,
  -- Famous: the person and years. Long view interviews: optional first name
  -- and decade, only with consent.
  person text,
  period text,
  sources text[],
  tried_too_count integer not null default 0 check (tried_too_count >= 0),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint famous_needs_person_and_sources check (
    type <> 'famous'
    or (person is not null and sources is not null and cardinality(sources) >= 1)
  )
);

create index stories_feed_idx on public.stories (status, type, approved_at desc);

create table public.tried_too (
  story_id uuid not null references public.stories (id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  constraint tried_too_story_ip_unique unique (story_id, ip_hash)
);

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants everything on public tables to anon/authenticated by
-- default; start from nothing and add back only what is needed.
-- ---------------------------------------------------------------------------
revoke all on public.stories, public.prompts, public.tried_too from anon, authenticated;

grant select on public.stories to anon, authenticated;
-- Anonymous submitters can only supply these columns. status, approved_at,
-- tried_too_count, person, period and sources keep their defaults (pending,
-- null, 0, null...).
grant insert (type, what_tried, what_happened, tag, age_range, prompt_id)
  on public.stories to anon;
grant select, insert, update, delete on public.stories to authenticated;

grant select on public.prompts to anon, authenticated;
grant insert, update, delete on public.prompts to authenticated;

grant select on public.tried_too to authenticated;

alter table public.stories enable row level security;
alter table public.prompts enable row level security;
alter table public.tried_too enable row level security;

-- ---------------------------------------------------------------------------
-- Policies: stories
-- ---------------------------------------------------------------------------
create policy "Anyone can read approved stories"
on public.stories for select
to anon, authenticated
using (status = 'approved');

create policy "Anonymous visitors can submit pending stories"
on public.stories for insert
to anon
with check (
  status = 'pending'
  and type in ('community', 'long_view')
  -- A 60+ submission is a long view story, and only a 60+ one is.
  and (type = 'long_view') = (age_range is not distinct from '60+')
  and char_length(what_tried) <= 280
  and (what_happened is null or char_length(what_happened) <= 280)
  and tried_too_count = 0
  and approved_at is null
  and person is null
  and period is null
  and sources is null
);

create policy "Admin can read all stories"
on public.stories for select
to authenticated
using ((select private.is_admin()));

create policy "Admin can insert stories"
on public.stories for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admin can update stories"
on public.stories for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admin can delete stories"
on public.stories for delete
to authenticated
using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Policies: prompts
-- ---------------------------------------------------------------------------
create policy "Anyone can read prompts"
on public.prompts for select
to anon, authenticated
using (true);

create policy "Admin can insert prompts"
on public.prompts for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admin can update prompts"
on public.prompts for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admin can delete prompts"
on public.prompts for delete
to authenticated
using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Policies: tried_too (writes only through record_tried_too below)
-- ---------------------------------------------------------------------------
create policy "Admin can read tried_too"
on public.tried_too for select
to authenticated
using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Lets the app check whether the signed-in user is the admin.
create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- "I tried something too": one tap per story per IP hash. Returns the count.
-- Server only: anon could otherwise call it with made-up hashes.
create function public.record_tried_too(p_story_id uuid, p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from public.stories where id = p_story_id and status = 'approved'
  ) then
    raise exception 'story not found' using errcode = 'P0002';
  end if;

  insert into public.tried_too (story_id, ip_hash)
  values (p_story_id, p_ip_hash)
  on conflict on constraint tried_too_story_ip_unique do nothing;

  if found then
    update public.stories
      set tried_too_count = tried_too_count + 1
      where id = p_story_id
      returning tried_too_count into v_count;
  else
    select tried_too_count into v_count from public.stories where id = p_story_id;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.record_tried_too(uuid, text) from public, anon, authenticated;
grant execute on function public.record_tried_too(uuid, text) to service_role;

-- Submission rate limit: returns true and logs the attempt when this IP hash
-- has made fewer than p_limit submissions in the last 24 hours. Server only.
create function public.take_submission_slot(p_ip_hash text, p_limit integer default 3)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip_hash));

  delete from private.submission_log where created_at < now() - interval '2 days';

  select count(*) into v_recent
  from private.submission_log
  where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';

  if v_recent >= p_limit then
    return false;
  end if;

  insert into private.submission_log (ip_hash) values (p_ip_hash);
  return true;
end;
$$;

revoke execute on function public.take_submission_slot(text, integer) from public, anon, authenticated;
grant execute on function public.take_submission_slot(text, integer) to service_role;

-- Make one prompt the active one (admin only, enforced by RLS on prompts).
create function public.set_active_prompt(p_prompt_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.prompts set active = false where active and id <> p_prompt_id;
  update public.prompts set active = true where id = p_prompt_id;
end;
$$;

revoke execute on function public.set_active_prompt(uuid) from public, anon;
grant execute on function public.set_active_prompt(uuid) to authenticated;
