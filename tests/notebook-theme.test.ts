/**
 * THE NOTEBOOK'S FOUR PLATES, AND THE ONE THAT FOLLOWS THE SITE.
 *
 * Two things here fail SILENTLY and neither shows in a browser pass over a
 * page that is working:
 *
 *   - PARITY. The notebook's matrix plate is the site theme's own register,
 *     mapped one token to one exactly as the default plate maps the unthemed
 *     register. A value in one file that drifted from the other would render
 *     perfectly and be one shade off beside the classroom, which is the
 *     defect the plate exists to end. So the six are read out of BOTH files
 *     and compared.
 *
 *   - THE FOLLOW. "The same surfaces as your classes" is kept true under a
 *     themed site by a selector in the stylesheet and by a pure function in
 *     the store that tells the picker what is showing. Those are two
 *     statements of one rule and this is where they are held together.
 *
 * Contrast is recomputed here from the WCAG formula against grounds parsed out
 * of the same stylesheet -- arithmetic this repo does not otherwise perform,
 * so it cannot agree with a wrong value by construction (the
 * boundary-token.test.ts argument). Only hex-over-hex is computed: the
 * color-mix() inks are the two other dark plates' own and are measured there.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	NOTEBOOK_THEMES,
	NOTEBOOK_THEME_FOLLOWING_NOTE,
	NOTEBOOK_THEME_LABELS,
	NOTEBOOK_THEME_NOTES,
	NOTEBOOK_THEME_SHORT,
	notebookPlateShowing
} from '../src/lib/notebook/notebook-theme.svelte';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const NB_THEME = read('src/lib/notebook/notebook-theme.css');
const MATRIX = read('src/lib/design-system/themes/matrix.css');
const COLORS = read('src/lib/design-system/colors.css');
const TOGGLE = read('src/lib/notebook/NotebookThemeToggle.svelte');

const MATRIX_PLATE = ".nb-root[data-nb-theme='matrix'],\n:root[data-theme='matrix'] .nb-root:not([data-nb-theme]) {";

function block(css: string, opener: string): string {
	const at = css.indexOf(opener);
	expect(at, `selector not found: ${opener}`).toBeGreaterThan(-1);
	return css.slice(at, css.indexOf('\n}', at));
}
function token(css: string, opener: string, name: string): string {
	const m = block(css, opener).match(new RegExp(`\\${name}:\\s*([^;]+);`));
	expect(m, `${name} not declared under ${opener}`).not.toBeNull();
	return m![1].trim();
}

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '').trim();
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance([r, g, b]: [number, number, number]): number {
	const ch = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrast(a: string, b: string): number {
	const [x, y] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))];
	const [hi, lo] = x > y ? [x, y] : [y, x];
	return (hi + 0.05) / (lo + 0.05);
}

describe('the registry', () => {
	it('lists four plates, default first, matrix last, each with a label, a short word and a note', () => {
		expect(NOTEBOOK_THEMES).toEqual(['default', 'light', 'idea', 'matrix']);
		for (const t of NOTEBOOK_THEMES) {
			expect(NOTEBOOK_THEME_LABELS[t], t).toBeTruthy();
			expect(NOTEBOOK_THEME_SHORT[t], t).toBeTruthy();
			expect(NOTEBOOK_THEME_NOTES[t], t).toBeTruthy();
			expect(NOTEBOOK_THEME_NOTES[t], t).not.toBe(NOTEBOOK_THEME_LABELS[t]);
		}
	});

	it('resolves what is showing: the default follows the site, an explicit plate does not', () => {
		expect(notebookPlateShowing('default', 'matrix')).toBe('matrix');
		expect(notebookPlateShowing('default', undefined)).toBe('default');
		expect(notebookPlateShowing('default', null)).toBe('default'); // not read yet
		expect(notebookPlateShowing('default', 'something-else')).toBe('default');
		// The room's own control wins inside the room.
		expect(notebookPlateShowing('light', 'matrix')).toBe('light');
		expect(notebookPlateShowing('idea', 'matrix')).toBe('idea');
		expect(notebookPlateShowing('matrix', undefined)).toBe('matrix');
	});

	it('the following note names the site theme it follows, and the picker renders it', () => {
		expect(NOTEBOOK_THEME_FOLLOWING_NOTE).toMatch(/Matrix/);
		expect(TOGGLE).toContain('NOTEBOOK_THEME_FOLLOWING_NOTE');
		// The trigger carries both facts: what is stored and what is showing.
		expect(TOGGLE).toMatch(/data-theme-state=\{theme\}/);
		expect(TOGGLE).toMatch(/data-theme-showing=\{showing\}/);
		// Read off the document, never off the site store (a second copy of
		// ThemeRoot's session gate is what would stop agreeing with it).
		expect(TOGGLE).toContain('watchSiteThemeOnDocument');
		expect(TOGGLE).not.toContain("from '$lib/theme.svelte'");
	});
});

describe('the matrix plate in the stylesheet', () => {
	it('is keyed on BOTH the notebook attribute and the site attribute over an unset plate', () => {
		expect(NB_THEME).toContain(MATRIX_PLATE);
		// And the canvas mirror follows the same two routes, or the page behind
		// the wrapper paints the light default under a black notebook.
		expect(NB_THEME).toMatch(
			/:root:has\(\.nb-root\[data-nb-theme='matrix'\]\),\n:root\[data-theme='matrix'\]:has\(\.nb-root:not\(\[data-nb-theme\]\)\) \{\n\t--nb-bg: #020402;/
		);
	});

	it('PARITY: the six register tokens are the site theme\'s own values, one to one', () => {
		const pairs: [string, string][] = [
			['--nb-bg', '--surface-0'],
			['--nb-surface', '--surface-1'],
			['--nb-surface-dim', '--surface-2'],
			['--nb-ink', '--text-1'],
			['--nb-ink-soft', '--text-2'],
			['--nb-boundary', '--boundary']
		];
		for (const [nb, site] of pairs) {
			const here = token(NB_THEME, MATRIX_PLATE, nb);
			const there = token(MATRIX, ":root[data-theme='matrix'] {", site);
			expect(here, `${nb} should be matrix.css's ${site}`).toBe(there);
		}
		// The mirror agrees with the plate.
		expect(token(NB_THEME, MATRIX_PLATE, '--nb-bg')).toBe('#020402');
	});

	it('POSITIVE CONTROL: the same mapping holds the DEFAULT plate to the unthemed register', () => {
		// If the reader above could not tell two files apart, this would be the
		// place it showed: the default plate is documented as the same six-token
		// map onto colors.css's :root register.
		const pairs: [string, string][] = [
			['--nb-bg', '--surface-0'],
			['--nb-surface', '--surface-1'],
			['--nb-surface-dim', '--surface-2'],
			['--nb-ink', '--text-1'],
			['--nb-ink-soft', '--text-2'],
			['--nb-boundary', '--boundary']
		];
		for (const [nb, site] of pairs) {
			expect(token(COLORS, '.nb-root:not([data-nb-theme]) {', nb)).toBe(token(COLORS, ':root {', site));
		}
	});

	it('every authored hex ink clears its floor on the three grounds', () => {
		const grounds = ['--nb-bg', '--nb-surface', '--nb-surface-dim'].map((g) => token(NB_THEME, MATRIX_PLATE, g));
		expect(grounds.every((g) => /^#[0-9a-f]{6}$/i.test(g))).toBe(true);
		const text = ['--nb-ink', '--nb-ink-soft', '--nb-ink-faint', '--nb-accent', '--nb-folder-slate', '--nb-folder-sage', '--nb-folder-clay', '--nb-folder-sky', '--nb-folder-plum'];
		let cases = 0;
		const failures: string[] = [];
		for (const name of text) {
			const fg = token(NB_THEME, MATRIX_PLATE, name);
			expect(fg, name).toMatch(/^#[0-9a-f]{6}$/i);
			for (const bg of grounds) {
				cases++;
				const r = contrast(fg, bg);
				if (r < 4.5) failures.push(`${name} ${fg} on ${bg} = ${r.toFixed(2)}`);
			}
		}
		const boundary = token(NB_THEME, MATRIX_PLATE, '--nb-boundary');
		for (const bg of grounds) {
			cases++;
			const r = contrast(boundary, bg);
			if (r < 3) failures.push(`--nb-boundary ${boundary} on ${bg} = ${r.toFixed(2)}`);
		}
		expect(cases).toBe(9 * 3 + 3);
		expect(failures).toEqual([]);
	});

	it('the faint tier is a real tier: measurably below the soft one and still clear of 4.5 on the card', () => {
		const card = token(NB_THEME, MATRIX_PLATE, '--nb-surface');
		const faint = contrast(token(NB_THEME, MATRIX_PLATE, '--nb-ink-faint'), card);
		const soft = contrast(token(NB_THEME, MATRIX_PLATE, '--nb-ink-soft'), card);
		expect(faint).toBeGreaterThanOrEqual(4.5);
		expect(soft - faint).toBeGreaterThan(1);
	});

	it('the site theme file still touches no --nb-* token: the follow is the notebook\'s to do', () => {
		expect(MATRIX.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--nb-[a-z-]+\s*:/);
	});

	it('the plate carries the pinned cell fills of the other dark plates, not a mix of the ink', () => {
		for (const name of ['--nb-cell-ontime-fill', '--nb-cell-late-fill', '--nb-cell-await-fill', '--nb-cell-flagged-fill']) {
			expect(token(NB_THEME, MATRIX_PLATE, name)).toBe(token(COLORS, '.nb-root:not([data-nb-theme]) {', name));
		}
	});
});
