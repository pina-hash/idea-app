import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { submenuPlacement } from '../src/lib/ideacad/solid/context-menu';
import { placeTip } from '../src/lib/ideacad/solid/learn/tip-place';
import type { AnchorBox } from '../src/lib/shell/anchored';

/**
 * EVERY PANEL PLACED WITH `$lib/shell/anchored`'s ARITHMETIC KEEPS CLEAR OF THE
 * CORNER FEEDBACK BUTTON, NOT ONLY THE ONES THE ACTION PLACES (ledger 0396,
 * integration review 3).
 *
 * The action reads the reserve live; a component that called `anchorPosition`
 * itself passed no `avoid`, so IdeaCAD's right-click menu opened at (1325,656)
 * in a 1440x900 window drew its Search commands row under the button (it
 * hit-tested as the button at 90% of its width), and the same at 960x800 and on
 * a phone. Those callers now go through `anchorInWindow`, which reads the
 * reserve unless told otherwise, and the two pure placements built on
 * `anchorPosition` (a list beside the menu, a tool's card) take an `avoid` that
 * their components fill with `cornerReserve()`. This sweep holds that over the
 * whole tree, so a new direct caller cannot quietly be the hole again.
 */

const SRC = join(__dirname, '..', 'src');
const ANCHORED = 'lib/shell/anchored.ts';

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(p);
	}
	return out;
}

/** Comments out, string contents kept (an option name inside a template literal is still code). */
function stripComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length)).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** The argument text of every CALL of `name(` (not its declaration or an import), balanced. */
function calls(text: string, name: string): { args: string; line: number }[] {
	const out: { args: string; line: number }[] = [];
	const re = new RegExp(`(?<![\\w.$])${name}\\(`, 'g');
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		const before = text.slice(Math.max(0, m.index - 9), m.index);
		if (/function\s*$/.test(before)) continue;
		let depth = 1;
		let i = m.index + m[0].length;
		for (; i < text.length && depth > 0; i++) {
			if (text[i] === '(') depth++;
			else if (text[i] === ')') depth--;
		}
		out.push({ args: text.slice(m.index + m[0].length, i - 1), line: text.slice(0, m.index).split('\n').length });
	}
	return out;
}

/**
 * The calls allowed to leave `avoid` out, each with the reason somebody checked.
 * Keyed by file; the count is exact, so a second such call in a listed file is
 * still looked at.
 */
const NO_AVOID: Record<string, { count: number; reason: string }> = {
	'lib/classroom/StudentSectionsMenu.svelte': {
		count: 1,
		reason: 'a zero-height call read only for its columns (`left`), which anchorRooms then measures WITH the reserve; the panel itself is placed by the action, which keeps clear'
	}
};

const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split('\\').join('/'), text: stripComments(readFileSync(p, 'utf8')) }));

describe('every direct caller of the anchored arithmetic keeps clear of the corner button', () => {
	it('names `avoid` in every anchorPosition call outside the module, but the listed ones', () => {
		let seen = 0;
		const missing: string[] = [];
		const allowed: Record<string, number> = {};
		for (const { rel, text } of files) {
			if (rel === ANCHORED) continue;
			for (const c of calls(text, 'anchorPosition')) {
				seen += 1;
				if (/\bavoid\b/.test(c.args)) continue;
				if (NO_AVOID[rel]) allowed[rel] = (allowed[rel] ?? 0) + 1;
				else missing.push(`${rel}:${c.line}`);
			}
		}
		expect(missing, 'an anchorPosition call with no avoid (use anchorInWindow, or pass cornerReserve())').toEqual([]);
		for (const [rel, { count }] of Object.entries(NO_AVOID)) expect(allowed[rel] ?? 0, `${rel}: the listed exception`).toBe(count);
		// The sweep found the callers it is about: IdeaCAD's submenu and tool card, and the Sections menu.
		expect(seen, 'the sweep found no anchorPosition call').toBeGreaterThanOrEqual(3);
	});

	it('never turns the reserve off through anchorInWindow, and the IdeaCAD panels and the roster card use it', () => {
		const users = new Set<string>();
		const off: string[] = [];
		for (const { rel, text } of files) {
			for (const c of calls(text, 'anchorInWindow')) {
				users.add(rel);
				if (/\bavoid\s*:\s*null\b/.test(c.args)) off.push(`${rel}:${c.line}`);
			}
		}
		expect(off).toEqual([]);
		for (const rel of [
			'lib/ideacad/solid/ContextMenu.svelte',
			'lib/ideacad/solid/tree/RowMenu.svelte',
			'lib/ideacad/solid/CommandSearch.svelte',
			'lib/ideacad/solid/ContextBar.svelte',
			'lib/classroom/RosterCard.svelte'
		]) {
			expect(users.has(rel), `${rel} places its panel through anchorInWindow`).toBe(true);
		}
	});

	it('hands the live reserve to the two pure placements wherever a component calls them', () => {
		let seen = 0;
		const missing: string[] = [];
		for (const { rel, text } of files) {
			if (!rel.endsWith('.svelte')) continue;
			for (const name of ['submenuPlacement', 'placeTip']) {
				for (const c of calls(text, name)) {
					seen += 1;
					if (!/cornerReserve\(\)/.test(c.args)) missing.push(`${rel}:${c.line} ${name}`);
				}
			}
		}
		expect(missing).toEqual([]);
		expect(seen, 'no component calls either placement').toBeGreaterThanOrEqual(2);
	});
});

