// All weights are stored internally as kilograms.
// Display + entry units come from app settings.

export type WeightUnit = 'kg' | 'lb'

const KG_PER_LB = 0.45359237

// Round to 3 decimal places of a kilogram (1 g resolution).
// Avoids long binary-float tails like 1.5875732949999998 from creeping
// into stored values or downstream arithmetic.
export function roundKg(kg: number): number {
  if (!isFinite(kg)) return 0
  return Math.round(kg * 1000) / 1000
}

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return roundKg(unit === 'kg' ? value : value * KG_PER_LB)
}

export function formatWeight(
  kg: number,
  unit: WeightUnit,
  digits: number = 2,
): string {
  return `${kgToDisplay(kg, unit).toFixed(digits)} ${unit}`
}

export function formatWeightShort(kg: number, unit: WeightUnit): string {
  return kgToDisplay(kg, unit).toFixed(2)
}
