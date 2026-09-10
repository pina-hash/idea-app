/**
 * THE NOTEBOOK'S FOUR PLATES, AND THE ONE THAT FOLLOWS THE SITE THEME.
 *
 * Every regression this file exists to catch is SILENT. A default plate that
 * stopped following the site's Matrix theme renders perfectly -- it is simply
 * the standard console in a room where every other surface went black, and
 * the only thing that would notice is a student who picked Matrix. A matrix
 * block whose six register tokens drifted from matrix.css's renders perfectly
 * too: two shades of near-black, one on the class page and one in the
 * notebook, with nothing on screen to say they were meant to be one. And an
 * authored ink that fell under 4.5:1 on a black ground is exactly where
 * contrast fails without anyone filing it.
 *
 * WHERE THE EXPECTED VALUES COME FROM. The parity assertions read matrix.css
 * and colors.css and compare literal for literal, so the notebook cannot
 * agree with itself -- it has to agree with the site theme. The ratios are
 * computed HERE from the WCAG 2.x relative-luminance formula, with
 * color-mix(in srgb) resolved as a linear per-channel mix of sRGB values (how
 * Chromium resolves that space) and rgba() composited over its opaque ground;
 * that is arithmetic nothing under test performs, so it cannot agree with a
 * wrong stylesheet by construction. The helpers are deliberately NOT imported
 * from a tool: a test that shares its instrument with the thing it measures
 * has nothing independent to say.
 *
 * The pure half is imported and CALLED; the reactive store and the toggle are
 * asserted over their source, because a `$state` module and a component need
 * a compiler and a DOM the `node` project deliberately does not have.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	DEFAULT_NOTEBOOK_THEME,
	NOTEBOOK_THEME_KEY,
	NOTEBOOK_THEME_LABELS,
	NOTEBOOK_THEME_NOTES,
	NOTEBOOK_THEME_SHORT,
	NOTEBOOK_THEMES,
	notebookDefaultNote,
	notebookPickerName,
	notebookPlate,
	notebookThemeAttrFor,
	readStoredNotebookTheme
} from '../src/lib/notebook/notebook-theme';
import { SITE_THEME_KEY, SITE_THEMES } from '../src/lib/theme';

const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const NB_THEME = src('../src/lib/notebook/notebook-theme.css');
const COLORS = src('../src/lib/design-system/colors.css');
const MATRIX = src('../src/lib/design-system/themes/matrix.css');

/** The opening selector line of each block, verbatim. A block is matched by
 *  its selector so the four notebook palettes can be told apart even though
 *  they declare the same names. */
const SEL = {
	root: ':root {',
	nbDefault: '.nb-root:not([data-nb-theme]) {',
	matrixTheme: ":root[data-theme='matrix'] {",
	nbMatrix: ".nb-root[data-nb-theme='matrix'],\n:root[data-theme='matrix'] .nb-root:not([data-nb-theme]) {",
	mirrorMatrix: ":root:has(.nb-root[data-nb-theme='matrix']),\n:root[data-theme='matrix']:has(.nb-root:not([data-nb-theme])) {",
	mirrorDefault: ':root:has(.nb-root:not([data-nb-theme])) {'
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
	['--nb-boundary', '--boundary']
];

// ==========================================================================

