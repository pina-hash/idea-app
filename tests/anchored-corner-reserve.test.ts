import { describe, expect, it } from 'vitest';
import { anchorFitHeight, anchorPosition, anchorRooms, clearBottom, type AnchorBox } from '../src/lib/shell/anchored';

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

describe('a menu the room above the corner cannot take moves beside its key, never over it', () => {
	// The class page's row menu: 176 wide, end-aligned to its 32x44 key at the
	// row's right edge, below first, 3px gap, 8px margin. 198 tall without the
	// Unit select, 234 with it.
	const WINDOWS = [
		{ viewport: { width: 667, height: 375 }, button: { left: 505, top: 319, right: 655, bottom: 363, width: 150, height: 44 }, keyLeft: 586 },
		{ viewport: { width: 568, height: 320 }, button: { left: 406, top: 264, right: 556, bottom: 308, width: 150, height: 44 }, keyLeft: 487 },
		{ viewport: { width: 320, height: 568 }, button: { left: 143, top: 496, right: 304, bottom: 544, width: 161, height: 48 }, keyLeft: 239 },
		{ viewport: { width: 375, height: 812 }, button: { left: 198, top: 740, right: 359, bottom: 788, width: 161, height: 48 }, keyLeft: 294 },
		{ viewport: { width: 1440, height: 900 }, button: { left: 1278, top: 844, right: 1428, bottom: 888, width: 150, height: 44 }, keyLeft: 1340 }
	];
	const MENU = { prefer: 'below' as const, align: 'end' as const, gap: 3, margin: 8 };

	it('the reported case: the Engineering glossary menu at 667x375 sits to the left of its key, off the button', () => {
		const { viewport, button } = WINDOWS[0];
		const key = box(586, 125);
		const size = { width: 176, height: 198 };
		const at = anchorPosition(key, size, viewport, { ...MENU, avoid: button });
		// Clamped against the button's top it would have been drawn at 113, over
		// the key's 125 to 169; beside the key, its right edge is the key's left
		// less the gap, and it keeps the room above the button.
		expect(at.left).toBe(586 - 3 - 176);
		expect(at.top).toBe(319 - 8 - 198);
		expect(overlaps({ ...at, ...size }, key)).toBe(false);
		expect(overlaps({ ...at, ...size }, button)).toBe(false);
	});

	it('over every key position in five windows: no menu covers its key or meets the button, and the clamp alone covered keys', () => {
		let cases = 0;
		let clampCovered = 0;
		for (const { viewport, button, keyLeft } of WINDOWS) {
			for (const height of [198, 234]) {
				const size = { width: 176, height };
				// Every key whose box sits clear of the button (a key under the
				// button cannot be pressed in the first place).
				for (let y = 8; y + 44 <= viewport.height - 8; y += 4) {
					const key = box(keyLeft, y);
					if (overlaps({ left: key.left, top: key.top, width: key.width, height: key.height }, button)) continue;
					const at = anchorPosition(key, size, viewport, { ...MENU, avoid: button });
					cases += 1;
					expect(overlaps({ ...at, ...size }, key), `covers its key at ${viewport.width}x${viewport.height} y=${y} h=${height}`).toBe(false);
					expect(overlaps({ ...at, ...size }, button), `meets the button at ${viewport.width}x${viewport.height} y=${y} h=${height}`).toBe(false);
					expect(at.left).toBeGreaterThanOrEqual(8);
					expect(at.top).toBeGreaterThanOrEqual(8);
					expect(at.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
					expect(at.top + size.height).toBeLessThanOrEqual(viewport.height - 8);
					// THE POSITIVE CONTROL, by hand: the end-aligned columns cross
					// the button, so the floor is its top; a panel taller than both
					// rooms there is clamped to it, and that clamp covers the key.
					const floor = button.top;
					const below = floor - 8 - (key.bottom + 3);
					const above = Math.min(key.top - 3, floor - 8) - 8;
					const side = below < height && above > below ? 'above' : 'below';
					const raw = side === 'above' ? key.top - 3 - height : key.bottom + 3;
					const top = Math.max(8, Math.min(raw, Math.max(8, floor - 8 - height)));
					if (top < key.bottom && top + height > key.top) clampCovered += 1;
				}
			}
		}
		expect(cases, 'the sweep generated nothing').toBeGreaterThan(500);
		expect(clampCovered, 'the sweep never reached a key the clamp covers').toBeGreaterThan(20);
	});

	it('with no room beside the key either, the menu stays clear of the button and keeps its start on screen', () => {
		// A 320px window and a start-aligned panel nearly as wide as it: neither
		// side of the key nor the left of the button has the columns.
		const viewport = { width: 320, height: 568 };
		const button = { left: 143, top: 496, right: 304, bottom: 544, width: 161, height: 48 };
		const key = box(102, 300);
		const size = { width: 296, height: 400 };
		const at = anchorPosition(key, size, viewport, { prefer: 'below', align: 'start', gap: 6, margin: 12, avoid: button });
		expect(overlaps({ ...at, ...size }, button)).toBe(false);
		// Above the key (it has more room there), clamped to the top margin.
		expect(at.side).toBe('above');
		expect(at.top).toBe(12);
		expect(at.left).toBe(12);
	});
});

/**
 * INTEGRATION REVIEW 3: A PANEL WHOSE CONTENT OUTGROWS ITS ROOM. The header's
 * Quick note opened at 344px and grew to 448px once its editor loaded; at
 * 375x548 the room under its Menu key and above the feedback button is 406px,
 * so the next placement clamped it up over the key. `anchorFitHeight` is the
 * cap the action writes as `--anchor-room`; the boxes are the measured ones,
 * and every expected value is worked out here by hand.
 */
describe('anchorFitHeight: the tallest a panel may be beside its key', () => {
	// Phones: the panel spans the window, so no place off the button's columns exists.
	const QUICK_NOTE = [
		// window, the button, the key (the Menu below 560px, the Note key above), the panel width
		{ viewport: { width: 375, height: 548 }, button: { left: 198, top: 476, right: 359, bottom: 524, width: 161, height: 48 }, key: { left: 210, top: 12, right: 254, bottom: 56, width: 44, height: 44 }, width: 359 },
		{ viewport: { width: 320, height: 568 }, button: { left: 143, top: 496, right: 304, bottom: 544, width: 161, height: 48 }, key: { left: 155, top: 12, right: 199, bottom: 56, width: 44, height: 44 }, width: 304 }
	];
	// Wider windows where the panel under its Note key crosses the button's columns by a little
	// (37px at 667x375, 21px at 1024x560), measured on /dev/quick-note/s-1.
	const QUICK_NOTE_WIDE = [
		{ viewport: { width: 667, height: 375 }, button: { left: 504.6, top: 319, right: 655, bottom: 363, width: 150.4, height: 44 }, key: { left: 465.5, top: 12, right: 541.5, bottom: 56, width: 76, height: 44 }, width: 416, cssCap: 375 - 90 },
		{ viewport: { width: 1024, height: 560 }, button: { left: 862, top: 504, right: 1012, bottom: 548, width: 150, height: 44 }, key: { left: 806, top: 12, right: 883, bottom: 56, width: 77, height: 44 }, width: 416, cssCap: 560 - 90 }
	];

	it('is the room under the key, ending a margin above the button, for the Quick note on a phone', () => {
		for (const { viewport, button, key, width } of QUICK_NOTE) {
			const fit = anchorFitHeight(key, width, viewport, { prefer: 'below', align: 'end', avoid: button });
			// The button's top less the 8px margin, less the key's foot and the 6px gap.
			expect(fit).toBe(button.top - 8 - (key.bottom + 6));
			// The panel at 448 did not fit there; capped to the room it opens under its key, clear of the button.
			const size = { width, height: Math.min(448, fit) };
			const at = anchorPosition(key, size, viewport, { prefer: 'below', align: 'end', avoid: button });
			expect(at.top).toBe(key.bottom + 6);
			expect(overlaps({ ...at, ...size }, key)).toBe(false);
			expect(overlaps({ ...at, ...size }, button)).toBe(false);
			// THE POSITIVE CONTROL: uncapped, the panel could not stay under its key; it was clamped
			// up over the key.
			const tall = anchorPosition(key, { width, height: 448 }, viewport, { prefer: 'below', align: 'end', avoid: button });
			expect(tall.top === key.bottom + 6 && tall.left === at.left).toBe(false);
			expect(overlaps({ ...tall, width, height: 448 }, key)).toBe(true);
		}
	});

	/*
	 * INTEGRATION REVIEW 4: crossing the button's columns by a few pixels capped the panel to the
	 * room above the button outright, and never weighed the short move sideways `anchorPosition`
	 * itself makes. At 667x375 the Quick note opened 249px tall at [126,62,542,311], its writing box
	 * cut and Save and Open notebook out of reach; the same inputs placed left of its key, off the
	 * button's columns, give it the window's height.
	 */
	it('moves a panel crossing the corner by a little sideways, beside its key, before shortening it', () => {
		for (const { viewport, button, key, width, cssCap } of QUICK_NOTE_WIDE) {
			const options = { prefer: 'below' as const, align: 'end' as const, avoid: button };
			const fit = anchorFitHeight(key, width, viewport, options);
			// Left of the key (its right edge 6px short of the key's left) the panel misses the key's
			// columns and the button's, so it may take the window less the two margins.
			expect(fit).toBe(viewport.height - 16);
			// THE OLD ANSWER, the room under the key at its own columns, which end on the button.
			expect(button.top - 8 - (key.bottom + 6)).toBeLessThan(fit);
			// The Quick note at its own cap (448 of content, `100vh - 90px`) under that room.
			const size = { width, height: Math.min(448, cssCap, fit) };
			const at = anchorPosition(key, size, viewport, options);
			expect(at.left).toBe(key.left - 6 - width);
			expect(at.top).toBe(key.bottom + 6);
			expect(overlaps({ ...at, ...size }, key)).toBe(false);
			expect(overlaps({ ...at, ...size }, button)).toBe(false);
			// Taller than the old room: 285px at 667x375 (was 249), the whole 448 at 1024x560 (was 434).
			expect(size.height).toBeGreaterThan(button.top - 8 - (key.bottom + 6));
		}
	});

	it('counts the room below a key scrolled above the window from the top margin, never past the window', () => {
		const viewport = { width: 1440, height: 900 };
		// The home header's Note key after 200px of scroll, 170px above the window.
		const gone = { left: 1222, top: -186, right: 1298, bottom: -142, width: 76, height: 44 };
		expect(anchorRooms(gone, { left: 883, right: 1299 }, viewport).below).toBe(900 - 8 - 8);
		expect(anchorFitHeight(gone, 416, viewport, { prefer: 'below', align: 'end' })).toBe(884);
		// THE CONTROL: a key in the window still counts from its own foot.
		expect(anchorRooms(box(1222, 12, 76), { left: 883, right: 1299 }, viewport).below).toBe(900 - 8 - (56 + 6));
	});

	it('is the room ABOVE the key when that is the larger side', () => {
		const viewport = { width: 1440, height: 900 };
		const key = box(400, 700);
		// Below: 900 - 8 - (744 + 6) = 142. Above: 700 - 6 - 8 = 686.
		expect(anchorFitHeight(key, 300, viewport, { prefer: 'below' })).toBe(686);
		expect(anchorFitHeight(box(400, 100), 300, viewport, { prefer: 'below' })).toBe(900 - 8 - (144 + 6));
	});

	it('never names a cap a placement then breaks: a panel at the cap never covers its key nor meets the button', () => {
		let cases = 0;
		let coveredUncapped = 0;
		for (const { viewport, button } of [...CASES, ...QUICK_NOTE, ...QUICK_NOTE_WIDE]) {
			for (const width of [176, 300, Math.min(416, viewport.width - 16)]) {
				for (let x = 8; x + 44 <= viewport.width - 8; x += Math.round(viewport.width / 16)) {
					for (let y = 8; y + 44 <= viewport.height - 8; y += Math.round(viewport.height / 20)) {
						const key = box(x, y);
						if (overlaps({ left: key.left, top: key.top, width: key.width, height: key.height }, button)) continue;
						for (const align of ['start', 'end'] as const) {
							const options = { prefer: 'below' as const, align, avoid: button };
							const fit = anchorFitHeight(key, width, viewport, options);
							if (fit < 44) continue;
							const size = { width, height: fit };
							const at = anchorPosition(key, size, viewport, options);
							cases += 1;
							expect(overlaps({ ...at, ...size }, key), `covers its key at ${viewport.width}x${viewport.height} ${x},${y}`).toBe(false);
							expect(overlaps({ ...at, ...size }, button), `meets the button at ${viewport.width}x${viewport.height} ${x},${y}`).toBe(false);
							const tall = { width, height: viewport.height };
							const t = anchorPosition(key, tall, viewport, options);
							if (overlaps({ ...t, ...tall }, key)) coveredUncapped += 1;
						}
					}
				}
			}
		}
		expect(cases, 'the sweep generated nothing').toBeGreaterThan(1000);
		expect(coveredUncapped, 'the sweep never reached a panel too tall for its room').toBeGreaterThan(100);
	});
});
