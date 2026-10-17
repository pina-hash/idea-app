import { describe, expect, it } from 'vitest';
import { anchorPosition, clearBottom, type AnchorBox } from '../src/lib/shell/anchored';

/**
 * A POPOVER NEVER OPENS UNDER THE CORNER FEEDBACK BUTTON (ledger 0396).
 *
 * The button floats over every page at z-index 90, and a panel placed by
 * `anchored` inside `main` (a stacking context at 1) is always painted under
 * it: the class page's row menu had its Unit select covered, and the student
 * page's Sections menu its Show all and Done keys, with a tap on Done opening
 * the feedback window. `avoid` is the corner's box; the boxes below are the
 * button's measured ones at 1440x900 and 375x812.
 */

const box = (left: number, top: number, width = 32, height = 44): AnchorBox => ({
	left,
	top,
	right: left + width,
	bottom: top + height,
	width,
	height
});

const overlaps = (a: { left: number; top: number; width: number; height: number }, b: AnchorBox) =>
	Math.min(a.left + a.width, b.right) - Math.max(a.left, b.left) > 0 &&
	Math.min(a.top + a.height, b.bottom) - Math.max(a.top, b.top) > 0;

const CASES = [
	{ viewport: { width: 1440, height: 900 }, button: { left: 1278, top: 844, right: 1428, bottom: 888, width: 150, height: 44 } },
	{ viewport: { width: 375, height: 812 }, button: { left: 198, top: 740, right: 359, bottom: 788, width: 161, height: 48 } }
];
// The row menu (176x198, end-aligned to its key, below first) and the Sections
// menu (start-aligned, below first) at their measured sizes.
const PANELS = [
	{ size: { width: 176, height: 198 }, options: { prefer: 'below' as const, align: 'end' as const, gap: 3 } },
	{ size: { width: 351, height: 300 }, options: { prefer: 'below' as const, align: 'start' as const, gap: 6, margin: 12 } }
];

describe('anchorPosition keeps clear of a reserved corner', () => {
	it('places no panel under the button wherever its key sits, and the same sweep without it does', () => {
		let cases = 0;
		let under = 0;
		let underWithout = 0;
		for (const { viewport, button } of CASES) {
			for (const { size, options } of PANELS) {
				if (size.width > viewport.width - 24) continue;
				for (let x = 8; x <= viewport.width - 40; x += Math.round(viewport.width / 24)) {
					// Keys anywhere ABOVE the button's band: a key inside the band
					// beside the button is the case the next test covers.
					for (let y = 8; y <= button.top - 52; y += Math.round(viewport.height / 24)) {
						const key = box(x, y);
						const at = anchorPosition(key, size, viewport, { ...options, avoid: button });
						const plain = anchorPosition(key, size, viewport, options);
						cases += 1;
						if (overlaps({ ...at, ...size }, button)) under += 1;
						if (overlaps({ ...plain, ...size }, button)) underWithout += 1;
						// Still on screen, as every placement must be.
						expect(at.left).toBeGreaterThanOrEqual(8);
						expect(at.top).toBeGreaterThanOrEqual(8);
						expect(at.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
						expect(at.top + size.height).toBeLessThanOrEqual(viewport.height - 8);
					}
				}
			}
		}
		expect(cases, 'the sweep generated nothing').toBeGreaterThan(1000);
		expect(under, 'a panel landed under the button').toBe(0);
		// The positive control: the sweep does reach the corner, so the zero
		// above is the rule working, not a sweep that never got near it.
		expect(underWithout).toBeGreaterThan(20);
	});

	it('opens a menu above its key when the key is near the bottom edge over the button', () => {
		const { viewport, button } = CASES[0];
		const key = box(1302, 806);
		const at = anchorPosition(key, { width: 176, height: 198 }, viewport, { prefer: 'below', align: 'end', gap: 3, avoid: button });
		expect(at.side).toBe('above');
		expect(at.top + 198).toBeLessThanOrEqual(key.top);
	});

	it('moves a panel too tall for the room above the corner sideways off it, when the window has the columns', () => {
		const viewport = { width: 1440, height: 400 };
		const button = { left: 1278, top: 344, right: 1428, bottom: 388, width: 150, height: 44 };
		const at = anchorPosition(box(1380, 100), { width: 200, height: 360 }, viewport, { prefer: 'below', align: 'end', avoid: button });
		expect(overlaps({ ...at, width: 200, height: 360 }, button)).toBe(false);
		expect(at.left + 200).toBeLessThanOrEqual(button.left);
	});

	it('changes nothing for a panel whose columns miss the corner, or with no corner', () => {
		const { viewport, button } = CASES[0];
		const key = box(200, 800);
		const size = { width: 300, height: 120 };
		expect(anchorPosition(key, size, viewport, { prefer: 'below', avoid: button })).toEqual(anchorPosition(key, size, viewport, { prefer: 'below' }));
		expect(clearBottom({ left: 100, right: 400 }, 900, button)).toBe(900);
		expect(clearBottom({ left: 1200, right: 1300 }, 900, button)).toBe(844);
		expect(clearBottom({ left: 1200, right: 1300 }, 900, null)).toBe(900);
	});
});
