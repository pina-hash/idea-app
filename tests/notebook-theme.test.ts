/**
 * THE NOTEBOOK FOLLOWS THE SITE THEME, AND A STORED PLATE CANNOT STRAND ANYONE.
 *
 * Ledger 0297 (package F4a) retired the notebook's own plates -- default,
 * light, IDEA and Matrix, chosen from a picker in the notebook's masthead --
 * on Mr. Pina's words of 2026-09-23: "visually and functionally the IDEA
 * notebook should follow IDEA Classroom, not the other way around." The
 * notebook lives inside the classroom and paints whatever the site theme is.
 * This file was the four-plate registry's; it is GENERALIZED to the rule that
 * replaced it, and every regression it catches is still SILENT:
 *
 *   - a notebook ground that stopped aliasing the register renders perfectly,
 *     as a second shade of the page one pane over;
 *   - a notebook ink authored for one theme's ground and read on another's
 *     fails contrast with nothing on screen to say so -- which is exactly why
 *     every --nb-* ink is measured here on all three site themes' grounds;
 *   - a stored plate id a student's browser still holds must answer the site
 *     theme and be cleared, never throw and never paint a plate that is gone.
 *
 * WHERE THE EXPECTED VALUES COME FROM. The ratios are computed HERE from the
 * WCAG 2.x relative-luminance formula, with color-mix(in srgb) resolved as a
 * linear per-channel mix of sRGB values (how Chromium resolves that space) and
 * rgba() composited over its opaque ground; that is arithmetic nothing under
 * test performs, so it cannot agree with a wrong stylesheet by construction.
 * The helpers are deliberately NOT imported from a tool.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	NOTEBOOK_THEME_KEY,
	RETIRED_NOTEBOOK_PLATES,
	readStoredNotebookTheme,
	retireStoredNotebookPlate,
	type NotebookPlateStore
} from '../src/lib/notebook/notebook-theme';
import { SITE_THEME_KEY } from '../src/lib/theme';

const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const exists = (p: string) => existsSync(fileURLToPath(new URL(p, import.meta.url)));

const NB_THEME = src('../src/lib/notebook/notebook-theme.css');
const COLORS = src('../src/lib/design-system/colors.css');
const MATRIX = src('../src/lib/design-system/themes/matrix.css');
const SPACE_WHITE = src('../src/lib/design-system/themes/space-white.css');

/** The opening selector line of each block, verbatim. */
const SEL = {
	root: ':root {',
	matrixTheme: ":root[data-theme='matrix'] {",
	swTheme: ":root[data-theme='space-white'] {",
	nb: '\n.nb-root {',
	nbMatrix: ":root[data-theme='matrix'] .nb-root {",
	nbSw: ":root[data-theme='space-white'] .nb-root {"
} as const;

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `--name: value;` inside the block that opens with `selector`,
 *  comments stripped first so a documented hex cannot be read as a value. */
function block(css: string, selector: string): Record<string, string> {
	const at = css.indexOf(selector);
	expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
	const body = stripComments(css.slice(at, css.indexOf('\n}', at)));
	const out: Record<string, string> = {};
	for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
	return out;
}

// --------------------------------------------------------------------------
// WCAG contrast, computed here rather than read from anything under test.
// --------------------------------------------------------------------------

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

function hexToRgb(hex: string): RGB {
	const s = hex.replace('#', '').trim();
	const f = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
	return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
function luminance([r, g, b]: RGB): number {
	const ch = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrast(a: RGB, b: RGB): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Composite an rgba over an opaque ground. */
function over(fg: RGBA, bg: RGB): RGB {
	const a = fg[3];
	return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as RGB;
}
/** Resolve a CSS colour expression -- a hex, an rgba(), a var() through the
 *  given scope, or a color-mix(in srgb, A P%, B) -- to channels. */
function resolve(expr: string, scope: Record<string, string>): RGBA {
	expr = expr.trim();
	let m: RegExpMatchArray | null;
	if ((m = expr.match(/^var\((--[a-z0-9-]+)\)$/))) {
		const v = scope[m[1]];
		if (v === undefined) throw new Error(`unresolved ${m[1]}`);
		return resolve(v, scope);
	}
	if (expr.startsWith('#')) return [...hexToRgb(expr), 1];
	if ((m = expr.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/))) {
		return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
	}
	if ((m = expr.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\)$/))) {
		const p = Number(m[2]) / 100;
		const a = resolve(m[1], scope);
		const b = resolve(m[3], scope);
		return [a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), a[2] * p + b[2] * (1 - p), 1];
	}
	throw new Error(`cannot resolve ${expr}`);
}
function opaque(expr: string, scope: Record<string, string>): RGB {
	const c = resolve(expr, scope);
	if (c[3] !== 1) throw new Error(`expected an opaque colour, got ${expr}`);
	return [c[0], c[1], c[2]];
}

