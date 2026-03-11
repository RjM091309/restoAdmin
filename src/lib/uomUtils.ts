/**
 * UOM (Unit of Measure) utilities for ingredients.
 * - Whole: pcs, box, pack, bottle, jar, can, bag, head, bunch, cup
 * - Decimal: kg, g, L, mL (4 decimal places for computation consistency)
 */

/** Decimal units (weight/volume) — use 4 decimal places */
const DECIMAL_UNITS = new Set(['kg', 'g', 'l', 'ml']);

/** Whole/count units — no decimals */
const WHOLE_NUMBER_UNITS = new Set([
  'pcs', 'box', 'pack', 'bottle', 'jar', 'can', 'bag', 'head', 'bunch', 'cup',
]);

/** All UOM options for selection, grouped: whole first, then decimal */
export const UOM_OPTIONS = [
  'pcs', 'box', 'pack', 'bottle', 'jar', 'can', 'bag', 'head', 'bunch', 'cup',
  'kg', 'g', 'L', 'mL',
] as const;

/** Decimal places for display (aligned with DB precision) */
const DECIMAL_PLACES = 4;

/** Normalize unit for comparison (lowercase, trimmed) */
function normalizeUnit(unit: string): string {
  return String(unit || 'pcs').toLowerCase().trim();
}

/** Display label for unit — matches backend VALID_UNITS (lowercase) */
export function getUnitLabel(unit: string): string {
  const u = normalizeUnit(unit);
  return u || 'pcs';
}

export function isDecimalUnit(unit: string): boolean {
  return DECIMAL_UNITS.has(normalizeUnit(unit));
}

export function isWholeNumberUnit(unit: string): boolean {
  const u = normalizeUnit(unit);
  return WHOLE_NUMBER_UNITS.has(u) || !DECIMAL_UNITS.has(u);
}

/** Input step: 1 for whole, 0.0001 for decimal */
export function getQtyInputStep(unit: string): string {
  return isDecimalUnit(unit) ? '0.0001' : '1';
}

/** Decimal places for display: 0 for whole, 4 for kg/g/L/mL */
export function getQtyDecimalPlaces(unit: string): number {
  return isDecimalUnit(unit) ? DECIMAL_PLACES : 0;
}

/** Format quantity for display based on UOM */
export function formatQty(value: number | null | undefined, unit: string): string {
  const n = Number.isFinite(value) ? Number(value) : 0;
  const places = getQtyDecimalPlaces(unit);
  if (places === 0) return String(Math.round(n));
  // For decimal units: strip trailing zeros so 3, 100, 0.5 look clean
  return parseFloat(n.toFixed(places)).toString();
}

/** Valid unit values for backend validation (lowercase) */
export const VALID_UNITS = [...WHOLE_NUMBER_UNITS, ...DECIMAL_UNITS];
