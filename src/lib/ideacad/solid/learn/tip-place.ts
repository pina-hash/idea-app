/**
 * WHERE A TOOL'S CARD GOES, so it never covers the tool it describes.
 *
 * Beside the tool first (right, then left), because the palette is a column
 * and a card above or below a tool covers its neighbors. Where neither side
 * has room (a phone, where the palette is a strip along the bottom), it falls
 * back to `anchorPosition` in `$lib/shell/anchored`, which puts the card above
 * or below and flips at the viewport's edges. Pure, so every edge is testable
 * with no DOM.
 */
import { anchorPosition, type AnchorBox, type AnchorSize } from '$lib/shell/anchored';

export interface TipPlacement { left: number; top: number; side: 'right' | 'left' | 'above' | 'below' }

export function placeTip(anchor: AnchorBox, tip: AnchorSize, viewport: AnchorSize, gap = 8, margin = 8): TipPlacement {
	const top = Math.max(margin, Math.min(anchor.top, viewport.height - margin - tip.height));
	if (anchor.right + gap + tip.width <= viewport.width - margin) return { left: anchor.right + gap, top, side: 'right' };
	if (anchor.left - gap - tip.width >= margin) return { left: anchor.left - gap - tip.width, top, side: 'left' };
	const p = anchorPosition(anchor, tip, viewport, { prefer: 'above', gap, margin });
	return { left: p.left, top: p.top, side: p.side };
}

/** A CSS time (`400ms`, `0.4s`) in milliseconds, or the fallback when it is not one. */
export function cssTimeMs(value: string | null | undefined, fallback: number): number {
	const m = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/i.exec(value ?? '');
	if (!m) return fallback;
	const n = Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** A tool's name as the palette hands it ("Rectangle (R)") split into the name and the shortcut. */
export function splitShortcut(name: string): { name: string; shortcut: string | null } {
	const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(name);
	return m ? { name: m[1], shortcut: m[2] } : { name, shortcut: null };
}
