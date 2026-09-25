// tests/ideacad-context-submenu.test.ts
//
// WHERE A RIGHT-CLICK ROW'S LIST OPENS (report R04, ledger 0298). Two things
// here fail SILENTLY for the person who would notice: a phone or a touch screen
// handed the desktop flyout gets a list running off the side of the screen,
// which nobody at a desk ever sees; and a list placed on the wrong axis (the
// placement is `anchorPosition` with its axes swapped) lands on top of the
// menu it came from or off the window's edge only at the edges nobody opens a
// menu near. The expected numbers are worked out by hand from the boxes, never
// by calling `anchorPosition`, so a mistake in the swap cannot agree with itself.
import { describe, expect, it } from 'vitest';
import { MENU_MARGIN, MENU_MAX_WIDTH, submenuLayout, submenuPlacement } from '../src/lib/ideacad/solid/context-menu';

describe('beside or in place', () => {
	it('a finger always gets the list in place, at any width', () => {
		for (const width of [375, 1440, 2560]) expect(submenuLayout(false, { left: 40, right: 280 }, width)).toBe('inline');
	});
	it('a mouse gets the list beside the menu when one side has room for the widest list', () => {
		expect(submenuLayout(true, { left: 40, right: 280 }, 1440)).toBe('side');
		/* A menu at the right edge still has the whole left side. */
		expect(submenuLayout(true, { left: 1150, right: 1432 }, 1440)).toBe('side');
		/* Exactly the room the widest list needs, on the right: 280 + 320 + 8 = 608. */
		expect(submenuLayout(true, { left: 40, right: 280 }, 280 + MENU_MAX_WIDTH + MENU_MARGIN)).toBe('side');
	});
	it('a mouse in a window with no room on either side keeps the list in place', () => {
		/* A phone-width window: 375 - 8 - 248 = 119 on the right, 8 - 8 = 0 on the left. */
		expect(submenuLayout(true, { left: 8, right: 248 }, 375)).toBe('inline');
		/* One pixel short on both sides. */
		expect(submenuLayout(true, { left: 327, right: 600 }, 600 + MENU_MARGIN + MENU_MAX_WIDTH - 1)).toBe('inline');
	});
});

describe('where the list beside the menu goes', () => {
	const viewport = { width: 1440, height: 900 };
	const list = { width: 220, height: 240 };
	it('to the right of the menu, its first row level with the row that opened it', () => {
		/* Menu from x 40 to 280; the row spans y 170 to 214; the list's first row sits 5px inside its frame. */
		const p = submenuPlacement({ top: 170, bottom: 214 }, { left: 40, right: 280 }, list, viewport, 5);
		expect(p).toEqual({ left: 280, top: 165, side: 'right', align: 'start' });
		/* Room on BOTH sides (600 px left, 592 right): the right wins, as desktop menus open. */
		expect(submenuPlacement({ top: 170, bottom: 214 }, { left: 608, right: 840 }, list, viewport, 5)).toEqual({ left: 840, top: 165, side: 'right', align: 'start' });
	});
	it('flips to the LEFT of the menu at the window\'s right edge, and never covers the menu', () => {
		/* Menu from x 1150 to 1432: 1440 - 8 - 1432 = 0 px on the right, so the list ends at the menu's left edge. */
		const p = submenuPlacement({ top: 170, bottom: 214 }, { left: 1150, right: 1432 }, list, viewport, 5);
		expect(p).toEqual({ left: 1150 - 220, top: 165, side: 'left', align: 'start' });
		expect(p.left + list.width).toBeLessThanOrEqual(1150);
	});
	it('near the window\'s foot it flips up, its LAST row level with the row, and stays on screen', () => {
		/* Row y 800 to 844 in a 900 window: 165-style alignment would end at 1035, past 892. It ends at 844 + 5 instead. */
		const p = submenuPlacement({ top: 800, bottom: 844 }, { left: 40, right: 280 }, list, viewport, 5);
		expect(p).toEqual({ left: 280, top: 844 + 5 - 240, side: 'right', align: 'end' });
		expect(p.top + list.height).toBeLessThanOrEqual(viewport.height - MENU_MARGIN);
	});
	it('a list taller than the window starts at the top margin rather than off the top', () => {
		const p = submenuPlacement({ top: 400, bottom: 444 }, { left: 40, right: 280 }, { width: 220, height: 2000 }, viewport, 5);
		expect(p.top).toBe(MENU_MARGIN);
		expect(p.side).toBe('right');
	});
});
