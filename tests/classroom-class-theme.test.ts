// CLASS THEMES (decision 45, report R07): the catalogue, its resolution, its
// transports, and the contrast sweep that says every option can be painted.
//
// Why a test and not only a harness. Three things here fail SILENTLY:
//
//  - An option id is a value stored in vote rows and on sections, so dropping
//    or renaming one turns a class's choice back into the default with nothing
//    said anywhere. The lists are pinned as PREFIXES (append-only).
//  - An id this build does not know must be DROPPED, never drawn. A read that
//    let one through would still render -- as a default, or a blank.
//  - A colour that sits under the floor on one theme's ground renders
//    perfectly and reads as a slightly quieter banner, which nobody reports.
//    So every palette and every accent is measured on every ground of all
//    three site themes, read out of the theme CSS rather than typed here, and
//    under the projector model the browser harness uses.

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BADGE_BY_ID } from '$lib/identity-style';
import {
	CLASS_THEME_BADGES,
	CLASS_THEME_DEFAULTS,
	CLASS_THEME_FEATURES,
	CLASS_THEME_ID,
	CLASS_THEME_IDLE_POLL_MS,
	CLASS_THEME_NOT_A_CHOICE,
	CLASS_THEME_OPTIONS,
	CLASS_THEME_PALETTES,
	CLASS_THEME_PATTERN_ALPHA,
	CLASS_THEME_PATTERNS,
	CLASS_THEME_POLL_MS,
	CLASS_THEME_UNREACHABLE,
	CLASS_THEME_VOTE_NOT_COUNTED,
	CLASS_THEME_WASH_ALPHA,
	SECTION_ACCENTS,
	classThemeBallot,
	classThemeCss,
	classThemePollMs,
	classThemeVars,
	classThemeWords,
	classThemesBySection,
	createClassThemeTransports,
	parseClassThemeTally,
	resolveClassTheme,
	themeColourCss,
	type ClassTheme,
	type ClassThemeTransports,
	type ThemeColour,
	type ThemeSide
} from '$lib/classroom/class-theme';

/**
 * THE PROJECTOR MODEL IS THE HARNESS'S OWN, IMPORTED THROUGH A COMPUTED URL.
 * A literal specifier pulls `tools/browser-verify/checks.mjs` into
 * svelte-check's program, and measured here that took the baseline from 0
 * errors to 126, all in a harness module this file does not own. The computed
 * URL is what tests/browser-verify-prepare-until.test.ts already does for the
 * same reason; the numbers still come from the one implementation.
 */
type Rgb255 = { r: number; g: number; b: number };
let PROJECTOR_MODEL: { contrast: number; ambient: number };
let washedRatio: (a: Rgb255, b: Rgb255) => number;
beforeAll(async () => {
	const checks = await import(new URL('../tools/browser-verify/checks.mjs', import.meta.url).href);
	({ PROJECTOR_MODEL, washedRatio } = checks);
	expect(typeof washedRatio).toBe('function');
});

/* -------------------------------------------------------------------------- */
/* Colour arithmetic (the sRGB WCAG formula; the projector half is imported)  */
/* -------------------------------------------------------------------------- */

type Rgb = [number, number, number]; // 0..255
type Rgba = { rgb: Rgb; alpha: number };

function hslToRgb(h: number, s: number, l: number): Rgb {
	s /= 100;
	l /= 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const sextant: Rgb[] = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x]
	];
	const [r, g, b] = sextant[Math.min(5, Math.floor(h / 60))];
	return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
	[r, g, b] = [r / 255, g / 255, b / 255];
	const mx = Math.max(r, g, b);
	const mn = Math.min(r, g, b);
	const d = mx - mn;
	const l = (mx + mn) / 2;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d) {
		if (mx === r) h = ((g - b) / d) % 6;
		else if (mx === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return [h, s * 100, l * 100];
}
/**
 * A colour as this module or a theme file writes one. Anything else throws,
 * so a new spelling cannot pass by parsing to black.
 */
function parse(value: string): Rgba & { hsl: [number, number, number] } {
	const v = value.trim();
	const hex = v.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const rgb = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb;
		return { rgb, alpha: 1, hsl: rgbToHsl(rgb) };
	}
	const hsl = v.match(/^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%(?: \/ ([\d.]+))?\)$/);
	if (hsl) {
		const [h, s, l] = hsl.slice(1, 4).map(Number);
		const alpha = hsl[4] === undefined ? 1 : Number(hsl[4]);
		return { rgb: hslToRgb(h, s, l), alpha, hsl: [h, s, l] };
	}
	throw new Error(`unparsed colour ${value}`);
}
const lin = (v: number) => {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb, b: Rgb) => {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
};
const projector = (a: Rgb, b: Rgb) =>
	washedRatio({ r: a[0], g: a[1], b: a[2] }, { r: b[0], g: b[1], b: b[2] });
