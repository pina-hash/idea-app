/**
 * WHERE A TOOL'S CARD GOES, so it never covers the tool it describes.
 *
 * Beside the tool first (right, then left), because the palette is a column
 * and a card above or below a tool covers its neighbors. Where neither side
 * has room (a phone, where the palette is a strip along the bottom), it falls
 * back to `anchorPosition` in `$lib/shell/anchored`, which puts the card above
 * or below and flips at the viewport's edges. Pure, so every edge is testable
 * with no DOM.
 *
 * `avoid` is the corner the feedback button claims (`cornerReserve`, ledger
 * 0396): a card beside the tool that would meet it is lifted to end a margin
 * above it, and a side that cannot be lifted that far is passed over, and the
 * fallback hands it to `anchorPosition`, which keeps clear of it on its own.
 */
import { anchorPosition, type AnchorBox, type AnchorSize } from '$lib/shell/anchored';

export interface TipPlacement { left: number; top: number; side: 'right' | 'left' | 'above' | 'below' }

export function placeTip(anchor: AnchorBox, tip: AnchorSize, viewport: AnchorSize, gap = 8, margin = 8, lane?: { left: number; right: number; top?: number; bottom?: number }, avoid: AnchorBox | null = null): TipPlacement {
	/* `lane` is the palette the tool sits in: a card beside it, above it or below it clears the whole palette, not only its own tool, so a tool in an expanded grid never has its neighbors covered. */
	const side = lane ?? anchor;
	const top = Math.max(margin, Math.min(anchor.top, viewport.height - margin - tip.height));
	/* Beside the tool, lifted off the reserved corner when it would meet it; null when even lifted it cannot stay on screen. */
	const clearOf = (left: number): number | null => {
		if (!avoid || left >= avoid.right || left + tip.width <= avoid.left || top >= avoid.bottom || top + tip.height <= avoid.top) return top;
		const lifted = avoid.top - margin - tip.height;
		return lifted >= margin ? lifted : null;
	};
	const right = side.right + gap, left = side.left - gap - tip.width;
	if (right + tip.width <= viewport.width - margin) { const t = clearOf(right); if (t !== null) return { left: right, top: t, side: 'right' }; }
	if (left >= margin) { const t = clearOf(left); if (t !== null) return { left, top: t, side: 'left' }; }
	const top0 = lane?.top ?? anchor.top, bottom0 = lane?.bottom ?? anchor.bottom;
	/* Named field by field: a DOMRect's sides are getters on its prototype, so spreading one copies nothing. */
	const p = anchorPosition({ left: anchor.left, right: anchor.right, width: anchor.width, top: top0, bottom: bottom0, height: bottom0 - top0 }, tip, viewport, { prefer: 'above', gap, margin, avoid });
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
