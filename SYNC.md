# Cloud sync (optional, beta)

By default RefrigHandle is **fully offline** — every device keeps its own
data in localStorage and IndexedDB. To share data across multiple devices
(office laptop + techs in the field) you can connect the app to a free
Supabase project you host yourself. This is **opt-in** — the app keeps
working exactly as before until you turn it on.

> **Beta.** Sync is built for small teams (a handful of devices) and is
> honestly labelled beta in the app. There are no per-person server
> accounts yet — the planned authenticated backend replaces this. Sync
> keeps devices in step; it is **not** a long-term archive. Keep taking
> JSON backups.

## How sync works

- The whole `AppState` (bottles, jobs, transactions, settings) is stored
  as one row keyed by **Team ID** in your Supabase Postgres.
- The table is **not** directly readable or writable with the app's
  public key: row level security is enabled with **no policies**, and all
  access goes through `SECURITY DEFINER` functions that require the exact
  Team ID. Knowing the ID *is* the key to the row — which is why the app
  generates a long random one and tells you to treat it like a password.
- Devices **merge record-by-record** (no whole-blob last-write-wins): two
  techs logging at once both keep their entries, and every device pulls
  and merges the server row before it pushes, so a device that was
  offline can't overwrite work the rest of the team did meanwhile.
- Change detection is a light poll (~15 s while the app is visible, plus
  an immediate check on focus) of the row's `updated_at`; the full state
  downloads only when it changed.

## Security model — read this before enabling

- **The Team ID is the secret.** Anyone who knows it (the app's public
  anon key is visible to anyone) can read and overwrite your team's
  synced data. Use the app's **Generate a secure Team ID** button — never
  a guessable name like `acme`.
- Photos and customer signatures never leave the device (they are not in
  the synced state).
- For tighter control (per-user accounts, provable permissions), wait for
  the authenticated backend or add Supabase Auth yourself and rewrite the
  functions to check `auth.uid()`.

## One-time setup (~10 minutes)

### 1. Create a free Supabase project

1. Go to https://supabase.com/ and sign up (free tier, no credit card).
2. "New project" → pick a name and a region close to your team.
3. Wait ~1 minute while it provisions.

### 2. Create the table and access functions

In the Supabase dashboard, open **SQL Editor → New query** and run:

```sql
create table if not exists public.rh_state (
  team_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on, and deliberately NO policies: the public anon key cannot
-- touch the table directly. All access goes through the functions
-- below, which require knowing the exact Team ID.
alter table public.rh_state enable row level security;

-- Read a team's state. Returns null for an unknown Team ID.
create or replace function public.rh_get_state(p_team_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select state from public.rh_state where team_id = p_team_id;
$$;

-- Cheap change detection: just the row's last-write timestamp.
create or replace function public.rh_get_updated_at(p_team_id text)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select updated_at from public.rh_state where team_id = p_team_id;
$$;

-- Write a team's state. Refuses short Team IDs so a typo'd or
-- guessable ID can't become a team's row by accident.
create or replace function public.rh_set_state(p_team_id text, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_team_id) < 12 then
    raise exception 'Team ID too short — use the app''s generated ID';
  end if;
  insert into public.rh_state (team_id, state, updated_at)
  values (p_team_id, p_state, now())
  on conflict (team_id)
  do update set state = excluded.state, updated_at = now();
end;
$$;

revoke all on function public.rh_get_state(text) from public;
revoke all on function public.rh_get_updated_at(text) from public;
revoke all on function public.rh_set_state(text, jsonb) from public;
grant execute on function public.rh_get_state(text) to anon;
grant execute on function public.rh_get_updated_at(text) to anon;
grant execute on function public.rh_set_state(text, jsonb) to anon;
```

### If you set up sync before this hardening

Earlier versions used open table policies and Postgres realtime. Run this
once to close the direct table access (then run the block above to add
the functions):

```sql
drop policy if exists "anon read" on public.rh_state;
drop policy if exists "anon write" on public.rh_state;
drop policy if exists "anon update" on public.rh_state;
alter publication supabase_realtime drop table public.rh_state;
```

Also switch every device to a **generated** Team ID if your old one was
guessable: connect with the new ID on a device that has the full data,
let it push, then connect the rest with the same new ID, and finally
delete the old row in Supabase
(`delete from public.rh_state where team_id = 'old-id';`).

### 3. Get the URL and anon key

In Supabase: **Project Settings → API**

- Copy **Project URL** (looks like `https://xxxx.supabase.co`)
- Copy **anon / public key** (the long `eyJ...` JWT)

### 4. Add them as GitHub repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

Add two secrets:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the URL from step 3 |
| `VITE_SUPABASE_ANON_KEY` | the anon key from step 3 |

### 5. Re-deploy

Push any commit (or manually re-run the deploy workflow). The build will
pick the secrets up at compile time and the **Settings → Cloud sync**
section will switch from hidden to a Team ID input.

### 6. Enable on each device

1. On the FIRST device: Settings → Cloud sync → **Generate a secure
   Team ID** → Connect. Share that ID with your team privately (not in
   an email subject line or a group chat strangers can see).
2. On every other device: paste the same Team ID and tap Connect.

Changes on one device appear on the others within ~15 seconds while the
app is open.

## Pause / disconnect

In Settings → Cloud sync, tap **Pause sync**. The app continues working
locally. Tap Connect again to resume.

## Going back to local-only

Just remove the GitHub secrets and re-deploy, or pause sync on each
device. Your data stays in localStorage on every device. To remove the
server copy, delete the row:
`delete from public.rh_state where team_id = 'your-id';`
