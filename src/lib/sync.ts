// Optional Supabase sync (BETA). The app works fully offline without any
// of this. To enable, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at
// build time and turn the switch on in Settings → Cloud sync. See SYNC.md
// for the SQL schema and one-time Supabase setup.
//
// Access model: the anon key can NOT read or write the rh_state table
// directly — row level security is on with no policies. All access goes
// through SECURITY DEFINER functions keyed by the exact Team ID, so
// knowing a team's long random ID is the capability that unlocks that
// team's row (and only that row). That's why the UI generates random IDs
// and tells users to treat them like passwords. Change detection is a
// light poll of the row's updated_at (tiny payload); the full state is
// pulled only when it actually changed. Real per-person accounts need the
// planned authenticated backend.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from './types'
import { logDiagnostic } from './diagnostics'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let clientPromise: Promise<SupabaseClient | null> | null = null

export function isSyncConfigured(): boolean {
  return !!URL && !!KEY
}

async function getClient(): Promise<SupabaseClient | null> {
  if (!isSyncConfigured()) return null
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then((m) =>
      m.createClient(URL!, KEY!),
    )
  }
  return clientPromise
}

// "No row yet" and "the pull FAILED" are very different answers: a
// failed pull must never be treated as an empty server — the caller
// would then blind-push stale state over the row it couldn't see.
export type PullResult =
  | { ok: true; state: AppState | null } // null = no row for this team yet
  | { ok: false }

export async function pullState(teamId: string): Promise<PullResult> {
  const c = await getClient()
  if (!c || !teamId) return { ok: false }
  try {
    const { data, error } = await c.rpc('rh_get_state', { p_team_id: teamId })
    if (error) {
      logDiagnostic('sync', 'Cloud sync pull failed', error.message)
      return { ok: false }
    }
    return { ok: true, state: (data as AppState | null) ?? null }
  } catch (e) {
    logDiagnostic(
      'sync',
      'Cloud sync pull failed',
      e instanceof Error ? e.message : String(e),
    )
    return { ok: false }
  }
}

// True when the row was written. A failed push must NEVER be silent —
// the caller surfaces it and retries, otherwise a business can believe
// it's replicated for months while nothing has left the phone.
export async function pushState(
  teamId: string,
  state: AppState,
): Promise<boolean> {
  const c = await getClient()
  if (!c || !teamId) return false
  try {
    const { error } = await c.rpc('rh_set_state', {
      p_team_id: teamId,
      p_state: state,
    })
    if (error) {
      logDiagnostic('sync', 'Cloud sync push failed', error.message)
      return false
    }
    return true
  } catch (e) {
    logDiagnostic(
      'sync',
      'Cloud sync push failed',
      e instanceof Error ? e.message : String(e),
    )
    return false
  }
}

// How often a visible app checks whether the team row changed. The check
// is a single timestamp read; the full state only downloads on change.
const POLL_MS = 15_000

// Watch the team's row for changes. Polling (not Postgres realtime)
// because realtime's postgres_changes needs SELECT rights on the table,
// and granting those to the public anon key is exactly the hole the RPC
// model closes. A hidden tab doesn't poll; refocusing checks immediately.
export function subscribeToState(
  teamId: string,
  onRemote: (s: AppState) => void,
): () => void {
  let stopped = false
  let lastSeen = ''
  let inFlight = false

  const tick = async () => {
    if (stopped || inFlight || !teamId) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    inFlight = true
    try {
      const c = await getClient()
      if (!c || stopped) return
      const { data, error } = await c.rpc('rh_get_updated_at', {
        p_team_id: teamId,
      })
      if (error || data == null) return
      const stamp = String(data)
      if (stamp === lastSeen) return
      const r = await pullState(teamId)
      if (!r.ok) return // pull failed — leave lastSeen so the next tick retries
      // Only a delivered body advances the watermark; otherwise a
      // one-off failed pull would swallow the update until the NEXT
      // remote write.
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
