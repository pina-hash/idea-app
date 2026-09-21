/**
 * APPEARANCE: what colour a body is drawn in, and why. One decision, read by
 * the viewport and by the appearance panel, so the swatch beside a body and
 * the shade on screen cannot disagree.
 *
 * THIS MODULE IS THE MATERIALS-AND-COLOUR SURFACE'S. A material's own colour
 * lives on `StockMaterial.color` in `advisory.ts`; a body's override is
 * `BodyRecord.color`; this file says which wins and what the panel says about it.
 */
import type { BodyProjection } from './types';

/** Machined stock, when neither the body nor its material says otherwise. */
export const DEFAULT_BODY_COLOUR = '#91a2ad';

/** The colour a body is drawn in: its own override, else its material's colour, else machined stock. */
export function bodyColour(body: Pick<BodyProjection, 'color' | 'materialId'>, materialColour?: string | null): string {
	return body.color ?? materialColour ?? DEFAULT_BODY_COLOUR;
}
