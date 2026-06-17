import { isValidAbn, type Jurisdiction } from './types'

// Australian compliance profile. The app is Australia-only (the ARC
// RHL/RTA scheme), so there is a single profile — but the rest of the
// app still asks the profile for its terminology rather than hard-coding
// "RHL" / "RTA" / "ABN" strings everywhere, which keeps those labels in
// one place.
//
// AU — Ozone Protection & SGG Management Act/Regulations, ARC scheme,
//      ANZ Refrigerant Handling Code of Practice 2025, AS/NZS 5149.

export interface ComplianceProfile {
  id: Jurisdiction
  name: string
  // Personal licence/certification carried by each technician.
  techLicenceLabel: string
  techLicenceShort: string // prefix shown next to the number, e.g. "RHL 12345"
  hasBusinessAuthorisation: boolean
  businessAuthLabel: string
  businessAuthShort: string
  // Business registration number label + validator.
  businessNumberLabel: string
  businessNumberShort: string // prefix on printouts, e.g. "ABN 51 824…"
  validateBusinessNumber: (s: string) => boolean
  businessNumberHint: string
  recordRetentionYears: number
  // Footer citation for logbook / audit printouts.
  citation: string
}

export const COMPLIANCE_PROFILES: Record<Jurisdiction, ComplianceProfile> = {
  AU: {
    id: 'AU',
    name: 'Australia (ARC)',
    techLicenceLabel: 'ARC Refrigerant Handling Licence (RHL)',
    techLicenceShort: 'RHL',
    hasBusinessAuthorisation: true,
    businessAuthLabel: 'ARC Refrigerant Trading Authorisation (RTA)',
    businessAuthShort: 'RTA',
    businessNumberLabel: 'Business ABN',
    businessNumberShort: 'ABN',
    validateBusinessNumber: (s) => s.trim() === '' || isValidAbn(s),
    businessNumberHint: 'Your 11-digit Australian Business Number.',
    recordRetentionYears: 5,
    citation:
      'Recorded against AS/NZS 5149.4 §6 (service records), the Australia and New Zealand Refrigerant Handling Code of Practice 2025, and AIRAH DA19. GWP values per IPCC AR4 (100-year) as adopted by the Ozone Protection and Synthetic Greenhouse Gas Management Regulations.',
  },
}

export function profileFor(j: Jurisdiction | undefined): ComplianceProfile {
  return COMPLIANCE_PROFILES[j ?? 'AU'] ?? COMPLIANCE_PROFILES.AU
}
