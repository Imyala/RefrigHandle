// Supabase provider (the current default, BETA). The app works fully
// offline without any of this. To enable, set VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY at build time and turn the switch on in
// Settings → Cloud sync. See SYNC.md for the SQL schema and setup.
//
// Access model: the anon key can NOT read or write the rh_state table
// directly — row level security is on with no policies. All access goes
// through SECURITY DEFINER functions keyed by the exact Team ID, so
// knowing a team's long random ID is the capability that unlocks that
// team's row (and only that row). That's why the UI generates random IDs
// and tells users to treat them like passwords.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from '../types'
import { logDiagnostic } from '../diagnostics'
import type { PullResult, SyncProvider } from './provider'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let clientPromise: Promise<SupabaseClient | null> | null = null

function isConfigured(): boolean {
  return !!URL && !!KEY
}

async function getClient(): Promise<SupabaseClient | null> {
  if (!isConfigured()) return null
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then((m) =>
      m.createClient(URL!, KEY!),
    )
  }
  return clientPromise
}

async function pullState(teamId: string): Promise<PullResult> {
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

async function pushState(teamId: string, state: AppState): Promise<boolean> {
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

async function getChangeToken(teamId: string): Promise<string | null> {
  const c = await getClient()
  if (!c || !teamId) return null
  try {
    const { data, error } = await c.rpc('rh_get_updated_at', {
      p_team_id: teamId,
    })
    if (error || data == null) return null
    return String(data)
  } catch {
    return null
  }
}

export const supabaseProvider: SyncProvider = {
  name: 'supabase',
  isConfigured,
  pullState,
  pushState,
  getChangeToken,
}
