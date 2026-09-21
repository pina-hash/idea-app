/**
 * APPEARANCE: what colour a body is drawn in, and why. One decision, read by
 * the viewport and by the appearance panel, so the swatch beside a body and
 * the shade on screen cannot disagree.
 *
 * THIS MODULE IS THE MATERIALS-AND-COLOUR SURFACE'S. A material's own colour
 * lives on `StockMaterial.color` in `advisory.ts`; a body's override is
 * `BodyRecord.color`; this file says which wins and what the panel says about it.
 *
 * THREE RUNGS, IN ORDER, AND THE PANEL SAYS WHICH ONE APPLIES IN WORDS:
 *   1. the body's own colour (`BodyRecord.color`, `#rrggbb`), set from the
 *      palette below or typed as hex -- "Drawn in the body's own colour";
 *   2. the material's colour (`STOCK_MATERIALS[*].color`) -- "Drawn in <material>'s colour";
 *   3. machined stock, `DEFAULT_BODY_COLOUR` -- "No material: drawn as machined stock".
 * The viewport applies the same three rungs through `bodyColour` with the
 * material colours it was handed at mount (`viewport.materialColours`), so the
 * sentence and the shade are two readings of one rule.
 *
 * A COLOUR IS NEVER A DENSITY. Every stock material has a colour because a
 * colour is decoration and costs no citation; whether its density may be
 * multiplied by is `hasCitedDensity` in `advisory.ts`, a separate question
 * this module never answers.
 */
import { STOCK_MATERIALS, type StockMaterial } from './advisory';
import type { BodyProjection } from './types';

/** Machined stock, when neither the body nor its material says otherwise. */
export const DEFAULT_BODY_COLOUR = '#91a2ad';

/** The colour a body is drawn in: its own override, else its material's colour, else machined stock. */
export function bodyColour(body: Pick<BodyProjection, 'color' | 'materialId'>, materialColour?: string | null): string {
	return body.color ?? materialColour ?? DEFAULT_BODY_COLOUR;
}

/** The colour a stock material draws in, or null for no material and for an id no row carries (a document saved against a retired id draws as machined stock). */
export function materialColourFor(materialId: string | null | undefined): string | null {
	if (!materialId) return null;
	return STOCK_MATERIALS.find((m) => m.id === materialId)?.color ?? null;
}

/**
 * THE OVERRIDE PALETTE: a small set of named swatches. Each carries a WORD,
 * because a swatch is a control and colour is never the only signal; the
 * word is what the panel prints beside the chip and what the sentence names.
 * Ids are stable and greppable; the hex is what lands in `BodyRecord.color`.
 */
export interface PaletteColour { id: string; name: string; hex: string }
export const BODY_COLOUR_PALETTE: readonly PaletteColour[] = [
	{ id: 'signal-red', name: 'Signal red', hex: '#d24a3a' },
	{ id: 'safety-orange', name: 'Safety orange', hex: '#e8813a' },
	{ id: 'brass', name: 'Brass', hex: '#c9a54a' },
	{ id: 'forest-green', name: 'Forest green', hex: '#4f9a5c' },
	{ id: 'sky-blue', name: 'Sky blue', hex: '#4c9ad6' },
	{ id: 'violet', name: 'Violet', hex: '#8d6ac9' },
	{ id: 'charcoal', name: 'Charcoal', hex: '#4a4f54' },
	{ id: 'bone-white', name: 'Bone white', hex: '#ece7db' }
];

/**
 * A typed colour, normalised to the `#rrggbb` lowercase form the reducer
 * stores, or null when it is not one. Accepts the six-digit form with or
 * without its `#`, and the three-digit shorthand a student may know from
 * CSS. It is a parser, not a gate: the reducer re-checks the shape itself.
 */
export function parseHexColour(input: string): string | null {
	const text = input.trim().toLowerCase().replace(/^#/, '');
	if (/^[0-9a-f]{6}$/.test(text)) return `#${text}`;
	if (/^[0-9a-f]{3}$/.test(text)) return `#${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`;
	return null;
}

/** The palette word for a stored colour, or the hex itself when it is not a palette colour. */
export function colourName(hex: string): string {
	return BODY_COLOUR_PALETTE.find((c) => c.hex === hex.toLowerCase())?.name ?? hex.toLowerCase();
}

/**
 * The sentence the panel shows, saying which rung of `bodyColour` applies.
 * `material` is the body's material row, or undefined for no material and for
 * an id no row carries, which draws as machined stock exactly as no material does.
 */
export function describeAppearance(body: Pick<BodyProjection, 'color' | 'materialId'>, material: Pick<StockMaterial, 'name'> | undefined): string {
	if (body.color) return material ? `Drawn in the body's own colour, overriding ${material.name}` : "Drawn in the body's own colour";
	if (material) return `Drawn in ${material.name}'s colour`;
	return body.materialId ? 'Unknown material: drawn as machined stock' : 'No material: drawn as machined stock';
}
