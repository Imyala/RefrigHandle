// The sync seam. Every backend (Supabase today, Oracle next) implements
// this one interface; the rest of the app only ever talks to the facade in
// ./index, so switching backends is a build-time config change — no app
// code moves. Secrets never live in the client: a provider holds only a
// PUBLIC key (Supabase anon) or a short-lived bearer token minted by the
// server. Anything truly secret stays on the backend.

import type { AppState } from '../types'

// "No row yet" and "the pull FAILED" are very different answers: a failed
// pull must never be treated as an empty server — the caller would then
// blind-push stale state over the row it couldn't see.
export type PullResult =
  | { ok: true; state: AppState | null } // null = no row for this team yet
  | { ok: false }

export interface SyncProvider {
  // For diagnostics/logging only.
  readonly name: string
  // True once the provider has the config it needs (URL + key/token).
  isConfigured(): boolean
  // Full state for a team. See PullResult for the ok/failed/empty split.
  pullState(teamId: string): Promise<PullResult>
  // True only when the row was actually written. A failed push must never
  // be silent — the caller surfaces it and retries.
  pushState(teamId: string, state: AppState): Promise<boolean>
  // Cheap change-detection token (e.g. the row's updated_at). null means
  // "unknown / no row / failed" — the poller then just tries again next
  // tick. The full state downloads only when this token changes.
  getChangeToken(teamId: string): Promise<string | null>
  // Optional: set the bearer token for providers that authenticate per
  // user (Oracle/JWT). No-op for the Team-ID capability model (Supabase).
  setAuthToken?(token: string | null): void
}
