export const REFRIGERANT_TYPES = [
  'R410A',
  'R22',
  'R32',
  'R134A',
  'R407C',
  'R404A',
  'R290',
  'R600A',
  'R1234YF',
  'R454B',
  'R513A',
] as const

export type RefrigerantType = (typeof REFRIGERANT_TYPES)[number] | string

export type BottleStatus = 'in_stock' | 'on_site' | 'returned' | 'empty'

export interface Bottle {
  id: string
  bottleNumber: string
  refrigerantType: RefrigerantType
  tareWeight: number // empty cylinder mass, kg
  grossWeight: number // current total mass (tare + refrigerant), kg
  initialNetWeight: number // refrigerant mass when first received, kg
  status: BottleStatus
  currentJobId?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Job {
  id: string
  name: string
  address?: string
  client?: string
  notes?: string
  createdAt: string
}

export type TransactionKind =
  | 'charge' // refrigerant put INTO equipment, removed from bottle
  | 'recover' // refrigerant pulled OUT of equipment, added to bottle
  | 'transfer' // bottle moved to a job (no weight change)
  | 'return' // bottle returned to stock / supplier
  | 'adjust' // manual correction

export type TransactionReason =
  | 'install'
  | 'service'
  | 'leak_repair'
  | 'top_up'
  | 'decommission'
  | 'other'

export const REASON_LABELS: Record<TransactionReason, string> = {
  install: 'Install / commissioning',
  service: 'Service',
  leak_repair: 'Leak repair',
  top_up: 'Top up',
  decommission: 'Decommission',
  other: 'Other',
}

export interface Transaction {
  id: string
  bottleId: string
  jobId?: string
  kind: TransactionKind
  amount: number // kg of refrigerant moved (always positive)
  weightBefore: number // bottle gross weight before
  weightAfter: number // bottle gross weight after
  date: string // ISO date
  technician?: string
  equipment?: string // e.g. "Daikin VRV unit #3" — F-Gas log
  reason?: TransactionReason
  notes?: string
}

export interface AppState {
  bottles: Bottle[]
  jobs: Job[]
  transactions: Transaction[]
  customRefrigerants: string[]
  technician: string
}

export const EMPTY_STATE: AppState = {
  bottles: [],
  jobs: [],
  transactions: [],
  customRefrigerants: [],
  technician: '',
}

export function netWeight(b: Bottle): number {
  return Math.max(0, b.grossWeight - b.tareWeight)
}

export function statusLabel(s: BottleStatus): string {
  switch (s) {
    case 'in_stock':
      return 'In stock'
    case 'on_site':
      return 'On job'
    case 'returned':
      return 'Returned'
    case 'empty':
      return 'Empty'
  }
}

export function transactionLabel(k: TransactionKind): string {
  switch (k) {
    case 'charge':
      return 'Charge'
    case 'recover':
      return 'Recover'
    case 'transfer':
      return 'Transfer'
    case 'return':
      return 'Return'
    case 'adjust':
      return 'Adjust'
  }
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`
}
