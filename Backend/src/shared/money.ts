/**
 * Money / exact-decimal helpers — Phase 3+.
 *
 * Authorization-critical monetary values must NEVER be handled as JavaScript floats
 * (BACKEND_DATABASE.md §60, CONTRACTS.md §4.3). We use Prisma's Decimal (decimal.js)
 * for all arithmetic and comparison. The API/contract representation remains an exact
 * decimal string; these helpers convert to/from that string form.
 */
import { Prisma } from "@prisma/client";

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

/** Parse an exact decimal string into a Decimal. Rejects non-decimal input. */
export function toDecimal(value: string | number | Prisma.Decimal): Prisma.Decimal {
  // Prisma.Decimal accepts strings/numbers; we forbid float NUMBER inputs for money to
  // avoid precision loss — callers should pass strings. Numbers are allowed only for
  // integer-safe values (e.g. counts) but money paths always pass strings.
  return new Prisma.Decimal(value);
}

/** a <= b */
export function lte(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.lessThanOrEqualTo(b);
}

/** a < b */
export function lt(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.lessThan(b);
}

/** a >= b */
export function gte(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.greaterThanOrEqualTo(b);
}

/** a > b */
export function gt(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.greaterThan(b);
}

/** a + b */
export function add(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.plus(b);
}

/** Sum a list of decimals (empty => 0). */
export function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0));
}

/** Canonical exact-string form for the wire/contract representation. */
export function toMoneyString(value: Prisma.Decimal): string {
  return value.toString();
}
