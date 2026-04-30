# Cloud sync (optional)

By default RefrigHandle is **fully offline** — every device keeps its own
data in localStorage and IndexedDB. To share data across multiple devices
(office laptop + multiple techs in the field) you can connect the app to a
free Supabase project. This is **opt-in** — the app keeps working exactly
as before until you turn it on.

## How sync works

- The whole `AppState` (bottles, jobs, transactions, settings) is stored as
  one JSON row keyed by **Team ID** in a Supabase Postgres table.
- Devices using the same Team ID see the same data in real time
  (Postgres LISTEN/NOTIFY via Supabase Realtime).
- Last write wins — a tech in the field saving a transaction will
  overwrite anything else that changed in the previous ~1s. This is fine
  for one-or-two-tech teams; for larger teams you'd want a proper
  per-record sync (separate project).
- Photos are **not synced** in this version — they stay on the device that
  took them. We can wire those up later via Supabase Storage.

## One-time setup (~10 minutes)

### 1. Create a free Supabase project

1. Go to https://supabase.com/ and sign up (free tier, no credit card).
2. "New project" → pick a name and a region close to your team.
3. Wait ~1 minute while it provisions.

### 2. Create the table

In the Supabase dashboard, open **SQL Editor → New query** and run:

```sql
create table if not exists public.rh_state (
  team_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.rh_state enable row level security;

-- Open access for the anon key. If you want to restrict who can read/write,
-- replace these with policies that check auth.uid() or a known team_id list.
create policy "anon read"
  on public.rh_state for select
  to anon
  using (true);

create policy "anon write"
  on public.rh_state for insert
  to anon
  with check (true);

create policy "anon update"
  on public.rh_state for update
  to anon
  using (true)
  with check (true);

-- Enable realtime on the table
alter publication supabase_realtime add table public.rh_state;
```

> ⚠️ Treat the Team ID as a shared secret — anyone who knows it (and your
> public anon key) can read your data. For tighter control, add Supabase
> Auth and rewrite the RLS policies to check `auth.uid()`.

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
section will switch from "Not configured" to a Team ID input.

### 6. Enable on each device

On every phone/tablet that should share data:

1. Open the app
2. Settings → Cloud sync
3. Type the same **Team ID** (anything you like, e.g. `acme-hvac`) and tap
   Connect

That's it — changes on one device should appear on the others within a
second.

## Pause / disconnect

In Settings → Cloud sync, tap **Pause sync**. The app continues working
locally. Tap Connect again to resume.

## Going back to local-only

Just remove the GitHub secrets and re-deploy, or pause sync on each device.
Your data stays in localStorage on every device.
