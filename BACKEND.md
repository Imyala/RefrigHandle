# Backend API contract (Oracle)

This is the REST contract the client's Oracle sync provider
(`src/lib/sync/oracleProvider.ts`) expects. Implement these three
endpoints on your Oracle backend (an OCI-hosted Node/Deno API, or ORDS over
Autonomous Database) and the app targets them by build-time env var — **no
app code changes**.

## Activating the Oracle backend

Set at build time (e.g. GitHub Actions secret, or your local `.env`):

```
VITE_ORACLE_API_URL=https://api.your-oracle-host.example
```

When this is set it **takes precedence** over Supabase. Unset it to fall
back to Supabase. The selection lives in `src/lib/sync/index.ts`.

## Auth

Every request carries `Authorization: Bearer <token>`.

- **Target model:** the token is a short-lived **JWT** the server mints at
  login. The server derives the team/user from the token and enforces all
  permissions itself — never trust the client.
- **Transition shim:** until login exists, the client sends the **Team ID**
  as the bearer, so an early cut works exactly like the current Supabase
  Team-ID model. Feed a real JWT in later via `setSyncAuthToken(token)`
  (exported from `src/lib/sync`) — no other client change needed.

## Endpoints

The app stores the entire `AppState` as one JSON document per team, and
merges record-by-record on the client before every push (see
`src/lib/merge.ts`), so the server only needs read/write of the blob plus a
change timestamp. It does **not** need to understand the schema.

### `GET /state?teamId=…`
Return the team's stored state.

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ "state": <AppState> }` | current state |
| `204` | _(empty)_ | no row for this team yet |
| `401`/`5xx` | — | treated as a failed pull; client retries, never overwrites |

### `GET /state/updated_at?teamId=…`
Cheap change-detection — return only the last-write timestamp.

| Status | Body |
|---|---|
| `200` | `{ "updatedAt": "2026-07-12T04:00:00Z" }` |
| `204` | _(empty)_ — no row yet |

The client polls this (~15 s while visible) and pulls the full state only
when `updatedAt` changes.

### `PUT /state`
Upsert the team's state.

- Body: `{ "teamId": "…", "state": <AppState> }`
- `200` on success; any non-2xx is treated as a failed push (the client
  surfaces it and retries — a failed push is never silent).
- Refuse Team IDs shorter than 12 chars (matches the current SQL guard) so
  a typo'd/guessable ID can't claim a row.

## Notes

- Store `state` as native JSON (Oracle 23ai JSON column / Autonomous DB JSON
  document). Index on `team_id`.
- CORS: allow the web origin(s). Native shells (Capacitor/Tauri) use a
  custom scheme and aren't subject to browser CORS, but keep the allow-list
  tight for the web build.
- Keep taking client-side JSON backups regardless — sync keeps devices in
  step, it is not the archive of record.
