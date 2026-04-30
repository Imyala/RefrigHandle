// All weights are stored internally as kilograms.
// Display + entry units come from app settings.

export type WeightUnit = 'kg' | 'lb'

const KG_PER_LB = 0.45359237

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB
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