const REGISTER: [nb: string, site: string][] = [
	['--nb-bg', '--surface-0'],
	['--nb-surface', '--surface-1'],
	['--nb-surface-dim', '--surface-2'],
	['--nb-ink', '--text-1'],
	['--nb-ink-soft', '--text-2'],
	['--nb-hairline', '--hairline'],
	['--nb-boundary', '--boundary']
];

// ==========================================================================

describe('a stored plate answers the site theme, and is cleared', () => {
	it('every id a browser was ever handed answers the site theme', () => {
		// The four the picker offered and the two before them, named so a list
		// that lost one reddens rather than shrinking.
		expect([...RETIRED_NOTEBOOK_PLATES].sort()).toEqual(
			['dark', 'default', 'idea', 'light', 'matrix', 'system'].sort()
		);
		for (const id of RETIRED_NOTEBOOK_PLATES) expect(readStoredNotebookTheme(id), id).toBe('site');
		// And anything a corrupted or hand-edited store can hold.
		for (const junk of ['', ' ', 'sepia', 'MATRIX', '{"a":1}', 0, false, {}]) {
			expect(readStoredNotebookTheme(junk), String(junk)).toBe('site');
		}
		// Nothing stored is the one "no answer".
		expect(readStoredNotebookTheme(null)).toBeNull();
		expect(readStoredNotebookTheme(undefined)).toBeNull();
	});

	it('the key is the one the retired picker wrote, and is not the site key', () => {
		expect(NOTEBOOK_THEME_KEY).toBe('idea_notebook_theme');
		expect(NOTEBOOK_THEME_KEY).not.toBe(SITE_THEME_KEY);
	});

	function stub(initial: Record<string, string>, opts: { throwGet?: boolean; throwRemove?: boolean } = {}) {
		const data = { ...initial };
		const removed: string[] = [];
		const store: NotebookPlateStore = {
			getItem(k) {
				if (opts.throwGet) throw new Error('SecurityError');
				return k in data ? data[k] : null;
			},
			removeItem(k) {
				if (opts.throwRemove) throw new Error('SecurityError');
				removed.push(k);
				delete data[k];
			}
		};
		return { store, data, removed };
	}

	it('clears every stored plate, returns what was there, and touches no other key', () => {
		let cases = 0;
		for (const id of RETIRED_NOTEBOOK_PLATES) {
			const s = stub({ [NOTEBOOK_THEME_KEY]: id, [SITE_THEME_KEY]: 'space-white' });
			expect(retireStoredNotebookPlate(s.store), id).toBe(id);
			expect(s.removed).toEqual([NOTEBOOK_THEME_KEY]);
			expect(s.data[SITE_THEME_KEY]).toBe('space-white');
			expect(NOTEBOOK_THEME_KEY in s.data).toBe(false);
			cases++;
		}
		expect(cases).toBe(RETIRED_NOTEBOOK_PLATES.length);
	});

	it('POSITIVE CONTROL: with nothing stored it removes nothing and answers null', () => {
		const s = stub({ [SITE_THEME_KEY]: 'matrix' });
		expect(retireStoredNotebookPlate(s.store)).toBeNull();
		expect(s.removed).toEqual([]);
	});

	it('a blocked, throwing or absent store costs the tidy-up, never the page', () => {
		expect(() => retireStoredNotebookPlate(stub({}, { throwGet: true }).store)).not.toThrow();
		expect(retireStoredNotebookPlate(stub({}, { throwGet: true }).store)).toBeNull();
		const blocked = stub({ [NOTEBOOK_THEME_KEY]: 'light' }, { throwRemove: true });
		expect(() => retireStoredNotebookPlate(blocked.store)).not.toThrow();
		expect(retireStoredNotebookPlate(null)).toBeNull();
		expect(retireStoredNotebookPlate(undefined)).toBeNull();
	});

	it('both notebook surfaces run the sweep on mount, through the one helper', () => {
		for (const f of ['../src/lib/notebook/NotebookView.svelte', '../src/lib/notebook/ReviewConsole.svelte']) {
			expect(src(f), f).toMatch(/retireStoredNotebookPlate\(browserPlateStore\(\)\)/);
		}
	});
});

