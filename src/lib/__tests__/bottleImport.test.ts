import { describe, expect, it } from 'vitest'
import {
  IMPORT_TEMPLATE_CSV,
  normalizeRefrigerant,
  parseBottleImport,
  parseImportDate,
} from '../bottleImport'
import { makeBottle } from './fixtures'

describe('parseImportDate', () => {
  it('reads the formats spreadsheets actually produce', () => {
    expect(parseImportDate('2026-06-18')).toBe('2026-06-18')
    expect(parseImportDate('18/06/2026')).toBe('2026-06-18')
    expect(parseImportDate('8/6/2026')).toBe('2026-06-08')
    expect(parseImportDate('18-06-2026')).toBe('2026-06-18')
    expect(parseImportDate('06/2026')).toBe('2026-06-01')
    expect(parseImportDate('2026-6')).toBe('2026-06-01')
    expect(parseImportDate('June next year')).toBeNull()
    expect(parseImportDate('')).toBeNull()
  })
})

describe('normalizeRefrigerant', () => {
  it('folds spreadsheet spellings onto the app naming', () => {
    expect(normalizeRefrigerant('r410a')).toEqual(['R410A', true])
    expect(normalizeRefrigerant('R-410a')).toEqual(['R410A', true])
    expect(normalizeRefrigerant(' r 32 ')).toEqual(['R32', true])
    expect(normalizeRefrigerant('R-999X')).toEqual(['R999X', false])
  })
})

describe('parseBottleImport', () => {
  it('parses the shipped template', () => {
    const out = parseBottleImport(IMPORT_TEMPLATE_CSV, [])
    expect(out.ready).toBe(1)
    expect(out.skipped).toBe(0)
    expect(out.unmatchedHeaders).toEqual([])
    const b = out.rows[0].data!
    expect(b.bottleNumber).toBe('CYL-001')
    expect(b.refrigerantType).toBe('R410A')
    expect(b.tareWeight).toBe(12.5)
    expect(b.grossWeight).toBe(21.3)
    expect(b.lastHydroTestDate).toBe('2024-06-01')
    expect(b.nextHydroTestDate).toBe('2034-06-01')
    expect(b.supplier).toBe('BOC')
    expect(b.costAud).toBe(412.5)
    expect(b.status).toBe('in_stock')
  })

  it('accepts tab-separated Excel paste with synonym headers', () => {
    const text =
      'Cylinder\tGas\tTare weight\tGross weight\n' +
      'B-9\tr32\t10 kg\t19 kg\n'
    const out = parseBottleImport(text, [])
    expect(out.ready).toBe(1)
    const b = out.rows[0].data!
    expect(b.bottleNumber).toBe('B-9')
    expect(b.refrigerantType).toBe('R32')
    expect(b.tareWeight).toBe(10)
    expect(b.grossWeight).toBe(19)
    expect(b.initialNetWeight).toBe(9)
  })

  it('skips duplicates within the file and against existing active bottles', () => {
    const existing = [makeBottle({ bottleNumber: 'B-1', status: 'in_stock' })]
    const text =
      'Bottle number,Refrigerant,Tare (kg),Gross (kg)\n' +
      'B-1,R32,10,19\n' + // exists already
      'B-2,R32,10,19\n' +
      'b-2,R32,10,19\n' // duplicate within the file (case-insensitive)
    const out = parseBottleImport(text, existing)
    expect(out.ready).toBe(1)
    expect(out.skipped).toBe(2)
    expect(out.rows[0].errors[0]).toMatch(/already exists/)
    expect(out.rows[2].errors[0]).toMatch(/Duplicate of an earlier row/)
  })

  it('allows re-using the number of a returned/sold cylinder', () => {
    const existing = [makeBottle({ bottleNumber: 'B-1', status: 'returned' })]
    const out = parseBottleImport(
      'Bottle number,Refrigerant,Tare,Gross\nB-1,R32,10,19\n',
      existing,
    )
    expect(out.ready).toBe(1)
  })

  it('errors clearly with no cylinder-number column, flags unknown headers', () => {
    const out = parseBottleImport('Colour,Smell\nred,fine\n', [])
    expect(out.ready).toBe(0)
    expect(out.rows[0].errors[0]).toMatch(/No cylinder-number column/)
    expect(out.unmatchedHeaders).toEqual(['Colour', 'Smell'])
  })

  it('imports unknown refrigerants with a warning, rejects gross < tare', () => {
    const out = parseBottleImport(
      'Bottle number,Refrigerant,Tare,Gross\n' +
        'B-1,R999X,10,19\n' +
        'B-2,R32,19,10\n',
      [],
    )
    expect(out.rows[0].data).toBeTruthy()
    expect(out.rows[0].warnings[0]).toMatch(/Unknown refrigerant "R999X"/)
    expect(out.rows[1].errors[0]).toMatch(/Gross weight is less than tare/)
  })

  it('handles quoted CSV cells with commas', () => {
    const out = parseBottleImport(
      'Bottle number,Refrigerant,Tare,Gross,Notes\n' +
        'B-1,R32,10,19,"Ute 2, back rack"\n',
      [],
    )
    expect(out.ready).toBe(1)
    expect(out.rows[0].data!.notes).toBe('Ute 2, back rack')
  })
})
