/**
 * True when a value is unset (null/undefined/"").
 */
export function blank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}
