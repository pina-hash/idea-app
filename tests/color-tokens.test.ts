/**
 * THE COLOR TOKENS, RE-DERIVED PER THEME AND HELD BY ARITHMETIC (ledger 0465,
 * feedback abb2c080, the first lane of the site-wide visual pass).
 *
 * Every regression this file catches is SILENT. A word one shade too dark on a
 * white panel renders perfectly; it is 4.3:1 instead of 4.5:1 and nobody files
 * it. Two status chips that a colorblind student cannot tell apart render
 * perfectly too. And a hex typed into a token file by hand, "close enough" to
 * what the solver gave, renders perfectly and is the first step back to the
 * hand-tuned palette the 2026-10-26 audit measured
 * (docs/design/site-ui-audit-2026-10-26/).
 *
 * WHAT IS HELD, IN ALL THREE THEMES (IDEA, Matrix, Space White):
 *
 *   1. DERIVATION. Each semantic token is what `solve()` in
 *      tools/hx-kit/color.mjs makes of its ANCHOR (the brand value, typed once
 *      below) over that theme's own grounds, read out of the stylesheets. The
 *      solver is imported, never copied: there is one solver in this
 *      repository and this file is a caller of it. The shipped hex may sit
 *      within 0.5 CIEDE2000 of solve()'s answer (the OKLCH round trip moves
 *      the brand green #78b870 by 0.29), never further.
 *   2. CONTRAST, WCAG 2.2, unrounded (4.499 fails). Words 4.5:1 and marks or
 *      edges 3:1 on every ground a theme paints: page, panel, inset, raised
 *      and the selected-row tint. The pairs the app makes beyond the grounds
 *      (the label on a status fill, on a primary key, on a brass plate) are
 *      listed one by one.
 *   3. NO MUDDY FILL: solve()'s own `isMuddy` (the dark-yellow-to-brown box)
 *      over every fill, composited onto each ground first when it is
 *      translucent. On the light theme a warm WORD is held to a chroma floor
 *      too, which is the "never brown text" half: the muted ochre #715d22 this
 *      replaced is the negative control.
 *   4. THE STATUS TONES APART: every pair of status chip fills at least 12
 *      CIEDE2000 apart in normal vision and 8 under simulated deuteranopia and
 *      protanopia (Machado 2009, severity 1), the kit's own floors for fills.
 *      The inks are NOT held to this, deliberately: 4.5:1 on a near-white
 *      panel pins every hue to about OKLCH L 0.5, so two inks can only differ
 *      in hue, which is exactly what those simulations remove (the research
 *      report computes 0.6 between the best warm inks). A status always
 *      carries its word and glyph (WCAG 1.4.1), and the chip's FILL is where
 *      colour tells tones apart, because a fill is free to differ in lightness.
 *
 * Where a pair is a known, documented failure the token cannot fix (--dim is
 * luminance-held for FRC's white paper), it is named in EXCEPTIONS with its
 * reason, and the test asserts every exception STILL fails, so a stale one
 * cannot sit in the list after the failure is gone.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Rgb = { r: number; g: number; b: number };
type Solved = { ink: string; fill: string; on: string; line: string; wash: string; washOver: string };
type Theme = { dark: boolean; panels: Rgb[] };
type ColorLib = {
	hex: (h: string) => Rgb;
	toHex: (c: Rgb) => string;
	contrast: (a: Rgb, b: Rgb) => number;
	over: (fg: Rgb, alpha: number, bg: Rgb) => Rgb;
	deltaE2000: (a: Rgb, b: Rgb) => number;
	simulate: (c: Rgb, kind: 'protan' | 'deutan' | 'tritan') => Rgb;
	isMuddy: (c: Rgb) => boolean;
	rgbToOklch: (c: Rgb) => { L: number; C: number; H: number };
	oklchToRgb: (L: number, C: number, H: number) => Rgb;
	solve: (anchor: string, theme: Theme) => Solved;
};

/* A computed URL, never a literal specifier: a literal import pulls the tool's
   JavaScript into svelte-check's program (docs/subsystems/testing.md). */
