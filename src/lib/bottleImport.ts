import type { Bottle } from './types'
import {
  REFRIGERANT_TYPES,
  isDuplicateActiveBottleNumber,
  safeFillKgFor,
} from './types'

// "Bring your cylinders in" — parse a pasted spreadsheet / CSV into
// ready-to-create bottles. Every real business already has this list in
// Excel; retyping sixty cylinders on a phone is where trials die, so the
// parser is deliberately forgiving: header names are matched by synonym,
// commas or tabs both work (Excel copy-paste is tab-separated), numbers
// may carry "kg", and dates accept the formats spreadsheets actually
// produce (dd/mm/yyyy, yyyy-mm-dd, mm/yyyy).

export interface ImportRow {
  line: number // 1-based line in the pasted text (for error messages)
  raw: string
  data?: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>
  // A row with errors is skipped; warnings import but are surfaced.
  errors: string[]
  warnings: string[]
}

export interface ImportParse {
  rows: ImportRow[]
  // Header cells that matched nothing — shown so a typo'd column is
  // noticed rather than silently dropped.
  unmatchedHeaders: string[]
  ready: number
  skipped: number
}

// Column synonyms, all compared lowercased with spaces/underscores
// collapsed. First match wins; unmatched columns are reported.
const HEADER_MAP: Record<string, readonly string[]> = {
  bottleNumber: [
    'bottle', 'bottlenumber', 'bottleid', 'bottleno', 'cylinder',
    'cylindernumber', 'cylinderid', 'cylinderno', 'number', 'id', 'serial',
    'serialnumber', 'asset', 'assetnumber',
  ],
  refrigerantType: ['refrigerant', 'refrigeranttype', 'type', 'gas', 'gastype'],
  tareWeight: ['tare', 'tareweight', 'tarekg', 'tareweightkg', 'emptyweight'],
  grossWeight: [
    'gross', 'grossweight', 'grosskg', 'grossweightkg', 'currentweight',
    'weight', 'totalweight',
  ],
  waterCapacity: ['watercapacity', 'wc', 'capacity', 'capacitykg'],
  lastHydroTestDate: [
    'lasttest', 'lasttested', 'testdate', 'lasttestdate', 'hydrotest',
    'lasthydro', 'lasthydrotest',
  ],
  nextHydroTestDate: [
    'nexttest', 'nextdue', 'testdue', 'nexttestdate', 'nexthydro', 'duedate',
  ],
  supplier: ['supplier', 'from', 'vendor'],
  invoiceNumber: ['invoice', 'invoicenumber', 'invoiceno', 'docket', 'docketnumber'],
  costAud: ['cost', 'costaud', 'price', 'costexgst', 'priceexgst'],
  notes: ['notes', 'note', 'comments', 'comment'],
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_()./-]+/g, '').replace(/kg$/, 'kg')
}

function matchHeader(h: string): string | null {
  const n = normHeader(h)
  for (const [field, names] of Object.entries(HEADER_MAP)) {
    if (names.includes(n)) return field
  }
  return null
}

// Normalise a refrigerant cell to the app's naming: "r-410a" → "R410A".
// Returns [name, known] — unknown names import as custom refrigerants.
export function normalizeRefrigerant(raw: string): [string, boolean] {
  const name = raw.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!name) return ['', false]
  const known = (REFRIGERANT_TYPES as readonly string[]).includes(name)
  return [name, known]
}

