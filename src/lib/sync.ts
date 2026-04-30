// Optional Supabase sync. The app works fully offline without any of this.
// To enable, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time
// and turn the switch on in Settings → Cloud sync. See SYNC.md for the
// SQL schema and one-time Supabase setup.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from './types'

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

interface RemoteRow {
  team_id: string
  state: AppState
  updated_at: string
}

export async function pullState(teamId: string): Promise<AppState | null> {
  const c = await getClient()
  if (!c || !teamId) return null
  const { data, error } = await c
    .from('rh_state')
    .select('state, updated_at')
    .eq('team_id', teamId)
    .maybeSingle()
  if (error || !data) return null
  return (data as RemoteRow).state ?? null
}

export async function pushState(teamId: string, state: AppState): Promise<void> {
  const c = await getClient()
  if (!c || !teamId) return
  await c.from('rh_state').upsert(
    {
      team_id: teamId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'team_id' },
  )
}

export function subscribeToState(
  teamId: string,
  onRemote: (s: AppState) => void,
): () => void {
  let cleanup: (() => void) | null = null
  let cancelled = false
  void getClient().then((c) => {
    if (!c || cancelled || !teamId) return
    const channel = c
      .channel(`rh_state:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rh_state',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const row = payload.new as RemoteRow | undefined
          if (row?.state) onRemote(row.state)
        },
      )
      .subscribe()
    cleanup = () => {
      void c.removeChannel(channel)
    }
  })
  return () => {
    cancelled = true
    cleanup?.()
  }
}