/** Alpha composited in sRGB, as a browser paints it. */
const over = ({ rgb, alpha }: Rgba, bg: Rgb): Rgb =>
	rgb.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/* -------------------------------------------------------------------------- */
/* The grounds, read out of the theme CSS                                     */
/* -------------------------------------------------------------------------- */

function blockAfter(css: string, header: string): string {
	const start = css.indexOf(header);
	if (start < 0) throw new Error(`no block ${header}`);
	const open = css.indexOf('{', start);
	return css.slice(open + 1, css.indexOf('\n}', open));
}
function hexIn(block: string, name: string): string | null {
	return block.match(new RegExp(`\\n\\s*${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1] ?? null;
}
function declares(block: string, name: string): boolean {
	return new RegExp(`\\n\\s*${name}:`).test(block);
}
const colorsCss = readFileSync('src/lib/design-system/colors.css', 'utf8');
const plateCss = readFileSync('src/lib/classroom/plate.css', 'utf8');
const SITE = {
	idea: blockAfter(colorsCss, ':root {'),
	matrix: blockAfter(
		readFileSync('src/lib/design-system/themes/matrix.css', 'utf8'),
		":root[data-theme='matrix'] {"
	),
	'space-white': blockAfter(
		readFileSync('src/lib/design-system/themes/space-white.css', 'utf8'),
		":root[data-theme='space-white'] {"
	)
};
const PLATE = {
	idea: blockAfter(plateCss, ':is(.cr-plate, .site-plate),\nbody:has(:is(.cr-plate, .site-plate)) {'),
	matrix: blockAfter(plateCss, ":root[data-theme='matrix'] :is(.cr-plate, .site-plate),"),
	'space-white': blockAfter(plateCss, ":root[data-theme='space-white'] :is(.cr-plate, .site-plate),")
};

/** Where a banner or a class card can sit: the room's own grounds and the plate's page and card faces. */
const BANNER_GROUNDS = [
	'--surface-0',
	'--surface-1',
	'--surface-2',
	'--plate-plate-top',
	'--plate-plate-bot',
	'--plate-panel-top',
	'--plate-panel-bot'
];
/** A header strip key: an edge or an accent may sit on its face, bare. */
const KEY_GROUNDS = ['--plate-face-top', '--plate-face-bot', '--plate-lit-top'];

type ThemeName = keyof typeof SITE;
const THEMES: { name: ThemeName; side: ThemeSide }[] = [
	{ name: 'idea', side: 'dark' },
	{ name: 'matrix', side: 'dark' },
	{ name: 'space-white', side: 'light' }
];
/**
 * One token as the theme paints it. A plate token a theme block does not
 * declare at all is the IDEA block's, which applies under every theme; one it
 * declares as anything but a hex throws, so a `var()` cannot be measured as
 * the IDEA value by accident.
 */
function token(theme: ThemeName, name: string): Rgb {
	const plate = name.startsWith('--plate-');
	const block = plate ? PLATE[theme] : SITE[theme];
	const own = hexIn(block, name);
	if (!own && declares(block, name)) throw new Error(`${theme} declares ${name} as a non-hex`);
	const value = own ?? (plate ? hexIn(PLATE.idea, name) : null);
	if (!value) throw new Error(`${theme} does not declare ${name} as a hex`);
	return parse(value).rgb;
}
const grounds = (theme: ThemeName, names: string[]) =>
	names.map((n) => [n, token(theme, n)] as const);

describe('the grounds are read from the theme files', () => {
	it('finds every ground: dark for IDEA and Matrix, light for Space White (positive control)', () => {
		for (const { name, side } of THEMES) {
			const all = grounds(name, [...BANNER_GROUNDS, ...KEY_GROUNDS]);
			expect(all.length).toBe(10);
			for (const [g, rgb] of all) {
				if (side === 'dark') expect(lum(rgb), `${name} ${g}`).toBeLessThan(0.06);
				else expect(lum(rgb), `${name} ${g}`).toBeGreaterThan(0.45);
			}
			const ink = token(name, '--text-1');
			if (side === 'dark') expect(lum(ink)).toBeGreaterThan(0.6);
			else expect(lum(ink)).toBeLessThan(0.02);
		}
		// Matrix's and Space White's faces are their own, not the IDEA block's read twice.
		expect(token('matrix', '--plate-panel-top')).not.toEqual(token('idea', '--plate-panel-top'));
		expect(token('space-white', '--plate-face-top')).not.toEqual(token('idea', '--plate-face-top'));
	});
});

/* -------------------------------------------------------------------------- */
/* The catalogue                                                              */
/* -------------------------------------------------------------------------- */

/**
 * THE SHIPPED IDS, AS PREFIXES. A shipped id may be stored in a vote row or on
 * a section, so these lists only ever grow at the end: a removal, a rename or
 * a reorder reddens here, an addition does not.
 */
const PINNED: Record<string, readonly string[]> = {
	palette: ['idea', 'frc', 'ocean', 'ember', 'violet', 'steel'],
	pattern: ['plain', 'stripes', 'rings', 'rays', 'ripples'],
	badge: ['none', 'bolt', 'star', 'shield', 'gear', 'rocket', 'flame'],
	accent: ['gold', 'tangerine', 'rose', 'violet', 'sky', 'mint']
};
const LISTS: Record<string, readonly { id: string; label: string }[]> = {
	palette: CLASS_THEME_PALETTES,
	pattern: CLASS_THEME_PATTERNS,
	badge: CLASS_THEME_BADGES,
	accent: SECTION_ACCENTS
};

describe('the catalogue', () => {
	it('votes on three features, in order, each with its own option list', () => {
		expect(CLASS_THEME_FEATURES).toEqual(['palette', 'pattern', 'badge']);
		expect(CLASS_THEME_OPTIONS.palette).toBe(CLASS_THEME_PALETTES);
		expect(CLASS_THEME_OPTIONS.pattern).toBe(CLASS_THEME_PATTERNS);
		expect(CLASS_THEME_OPTIONS.badge).toBe(CLASS_THEME_BADGES);
	});

	it('keeps every shipped id, in its place (append-only)', () => {
		for (const [name, pinned] of Object.entries(PINNED)) {
			expect(LISTS[name].map((o) => o.id).slice(0, pinned.length), name).toEqual(pinned);
		}
	});

	it('offers four to eight options per list, unique ids the database accepts, each labelled', () => {
		for (const [name, list] of Object.entries(LISTS)) {
			expect(list.length, name).toBeGreaterThanOrEqual(4);
			expect(list.length, name).toBeLessThanOrEqual(8);
			const ids = list.map((o) => o.id);
			expect(new Set(ids).size, name).toBe(ids.length);
			for (const o of list) {
				expect(o.id, name).toMatch(CLASS_THEME_ID);
				expect(o.label.trim(), `${name} ${o.id}`).not.toBe('');
			}
		}
		for (const f of CLASS_THEME_FEATURES) expect(f).toMatch(CLASS_THEME_ID);
	});

	it('gives every feature a default that is one of its own options', () => {
		for (const f of CLASS_THEME_FEATURES) {
			expect(CLASS_THEME_OPTIONS[f].map((o) => o.id), f).toContain(CLASS_THEME_DEFAULTS[f]);
		}
		expect(CLASS_THEME_DEFAULTS).toEqual({ palette: 'idea', pattern: 'plain', badge: 'none' });
	});

	it('takes every badge from the identity layer by reference, never a copy', () => {
		const [none, ...rest] = CLASS_THEME_BADGES;
		expect(none).toEqual({ id: 'none', label: 'None', paths: [] });
		for (const b of rest) {
			const def = BADGE_BY_ID[b.id];
			expect(def, b.id).toBeTruthy();
			expect(b.paths, b.id).toBe(def.paths);
			expect(b.label).toBe(def.label);
		}
		expect(rest.length).toBeGreaterThanOrEqual(4);
	});

	it('draws every pattern as ONE repeating gradient in the edge colour, so none is a grid', () => {
		const theme = resolveClassTheme({ winners: { palette: 'ocean' } })!;
		for (const side of ['dark', 'light'] as const) {
			const stroke = themeColourCss(theme.palette.edge, side, CLASS_THEME_PATTERN_ALPHA);
			for (const p of CLASS_THEME_PATTERNS) {
				const css = classThemeCss({ ...theme, pattern: p }, side).pattern;
				if (p.template === null) {
					expect(css, p.id).toBe('none');
					continue;
				}
				expect(css.match(/gradient\(/g)?.length, p.id).toBe(1);
				expect(css, p.id).toMatch(/^repeating-(linear|radial|conic)-gradient\(/);
				expect(css, p.id).toContain(stroke);
				expect(css, p.id).not.toContain('{c}');
			}
		}
		const drawn = CLASS_THEME_PATTERNS.filter((p) => p.template !== null);
		expect(drawn.length).toBeGreaterThanOrEqual(4);
	});
});

/* -------------------------------------------------------------------------- */
/* Every colour is a lightness-only pair, seeded where it says it is          */
/* -------------------------------------------------------------------------- */

const COLOURS: [string, ThemeColour][] = [
	...CLASS_THEME_PALETTES.flatMap((p): [string, ThemeColour][] => [
		[`${p.id} wash`, p.wash],
		[`${p.id} edge`, p.edge]
	]),
	...SECTION_ACCENTS.map((a): [string, ThemeColour] => [`${a.id} accent`, a.colour])
];

describe('every colour is a pair', () => {
	it('moves in lightness only between its two twins, and deeper on the light ground', () => {
		expect(COLOURS.length).toBe(CLASS_THEME_PALETTES.length * 2 + SECTION_ACCENTS.length);
		for (const [name, c] of COLOURS) {
			const dark = parse(themeColourCss(c, 'dark')).hsl;
			const light = parse(themeColourCss(c, 'light')).hsl;
			expect(dark[0], name).toBe(light[0]);
			expect(dark[1], name).toBe(light[1]);
			expect(light[2], name).toBeLessThan(dark[2]);
		}
	});

	it('seeds IDEA from --green and --teal and FRC from --frc-blue and --frc-red', () => {
		const frc = blockAfter(readFileSync('src/lib/frc/frc-theme.css', 'utf8'), '.frc-root {');
		const palette = (id: string) => CLASS_THEME_PALETTES.find((p) => p.id === id)!;
		const seeds: [ThemeColour, string][] = [
			[palette('idea').wash, hexIn(SITE.idea, '--green')!],
			[palette('idea').edge, hexIn(SITE.idea, '--teal')!],
			[palette('frc').wash, hexIn(frc, '--frc-blue')!],
			[palette('frc').edge, hexIn(frc, '--frc-red')!]
		];
		for (const [c, source] of seeds) {
			const [h, s] = parse(source).hsl;
			expect(hueDistance(c.h, h), source).toBeLessThanOrEqual(0.1);
			expect(Math.abs(c.s - s), source).toBeLessThanOrEqual(0.1);
		}
		// On Space White the FRC wash is FIRST's blue itself, not a neighbour of it.
		const frcLight = parse(themeColourCss(palette('frc').wash, 'light')).rgb.map(Math.round);
		expect(frcLight).toEqual(parse(hexIn(frc, '--frc-blue')!).rgb);
	});

	it('never paints pure red, white or yellow, and no wash or accent reads as the error red', () => {
		const forbidden = ['255,0,0', '255,255,255', '255,255,0'];
		for (const [name, c] of COLOURS) {
			for (const side of ['dark', 'light'] as const) {
				const rgb = parse(themeColourCss(c, side)).rgb.map(Math.round).join(',');
				expect(forbidden, `${name} ${side}`).not.toContain(rgb);
			}
		}
		const crimson = parse(hexIn(SITE.idea, '--crimson')!).hsl[0];
		for (const p of CLASS_THEME_PALETTES) {
			expect(hueDistance(p.wash.h, crimson), `${p.id} wash`).toBeGreaterThanOrEqual(20);
		}
		for (const a of SECTION_ACCENTS) {
			expect(hueDistance(a.colour.h, crimson), `${a.id} accent`).toBeGreaterThanOrEqual(20);
		}
	});
});

/* -------------------------------------------------------------------------- */
/* THE CONTRAST SWEEP                                                         */
/* -------------------------------------------------------------------------- */

const FLOOR = { text: 4.5, graphical: 3, projectorText: 4.5, projectorBoundary: 2 };

type Worst = { value: number; where: string };
const worst = new Map<string, Worst>();
function record(key: string, value: number, where: string) {
	const w = worst.get(key);
	if (!w || value < w.value) worst.set(key, { value, where });
}

describe('THE CONTRAST SWEEP: every palette and accent on every ground of all three themes', () => {
	it('uses the harness projector model, not a copy of it', () => {
		expect(PROJECTOR_MODEL).toEqual({ contrast: 300, ambient: 0.1 });
		// The research's own figure, which the harness reproduces.
		expect(projector(parse('#0d1311').rgb, parse('#f7f9f9').rgb)).toBeCloseTo(9.56, 1);
	});

	it('clears 4.5 for the room ink and 3:1 for the edge and accent, straight and projected', () => {
		let cases = 0;
		const graphical = (fg: Rgb, ground: Rgb, key: string, where: string) => {
			const r = ratio(fg, ground);
			const p = projector(fg, ground);
			expect(r, `${key} ${where}`).toBeGreaterThanOrEqual(FLOOR.graphical);
			expect(p, `${key} projected ${where}`).toBeGreaterThanOrEqual(FLOOR.projectorBoundary);
			record(key, r, where);
			record(`${key} projected`, p, where);
			cases++;
		};
		for (const { name, side } of THEMES) {
			const ink = token(name, '--text-1');
			const muted = token(name, '--text-2');
			const banner = grounds(name, BANNER_GROUNDS);
			const keys = grounds(name, KEY_GROUNDS);
			const accents = SECTION_ACCENTS.map(
				(a) => [a.id, parse(themeColourCss(a.colour, side)).rgb] as const
			);
			for (const palette of CLASS_THEME_PALETTES) {
				// The theme as the page receives it: the palette chosen, a pattern
				// on (so the stroke is measured), and the strings classThemeVars emits.
				const winners = { palette: palette.id, pattern: 'stripes' };
				const css = classThemeCss(resolveClassTheme({ winners })!, side);
				const wash = parse(css.wash);
				const edge = parse(css.edge).rgb;
				const stroke = parse(css.pattern.match(/hsl\([^)]*\)/)![0]);
				expect(wash.alpha).toBe(CLASS_THEME_WASH_ALPHA);
				expect(stroke.alpha).toBe(CLASS_THEME_PATTERN_ALPHA);
				for (const [gName, g] of banner) {
					const washed = over(wash, g);
					const layers = [
						['wash', washed],
						['wash under a pattern stroke', over(stroke, washed)]
					] as const;
					for (const [layer, ground] of layers) {
						const at = `${palette.id} on ${gName}, ${layer}`;
						const text = ratio(ink, ground);
						const textP = projector(ink, ground);
						expect(text, `${name} text ${at}`).toBeGreaterThanOrEqual(FLOOR.text);
						expect(textP, `${name} text projected ${at}`).toBeGreaterThanOrEqual(
							FLOOR.projectorText
						);
						record(`${name} text`, text, at);
						record(`${name} text projected`, textP, at);
						record(`${name} --text-2 (not used on the banner)`, ratio(muted, ground), at);
						cases++;

						graphical(edge, ground, `${name} edge`, at);
						for (const [id, a] of accents) graphical(a, ground, `${name} accent`, `${id} on ${at}`);
					}
				}
				// The edge also meets the bare card beside the banner, and a strip key's face.
				for (const [gName, g] of [...banner, ...keys]) {
					graphical(edge, g, `${name} edge`, `${palette.id} on bare ${gName}`);
				}
			}
			for (const [id, a] of accents) {
				for (const [gName, g] of [...banner, ...keys]) {
					graphical(a, g, `${name} accent`, `${id} on bare ${gName}`);
				}
			}
		}
		// 3 themes x 6 palettes x 7 banner grounds x 2 layers x (text + edge + 6 accents),
		// plus every edge and every accent on the 10 bare grounds of each theme.
		expect(cases).toBe(3 * 6 * 7 * 2 * (1 + 1 + 6) + 3 * 6 * 10 + 3 * 6 * 10);
		if (process.env.CLASS_THEME_REPORT) {
			for (const [k, w] of [...worst].sort()) {
				console.log(`${k.padEnd(44)} ${w.value.toFixed(2)}  ${w.where}`);
			}
		}
	});

	it('NEGATIVE CONTROLS: a raw brand colour and a dark-theme twin on white do not clear', () => {
		// FIRST's blue as authored, used as an edge on a dark card: why the dark twin is lighter.
		const card = token('idea', '--plate-panel-top');
		expect(ratio(parse('#0066b3').rgb, card)).toBeLessThan(FLOOR.graphical);
		// Every accent's DARK twin on Space White's washed card: why the light twin exists.
		const ocean = resolveClassTheme({ winners: { palette: 'ocean' } })!;
		const washed = over(parse(classThemeCss(ocean, 'light').wash), token('space-white', '--plate-panel-top'));
		const failing = SECTION_ACCENTS.filter(
			(a) => ratio(parse(themeColourCss(a.colour, 'dark')).rgb, washed) < FLOOR.graphical
		);
		expect(failing.length).toBeGreaterThanOrEqual(4);
	});
});

/* -------------------------------------------------------------------------- */
/* Resolution, paint and words                                                */
/* -------------------------------------------------------------------------- */

describe('resolving a class theme', () => {
	it('answers null -- render exactly as today -- for no votes and no accent', () => {
		expect(resolveClassTheme(null)).toBeNull();
		expect(resolveClassTheme(undefined)).toBeNull();
		expect(resolveClassTheme({})).toBeNull();
		expect(resolveClassTheme({ winners: {}, accent: null })).toBeNull();
		expect(classThemeVars(null)).toBe('');
		expect(classThemeWords(null)).toBe('');
	});

	it('drops every id this build does not know, and a theme made only of those is null', () => {
		const unknown = { winners: { palette: 'plaid', glitter: 'max' }, accent: 'chartreuse' };
		expect(resolveClassTheme(unknown)).toBeNull();
		expect(resolveClassTheme({ winners: { palette: 'idea;background:url(x)' } })).toBeNull();
		expect(resolveClassTheme({ winners: ['palette', 'idea'] })).toBeNull();
		expect(resolveClassTheme({ winners: { palette: 7 } })).toBeNull();
		// POSITIVE CONTROL: the same payload with one known id does resolve, and
		// only the known id is taken; the unknown feature leaves no trace.
		const theme = resolveClassTheme({
			winners: { ...unknown.winners, pattern: 'rings' },
			accent: unknown.accent
		})!;
		expect(theme).not.toBeNull();
		expect(theme.palette.id).toBe('idea');
		expect(theme.pattern.id).toBe('rings');
		expect(theme.accent).toBeNull();
		expect(theme.chosen).toEqual({ palette: false, pattern: true, badge: false });
		expect(Object.keys(theme).sort()).toEqual(['accent', 'badge', 'chosen', 'palette', 'pattern']);
	});

	it('resolves an accent alone, with every feature at its default', () => {
		const theme = resolveClassTheme({ winners: {}, accent: 'sky' })!;
		expect(theme.accent?.id).toBe('sky');
		expect([theme.palette.id, theme.pattern.id, theme.badge.id]).toEqual(['idea', 'plain', 'none']);
		expect(theme.chosen).toEqual({ palette: false, pattern: false, badge: false });
	});

	it('keys themes by section and leaves an unthemed section out', () => {
		const out = classThemesBySection([
			{ section_id: 's1', course_id: 'c1', accent: null, winners: { palette: 'frc' } },
			{ section_id: 's2', course_id: 'c1', accent: 'gold', winners: { palette: 'frc' } },
			{ section_id: 's3', course_id: 'c2', accent: null, winners: {} }
		]);
		expect(Object.keys(out).sort()).toEqual(['s1', 's2']);
		expect(out.s1.palette.id).toBe('frc');
		expect(out.s2.accent?.id).toBe('gold');
	});
});

describe('painting and saying a theme', () => {
	const themed = (winners: Record<string, string>, accent: string | null = null): ClassTheme =>
		resolveClassTheme({ winners, accent })!;

	it('carries both twins of every colour, and the accent pair only when the section has one', () => {
		const vars = classThemeVars(themed({ palette: 'ember', pattern: 'rays' }));
		const names = vars.split(';').map((d) => d.slice(0, d.indexOf(':')));
		expect(names).toEqual([
			'--ct-wash',
			'--ct-wash-light',
			'--ct-edge',
			'--ct-edge-light',
			'--ct-pattern',
			'--ct-pattern-light'
		]);
		const withAccent = classThemeVars(themed({ palette: 'ember' }, 'mint'));
		expect(withAccent).toContain('--ct-accent:');
		expect(withAccent).toContain('--ct-accent-light:');
		// A plain pattern is `none`, never an empty value a stylesheet has to guess about.
		expect(classThemeVars(themed({ palette: 'ember' }))).toContain(
			'--ct-pattern:none;--ct-pattern-light:none'
		);
	});

	it('emits exactly the catalogue strings, so nothing from a payload reaches a style attribute', () => {
		const theme = themed({ palette: 'violet', pattern: 'rings', badge: 'gear' }, 'rose');
		const dark = classThemeCss(theme, 'dark');
		const light = classThemeCss(theme, 'light');
		expect(classThemeVars(theme)).toBe(
			[
				`--ct-wash:${dark.wash}`,
				`--ct-wash-light:${light.wash}`,
				`--ct-edge:${dark.edge}`,
				`--ct-edge-light:${light.edge}`,
				`--ct-pattern:${dark.pattern}`,
				`--ct-pattern-light:${light.pattern}`,
				`--ct-accent:${dark.accent}`,
				`--ct-accent-light:${light.accent}`
			].join(';')
		);
		expect(dark.wash).toBe('hsl(265 55% 60% / 0.22)');
		expect(light.edge).toBe('hsl(320 60% 35%)');
	});

	it('says the theme in words, naming only what is on screen', () => {
		const full = themed({ palette: 'ocean', pattern: 'rings', badge: 'gear' }, 'gold');
		expect(classThemeWords(full)).toBe('Ocean palette, rings pattern, gear badge, gold section color');
		expect(classThemeWords(themed({ badge: 'rocket' }))).toBe('IDEA palette, rocket badge');
		expect(classThemeWords(themed({}, 'sky'))).toBe('IDEA palette, sky section color');
	});
});

/* -------------------------------------------------------------------------- */
/* The tally and the ballot                                                   */
/* -------------------------------------------------------------------------- */

const TALLY = {
	ok: true,
	course_id: 'c1',
	voting_open: true,
	reset_at: null,
	manages: false,
	can_vote: true,
	voters: 5,
	counts: [
		{ feature: 'palette', option: 'ocean', votes: 2 },
		{ feature: 'palette', option: 'frc', votes: 2 },
		{ feature: 'palette', option: 'plaid', votes: 9 },
		{ feature: 'glitter', option: 'max', votes: 9 },
		{ feature: 'badge', option: 'gear', votes: 1 }
	],
	winners: { palette: 'ocean', badge: 'gear', glitter: 'max' },
	mine: { palette: 'frc', pattern: 'plaid' }
};

describe('the live tally', () => {
	it('keeps counts only for ids this build can draw', () => {
		const t = parseClassThemeTally(TALLY)!;
		expect(t.counts).toEqual([
			{ feature: 'palette', option: 'ocean', votes: 2 },
			{ feature: 'palette', option: 'frc', votes: 2 },
			{ feature: 'badge', option: 'gear', votes: 1 }
		]);
		expect(t.winners).toEqual({ palette: 'ocean', badge: 'gear' });
		expect(t.mine).toEqual({ palette: 'frc' });
		expect(parseClassThemeTally({ ok: true })).toBeNull();
		expect(parseClassThemeTally(null)).toBeNull();
	});

	it('lists every option, takes the winner from the database (its tie rule), and marks my vote', () => {
		const ballot = classThemeBallot(parseClassThemeTally(TALLY));
		expect(ballot.map((f) => f.feature)).toEqual(['palette', 'pattern', 'badge']);
		const palette = ballot[0];
		expect(palette.options.map((o) => o.id)).toEqual(CLASS_THEME_PALETTES.map((p) => p.id));
		expect(palette.total).toBe(4);
		// A 2-2 tie: the database said ocean, so ocean is winning and frc is not.
		expect(palette.options.filter((o) => o.winning).map((o) => o.id)).toEqual(['ocean']);
		expect(palette.options.find((o) => o.id === 'frc')).toMatchObject({
			votes: 2,
			winning: false,
			mine: true
		});
		expect(ballot[1].options.every((o) => o.votes === 0 && !o.winning && !o.mine)).toBe(true);
		// Before the first read: all zeros, nothing winning.
		const empty = classThemeBallot(null).flatMap((f) => f.options);
		expect(empty.some((o) => o.votes || o.winning || o.mine)).toBe(false);
	});

	it('re-reads on a short poll while voting is open and on the posted-teams cadence after', () => {
		expect(CLASS_THEME_POLL_MS).toBe(15_000);
		expect(classThemePollMs(true)).toBe(CLASS_THEME_POLL_MS);
		expect(classThemePollMs(false)).toBe(CLASS_THEME_IDLE_POLL_MS);
		expect(CLASS_THEME_IDLE_POLL_MS).toBe(60_000);
	});
});

/* -------------------------------------------------------------------------- */
/* Transports against a fake client                                           */
/* -------------------------------------------------------------------------- */

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null } | 'throw';
function fakeClient(answers: Record<string, Answer>) {
	const calls: { fn: string; args: Record<string, unknown> }[] = [];
	const client = {
		async rpc(fn: string, args: Record<string, unknown>) {
			calls.push({ fn, args });
			const a = answers[fn];
			if (a === 'throw') throw new TypeError('Failed to fetch');
			return { data: a?.data ?? null, error: a?.error ?? null };
		}
	};
	return { transports: createClassThemeTransports(client as unknown as SupabaseClient), calls };
}
const MISSING = { error: { code: 'PGRST202', message: 'Could not find the function' } };

describe('the transports', () => {
	it('reads themes for the sections asked about, validating every row on the way in', async () => {
		const { transports, calls } = fakeClient({
			classroom_class_themes: {
				data: [
					{
						section_id: 's1',
						course_id: 'c1',
						accent: 'gold',
						winners: { palette: 'frc', glitter: 'max' }
					},
					{ section_id: 's2', course_id: 'c1', accent: 'chartreuse', winners: { palette: 'plaid' } },
					{ section_id: 7, course_id: 'c1', accent: null, winners: {} },
					'nonsense'
				]
			}
		});
		const res = await transports.themes(['s1', 's2', 's1', '']);
		expect(calls).toEqual([
			{ fn: 'classroom_class_themes', args: { p_section_ids: ['s1', 's2'] } }
		]);
		expect(res).toEqual({
			ok: true,
			themes: [
				{ section_id: 's1', course_id: 'c1', accent: 'gold', winners: { palette: 'frc' } },
				{ section_id: 's2', course_id: 'c1', accent: null, winners: {} }
			]
		});
	});

	it('asks nothing for no sections', async () => {
		const { transports, calls } = fakeClient({});
		expect(await transports.themes([])).toEqual({ ok: true, themes: [] });
		expect(calls).toEqual([]);
	});

	it('answers unavailable for PGRST202 alone, and the database sentence verbatim otherwise', async () => {
		const runs: [string, (t: ClassThemeTransports) => Promise<unknown>][] = [
			['classroom_class_themes', (t) => t.themes(['s1'])],
			['classroom_theme_tally', (t) => t.tally('c1')],
			['classroom_theme_vote', (t) => t.vote('c1', 'palette', 'ocean')],
			['classroom_theme_set_voting', (t) => t.setVoting('c1', true)],
			['classroom_theme_reset', (t) => t.reset('c1')],
			['classroom_set_section_accent', (t) => t.setAccent('s1', 'sky')]
		];
		const sentence = 'Only a student enrolled in this course can vote on its theme.';
		for (const [fn, run] of runs) {
			const answer = async (a: Answer) => run(fakeClient({ [fn]: a }).transports);
			expect(await answer(MISSING), fn).toEqual({ ok: false, reason: 'unavailable' });
			expect(await answer({ error: { code: 'P0001', message: sentence } }), fn).toEqual({
				ok: false,
				reason: 'error',
				message: sentence
			});
			// A different PostgREST code is NOT the missing function.
			expect(await answer({ error: { code: 'PGRST203', message: 'ambiguous' } }), fn).toEqual({
				ok: false,
				reason: 'error',
				message: 'ambiguous'
			});
			expect(await answer('throw'), fn).toEqual({
				ok: false,
				reason: 'error',
				message: CLASS_THEME_UNREACHABLE
			});
		}
		expect(runs.length).toBe(6);
	});

	it('reads the tally, and passes "Not found." through as the database said it', async () => {
		const ok = await fakeClient({ classroom_theme_tally: { data: TALLY } }).transports.tally('c1');
		expect(ok.ok && ok.tally.winners).toEqual({ palette: 'ocean', badge: 'gear' });
		const notFound = { error: { code: 'P0001', message: 'Not found.' } };
		const missing = await fakeClient({ classroom_theme_tally: notFound }).transports.tally('c1');
		expect(missing).toEqual({ ok: false, reason: 'error', message: 'Not found.' });
	});

	it('votes, withdraws, and passes a closed vote through as closed', async () => {
		const voted = fakeClient({
			classroom_theme_vote: {
				data: { ok: true, option: 'ocean', winners: { palette: 'ocean', glitter: 'x' } }
			}
		});
		expect(await voted.transports.vote('c1', 'palette', 'ocean')).toEqual({
			ok: true,
			withdrawn: false,
			option: 'ocean',
			winners: { palette: 'ocean' }
		});
		expect(voted.calls[0]).toEqual({
			fn: 'classroom_theme_vote',
			args: { p_course_id: 'c1', p_feature: 'palette', p_option: 'ocean' }
		});
		const withdrawn = fakeClient({ classroom_theme_vote: { data: { ok: true, withdrawn: true } } });
		expect(await withdrawn.transports.vote('c1', 'badge', null)).toEqual({
			ok: true,
			withdrawn: true,
			winners: null
		});
		expect(withdrawn.calls[0].args.p_option).toBeNull();
		const closed = fakeClient({ classroom_theme_vote: { data: { ok: false, reason: 'closed' } } });
		expect(await closed.transports.vote('c1', 'palette', 'frc')).toEqual({ ok: false, reason: 'closed' });
		// A structured refusal this build has no word for is an error, never a success.
		const odd = fakeClient({ classroom_theme_vote: { data: { ok: false, reason: 'later' } } });
		expect(await odd.transports.vote('c1', 'palette', 'frc')).toEqual({
			ok: false,
			reason: 'error',
			message: CLASS_THEME_VOTE_NOT_COUNTED
		});
	});

	it('refuses an option this build would never offer, before any round trip', async () => {
		const { transports, calls } = fakeClient({ classroom_theme_vote: { data: { ok: true } } });
		const refused = { ok: false, reason: 'error', message: CLASS_THEME_NOT_A_CHOICE };
		expect(await transports.vote('c1', 'palette', 'plaid')).toEqual(refused);
		expect(await transports.vote('c1', 'palette', 'rings')).toEqual(refused);
		expect(await transports.vote('c1', 'glitter' as 'palette', 'idea')).toEqual(refused);
		expect(await transports.setAccent('s1', 'chartreuse')).toEqual(refused);
		expect(calls).toEqual([]);
		// POSITIVE CONTROL: the same transports do call through for a real choice.
		await transports.vote('c1', 'pattern', 'rings');
		expect(calls.map((c) => c.fn)).toEqual(['classroom_theme_vote']);
	});

	it('opens, closes, resets and sets an accent', async () => {
		const resetAt = '2026-09-28T20:00:00Z';
		const { transports, calls } = fakeClient({
			classroom_theme_set_voting: { data: { ok: true, voting_open: false, reset_at: null } },
			classroom_theme_reset: { data: { ok: true, voting_open: true, reset_at: resetAt } },
			classroom_set_section_accent: { data: { ok: true, accent: 'sky' } }
		});
		expect(await transports.setVoting('c1', false)).toEqual({
			ok: true,
			voting_open: false,
			reset_at: null
		});
		expect(await transports.reset('c1')).toEqual({ ok: true, voting_open: true, reset_at: resetAt });
		expect(await transports.setAccent('s1', 'sky')).toEqual({ ok: true, accent: 'sky' });
		expect(calls.map((c) => [c.fn, c.args])).toEqual([
			['classroom_theme_set_voting', { p_course_id: 'c1', p_open: false }],
			['classroom_theme_reset', { p_course_id: 'c1' }],
			['classroom_set_section_accent', { p_section_id: 's1', p_accent: 'sky' }]
		]);
		const cleared = fakeClient({ classroom_set_section_accent: { data: { ok: true, accent: null } } });
		expect(await cleared.transports.setAccent('s1', null)).toEqual({ ok: true, accent: null });
		expect(cleared.calls[0].args.p_accent).toBeNull();
	});
});