// Numbers may arrive as "12.5", "12,5" is NOT supported (ambiguous with
// thousands), "12.5 kg", "$412.50". Empty → null.
function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, '').replace(/kg$/i, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// Dates: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, mm/yyyy, yyyy-mm. Month-only
// values land on the 1st (the AS 2030 stamp is month/year anyway).
export function parseImportDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  m = s.match(/^(\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`
  m = s.match(/^(\d{4})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`
  return null
}

// Split one line into cells. Tabs win when present (Excel paste);
// otherwise commas with RFC-4180 quote handling.
function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

export function parseBottleImport(
  text: string,
  existingBottles: readonly Bottle[],
): ImportParse {
  const lines = text.split(/\r\n|\r|\n/)
  // First non-empty line is the header.
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) {
    return { rows: [], unmatchedHeaders: [], ready: 0, skipped: 0 }
  }
  const headerCells = splitLine(lines[headerIdx])
  const fields = headerCells.map(matchHeader)
  const unmatchedHeaders = headerCells.filter((_, i) => !fields[i] && headerCells[i])
  const hasBottleNumber = fields.includes('bottleNumber')

  const rows: ImportRow[] = []
  const seenNumbers = new Set<string>()

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '') continue
    const line = i + 1
    const cells = splitLine(raw)
    const errors: string[] = []
    const warnings: string[] = []
    const get = (field: string): string => {
      const idx = fields.indexOf(field)
      return idx >= 0 ? (cells[idx] ?? '') : ''
    }

    if (!hasBottleNumber) {
      rows.push({
        line,
        raw,
        errors: [
          'No cylinder-number column found in the header row — include a column named e.g. "Bottle number" or "Cylinder".',
        ],
        warnings: [],
      })
      continue
    }

    const bottleNumber = get('bottleNumber').trim()
    if (!bottleNumber) errors.push('Missing cylinder number')

    const numberKey = bottleNumber.toLowerCase()
    if (bottleNumber && seenNumbers.has(numberKey)) {
      errors.push(`Duplicate of an earlier row (${bottleNumber})`)
    } else if (
      bottleNumber &&
      isDuplicateActiveBottleNumber(existingBottles, bottleNumber)
    ) {
      errors.push(`A cylinder numbered ${bottleNumber} already exists`)
    }

    const [refrigerantType, knownRef] = normalizeRefrigerant(get('refrigerantType'))
    if (!refrigerantType) {
      errors.push('Missing refrigerant type')
    } else if (!knownRef) {
      warnings.push(`Unknown refrigerant "${refrigerantType}" — will be added as a custom type`)
    }

    const tare = parseNumber(get('tareWeight'))
    const gross = parseNumber(get('grossWeight'))
    if (get('tareWeight') && tare == null) errors.push('Tare weight is not a number')
    if (get('grossWeight') && gross == null) errors.push('Gross weight is not a number')
    const tareKg = tare ?? 0
    const grossKg = gross ?? tareKg
    if (tare != null && gross != null && gross < tare) {
      errors.push('Gross weight is less than tare')
    }

    const lastRaw = get('lastHydroTestDate')
    const nextRaw = get('nextHydroTestDate')
    const lastHydro = parseImportDate(lastRaw)
    const nextHydro = parseImportDate(nextRaw)
    if (lastRaw && !lastHydro) warnings.push(`Could not read test date "${lastRaw}" — left blank`)
    if (nextRaw && !nextHydro) warnings.push(`Could not read next-test date "${nextRaw}" — left blank`)

    const cost = parseNumber(get('costAud'))
    const wc = parseNumber(get('waterCapacity'))

    if (errors.length === 0) {
      const net = Math.max(0, grossKg - tareKg)
      seenNumbers.add(numberKey)
      rows.push({
        line,
        raw,
        errors,
        warnings,
        data: {
          bottleNumber,
          refrigerantType,
          tareWeight: tareKg,
          grossWeight: grossKg,
          // Safe fill from W.C when given; else assume received-as-full.
          initialNetWeight:
            wc && wc > 0 ? safeFillKgFor(wc, refrigerantType) : net,
          status: 'in_stock',
          lastHydroTestDate: lastHydro ?? undefined,
          nextHydroTestDate: nextHydro ?? undefined,
          supplier: get('supplier').trim() || undefined,
          invoiceNumber: get('invoiceNumber').trim() || undefined,
          costAud: cost && cost > 0 ? Math.round(cost * 100) / 100 : undefined,
          notes: get('notes').trim() || undefined,
        },
      })
    } else {
      rows.push({ line, raw, errors, warnings })
    }
  }

  return {
    rows,
    unmatchedHeaders,
    ready: rows.filter((r) => r.data).length,
    skipped: rows.filter((r) => !r.data).length,
  }
}

// The template offered for download — the columns in the order most
// spreadsheets already have them, with one example row.
export const IMPORT_TEMPLATE_CSV =
  'Bottle number,Refrigerant,Tare (kg),Gross (kg),Last test,Next test,Supplier,Invoice,Cost ex GST,Notes\n' +
  'CYL-001,R410A,12.5,21.3,06/2024,06/2034,BOC,INV-48213,412.50,Ute 2\n'
