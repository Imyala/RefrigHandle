// Cloud sync facade (optional, BETA). The app works fully offline without
// any of this. The rest of the app imports ONLY from here — pullState,
// pushState, subscribeToState, isSyncConfigured — and never touches a
// concrete backend. Which backend runs is decided once, below, by which
// env vars were set at build time:
//
//   VITE_ORACLE_API_URL        -> Oracle REST/JWT backend (takes precedence)
//   VITE_SUPABASE_URL + _KEY   -> Supabase (the current default)
//   neither                    -> sync disabled (pure offline app)
//
// Switching Supabase -> Oracle is therefore a build-config change, not a
// code change: set the Oracle URL and every client (web, Android, iOS,
// desktop) targets it, because they all ship this same seam.

import type { AppState } from '../types'
import type { PullResult, SyncProvider } from './provider'
import { supabaseProvider } from './supabaseProvider'
import { oracleProvider } from './oracleProvider'

export type { PullResult } from './provider'

// Precedence: a configured Oracle backend wins over Supabase, so flipping
// to Oracle is just setting its URL. Falls back to whichever is configured,
// then to Supabase as an inert default (isSyncConfigured() stays false when
// nothing is set, so nothing tries to talk to a server).
function selectProvider(): SyncProvider {
  if (oracleProvider.isConfigured()) return oracleProvider
  if (supabaseProvider.isConfigured()) return supabaseProvider
  return supabaseProvider
}

const provider = selectProvider()

export function isSyncConfigured(): boolean {
  return provider.isConfigured()
}

export function pullState(teamId: string): Promise<PullResult> {
  return provider.pullState(teamId)
}

export function pushState(teamId: string, state: AppState): Promise<boolean> {
  return provider.pushState(teamId, state)
}

// Feed the authenticated backend a fresh bearer token after login/refresh.
// No-op for the Team-ID capability model (Supabase), so callers can wire it
// unconditionally.
export function setSyncAuthToken(token: string | null): void {
  provider.setAuthToken?.(token)
}

// How often a visible app checks whether the team's state changed. The
// check is a single change-token read; the full state only downloads on
// change.
const POLL_MS = 15_000

// Watch the team's state for remote changes. Polling (not push) keeps the
// backend simple and matches the RPC access model — a cheap token read,
// then a full pull only when the token moves. A hidden tab doesn't poll;
// refocusing checks immediately. Backend-agnostic: it drives whichever
// provider selectProvider() chose.
export function subscribeToState(
  teamId: string,
  onRemote: (s: AppState) => void,
): () => void {
  let stopped = false
  let lastSeen = ''
  let inFlight = false

  const tick = async () => {
    if (stopped || inFlight || !teamId) return
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      return
    }
    inFlight = true
    try {
      const stamp = await provider.getChangeToken(teamId)
      if (stopped || stamp == null) return
      if (stamp === lastSeen) return
      const r = await provider.pullState(teamId)
      if (!r.ok) return // pull failed — leave lastSeen so the next tick retries
      // Only a delivered body advances the watermark; otherwise a one-off
      // failed pull would swallow the update until the NEXT remote write.
      lastSeen = stamp
      if (r.state && !stopped) onRemote(r.state)
    } catch {
      // Offline — the next tick retries.
    } finally {
      inFlight = false
    }
  }

  const interval = setInterval(() => void tick(), POLL_MS)
  const onWake = () => void tick()
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
  }
  void tick()

  return () => {
    stopped = true
    clearInterval(interval)
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }
}