let K: ColorLib;
beforeAll(async () => {
	K = (await import(new URL('../tools/hx-kit/color.mjs', import.meta.url).href)) as ColorLib;
});

const DS = new URL('../src/lib/design-system/', import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, DS)), 'utf8');
const COLORS = read('colors.css');
const MATRIX = read('themes/matrix.css');
const SPACE_WHITE = read('themes/space-white.css');
/* The Plate (lane 0468's file; read here, never written): most pages a word
   sits on in IDEA, Matrix and Space White are drawn on its panels, chips and
   insets rather than on the bare theme grounds. */
const PLATE = readFileSync(fileURLToPath(new URL('../src/lib/classroom/plate.css', import.meta.url)), 'utf8');

/* ---- reading the stylesheets ------------------------------------------- */

/** The declarations of the ONE block whose selector is exactly `selector`. */
function block(css: string, selector: string): Record<string, string> {
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const re = /(?<=^|[};])\s*([^{};@]+?)\s*\{([^{}]*)\}/g;
	const found: Record<string, string>[] = [];
	for (const m of bare.matchAll(re)) {
		if (m[1].trim().replace(/\s+/g, ' ') !== selector) continue;
		const out: Record<string, string> = {};
		for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[d[1]] = d[2].trim().replace(/\s+/g, ' ');
		found.push(out);
	}
	if (found.length !== 1) throw new Error(`${selector}: ${found.length} blocks`);
	return found[0];
}

const BASE = block(COLORS, ':root');
const THEME_VARS: Record<ThemeId, Record<string, string>> = {
	idea: { ...BASE },
	matrix: { ...BASE, ...block(MATRIX, ":root[data-theme='matrix']") },
	'space-white': { ...BASE, ...block(SPACE_WHITE, ":root[data-theme='space-white']") }
};
type ThemeId = 'idea' | 'matrix' | 'space-white';
const THEMES: ThemeId[] = ['idea', 'matrix', 'space-white'];
/** The notebook room's tokens, declared on .nb-root over the site theme. */
const NB_VARS: Record<ThemeId, Record<string, string>> = {
	idea: { ...THEME_VARS.idea, ...block(COLORS, '.nb-root') },
	matrix: { ...THEME_VARS.matrix, ...block(COLORS, '.nb-root'), ...block(COLORS, ":root[data-theme='matrix'] .nb-root") },
	'space-white': {
		...THEME_VARS['space-white'],
		...block(COLORS, '.nb-root'),
		...block(COLORS, ":root[data-theme='space-white'] .nb-root")
	}
};

type Paint = { rgb: Rgb; a: number };
/** A token's painted value: hex, rgba(), var() (with fallback) and
    color-mix(in srgb, A p%, B) -- every form these files use. Throws on any
    other form rather than guessing. */
