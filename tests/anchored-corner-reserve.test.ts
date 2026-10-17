import { describe, expect, it } from 'vitest';
import { anchorPosition, anchorRooms, clearBottom, type AnchorBox } from '../src/lib/shell/anchored';

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

/**
 * INTEGRATION REVIEW 2, TWO HOLES THE FIRST ROUND LEFT. The boxes are the ones
 * measured in the browser at each window: the feedback button's wrapper, the
 * Sections key and the class page's row menu key and panel. Every expected
 * value is worked out here from those boxes by hand, never by calling the
 * function under test.
 */
describe('the room ABOVE a key ends at a corner its panel crosses', () => {
	// The Sections menu, flush with the window's foot (scrollIntoView block end):
	// start-aligned at the key's left, 12px margin, 6px gap.
	const SECTIONS = [
		{ viewport: { width: 375, height: 740 }, button: { left: 198, top: 668, right: 359, bottom: 716, width: 161, height: 48 }, key: { left: 102, top: 696, right: 198, bottom: 740, width: 96, height: 44 }, width: 351, left: 12 },
		{ viewport: { width: 320, height: 568 }, button: { left: 143, top: 496, right: 304, bottom: 544, width: 161, height: 48 }, key: { left: 102, top: 524, right: 198, bottom: 568, width: 96, height: 44 }, width: 296, left: 12 },
		{ viewport: { width: 667, height: 375 }, button: { left: 505, top: 319, right: 655, bottom: 363, width: 150, height: 44 }, key: { left: 102, top: 331, right: 198, bottom: 375, width: 96, height: 44 }, width: 512, left: 102 }
	];

	it('measures the room above as ending a margin above the button, not at the key', () => {
		const [phone] = SECTIONS;
		const span = { left: 12, right: 363 };
		const room = anchorRooms(phone.key, span, phone.viewport, { gap: 6, margin: 12, avoid: phone.button });
		// min(696 - 6, 668 - 12) - 12: the panel's foot stops at 656, 12px above the button.
		expect(room.above).toBe(644);
		expect(room.below).toBe(668 - 12 - (740 + 6));
		expect(room.floor).toBe(668);
		// With no corner, or columns that miss it, the key is the limit again.
		expect(anchorRooms(phone.key, span, phone.viewport, { gap: 6, margin: 12 }).above).toBe(696 - 6 - 12);
		expect(anchorRooms(phone.key, { left: 12, right: 190 }, phone.viewport, { gap: 6, margin: 12, avoid: phone.button }).above).toBe(696 - 6 - 12);
	});

	it('a panel sized to that room opens above its key with Done clear of the button, where the old room ran under it', () => {
		let cases = 0;
		let underBefore = 0;
		// `left` is where the panel's columns measured in the browser: pulled in
		// to the margin on a phone, at the key's own left at 667.
		for (const { viewport, button, key, width, left } of SECTIONS) {
			const room = anchorRooms(key, { left, right: left + width }, viewport, { gap: 6, margin: 12, avoid: button });
			const size = { width, height: room.above };
			const at = anchorPosition(key, size, viewport, { prefer: 'below', align: 'start', gap: 6, margin: 12, avoid: button });
			cases += 1;
			expect(at.side).toBe('above');
			expect(at.left).toBe(left);
			expect(at.top + size.height).toBeLessThanOrEqual(button.top - 12);
			expect(overlaps({ ...at, ...size }, button)).toBe(false);
			expect(overlaps({ ...at, ...size }, key)).toBe(false);
			// THE POSITIVE CONTROL: the room the menu measured before, the key's
			// top less the gap and the margin, makes a panel that runs under the
			// button at the same placement rule. So the fix is the room, and this
			// sweep does reach the case.
			const oldSize = { width, height: key.top - 12 - 6 };
			const old = anchorPosition(key, oldSize, viewport, { prefer: 'below', align: 'start', gap: 6, margin: 12, avoid: button });
			if (overlaps({ ...old, ...oldSize }, button)) underBefore += 1;
		}
		expect(cases).toBe(3);
		expect(underBefore).toBe(3);
	});
});