describe('the notebook plate registry', () => {
	it('lists four states, the default first, with a label, a short word and a note each', () => {
		expect(NOTEBOOK_THEMES).toEqual(['default', 'light', 'idea', 'matrix']);
		expect(NOTEBOOK_THEMES[0]).toBe(DEFAULT_NOTEBOOK_THEME);
		for (const t of NOTEBOOK_THEMES) {
			expect(NOTEBOOK_THEME_LABELS[t], t).toBeTruthy();
			expect(NOTEBOOK_THEME_SHORT[t], t).toBeTruthy();
			expect(NOTEBOOK_THEME_NOTES[t], t).toBeTruthy();
			// A note is what the option is FOR; repeating the name is not one.
			expect(NOTEBOOK_THEME_NOTES[t], t).not.toBe(NOTEBOOK_THEME_LABELS[t]);
		}
		// Exhaustive in both directions: a state added to the union with no
		// label would be a blank row in the menu.
		const ids = [...NOTEBOOK_THEMES].sort();
		expect(Object.keys(NOTEBOOK_THEME_LABELS).sort()).toEqual(ids);
		expect(Object.keys(NOTEBOOK_THEME_SHORT).sort()).toEqual(ids);
		expect(Object.keys(NOTEBOOK_THEME_NOTES).sort()).toEqual(ids);
	});

	it('no user-facing sentence carries an em dash', () => {
		const copy = [
			...Object.values(NOTEBOOK_THEME_LABELS),
			...Object.values(NOTEBOOK_THEME_NOTES),
			...Object.values(NOTEBOOK_THEME_SHORT),
			...SITE_THEMES.map((s) => notebookDefaultNote(s))
		];
		expect(copy.length).toBeGreaterThan(10); // positive control on the sweep
		for (const s of copy) expect(s, s).not.toMatch(/—/);
	});

	it('the default is the ABSENCE of the attribute and every other state is its own id', () => {
		expect(notebookThemeAttrFor(DEFAULT_NOTEBOOK_THEME)).toBeUndefined();
		for (const t of NOTEBOOK_THEMES) {
			if (t === DEFAULT_NOTEBOOK_THEME) continue;
			expect(notebookThemeAttrFor(t), t).toBe(t);
		}
	});

	it('a retired or unknown stored id answers null; every live state answers itself', () => {
		for (const t of NOTEBOOK_THEMES) expect(readStoredNotebookTheme(t)).toBe(t);
		expect(readStoredNotebookTheme(null)).toBeNull();
		// 'dark' and 'system' were really written to students' browsers; the
		// rest are the shapes a store can be holding.
		for (const junk of ['dark', 'system', 'IDEA', 'matrix ', '', '{}', 'null']) {
			expect(readStoredNotebookTheme(junk), JSON.stringify(junk)).toBeNull();
		}
	});

	it('the storage key is the one the three-plate picker already used, and is not the site key', () => {
		expect(NOTEBOOK_THEME_KEY).toBe('idea_notebook_theme');
		expect(NOTEBOOK_THEME_KEY).not.toBe(SITE_THEME_KEY);
	});

	it('the default plate follows the site theme and every explicit plate paints itself', () => {
		expect(notebookPlate('default', 'matrix')).toBe('matrix');
		expect(notebookPlate('default', 'idea')).toBe('default');
		expect(notebookPlate('light', 'matrix')).toBe('light');
		expect(notebookPlate('idea', 'matrix')).toBe('idea');
		expect(notebookPlate('matrix', 'idea')).toBe('matrix');
		expect(notebookPlate('matrix', 'matrix')).toBe('matrix');
	});

	/*
	 * THE INPUT IS `<html data-theme>`, NOT THE PREFERENCE STORE, AND THESE ARE
	 * THE SHAPES THE ATTRIBUTE REALLY TAKES. `ThemeRoot` REMOVES the attribute
	 * when the theme is off or there is no session, so `null` (nothing read
	 * yet, which is the server render and the first frame) and `undefined`
	 * (read, and absent) are both ordinary answers and both mean "no site
	 * theme". A function that answered 'matrix' for either would paint a black
	 * notebook on a page that is not black.
	 */
	it('an absent or unread site attribute is "no site theme" in both spellings', () => {
		for (const absent of [null, undefined, '', 'idea', 'MATRIX', 'matrix ']) {
			expect(notebookPlate('default', absent), JSON.stringify(absent)).toBe('default');
			expect(notebookDefaultNote(absent), JSON.stringify(absent)).not.toContain('Matrix');
		}
		// positive control on the sweep above: the one value that IS the theme
		expect(notebookPlate('default', 'matrix')).toBe('matrix');
		expect(notebookDefaultNote('matrix')).toContain('Matrix');
	});

	/*
	 * THE TRIGGER'S NAME CARRIES THE PAINTED PLATE ONLY WHEN IT DIFFERS from
	 * the chosen one. The visible word stays the CHOSEN state because the menu
	 * it opens ticks that row; the name is where the other half is said, so a
	 * reader looking at a black notebook is not told only "Default".
	 */
	it("the picker's accessible name names the painted plate exactly when it differs", () => {
		expect(notebookPickerName('default', 'matrix')).toBe('Appearance: Default, showing Matrix');
		expect(notebookPickerName('default', undefined)).toBe('Appearance: Default');
		expect(notebookPickerName('matrix', 'matrix')).toBe('Appearance: Matrix');
		expect(notebookPickerName('light', 'matrix')).toBe('Appearance: Light');
		for (const t of NOTEBOOK_THEMES) {
			for (const site of ['matrix', undefined]) {
				const name = notebookPickerName(t, site);
				expect(name, `${t}/${site}`).toContain(NOTEBOOK_THEME_LABELS[t]);
				expect(name, `${t}/${site}`).not.toMatch(/—/);
			}
		}
	});

	it("the default row's note says what it follows right now", () => {
		expect(notebookDefaultNote('matrix')).toContain('Matrix');
		expect(notebookDefaultNote('idea')).not.toContain('Matrix');
		expect(notebookDefaultNote('idea')).not.toBe(notebookDefaultNote('matrix'));
		// It is a NOTE, not the label, on either site theme.
		for (const s of SITE_THEMES) expect(notebookDefaultNote(s)).not.toBe(NOTEBOOK_THEME_LABELS.default);
	});
});

