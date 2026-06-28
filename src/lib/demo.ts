import type { AppState, Bottle, Site, Technician, Transaction, Unit } from './types'

// Sample data for "Explore with sample data" mode. Lets a brand-new user
// (or a demo on stage) try logging a charge, see the compliance health
// scorecard light up, and browse cylinders/sites BEFORE filling in the real
// business and licence details. It is clearly fictional, sits behind a
// persistent "sample data" banner, and is wiped the moment the user leaves
// demo to do the real setup.

// A fixed, obviously-fake licence so nobody mistakes the demo tech for real.
const DEMO_RHL = 'DEMO-0000'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function ym(d: Date): string {
  return d.toISOString().slice(0, 7)
}
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000)
}
function addMonths(base: Date, months: number): Date {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d
}

// Build the seeded slice of state. `nowISO` is the device clock at the
// moment demo starts (passed in so the store stays the single source of
// time). Dates are relative so the sample always looks current.
export function buildDemoState(nowISO: string): Partial<AppState> {
  const now = new Date(nowISO)

  const tech: Technician = {
    id: 'demo-tech',
    firstName: 'Sam',
    lastName: 'Rivers',
    name: 'Sam Rivers',
    arcLicenceNumber: DEMO_RHL,
    licenceExpiry: ymd(addMonths(now, 14)),
    role: 'owner',
    createdAt: nowISO,
  }

  const site: Site = {
    id: 'demo-site',
    name: 'Harbour View Apartments',
    client: 'Harbour View Body Corporate',
    address: '12 Marine Parade',
    state: 'NSW',
    city: 'Sydney',
    createdAt: nowISO,
    updatedAt: nowISO,
  }

  const unit: Unit = {
    id: 'demo-unit',
    siteId: site.id,
    name: 'Rooftop chiller #1',
    kind: 'chiller',
    refrigerantType: 'R32',
    refrigerantCharge: 8,
    manufacturer: 'Daikin',
    model: 'EWAD-TZ',
    serial: 'DK-2291',
    installDate: ymd(addMonths(now, -30)),
    status: 'active',
    createdAt: nowISO,
    updatedAt: nowISO,
  }

  const bottles: Bottle[] = [
    {
      id: 'demo-b1',
      bottleNumber: 'CYL-1001',
      refrigerantType: 'R32',
      tareWeight: 50,
      grossWeight: 59,
      initialNetWeight: 9,
      status: 'in_stock',
      // Comfortably in date.
      lastHydroTestDate: ymd(addMonths(now, -20)),
      nextHydroTestDate: ym(addMonths(now, 100)),
      supplier: 'Sample Refrigerants Co',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'demo-b2',
      bottleNumber: 'CYL-1002',
      refrigerantType: 'R410A',
      tareWeight: 52,
      grossWeight: 60,
      initialNetWeight: 8,
      status: 'on_site',
      currentSiteId: site.id,
      lastHydroTestDate: ymd(addMonths(now, -118)),
      // Due next month — lights up the compliance scorecard amber.
      nextHydroTestDate: ym(addMonths(now, 1)),
      supplier: 'Sample Refrigerants Co',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
    {
      id: 'demo-b3',
      bottleNumber: 'CYL-1003',
      refrigerantType: 'R134A',
      tareWeight: 48,
      grossWeight: 51.5,
      initialNetWeight: 6,
      status: 'in_stock',
      lastHydroTestDate: ymd(addMonths(now, -10)),
      nextHydroTestDate: ym(addMonths(now, 110)),
      supplier: 'Sample Refrigerants Co',
      createdAt: nowISO,
      updatedAt: nowISO,
    },
  ]

  const transactions: Transaction[] = [
    {
      id: 'demo-t1',
      bottleId: 'demo-b2',
      siteId: site.id,
      unitId: unit.id,
      kind: 'charge',
      amount: 1.2,
      weightBefore: 61.2,
      weightAfter: 60,
      reason: 'install',
      leakTestPerformed: true,
      bottleTareWeight: 52,
      bottleRefrigerantType: 'R410A',
      technician: tech.name,
      technicianLicence: tech.arcLicenceNumber,
      technicianRole: 'owner',
      date: addDays(now, -6).toISOString(),
      loggedAt: addDays(now, -6).toISOString(),
    },
    {
      id: 'demo-t2',
      bottleId: 'demo-b3',
      kind: 'intake',
      amount: 6,
      weightBefore: 48,
      weightAfter: 51.5,
      bottleTareWeight: 48,
      bottleRefrigerantType: 'R134A',
      technician: tech.name,
      technicianLicence: tech.arcLicenceNumber,
      date: addDays(now, -3).toISOString(),
      loggedAt: addDays(now, -3).toISOString(),
    },
  ]

  return {
    technicians: [tech],
    activeTechnicianId: tech.id,
    technician: tech.name,
    arcLicenceNumber: tech.arcLicenceNumber,
    businessName: 'Demo Refrigeration Co',
    arcAuthorisationNumber: 'RTA-DEMO',
    arcAuthorisationExpiry: ymd(addMonths(now, 9)),
    location: {
      country: 'Australia',
      region: 'NSW',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
    },
    sites: [site],
    units: [unit],
    bottles,
    transactions,
  }
}
