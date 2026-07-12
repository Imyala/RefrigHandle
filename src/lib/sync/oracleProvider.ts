// Oracle backend provider (REST + JWT). This is the seam for the planned
// authenticated backend running on Oracle (an OCI-hosted API, or ORDS over
// Autonomous DB). It activates automatically when VITE_ORACLE_API_URL is
// set at build time — see selectProvider() in ./index. No app code changes
// when you switch; only the env var.
//
// Security model (the point of moving off the Team-ID capability model):
//   - The client holds NO standing secret. It sends a short-lived bearer
//     JWT that the Oracle server mints after login; setAuthToken() feeds it
//     in. Until real auth is wired, it falls back to sending the Team ID as
//     the bearer so an early cut can keep working exactly like today.
//   - The server derives the team/user from the token and enforces every
//     permission check itself — the client is never trusted.
//
// Expected REST contract (implement these on the Oracle side — see
// BACKEND.md for the full spec):
//   GET  {API}/state?teamId=…            -> 200 {"state": …} | 204 (no row)
//   GET  {API}/state/updated_at?teamId=… -> 200 {"updatedAt": "…"} | 204
//   PUT  {API}/state                     -> 200   body {"teamId": …, "state": …}
// All three take `Authorization: Bearer <token>`.

import type { AppState } from '../types'
import { logDiagnostic } from '../diagnostics'
import type { PullResult, SyncProvider } from './provider'

const API = import.meta.env.VITE_ORACLE_API_URL as string | undefined

// Bearer token, injected by the app after login (setAuthToken). Held in a
// module variable, never persisted alongside the data it protects.
let authToken: string | null = null

function isConfigured(): boolean {
  return !!API
}

// Build the request headers, preferring a real JWT and falling back to the
// Team ID during the pre-auth transition so an early Oracle cut still works.
function authHeaders(teamId: string): HeadersInit {
  const bearer = authToken ?? teamId
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  }
}

function base(): string {
  // Tolerate a trailing slash in the configured URL.
  return API!.replace(/\/+$/, '')
}

async function pullState(teamId: string): Promise<PullResult> {
  if (!isConfigured() || !teamId) return { ok: false }
  try {
    const res = await fetch(
      `${base()}/state?teamId=${encodeURIComponent(teamId)}`,
      { headers: authHeaders(teamId) },
    )
    if (res.status === 204) return { ok: true, state: null } // no row yet
    if (!res.ok) {
      logDiagnostic('sync', 'Cloud sync pull failed', `HTTP ${res.status}`)
      return { ok: false }
    }
    const body = (await res.json()) as { state?: AppState | null }
    return { ok: true, state: body.state ?? null }
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
  if (!isConfigured() || !teamId) return false
  try {
    const res = await fetch(`${base()}/state`, {
      method: 'PUT',
      headers: authHeaders(teamId),
      body: JSON.stringify({ teamId, state }),
    })
    if (!res.ok) {
      logDiagnostic('sync', 'Cloud sync push failed', `HTTP ${res.status}`)
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
  if (!isConfigured() || !teamId) return null
  try {
    const res = await fetch(
      `${base()}/state/updated_at?teamId=${encodeURIComponent(teamId)}`,
      { headers: authHeaders(teamId) },
    )
    if (!res.ok) return null // 204 (no row) included — nothing to compare yet
    const body = (await res.json()) as { updatedAt?: string | null }
    return body.updatedAt ?? null
  } catch {
    return null
  }
}

export const oracleProvider: SyncProvider = {
  name: 'oracle',
  isConfigured,
  pullState,
  pushState,
  getChangeToken,
  setAuthToken(token: string | null) {
    authToken = token
  },
}