// ==========================================================================

describe('parity: the register tokens are the site theme\'s, literal for literal', () => {
	it('the matrix plate\'s six equal matrix.css\'s six', () => {
		const plate = block(NB_THEME, SEL.nbMatrix);
		const theme = block(MATRIX, SEL.matrixTheme);
		let cases = 0;
		for (const [nb, site] of REGISTER) {
			expect(plate[nb], nb).toMatch(/^#[0-9a-f]{6}$/i);
			expect(theme[site], site).toMatch(/^#[0-9a-f]{6}$/i);
			expect(plate[nb], `${nb} <- ${site}`).toBe(theme[site]);
			cases++;
		}
		expect(cases).toBe(6);
	});

	it("the DEFAULT plate's six equal colors.css's :root register -- the standing claim, now pinned", () => {
		const plate = block(COLORS, SEL.nbDefault);
		const root = block(COLORS, SEL.root);
		let cases = 0;
		for (const [nb, site] of REGISTER) {
			expect(plate[nb], nb).toMatch(/^#[0-9a-f]{6}$/i);
			expect(plate[nb], `${nb} <- ${site}`).toBe(root[site]);
			cases++;
		}
		expect(cases).toBe(6);
	});

	it('POSITIVE CONTROL: the block reader finds a declaration and ignores a commented one', () => {
		const mutant = "x {\n\t/* --nb-bg: #ffffff; */\n\t--nb-bg: #010203;\n}\n";
		expect(block(mutant, 'x {')).toEqual({ '--nb-bg': '#010203' });
	});
});

// ==========================================================================

describe('the selectors: one block, two ways in, and the canvas mirror beside it', () => {
	const bare = stripComments(NB_THEME);

	it('the matrix declaration block is reached by the explicit plate AND by the default plate under the site theme', () => {
		expect(bare).toContain(SEL.nbMatrix);
		// Exactly one such block: a second copy is two blocks that can drift.
		// Counted at LINE START, because the same selector text also appears
		// inside the canvas mirror's :has() argument.
		expect(bare.match(/^\.nb-root\[data-nb-theme='matrix'\]/gm)?.length).toBe(1);
		expect(bare.match(/^:root\[data-theme='matrix'\] \.nb-root:not\(\[data-nb-theme\]\)/gm)?.length).toBe(1);
	});

	it('the canvas mirror is reached by both :has() selectors and paints the same ground as the block', () => {
		expect(bare).toContain(SEL.mirrorMatrix);
		const mirror = block(NB_THEME, SEL.mirrorMatrix);
		const plate = block(NB_THEME, SEL.nbMatrix);
		expect(mirror['--nb-bg']).toBe(plate['--nb-bg']);
		// The mirror paints ONLY the canvas ground; anything more here would be
		// a second declaration of a plate token on an ancestor of .nb-root.
		expect(Object.keys(mirror)).toEqual(['--nb-bg']);
	});

	it('the default and IDEA mirrors still exist (positive control on the sweep)', () => {
		expect(bare).toContain(SEL.mirrorDefault);
		expect(bare).toContain(":root:has(.nb-root[data-nb-theme='idea']) {");
		const def = block(NB_THEME, SEL.mirrorDefault);
		expect(def['--nb-bg']).toBe(block(COLORS, SEL.nbDefault)['--nb-bg']);
	});

	it('the shell background layer stays suppressed in this room: no rain reaches the notebook', () => {
		expect(bare).toMatch(/body:has\(\.nb-root\)\s+\.bg-fx\s*\{\s*display:\s*none;/);
		// And the matrix block adds no motion, canvas or gradient of its own.
		const at = bare.indexOf(SEL.nbMatrix);
		const body = bare.slice(at, bare.indexOf('\n}', at));
		expect(body).not.toMatch(/animation|@keyframes|gradient|canvas/);
	});
});

// ==========================================================================

describe('contrast on the matrix plate, computed', () => {
	const root = block(COLORS, SEL.root);
	const theme = block(MATRIX, SEL.matrixTheme);
	const plate = block(NB_THEME, SEL.nbMatrix);
	/* Two scopes, because the plate is reached two ways: the explicit plate
	   under the standard site theme resolves --ice / --dim / --gear / --gold
	   from :root, and the default plate under the site's Matrix theme resolves
	   the four luminance-held tiers from matrix.css. Every floor is asserted
	   in both. */
	const scopes = {
		'explicit plate, site idea': { ...root, ...plate },
		'default plate, site matrix': { ...root, ...theme, ...plate }
	};

	const bg = hexToRgb(plate['--nb-bg']);
	const surface = hexToRgb(plate['--nb-surface']);
	const dim = hexToRgb(plate['--nb-surface-dim']);
	const wash = resolve(plate['--nb-accent-wash'], root);
	const grounds6: [string, RGB][] = [
		['bg', bg],
		['surface', surface],
		['surface-dim', dim],
		['wash/bg', over(wash, bg)],
		['wash/surface', over(wash, surface)],
		['wash/surface-dim', over(wash, dim)]
	];
	const grounds3 = grounds6.slice(0, 3);

	it('the three grounds are distinct and the wash is a real veil (positive control on the arithmetic)', () => {
		expect(new Set([plate['--nb-bg'], plate['--nb-surface'], plate['--nb-surface-dim']]).size).toBe(3);
		expect(wash[3]).toBeGreaterThan(0);
		expect(wash[3]).toBeLessThan(1);
		// Compositing the wash must MOVE the ground, or the six-ground sweep is three.
		expect(luminance(over(wash, bg))).toBeGreaterThan(luminance(bg));
	});

	it('the load-bearing boundary clears 3:1 on the three bare grounds', () => {
		const b = hexToRgb(plate['--nb-boundary']);
		let cases = 0;
		for (const [name, g] of grounds3) {
			expect(contrast(b, g), `--nb-boundary on ${name}`).toBeGreaterThanOrEqual(3);
			cases++;
		}
		expect(cases).toBe(3);
	});

	it('the decorative hairlines stay BELOW 3:1 -- that is their job', () => {
		for (const t of ['--nb-hairline', '--nb-hairline-strong']) {
			const c = resolve(plate[t], root);
			expect(contrast(over(c, surface), surface), t).toBeLessThan(3);
		}
		expect(plate['--nb-hairline']).toBe(root['--hairline']); // the register's own 8% rule, to the byte
	});

	it('ink and ink-soft clear 4.5 on all six grounds; ink-faint on the three bare ones', () => {
		let cases = 0;
		for (const [scopeName, scope] of Object.entries(scopes)) {
			for (const t of ['--nb-ink', '--nb-ink-soft']) {
				const c = opaque(plate[t], scope);
				for (const [name, g] of grounds6) {
					expect(contrast(c, g), `${t} on ${name} (${scopeName})`).toBeGreaterThanOrEqual(4.5);
					cases++;
				}
			}
			const faint = opaque(plate['--nb-ink-faint'], scope);
			for (const [name, g] of grounds3) {
				expect(contrast(faint, g), `--nb-ink-faint on ${name} (${scopeName})`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
			/* And the two tiers stay tellable: ink-faint is a real step below
			   ink-soft, not a rounding of it. */
			expect(luminance(faint)).toBeLessThan(luminance(opaque(plate['--nb-ink-soft'], scope)) * 0.7);
		}
		expect(cases).toBe(2 * (2 * 6 + 3));
	});

	it('the brass accent and the three status inks clear 4.5 on all six grounds', () => {
		let cases = 0;
		for (const [scopeName, scope] of Object.entries(scopes)) {
			for (const t of ['--nb-accent-ink', '--nb-ok', '--nb-error', '--nb-warn']) {
				const c = opaque(plate[t], scope);
				for (const [name, g] of grounds6) {
					expect(contrast(c, g), `${t} on ${name} (${scopeName})`).toBeGreaterThanOrEqual(4.5);
					cases++;
				}
			}
		}
		expect(cases).toBe(2 * 4 * 6);
	});

	it('the seven review-grid states clear 4.5: four on their pinned fill, three on the card', () => {
		let cases = 0;
		for (const [scopeName, scope] of Object.entries(scopes)) {
			for (const s of ['ontime', 'late', 'await', 'flagged']) {
				const ink = opaque(plate[`--nb-cell-${s}`], scope);
				const fill = opaque(plate[`--nb-cell-${s}-fill`], scope);
				expect(contrast(ink, fill), `${s} ink on its fill (${scopeName})`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
			for (const s of ['excused', 'missing', 'scheduled']) {
				const ink = opaque(plate[`--nb-cell-${s}`], scope);
				expect(contrast(ink, surface), `${s} ink on the card (${scopeName})`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
			// Missing's own edge and the focus ring are non-text: 3:1.
			expect(contrast(opaque(plate['--nb-cell-missing-edge'], scope), surface)).toBeGreaterThanOrEqual(3);
			const ring = resolve(plate['--nb-cell-ring'], scope);
			expect(contrast(over(ring, surface), surface), 'ring on the card').toBeGreaterThanOrEqual(3);
			const ontime = opaque(plate['--nb-cell-ontime-fill'], scope);
			expect(contrast(over(ring, ontime), ontime), 'ring on the on-time fill').toBeGreaterThanOrEqual(3);
		}
		expect(cases).toBe(2 * 7);
	});

	it('the six folder colours clear 4.5 on the card', () => {
		let cases = 0;
		for (const [scopeName, scope] of Object.entries(scopes)) {
			for (const f of ['slate', 'gold', 'sage', 'clay', 'sky', 'plum']) {
				const c = opaque(plate[`--nb-folder-${f}`], scope);
				expect(contrast(c, surface), `folder ${f} (${scopeName})`).toBeGreaterThanOrEqual(4.5);
				cases++;
			}
		}
		expect(cases).toBe(12);
	});

	it('the photo island keeps its own contrast', () => {
		const shotPlate = hexToRgb(plate['--nb-shot-plate']);
		const shotInk = hexToRgb(plate['--nb-shot-ink']);
		expect(contrast(shotInk, shotPlate)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(hexToRgb(plate['--nb-shot-ink-deep']), shotInk)).toBeGreaterThanOrEqual(4.5);
		expect(plate['--nb-shot-ink-deep']).toBe(plate['--nb-bg']);
	});

	it('POSITIVE CONTROL: the instrument reddens on a value that does not clear', () => {
		// matrix.css's own --text-3 is the candidate this plate REFUSED for
		// ink-faint; the same arithmetic must say why.
		const text3 = hexToRgb(theme['--text-3']);
		expect(contrast(text3, dim)).toBeLessThan(4.5);
		// And a resolved color-mix is not the same colour as either input.
		const ok = opaque(plate['--nb-ok'], root);
		expect(ok).not.toEqual(hexToRgb(root['--teal']));
		expect(ok).not.toEqual(hexToRgb('#dff5e6'));
	});
});

// ==========================================================================

describe('semantic and identity colours do not move with the plate', () => {
	const matrixPlate = block(NB_THEME, SEL.nbMatrix);
	const defaultPlate = block(COLORS, SEL.nbDefault);

	it('brass stays the thread: --nb-accent-ink is var(--nb-accent) and --nb-accent is not redeclared', () => {
		expect(matrixPlate['--nb-accent-ink']).toBe('var(--nb-accent)');
		expect(defaultPlate['--nb-accent-ink']).toBe('var(--nb-accent)');
		// The :root value is --gold and the matrix block leaves it alone, so the
		// accent resolves to the identical brass on both plates.
		expect(matrixPlate['--nb-accent']).toBeUndefined();
		expect(block(COLORS, SEL.root)['--nb-accent']).toBe('var(--gold)');
		expect(matrixPlate['--nb-meta-accent']).toBe('var(--nb-accent-ink)');
	});

	it('the five folder hexes, the gold and none re-declarations equal the default plate\'s', () => {
		const names = ['slate', 'sage', 'clay', 'sky', 'plum', 'gold', 'none'].map((f) => `--nb-folder-${f}`);
		let cases = 0;
		for (const n of names) {
			expect(matrixPlate[n], n).toBeDefined();
			expect(matrixPlate[n], n).toBe(defaultPlate[n]);
			cases++;
		}
		expect(cases).toBe(7);
		expect(names.slice(0, 5).map((n) => matrixPlate[n])).toEqual(names.slice(0, 5).map((n) => defaultPlate[n]));
	});

	it('the seven cell inks, the missing edge and the four pinned fills equal the default plate\'s', () => {
		const inks = ['ontime', 'late', 'await', 'flagged', 'excused', 'missing', 'scheduled'].map((s) => `--nb-cell-${s}`);
		const fills = ['ontime', 'late', 'await', 'flagged'].map((s) => `--nb-cell-${s}-fill`);
		let cases = 0;
		for (const n of [...inks, '--nb-cell-missing-edge', ...fills]) {
			expect(matrixPlate[n], n).toBeDefined();
			expect(matrixPlate[n], n).toBe(defaultPlate[n]);
			cases++;
		}
		expect(cases).toBe(12);
	});

	it('the status inks are the same color-mix expressions as the default plate', () => {
		for (const n of ['--nb-ok', '--nb-error', '--nb-warn']) {
			expect(matrixPlate[n], n).toMatch(/^color-mix\(in srgb, var\(--(teal|crimson|amber)\)/);
			expect(matrixPlate[n], n).toBe(defaultPlate[n]);
		}
	});

	it('the matrix block declares every token the default plate declares, and nothing it does not', () => {
		/* The default block is the TEMPLATE: a token it declares and the matrix
		   block forgot would inherit the LIGHT :root value in a black room, and a
		   token the matrix block invented would be undefined everywhere else. */
		expect(Object.keys(matrixPlate).sort()).toEqual(Object.keys(defaultPlate).sort());
		expect(Object.keys(matrixPlate).length).toBeGreaterThan(30); // positive control
	});
});

// ==========================================================================

describe('the store: turning it off leaves nothing behind', () => {
	const reactive = src('../src/lib/notebook/notebook-theme.svelte.ts');

	it('re-exports every name the three-plate module exported, so NotebookView and ReviewConsole need no change', () => {
		for (const name of [
			'NOTEBOOK_THEMES',
			'NOTEBOOK_THEME_LABELS',
			'NOTEBOOK_THEME_NOTES',
			'NOTEBOOK_THEME_SHORT',
			'type NotebookTheme'
		]) {
			expect(reactive, name).toContain(name);
		}
		for (const fn of ['notebookTheme', 'notebookThemeAttr', 'setNotebookTheme']) {
			expect(reactive, fn).toMatch(new RegExp(`export function ${fn}\\(`));
		}
		expect(reactive).toMatch(/from '\.\/notebook-theme'/);
		// And the two real consumers still import from the reactive module.
		for (const f of ['../src/lib/notebook/NotebookView.svelte', '../src/lib/notebook/ReviewConsole.svelte']) {
			expect(src(f), f).toContain("import { notebookThemeAttr } from '$lib/notebook/notebook-theme.svelte'");
		}
	});

	it('setNotebookTheme REMOVES the key for the default rather than storing it', () => {
		const body = reactive.slice(reactive.indexOf('export function setNotebookTheme'));
		expect(body).toContain('removeItem(NOTEBOOK_THEME_KEY)');
		expect(body).toMatch(/if \(next === DEFAULT_NOTEBOOK_THEME\) localStorage\.removeItem/);
		expect(body).not.toMatch(/setItem\(NOTEBOOK_THEME_KEY,\s*DEFAULT_NOTEBOOK_THEME\)/);
		expect(body).not.toMatch(/setItem\(NOTEBOOK_THEME_KEY,\s*'default'\)/);
	});

	it('read() drops an unknown key through readStoredNotebookTheme rather than keeping it', () => {
		const body = reactive.slice(reactive.indexOf('function read('), reactive.indexOf('let theme'));
		expect(body).toContain('readStoredNotebookTheme(stored)');
		expect(body).toMatch(/if \(stored !== null\) localStorage\.removeItem\(NOTEBOOK_THEME_KEY\)/);
	});

	it('every store touch is inside a try/catch: a blocked store costs the persistence, never the choice', () => {
		const touches = [...reactive.matchAll(/localStorage\.(getItem|setItem|removeItem)/g)];
		expect(touches.length).toBeGreaterThan(2); // positive control on the sweep
		for (const m of touches) {
			const before = reactive.slice(0, m.index ?? 0);
			expect(before.lastIndexOf('try {'), m[0]).toBeGreaterThan(before.lastIndexOf('} catch'));
		}
	});
});

// ==========================================================================

describe('the toggle', () => {
	const toggle = src('../src/lib/notebook/NotebookThemeToggle.svelte');

	it('lists every state from the registry, says what Default follows, and exposes the painted plate', () => {
		expect(toggle).toContain('{#each NOTEBOOK_THEMES as option (option)}');
		expect(toggle).toContain('notebookDefaultNote(');
		expect(toggle).toContain('data-plate=');
		expect(toggle).toContain('notebookPlate(');
		expect(toggle).toContain('notebookPickerName(');
		// The site theme is READ, never written, from this control.
		expect(toggle).not.toContain('setSiteTheme');
	});

	/*
	 * IT FOLLOWS `<html data-theme>` AND MUST NOT READ THE PREFERENCE STORE.
	 * The two answer different questions -- the store is what a student chose,
	 * the attribute is what `ThemeRoot`'s session gate decided -- and the
	 * cascade paints from the attribute, so a mirror of the cascade fed by the
	 * store can tell a student their black notebook is following "the same
	 * surfaces as your classes". Measured in Chromium before this changed.
	 */
	it('reads the site theme off the document and never off the preference store', () => {
		expect(toggle).toContain('watchSiteThemeOnDocument()');
		expect(toggle).toContain('siteThemeOnDocument()');
		expect(toggle).not.toContain("from '$lib/theme.svelte'");
		expect(toggle).not.toMatch(/\bsiteTheme\(\)/);
	});

	it('has a glyph branch for every non-default state (a fourth row without a mark reads as broken)', () => {
		for (const t of NOTEBOOK_THEMES) {
			if (t === DEFAULT_NOTEBOOK_THEME) continue;
			expect(toggle, t).toContain(`which === '${t}'`);
		}
		expect(toggle).toContain('stroke-dasharray');
	});

	it('keeps the 44px floor on the trigger and the rows', () => {
		expect(toggle).toMatch(/\.nb-theme\s*\{[^}]*min-height:\s*44px/);
		expect(toggle).toMatch(/\.option\s*\{[^}]*min-height:\s*2\.75rem/);
	});
});