function paint(value: string, vars: Record<string, string>, depth = 0): Paint {
	if (depth > 20) throw new Error(`alias loop at ${value}`);
	const v = value.trim();
	let m: RegExpMatchArray | null;
	if ((m = v.match(/^#[0-9a-f]{3,6}$/i))) return { rgb: K.hex(v), a: 1 };
	if (v === 'transparent') return { rgb: { r: 0, g: 0, b: 0 }, a: 0 };
	if ((m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)))
		return { rgb: { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 }, a: m[4] === undefined ? 1 : +m[4] };
	if ((m = v.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i))) {
		if (m[1] in vars) return paint(vars[m[1]], vars, depth + 1);
		if (m[2]) return paint(m[2], vars, depth + 1);
		throw new Error(`undefined ${m[1]}`);
	}
	if ((m = v.match(/^color-mix\(\s*in srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/i))) {
		const p = +m[2] / 100;
		const A = paint(m[1], vars, depth + 1);
		const B = paint(m[3], vars, depth + 1);
		if (B.a === 0) return { rgb: A.rgb, a: A.a * p };
		return { rgb: K.over(A.rgb, p, B.rgb), a: 1 };
	}
	throw new Error(`cannot read the colour value "${v}"`);
}
const tok = (theme: ThemeId, name: string, vars = THEME_VARS[theme]) => {
	if (!(name in vars)) throw new Error(`${theme}: ${name} is not declared`);
	return paint(vars[name], vars);
};
const opaque = (p: Paint, ground: Rgb) => (p.a >= 1 ? p.rgb : K.over(p.rgb, p.a, ground));
const hexOf = (theme: ThemeId, name: string, vars = THEME_VARS[theme]) => {
	const p = tok(theme, name, vars);
	if (p.a < 1) throw new Error(`${theme}: ${name} is translucent`);
	return K.toHex(p.rgb);
};

/* ---- the grounds, read off the files ------------------------------------ */

/** Where a word sits. solve() is handed these; the board adds the tint. */
const PAGE_GROUNDS = ['--bg1', '--bg0', '--bg2', '--surface-0', '--surface-1', '--surface-2', '--surface-raised'];
/** --plate is left out on purpose: colors.css says nothing renders on it, and
    a grep of src/ finds no `var(--plate)` outside the token files. */
const BOARD_GROUNDS = [...PAGE_GROUNDS, '--green-tint'];
const themeGrounds = (theme: ThemeId, list = BOARD_GROUNDS) => list.map((n) => [n, tok(theme, n).rgb] as const);

/** The Plate's faces a word is drawn on: its plate, panel, inset, chip and
    list faces. Its KEY faces and WELLS are left out: a key's label is the
    plate's own --plate-btn-ink, never a semantic hue (the space-white.css
    header gives the figure). */
const PLATE_GROUNDS = [
	'--plate-plate-top',
	'--plate-plate-bot',
	'--plate-inset-top',
	'--plate-inset-bot',
	'--plate-panel-top',
	'--plate-panel-bot',
	'--plate-chip-top',
	'--plate-chip-bot',
	'--plate-list-face'
];
const PLATE_DARK = block(PLATE, ':is(.cr-plate, .site-plate), body:has(:is(.cr-plate, .site-plate))');
const plateBlock = (id: string) =>
	block(PLATE, `:root[data-theme='${id}'] :is(.cr-plate, .site-plate), :root[data-theme='${id}'] body:has(:is(.cr-plate, .site-plate))`);
const PLATE_VARS: Record<ThemeId, Record<string, string>> = {
	idea: { ...THEME_VARS.idea, ...PLATE_DARK },
	matrix: { ...THEME_VARS.matrix, ...PLATE_DARK, ...plateBlock('matrix') },
	'space-white': { ...THEME_VARS['space-white'], ...PLATE_DARK, ...plateBlock('space-white') }
};
const plateGrounds = (theme: ThemeId) => PLATE_GROUNDS.map((n) => [n, tok(theme, n, PLATE_VARS[theme]).rgb] as const);
/** Every ground a word is checked on: the theme's own and the Plate's. */
const grounds = (theme: ThemeId, list = BOARD_GROUNDS) => [...themeGrounds(theme, list), ...plateGrounds(theme)];

/* ---- the anchors: the only colour values this file types ---------------- */

/** Each semantic role's brand value. Nothing here is read from the files. */
const ANCHOR = {
	green: '#78b870',
	gold: '#c8a848',
	cyan: '#5abda8',
	amber: '#d08030',
	crimson: '#d95f5f',
	violet: '#7050a8',
	boundary: '#6f7b73'
} as const;

/** The status tones: each is a hue's anchor at a chosen OKLCH lightness, and
    solve() derives its chip fill, the label on it and its quiet tint. The
    lightness is the one free choice, made to spread the five fills apart (the
    audit's ranked fix 1); everything else is the solver's. */
const TONES = {
	ok: { hue: 'green', dark: 0.82, light: 0.58 },
	warn: { hue: 'amber', dark: 0.66, light: 0.74 },
	danger: { hue: 'crimson', dark: 0.64, light: 0.66 },
	info: { hue: 'cyan', dark: 0.72, light: 0.66 },
	special: { hue: 'gold', dark: 0.78, light: 0.86 }
} as const;
type Tone = keyof typeof TONES;
const TONE_NAMES = Object.keys(TONES) as Tone[];
const toneAnchor = (t: Tone, dark: boolean) => {
	const { hue, ...L } = TONES[t];
	const a = K.rgbToOklch(K.hex(ANCHOR[hue]));
	return K.toHex(K.oklchToRgb(dark ? L.dark : L.light, a.C, a.H));
};

/** The solver's theme arguments. The dark :root value is read by IDEA AND by
    Matrix (an unscoped theme may not repaint a semantic hue), so a dark ink is
    solved over both themes' grounds at once. */
const DARK = (): Theme => ({
	dark: true,
	panels: [...grounds('idea', PAGE_GROUNDS), ...grounds('matrix', PAGE_GROUNDS)].map(([, g]) => g)
});
/** The same, with IDEA's neutral --surface-1 first: solve() composites its
    wash over panels[0], and a tint pinned over the neutral panel keeps its
    hue (the 12% mixes it replaced read a red tint as olive over --bg1). */
const DARK_WASH = (): Theme => {
	const s1 = tok('idea', '--surface-1').rgb;
	return { dark: true, panels: [s1, ...DARK().panels] };
};
const LIGHT = (): Theme => ({ dark: false, panels: grounds('space-white', PAGE_GROUNDS).map(([, g]) => g) });

/* ---- what is checked as what --------------------------------------------- */

const TEXT = [
	'--green',
	'--gold',
	'--cyan',
	'--amber',
	'--crimson',
	'--violet-ink',
	'--teal',
	'--status-ok',
	'--status-warn',
	'--status-danger',
	'--status-info',
	'--status-special',
	'--accent-ink',
	'--signal-hot',
	'--hover-ink',
	'--text-1',
	'--text-2',
	'--white',
	'--ice',
	'--dim'
];
/** Marks and edges: 3:1. --text-3, --hairline and --line are DECORATION by
    the register's own definition and are not measured (themes.md, "a boundary
    that carries meaning and one that decorates are two tokens"); the large
    --accent-field "must never carry a word" and is a ground, not a mark. */
const NON_TEXT = ['--violet', '--boundary', '--gear', '--focus-ring', '--accent-fill'];

/** theme:token:ground. Each must STILL fail, or it is removed. */
const EXCEPTIONS: Record<string, string> = {
	'idea:--dim:--bg2':
		'--dim is luminance-held: lightening it takes FRC paper from 2.95 to 2.72 (themes.md); its --bg2 uses moved to --text-2 in ledgers 0286 and 0346',
	'idea:--dim:--green-tint': 'the same luminance-held tier; a selected row is register copy, --text-1 and --text-2',
	'matrix:--dim:--green-tint': "Matrix holds --dim at IDEA's luminance, so the same tint answer holds"
};

function ratioOn(theme: ThemeId, name: string, groundName: string, ground: Rgb) {
	return K.contrast(opaque(tok(theme, name), ground), ground);
}

describe('the anchors and grounds are real (positive controls on the readers)', () => {
	it('reads the three themes off the files', () => {
		expect(Object.keys(BASE).length).toBeGreaterThan(60);
		expect(hexOf('idea', '--bg1')).toBe('#1a2a1a');
		expect(hexOf('matrix', '--bg1')).toBe('#0c140d');
		expect(hexOf('space-white', '--bg1')).toBe('#f7f9f9');
		// an alias resolves through the theme it is read in
		expect(hexOf('space-white', '--status-ok')).toBe(hexOf('space-white', '--green'));
	});

	it('the old crimson fails the word floor on --bg1 and the new one clears it, so the board can fail', () => {
		const bg1 = tok('idea', '--bg1').rgb;
		expect(K.contrast(K.hex('#d95f5f'), bg1)).toBeLessThan(4.5);
		expect(K.contrast(K.hex('#7050a8'), bg1)).toBeLessThan(3);
		expect(ratioOn('idea', '--crimson', '--bg1', bg1)).toBeGreaterThanOrEqual(4.5);
	});
});

describe('1. every semantic token is what solve() makes of its anchor', () => {
	const near = (shipped: string, solved: string) => K.deltaE2000(K.hex(shipped), K.hex(solved));
	const expectSolved = (theme: ThemeId, name: string, solved: string) => {
		const shipped = hexOf(theme, name);
		expect(near(shipped, solved), `${theme} ${name}: shipped ${shipped}, solve() gives ${solved}`).toBeLessThanOrEqual(0.5);
	};

	it('dark :root inks and marks, solved over the IDEA and Matrix grounds together', () => {
		for (const hue of ['green', 'gold', 'cyan', 'amber', 'crimson'] as const) {
			const s = K.solve(ANCHOR[hue], DARK());
			expectSolved('idea', `--${hue}`, s.ink);
			expectSolved('matrix', `--${hue}`, s.ink);
		}
		const v = K.solve(ANCHOR.violet, DARK());
		expectSolved('idea', '--violet', v.fill);
		expectSolved('idea', '--violet-ink', v.ink);
		// --boundary is IDEA's own (Matrix and Space White declare theirs): the
		// line solve() gives over IDEA's grounds and the selected-row tint. The
		// Plate draws its own edges in --plate-hair, so its faces are not here.
		const b = K.solve(ANCHOR.boundary, { dark: true, panels: themeGrounds('idea').map(([, g]) => g) });
		expectSolved('idea', '--boundary', b.line);
	});

	it('Space White inks and marks, solved over its own grounds', () => {
		for (const hue of ['green', 'gold', 'cyan', 'crimson'] as const) {
			expectSolved('space-white', `--${hue}`, K.solve(ANCHOR[hue], LIGHT()).ink);
		}
		/* COPPER SITS ON A WASH OF ITSELF. plate.css lays the copper word on
		   color-mix(--amber 14%, the chip ground) and, on Space White, on 14%
		   over white (the missing count, the needs-attention flag), so those
		   are grounds too. The ground depends on the ink, so the ink is
		   solve()'s fixed point: hand it the washes of its last answer until
		   the answer stops moving (it settles in three rounds). */
		const chip = tok('space-white', '--plate-chip-ground', PLATE_VARS['space-white']).rgb;
		let amber = K.solve(ANCHOR.amber, LIGHT()).ink;
		for (let i = 0, prev = ''; i < 12 && amber !== prev; i++) {
			prev = amber;
			const washes = [chip, K.hex('#ffffff')].map((g) => K.over(K.hex(amber), 0.14, g));
			amber = K.solve(ANCHOR.amber, { dark: false, panels: [...LIGHT().panels, ...washes] }).ink;
		}
		expectSolved('space-white', '--amber', amber);
		const shipped = tok('space-white', '--amber').rgb;
		expect(K.contrast(shipped, K.over(shipped, 0.14, chip))).toBeGreaterThanOrEqual(4.5);
		const v = K.solve(ANCHOR.violet, LIGHT());
		expectSolved('space-white', '--violet', v.fill);
		expectSolved('space-white', '--violet-ink', v.ink);
	});

	it('every status tone: the chip fill, the label on it, and the tint behind a band', () => {
		for (const t of TONE_NAMES) {
			const d = K.solve(toneAnchor(t, true), DARK_WASH());
			for (const theme of ['idea', 'matrix'] as const) {
				expectSolved(theme, `--status-${t}-solid`, d.fill);
				expectSolved(theme, `--status-${t}-on`, d.on);
				expectSolved(theme, `--status-${t}-fill`, d.washOver);
			}
			const l = K.solve(toneAnchor(t, false), LIGHT());
			expectSolved('space-white', `--status-${t}-solid`, l.fill);
			expectSolved('space-white', `--status-${t}-on`, l.on);
			// On the light theme the band IS the bright fill, with dark text on
			// it: a warm colour there is a fill, never a brown word.
			expectSolved('space-white', `--status-${t}-fill`, l.fill);
		}
	});

	it("the notebook's brass word on Space White is solved over the room's grounds AND its own wash", () => {
		const nb = NB_VARS['space-white'];
		const room = ['--nb-bg', '--nb-surface', '--nb-surface-dim'].map((n) => tok('space-white', n, nb).rgb);
		const wash = tok('space-white', '--nb-accent-wash', nb);
		const s = K.solve(ANCHOR.gold, { dark: false, panels: [...LIGHT().panels, ...room.map((g) => opaque(wash, g))] });
		const shipped = hexOf('space-white', '--nb-accent-ink', nb);
		expect(near(shipped, s.ink), `shipped ${shipped}, solve() gives ${s.ink}`).toBeLessThanOrEqual(0.5);
	});

	it('teal is retired as a meaning: it resolves to --cyan everywhere and no theme declares it', () => {
		expect(BASE['--teal']).toBe('var(--cyan)');
		for (const theme of THEMES) expect(hexOf(theme, '--teal'), theme).toBe(hexOf(theme, '--cyan'));
		expect(block(MATRIX, ":root[data-theme='matrix']")['--teal']).toBeUndefined();
		expect(block(SPACE_WHITE, ":root[data-theme='space-white']")['--teal']).toBeUndefined();
	});
});

describe('2. contrast: words 4.5:1, marks and edges 3:1, on every ground', () => {
	for (const theme of THEMES) {
		it(`${theme}: every word token on every ground`, () => {
			const low: string[] = [];
			let cells = 0;
			for (const name of TEXT)
				for (const [gn, g] of grounds(theme)) {
					cells++;
					const r = ratioOn(theme, name, gn, g);
					const key = `${theme}:${name}:${gn}`;
					if (key in EXCEPTIONS) continue;
					if (r < 4.5) low.push(`${name} on ${gn} ${r.toFixed(2)}`);
				}
			expect(cells).toBe(TEXT.length * (BOARD_GROUNDS.length + PLATE_GROUNDS.length));
			expect(low).toEqual([]);
		});

		it(`${theme}: every mark and edge token on every ground`, () => {
			const low: string[] = [];
			for (const name of NON_TEXT)
				for (const [gn, g] of grounds(theme)) {
					const r = ratioOn(theme, name, gn, g);
					if (r < 3) low.push(`${name} on ${gn} ${r.toFixed(2)}`);
				}
			expect(low).toEqual([]);
		});

		it(`${theme}: the pairs the app draws beyond the grounds`, () => {
			const P = (fg: string, bg: string, floor: number) => {
				const b = opaque(tok(theme, bg), tok(theme, '--bg1').rgb);
				return { pair: `${fg} on ${bg}`, r: K.contrast(opaque(tok(theme, fg), b), b), floor };
			};
			const pairs = [
				P('--accent-on-fill', '--accent-fill', 4.5),
				// --edge is the label on a brass or green plate (the required callout's tag)
				P('--edge', '--gold', 4.5),
				P('--edge', '--green', 4.5),
				...TONE_NAMES.flatMap((t) => [
					P(`--status-${t}-on`, `--status-${t}-solid`, 4.5),
					// every band carries body copy: the classroom's notebook count,
					// the coin fine banner and the inbox acknowledgement paint
					// --text-1 on a status fill today
					P('--text-1', `--status-${t}-fill`, 4.5),
					// a dark band also carries its own ink, the word and glyph of
					// a soft chip; on the light theme the word on a fill is -on
					...(theme === 'space-white'
						? [P(`--status-${t}-on`, `--status-${t}-fill`, 4.5)]
						: [P(`--status-${t}`, `--status-${t}-fill`, 4.5)])
				])
			];
			expect(pairs.length).toBe(3 + TONE_NAMES.length * 3);
			expect(pairs.filter((p) => p.r < p.floor).map((p) => `${p.pair} ${p.r.toFixed(2)}`)).toEqual([]);
		});

		it(`${theme}: the notebook room's own inks and pinned fills`, () => {
			const nb = NB_VARS[theme];
			const room = ['--nb-bg', '--nb-surface', '--nb-surface-dim'].map((n) => [n, tok(theme, n, nb).rgb] as const);
			const words = [
				'--nb-ink',
				'--nb-ink-soft',
				'--nb-ink-faint',
				'--nb-accent-ink',
				'--nb-ok',
				'--nb-error',
				'--nb-warn',
				'--nb-folder-slate',
				'--nb-folder-sage',
				'--nb-folder-clay',
				'--nb-folder-sky',
				'--nb-folder-plum'
			];
			const low: string[] = [];
			for (const w of words)
				for (const [gn, g] of room) {
					const r = K.contrast(opaque(tok(theme, w, nb), g), g);
					if (r < 4.5) low.push(`${w} on ${gn} ${r.toFixed(2)}`);
				}
			/* The review grid's cells sit on the CARD, and the three that fill with
			   nothing draw their glyph on it directly (colors.css's own
			   measurement); the four that fill draw it on their pinned fill. */
			const card = tok(theme, '--nb-surface', nb).rgb;
			for (const cell of ['excused', 'missing', 'scheduled']) {
				const r = K.contrast(tok(theme, `--nb-cell-${cell}`, nb).rgb, card);
				if (r < 4.5) low.push(`--nb-cell-${cell} on the card ${r.toFixed(2)}`);
			}
			for (const cell of ['ontime', 'late', 'await', 'flagged']) {
				const fill = tok(theme, `--nb-cell-${cell}-fill`, nb).rgb;
				const r = K.contrast(tok(theme, `--nb-cell-${cell}`, nb).rgb, fill);
				if (r < 4.5) low.push(`--nb-cell-${cell} on its fill ${r.toFixed(2)}`);
			}
			expect(low).toEqual([]);
		});
	}

	it('every named exception still fails, so none outlives its failure', () => {
		for (const key of Object.keys(EXCEPTIONS)) {
			const [theme, name, gn] = key.split(':') as [ThemeId, string, string];
			const g = tok(theme, gn).rgb;
			expect(ratioOn(theme, name, gn, g), key).toBeLessThan(4.5);
		}
	});
});

describe('3. no muddy fill, and no brown word on the light theme', () => {
	const FILLS = [
		...TONE_NAMES.flatMap((t) => [`--status-${t}-solid`, `--status-${t}-fill`]),
		'--accent-fill',
		'--accent-field',
		'--green-tint',
		'--violet'
	];
	for (const theme of THEMES) {
		it(`${theme}: no fill lands in the dark-yellow-to-brown box, on any ground`, () => {
			const mud: string[] = [];
			for (const name of FILLS)
				for (const [gn, g] of grounds(theme)) {
					const c = opaque(tok(theme, name), g);
					if (K.isMuddy(c)) mud.push(`${name} over ${gn} ${K.toHex(c)}`);
				}
			const nb = NB_VARS[theme];
			for (const cell of ['ontime', 'late', 'await', 'flagged']) {
				const c = tok(theme, `--nb-cell-${cell}-fill`, nb).rgb;
				if (K.isMuddy(c)) mud.push(`--nb-cell-${cell}-fill ${K.toHex(c)}`);
			}
			expect(mud).toEqual([]);
		});
	}

	/* A dark warm word reads as an ochre or a burnt orange only while it keeps
	   its chroma; muted, it is brown (solve()'s own note). The floor is OKLCH C
	   0.10: the Radix, Apple and Primer light-theme yellow inks sit at 0.12, and
	   the #715d22 Mr. Pina called ugly sits at 0.081. */
	const brownWord = (hex: string) => {
		const { L, C, H } = K.rgbToOklch(K.hex(hex));
		return H >= 35 && H <= 115 && L < 0.66 && C >= 0.03 && C < 0.1;
	};
	it('Space White: every warm word keeps its chroma', () => {
		expect(brownWord('#715d22')).toBe(true); // the gold this replaced
		expect(brownWord('#77491b')).toBe(true); // the amber this replaced
		const brown = TEXT.filter((n) => brownWord(hexOf('space-white', n)));
		expect(brown).toEqual([]);
	});
});

describe('4. the status tones stay apart, also for a colorblind student', () => {
	const apart = (hexes: Record<string, string>) => {
		const close: string[] = [];
		const names = Object.keys(hexes);
		for (let i = 0; i < names.length; i++)
			for (let j = i + 1; j < names.length; j++) {
				const a = K.hex(hexes[names[i]]);
				const b = K.hex(hexes[names[j]]);
				const n = K.deltaE2000(a, b);
				const d = K.deltaE2000(K.simulate(a, 'deutan'), K.simulate(b, 'deutan'));
				const p = K.deltaE2000(K.simulate(a, 'protan'), K.simulate(b, 'protan'));
				if (n < 12 || d < 8 || p < 8)
					close.push(`${names[i]}/${names[j]} ${n.toFixed(1)}, deutan ${d.toFixed(1)}, protan ${p.toFixed(1)}`);
			}
		return close;
	};

	it('POSITIVE CONTROL: the pale Space White fills this replaced fail the floor', () => {
		const before = { ok: '#ddebda', warn: '#f2e3d0', danger: '#f6dcdc', info: '#d8eae6' };
		expect(apart(before).length).toBeGreaterThan(0);
	});

	for (const theme of THEMES) {
		it(`${theme}: every pair of status chip fills clears 12 normal and 8 deutan and protan`, () => {
			const fills = Object.fromEntries(TONE_NAMES.map((t) => [t, hexOf(theme, `--status-${t}-solid`)]));
			expect(Object.keys(fills).length).toBe(5);
			expect(apart(fills)).toEqual([]);
		});
	}

	it('on Space White the band and the chip are one bright fill, spread in lightness', () => {
		const Ls = TONE_NAMES.map((t) => {
			expect(hexOf('space-white', `--status-${t}-fill`)).toBe(hexOf('space-white', `--status-${t}-solid`));
			return K.rgbToOklch(K.hex(hexOf('space-white', `--status-${t}-fill`))).L;
		});
		// the fills it replaced sat inside 0.04 of each other (0.89 to 0.95)
		expect(Math.max(...Ls) - Math.min(...Ls)).toBeGreaterThan(0.2);
	});
});

describe('the fixed rules CLAUDE.md states for colour', () => {
	it('no token in the three files is pure red, pure white or pure yellow', () => {
		const banned = ['#ff0000', '#ffffff', '#ffff00'];
		const hits: string[] = [];
		for (const theme of THEMES)
			for (const [n, v] of Object.entries(THEME_VARS[theme])) {
				let p: Paint;
				try {
					p = paint(v, THEME_VARS[theme]);
				} catch {
					continue; // shadows, gradients and other non-colour values
				}
				// an opaque paint; --hairline is 8% white over a dark plate, a rule, not white
				if (banned.includes(K.toHex(p.rgb)) && p.a >= 1) hits.push(`${theme} ${n}`);
			}
		expect(hits).toEqual([]);
	});

	it('green stays the primary key, crimson stays live and error, on every theme', () => {
		for (const theme of THEMES) {
			expect(THEME_VARS[theme]['--accent-fill'], theme).toBe('var(--green)');
			expect(THEME_VARS[theme]['--status-ok'], theme).toBe('var(--green)');
			expect(THEME_VARS[theme]['--status-danger'], theme).toBe('var(--crimson)');
		}
	});
});