describe('the picker and the plates are gone, not hidden', () => {
	it('the masthead, the picker and the plate store are deleted', () => {
		for (const f of [
			'../src/lib/notebook/NotebookMasthead.svelte',
			'../src/lib/notebook/NotebookThemeToggle.svelte',
			'../src/lib/notebook/notebook-theme.svelte.ts'
		]) {
			expect(exists(f), f).toBe(false);
		}
		// POSITIVE CONTROL on the reader: the module that replaced them is there.
		expect(exists('../src/lib/notebook/notebook-theme.ts')).toBe(true);
	});

	it('no stylesheet keys on a plate attribute any more', () => {
		for (const [name, css] of [
			['colors.css', COLORS],
			['notebook-theme.css', NB_THEME],
			['matrix.css', MATRIX],
			['space-white.css', SPACE_WHITE]
		] as const) {
			expect(stripComments(css), name).not.toMatch(/data-nb-theme/);
		}
		for (const f of ['../src/lib/notebook/NotebookView.svelte', '../src/lib/notebook/ReviewConsole.svelte']) {
			expect(src(f), f).not.toMatch(/data-nb-theme|NotebookMasthead|NotebookThemeToggle/);
		}
	});
});

describe("parity: the notebook's register IS the site's", () => {
	it('each register token is an alias of the site token, on the room itself', () => {
		const nb = block(COLORS, SEL.nb);
		for (const [n, site] of REGISTER) expect(nb[n], n).toBe(`var(${site})`);
		// No theme block re-declares the register for the notebook: the site
		// theme's own values reach it through the aliases.
		for (const sel of [SEL.nbMatrix, SEL.nbSw]) {
			const b = block(COLORS, sel);
			for (const [n] of REGISTER) expect(b[n], `${sel} ${n}`).toBeUndefined();
		}
	});

	it('the room redeclares none of the register it reads', () => {
		const bare = stripComments(NB_THEME);
		for (const site of ['--surface-0', '--surface-1', '--surface-2', '--text-1', '--text-2', '--hairline', '--boundary']) {
			expect(bare, site).not.toMatch(new RegExp(`^\\s*${site}\\s*:`, 'm'));
		}
		// The one tier it DOES point somewhere is --text-3, at its own measured
		// muted ink, because the classroom's --text-3 is decoration and this
		// room's is real copy.
		expect(bare).toMatch(/--text-3:\s*var\(--nb-ink-faint\)/);
	});

	it('no --nb-* token is declared at :root any more, so nothing the theme moves can strand one', () => {
		const root = block(COLORS, SEL.root);
		expect(Object.keys(root).filter((n) => n.startsWith('--nb-'))).toEqual([]);
		// POSITIVE CONTROL: the reader does find :root's own tokens.
		expect(Object.keys(root).length).toBeGreaterThan(40);
	});

	it('the canvas is the site ground, one rule for every theme', () => {
		expect(NB_THEME).toMatch(/body:has\(\.nb-root\)\s*\{\s*background:\s*var\(--surface-0\);/);
		expect(stripComments(NB_THEME)).not.toMatch(/:root:has\(/);
	});
});

describe('contrast on every site theme, computed', () => {
	const root = block(COLORS, SEL.root);
	const nb = block(COLORS, SEL.nb);
	const THEMES: Record<string, Record<string, string>> = {
		idea: { ...root, ...nb },
		matrix: { ...root, ...block(MATRIX, SEL.matrixTheme), ...nb, ...block(COLORS, SEL.nbMatrix) },
		'space-white': {
			...root,
			...block(SPACE_WHITE, SEL.swTheme),
			...nb,
			...block(COLORS, SEL.nbSw)
		}
	};

	function grounds(scope: Record<string, string>) {
		const bg = opaque(scope['--nb-bg'], scope);
		const surface = opaque(scope['--nb-surface'], scope);
		const dim = opaque(scope['--nb-surface-dim'], scope);
		const wash = resolve(scope['--nb-accent-wash'], scope);
		const six: [string, RGB][] = [
			['bg', bg],
			['surface', surface],
			['surface-dim', dim],
			['wash/bg', over(wash, bg)],
			['wash/surface', over(wash, surface)],
			['wash/surface-dim', over(wash, dim)]
		];
		return { bg, surface, dim, wash, six, three: six.slice(0, 3) };
	}

	it('three themes, three distinct grounds each, and a wash that is a real veil (positive control)', () => {
		expect(Object.keys(THEMES)).toEqual(['idea', 'matrix', 'space-white']);
		for (const [name, scope] of Object.entries(THEMES)) {
			const g = grounds(scope);
			expect(new Set(g.three.map(([, c]) => c.join())).size, name).toBe(3);
			expect(g.wash[3]).toBeGreaterThan(0);
			expect(g.wash[3]).toBeLessThan(1);
			expect(over(g.wash, g.surface)).not.toEqual(g.surface);
		}
		// The three themes are genuinely different grounds, or this is one sweep three times.
		const cards = Object.values(THEMES).map((s) => grounds(s).surface.join());
		expect(new Set(cards).size).toBe(3);
	});

	it('the load-bearing boundary clears 3:1 on the three bare grounds', () => {
		let cases = 0;
		for (const [name, scope] of Object.entries(THEMES)) {
			const b = opaque(scope['--nb-boundary'], scope);
			for (const [g, c] of grounds(scope).three) {
				expect(contrast(b, c), `${name}: --nb-boundary on ${g}`).toBeGreaterThanOrEqual(3);
				cases++;
			}
		}
		expect(cases).toBe(9);
	});

	it('the decorative hairlines stay BELOW 3:1 -- that is their job', () => {
		for (const [name, scope] of Object.entries(THEMES)) {
			const { surface } = grounds(scope);
			for (const t of ['--nb-hairline', '--nb-hairline-strong']) {
				const c = resolve(scope[t], scope);
				expect(contrast(over(c, surface), surface), `${name} ${t}`).toBeLessThan(3);
			}
		}
	});

	it('ink and ink-soft clear 4.5 on all six grounds; ink-faint on the three bare ones', () => {
		let cases = 0;
		for (const [name, scope] of Object.entries(THEMES)) {
			const g = grounds(scope);
			for (const t of ['--nb-ink', '--nb-ink-soft']) {
				const c = opaque(scope[t], scope);
				for (const [gn, gc] of g.six) {
					expect(contrast(c, gc), `${name}: ${t} on ${gn}`).toBeGreaterThanOrEqual(4.5);
					cases++;
				}
			}
			const faint = opaque(scope['--nb-ink-faint'], scope);
			for (const [gn, gc] of g.three) {
				expect(contrast(faint, gc), `${name}: --nb-ink-faint on ${gn}`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
		}
		expect(cases).toBe(3 * (2 * 6 + 3));
	});

	it('the brass accent and the three status inks clear 4.5 on all six grounds', () => {
		let cases = 0;
		for (const [name, scope] of Object.entries(THEMES)) {
			for (const t of ['--nb-accent-ink', '--nb-ok', '--nb-error', '--nb-warn']) {
				const c = opaque(scope[t], scope);
				for (const [gn, gc] of grounds(scope).six) {
					expect(contrast(c, gc), `${name}: ${t} on ${gn}`).toBeGreaterThanOrEqual(4.5);
					cases++;
				}
			}
		}
		expect(cases).toBe(3 * 4 * 6);
	});

	it('the seven review-grid states clear 4.5: four on their pinned fill, three on the card', () => {
		let cases = 0;
		for (const [name, scope] of Object.entries(THEMES)) {
			const { surface } = grounds(scope);
			for (const st of ['ontime', 'late', 'await', 'flagged']) {
				const ink = opaque(scope[`--nb-cell-${st}`], scope);
				const fill = opaque(scope[`--nb-cell-${st}-fill`], scope);
				expect(contrast(ink, fill), `${name}: ${st} ink on its fill`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
			for (const st of ['excused', 'missing', 'scheduled']) {
				const ink = opaque(scope[`--nb-cell-${st}`], scope);
				expect(contrast(ink, surface), `${name}: ${st} ink on the card`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
			// Missing's own edge and the focus ring are non-text: 3:1.
			expect(contrast(opaque(scope['--nb-cell-missing-edge'], scope), surface), `${name} missing edge`).toBeGreaterThanOrEqual(3);
			const ring = resolve(scope['--nb-cell-ring'], scope);
			expect(contrast(over(ring, surface), surface), `${name}: ring on the card`).toBeGreaterThanOrEqual(3);
			const ontime = opaque(scope['--nb-cell-ontime-fill'], scope);
			expect(contrast(over(ring, ontime), ontime), `${name}: ring on the on-time fill`).toBeGreaterThanOrEqual(3);
		}
		expect(cases).toBe(3 * 7);
	});

	it('the six folder colours clear 4.5 on the card', () => {
		let cases = 0;
		for (const [name, scope] of Object.entries(THEMES)) {
			const { surface } = grounds(scope);
			for (const f of ['slate', 'gold', 'sage', 'clay', 'sky', 'plum']) {
				const c = opaque(scope[`--nb-folder-${f}`], scope);
				expect(contrast(c, surface), `${name}: folder ${f}`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
		}
		expect(cases).toBe(18);
	});

	it('the photo island stays dark in every theme and keeps its own contrast', () => {
		for (const [name, scope] of Object.entries(THEMES)) {
			const plate = opaque(scope['--nb-shot-plate'], scope);
			const ink = opaque(scope['--nb-shot-ink'], scope);
			expect(contrast(ink, plate), `${name}: shot ink on the letterbox`).toBeGreaterThanOrEqual(4.5);
			expect(contrast(opaque(scope['--nb-shot-ink-deep'], scope), ink), name).toBeGreaterThanOrEqual(4.5);
			expect(luminance(plate), `${name}: the letterbox is dark`).toBeLessThan(0.01);
		}
		// Space White re-declares none of it: the island is IDEA's there.
		expect(Object.keys(block(COLORS, SEL.nbSw)).filter((n) => n.startsWith('--nb-shot-'))).toEqual([]);
		// And the overlays that paint it are a dark island of their own.
		expect(stripComments(SPACE_WHITE)).toMatch(/:where\(\.ic-root, \.nb-island, \.deck-stage\)/);
		for (const f of ['../src/lib/notebook/PhotoCorrector.svelte', '../src/lib/notebook/CameraCapture.svelte']) {
			expect(src(f), f).toMatch(/class="pc-overlay nb-island"|class="[^"]*\bnb-island\b[^"]*"/);
		}
	});

	it('POSITIVE CONTROL: the instrument reddens on a value that does not clear', () => {
		// Space White's own --text-3 as it would be on the dark register is a
		// value this room REFUSED for ink-faint on IDEA; the arithmetic says why.
		const idea = grounds(THEMES.idea);
		expect(contrast(hexToRgb(root['--text-3']), idea.dim)).toBeLessThan(4.5);
		// IDEA's brass, read on Space White's paper, is the stranding this
		// sweep exists to catch: it does not clear there.
		const sw = grounds(THEMES['space-white']);
		expect(contrast(opaque(THEMES.idea['--nb-cell-late'], THEMES.idea), sw.surface)).toBeLessThan(4.5);
		// And a resolved color-mix is not the same colour as either input.
		const ok = opaque(THEMES.idea['--nb-ok'], THEMES.idea);
		expect(ok).not.toEqual(hexToRgb(root['--teal']));
	});
});
