// Cloud account sign-in — the front-end seam for the (forthcoming)
// Supabase-backed multi-device accounts. Today the app is offline-first
// with no real sign-in; this module gives the welcome / sign-in screens a
// stable interface to call so the UI can be built and reviewed now, and
// the actual backend wired in behind it without touching the screens.
//
// Agreed model (see SYNC.md, to be extended):
//   - Owner creates the business → gets an auto-generated Business ID.
//   - Owner creates each tech's account with a temporary password.
//   - A tech signs in with Business ID + username + password, and is
//     prompted to set a new password on first sign-in.
//
// Until the backend exists, signIn resolves to `cloud-unavailable` so the
// screen can show an honest "cloud sign-in isn't switched on yet" state
// instead of pretending to authenticate.

import { isSyncConfigured } from './sync'
import { isValidBusinessId, normalizeBusinessId } from './businessId'

export interface SignInInput {
  businessId: string
  username: string
  password: string
}

export type SignInResult =
  // Backend not provisioned/enabled on this build yet.
  | { ok: false; reason: 'cloud-unavailable' }
  // Local, synchronous validation of the form before any network call.
  | { ok: false; reason: 'invalid-business-id' }
  | { ok: false; reason: 'missing-fields' }
  // Reserved for the backend slice.
  | { ok: false; reason: 'invalid-credentials' }
  | { ok: true; mustChangePassword: boolean }

// Whether cloud accounts are wired up on this build. Mirrors sync config
// for now — both come from the same Supabase project.
export function isCloudAuthAvailable(): boolean {
  return isSyncConfigured()
}

// Cheap, synchronous form validation usable for inline field errors,
// independent of whether the backend is available.
export function validateSignInInput(input: SignInInput): SignInResult | null {
  if (!input.username.trim() || !input.password) {
    return { ok: false, reason: 'missing-fields' }
  }
  if (!isValidBusinessId(input.businessId)) {
    return { ok: false, reason: 'invalid-business-id' }
  }
  return null
}

export async function signIn(input: SignInInput): Promise<SignInResult> {
  const invalid = validateSignInInput(input)
  if (invalid) return invalid

  if (!isCloudAuthAvailable()) {
    return { ok: false, reason: 'cloud-unavailable' }
  }

  // Backend wiring lands in the next slice: authenticate against Supabase,
  // load the business's state, and report whether a password change is
  // required. Normalised here so that code is ready to drop in.
  void normalizeBusinessId(input.businessId)
  return { ok: false, reason: 'cloud-unavailable' }
}

// Human-readable copy for each non-OK result, so the screen and any future
// callers render the same wording.
export function signInErrorMessage(result: SignInResult): string {
  if (result.ok) return ''
  switch (result.reason) {
    case 'cloud-unavailable':
      return "Cloud sign-in isn't switched on yet. Ask your administrator to finish cloud setup, or use Create account / Explore for now."
    case 'invalid-business-id':
      return 'That Business ID doesn’t look right. It looks like "RH-XXXX-XXXX" — check the code your administrator gave you.'
    case 'missing-fields':
      return 'Enter your Business ID, username and password.'
    case 'invalid-credentials':
      return 'Business ID, username or password is incorrect.'
  }
}
