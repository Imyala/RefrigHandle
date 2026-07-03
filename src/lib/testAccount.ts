import type { AppState } from './types'

// Built-in test account — a stopgap so the sign-in flow can be exercised
// end-to-end before the authenticated cloud backend exists. Signing in
// with these credentials on a fresh device provisions a local test
// workspace (the same completeSetup path a real account uses), so the
// whole loop — sign in, work, sign out, sign back in — is testable today.
//
// The credentials are deliberately NOT shown anywhere in the UI; the
// sign-in form answers every miss with the same generic error. They grant
// nothing beyond a sandbox on the visitor's own device (exactly like
// guest mode). REMOVE this module when the server backend lands —
// sign-in then authenticates remotely and a hardcoded account would only
// confuse.
export const TEST_ACCOUNT_BUSINESS_ID = 'TEST-0001'
export const TEST_ACCOUNT_USERNAME = 'testuser'
export const TEST_ACCOUNT_PASSWORD = 'Test1234'

// Whether this device's workspace is the built-in test account — drives
// the persistent "test account" banner so it can't be mistaken for a real
// business's records.
export function isTestAccount(state: AppState): boolean {
  return state.technicians.some(
    (t) => t.username?.toLowerCase() === TEST_ACCOUNT_USERNAME,
  )
}

function ymdMonthsFromNow(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// The completeSetup payload for the test workspace. Obviously-fake
// identifiers (same style as demo mode) so nobody mistakes it for a real
// business; the ABN passes the checksum so validation paths behave as
// they would for a real account.
export function buildTestAccountSetup(passwordHash: string) {
  return {
    businessName: 'Test Business Pty Ltd',
    businessAbn: '51824753556',
    arcAuthorisationNumber: 'RTA-TEST',
    arcAuthorisationExpiry: ymdMonthsFromNow(12),
    technician: {
      firstName: 'Test',
      lastName: 'Account',
      username: TEST_ACCOUNT_USERNAME,
      arcLicenceNumber: 'TEST-0000',
      licenceExpiry: ymdMonthsFromNow(24),
      role: 'owner' as const,
      passwordHash,
    },
    location: {
      country: 'Australia',
      region: 'NSW',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
    },
    jurisdiction: 'AU' as const,
  }
}