const overlaps = (a: { left: number; top: number; width: number; height: number }, b: AnchorBox) =>
	Math.min(a.left + a.width, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.top + a.height, b.bottom) - Math.max(a.top, b.top) > 0;

describe('the list beside a menu keeps clear of the corner button', () => {
	// The button at 1440x900 as measured, and a menu near the right edge.
	const viewport = { width: 1440, height: 900 };
	const button: AnchorBox = { left: 1278, top: 844, right: 1428, bottom: 888, width: 150, height: 44 };
	const list = { width: 220, height: 240 };

	it('a list opened from a low row of a menu with room on its right does not run under the button', () => {
		let cases = 0;
		let underWithout = 0;
		for (let menuLeft = 700; menuLeft <= 1100; menuLeft += 20) {
			for (let rowTop = 500; rowTop <= 836; rowTop += 12) {
				const row = { top: rowTop, bottom: rowTop + 44 };
				const menu = { left: menuLeft, right: menuLeft + 219 };
				const at = submenuPlacement(row, menu, list, viewport, 5, 0, button);
				const plain = submenuPlacement(row, menu, list, viewport, 5);
				cases += 1;
				expect(overlaps({ ...at, ...list }, button), `menu ${menuLeft} row ${rowTop}`).toBe(false);
				// Never over the menu it belongs to, and on screen.
				expect(at.left + list.width <= menu.left || at.left >= menu.right).toBe(true);
				expect(at.top).toBeGreaterThanOrEqual(8);
				expect(at.top + list.height).toBeLessThanOrEqual(viewport.height - 8);
				if (overlaps({ ...plain, ...list }, button)) underWithout += 1;
			}
		}
		expect(cases).toBeGreaterThan(400);
		// The positive control: without the reserve, the same sweep does reach the button.
		expect(underWithout).toBeGreaterThan(20);
	});

	it('changes nothing for a list nowhere near the button', () => {
		const row = { top: 170, bottom: 214 };
		const menu = { left: 40, right: 280 };
		expect(submenuPlacement(row, menu, list, viewport, 5, 0, button)).toEqual(submenuPlacement(row, menu, list, viewport, 5));
	});
});

describe('a tool card keeps clear of the corner button', () => {
	const viewport = { width: 1440, height: 900 };
	const button: AnchorBox = { left: 1278, top: 844, right: 1428, bottom: 888, width: 150, height: 44 };
	const tool = (left: number, top: number): AnchorBox => ({ left, top, right: left + 44, bottom: top + 44, width: 44, height: 44 });

	it('lifts a card beside a low tool off the button, and leaves one clear of it where it was', () => {
		const card = { width: 240, height: 160 };
		// A tool at the right of a palette near the foot: the card beside it, on its left, meets the button.
		const a = tool(1380, 830);
		const plain = placeTip(a, card, viewport);
		expect(overlaps({ ...plain, ...card }, button)).toBe(true);
		const at = placeTip(a, card, viewport, 8, 8, undefined, button);
		expect(overlaps({ ...at, ...card }, button)).toBe(false);
		expect(at.side).toBe('left');
		expect(at.top + card.height).toBeLessThanOrEqual(button.top - 8);
		// A card nowhere near it is where it always was.
		expect(placeTip(tool(12, 100), card, viewport, 8, 8, undefined, button)).toEqual(placeTip(tool(12, 100), card, viewport));
	});

	it('over every tool position on a phone strip and a desktop column, no card meets the button', () => {
		let cases = 0;
		const phone = { width: 375, height: 812 };
		const phoneButton: AnchorBox = { left: 198, top: 740, right: 359, bottom: 788, width: 161, height: 48 };
		for (const [vp, btn] of [[viewport, button], [phone, phoneButton]] as const) {
			for (let x = 8; x + 44 <= vp.width - 8; x += 24) {
				for (let y = 8; y + 44 <= vp.height - 8; y += 24) {
					const a = tool(x, y);
					if (overlaps({ left: a.left, top: a.top, width: 44, height: 44 }, btn)) continue;
					const card = { width: 240, height: 120 };
					const at = placeTip(a, card, vp, 8, 8, undefined, btn);
					cases += 1;
					expect(overlaps({ ...at, ...card }, btn), `${vp.width} tool ${x},${y}`).toBe(false);
					expect(overlaps({ ...at, ...card }, a), `covers its tool at ${vp.width} ${x},${y}`).toBe(false);
				}
			}
		}
		expect(cases).toBeGreaterThan(1000);
	});
});
