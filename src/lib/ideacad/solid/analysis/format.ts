/**
 * HOW THE ANALYSIS PANEL WRITES A NUMBER. Pure, so a test can read the exact
 * string a student reads. A number is shown to the precision its source
 * supports and no further, with its unit, and a value the arithmetic could not
 * give (a division by zero) is a word, never "NaN" or "Infinity".
 */
import { G_PER_LB } from './mass';
export type LengthUnit = 'in' | 'mm';
export const MM_PER_IN = 25.4;

const group = (n: number, digits: number) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Three significant figures, grouped, and never an exponent a student has to decode. */
export function sig(n: number, figures = 3): string {
	if (!Number.isFinite(n)) return 'Undefined';
	if (n === 0) return '0';
	const a = Math.abs(n);
	if (a >= 10 ** figures) return group(n, 0);
	/* Decimals to show that many figures, and at most 12, which is where toLocaleString stops. */
	return group(n, Math.min(12, Math.max(0, figures - 1 - Math.floor(Math.log10(a)))));
}
export function grams(g: number): string { return `${group(g, g >= 100 ? 0 : g >= 10 ? 1 : 2)} g`; }
export function pounds(g: number): string { const lb = g / G_PER_LB; return `${group(lb, lb >= 10 ? 1 : lb >= 1 ? 2 : 3)} lb`; }
export function length(inches: number, unit: LengthUnit = 'in'): string {
	if (!Number.isFinite(inches)) return 'Undefined';
	return unit === 'mm' ? `${group(inches * MM_PER_IN, 2)} mm` : `${group(inches, 3)} in`;
}
export function volume(in3: number, unit: LengthUnit = 'in'): string {
	return unit === 'mm' ? `${sig(in3 * MM_PER_IN ** 3)} mm³` : `${sig(in3)} in³`;
}
/** Three coordinates, joined, with no unit (the caller writes it once). `decimals` counts inches; millimeters get one fewer. */
export function point(p: readonly number[], unit: LengthUnit = 'in', decimals = 3): string {
	const k = unit === 'mm' ? MM_PER_IN : 1, d = unit === 'mm' ? decimals - 1 : decimals;
	return p.slice(0, 3).map((n) => group(n * k, d)).join(', ');
}
export const percent = (fraction: number) => `${group(fraction * 100, fraction >= 0.1 ? 0 : 1)}%`;
export const degrees = (deg: number) => (Number.isFinite(deg) ? `${group(deg, 1)}°` : 'Undefined');
