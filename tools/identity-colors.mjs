#!/usr/bin/env node
/**
 * THE SITE'S IDENTITY COLORS, SOLVED FROM ONE LIBRARY (ledger 0467).
 *
 * Every identity hue the site draws -- a launcher app's family, a calendar
 * layer, a unit's tint on a post thumbnail, a class palette and a section
 * color -- is an entry of `tools/hx-kit/kit/colors.json` (the HTML kit's
 * named library) put through `solve()` in `tools/hx-kit/color.mjs`, once per
 * ground set. This file is the one place that happens. It imports the solver
 * and reads the library; it never copies either, and it never types a color.
 *
 *   node tools/identity-colors.mjs           writes the two generated files
 *   node tools/identity-colors.mjs --check   exits 1 when they are stale
 *
 * WHAT IT WRITES
 *   src/lib/design-system/identity.css  `--id-<name>-ink|fill|on|line|wash`
 *                                       on :root (IDEA and Matrix, solved
 *                                       over both themes' grounds at once,
 *                                       because both read one :root value),
 *                                       again under Space White, and the
 *                                       dark values restored on Space
 *                                       White's dark islands.
 *   src/lib/design-system/identity.ts   the same answers as data, for the
 *                                       code that needs a value rather than a
 *                                       custom property (the class themes).
 *
 * WHAT EACH OUTPUT IS FOR (solve()'s own contract):
 *   ink   a word or a glyph: 6:1 on every dark ground, 4.8:1 on every light one
 *   fill  a mark, a stripe, a swatch, a strip (a band carries `on`)
 *   on    the word on the fill, 4.5:1
 *   line  the fill's edge: the fill where it reaches 3:1 on every ground,
 *         otherwise the ink
 *   wash  the fill at low alpha, a quiet tint
 *
 * THE GROUNDS ARE READ OFF THE TOKEN FILES, never typed here: the page and
 * surface grounds of each theme and the Plate's word faces (plate, inset,
 * panel, chip and list faces), the set tests/color-tokens.test.ts solves the
 * semantic hues over. The Plate's KEY faces are added, because a class
 * section's color sits on a header key.
 *
 * WHICH ENTRIES: `USED` below, and nothing else. tests/identity-colors.test.ts
 * holds every `--id-*` name src/ reads to this list and this list to what src/
 * reads, so an entry nobody draws is not generated and a name nobody generated
 * cannot be drawn.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, hex, toHex, over } from './hx-kit/color.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..');
const DS = join(REPO, 'src/lib/design-system');
export const LIBRARY_PATH = join(REPO, 'tools/hx-kit/kit/colors.json');
export const CSS_OUT = join(DS, 'identity.css');
export const TS_OUT = join(DS, 'identity.ts');

/**
 * The library entries the site draws. Three families, as the color research
 * report (docs/design/site-ui-audit-2026-10-26/color-research-report.md) sets
 * them out: the LINKING set for identity with no real-world meaning, the
 * ANCHOR family where the thing literally is that thing (FIRST), and the
 * neutral metal for what should read as no hue at all. No entry within the
 * green name band is here: green means act and done.
 */
export const USED = [
	'sky',
	'indigo',
	'violet',
	'magenta',
	'marigold',
	'coral',
	'filament-orange',
	'first-red',
	'first-blue',
	'steel',
	'titanium',
	'aluminum'
];

/**
 * THE ONE ENTRY THAT IS NOT THE KIT'S: the IDEA brand green, for the class
 * palette named for it. Its anchor is not typed here either; it is read off
 * `--green` in colors.css, which ledger 0465 holds to its own anchor. Green is
 * the brand and means act and done, so nothing but the IDEA palette reads it.
 */
export const BRAND = { 'idea-green': { token: '--green', means: 'the IDEA brand: act and done' } };

/* ---- reading the token files ------------------------------------------- */

const read = (p) => readFileSync(p, 'utf8');

/** The declarations of the ONE block whose selector is exactly `selector`. */
export function block(css, selector) {
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const re = /(?<=^|[};])\s*([^{};@]+?)\s*\{([^{}]*)\}/g;
	const found = [];
	for (const m of bare.matchAll(re)) {
		if (m[1].trim().replace(/\s+/g, ' ') !== selector) continue;
		const out = {};
		for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[d[1]] = d[2].trim().replace(/\s+/g, ' ');
		found.push(out);
	}
	if (found.length !== 1) throw new Error(`${selector}: ${found.length} blocks`);
	return found[0];
}

/** A token's painted value: hex, rgb()/rgba(), var() with a fallback, and
    color-mix(in srgb, A p%, B). Any other form throws rather than guessing. */
export function paint(value, vars, depth = 0) {
	if (depth > 20) throw new Error(`alias loop at ${value}`);
	const v = value.trim();
	let m;
	if (/^#[0-9a-f]{3,6}$/i.test(v)) return { rgb: hex(v), a: 1 };
	if (v === 'transparent') return { rgb: { r: 0, g: 0, b: 0 }, a: 0 };
	if ((m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i)))
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
		return { rgb: over(A.rgb, p, B.rgb), a: 1 };
	}
	throw new Error(`cannot read the colour value "${v}"`);
}

/** Every theme's custom properties, the Plate's blocks laid over them. */
export function themeVars() {
	const colors = read(join(DS, 'colors.css'));
	const matrix = read(join(DS, 'themes/matrix.css'));
	const spaceWhite = read(join(DS, 'themes/space-white.css'));
	const plate = read(join(REPO, 'src/lib/classroom/plate.css'));
	const base = block(colors, ':root');
	const plateDark = block(plate, ':is(.cr-plate, .site-plate), body:has(:is(.cr-plate, .site-plate))');
	const plateFor = (id) =>
		block(plate, `:root[data-theme='${id}'] :is(.cr-plate, .site-plate), :root[data-theme='${id}'] body:has(:is(.cr-plate, .site-plate))`);
	return {
		idea: { ...base, ...plateDark },
		matrix: { ...base, ...block(matrix, ":root[data-theme='matrix']"), ...plateDark, ...plateFor('matrix') },
		'space-white': { ...base, ...block(spaceWhite, ":root[data-theme='space-white']"), ...plateDark, ...plateFor('space-white') }
	};
}

/** Where an identity color is drawn: the card and page grounds of each theme,
    the Plate's word faces, and its key faces (a section color rides a key). */
export const GROUND_NAMES = [
	'--bg1',
	'--bg0',
	'--bg2',
	'--surface-0',
	'--surface-1',
	'--surface-2',
	'--surface-raised',
	'--plate-plate-top',
	'--plate-plate-bot',
	'--plate-inset-top',
	'--plate-inset-bot',
	'--plate-panel-top',
	'--plate-panel-bot',
	'--plate-chip-top',
	'--plate-chip-bot',
	'--plate-list-face',
	'--plate-face-top',
	'--plate-face-bot'
];

/** [name, rgb] for every ground of one theme, opaque. */
export function grounds(themeId, vars = themeVars()) {
	const v = vars[themeId];
	return GROUND_NAMES.map((n) => {
		const p = paint(v[n], v);
		if (p.a < 1) throw new Error(`${themeId}: ${n} is translucent`);
		return [n, p.rgb];
	});
}

/** solve()'s two theme arguments. The dark one is IDEA's and Matrix's grounds
    together, --bg1 first (solve() composites its wash over the first). */
export function solverThemes(vars = themeVars()) {
	return {
		dark: { dark: true, panels: [...grounds('idea', vars), ...grounds('matrix', vars)].map(([, g]) => g) },
		light: { dark: false, panels: grounds('space-white', vars).map(([, g]) => g) }
	};
}

/* ---- solving ----------------------------------------------------------- */

export function library() {
	return JSON.parse(read(LIBRARY_PATH)).colors;
}

/** { name: { anchor, means, source, status, dark: {...}, light: {...} } } */
export function solveIdentity(vars = themeVars()) {
	const lib = library();
	const th = solverThemes(vars);
	const out = {};
	const brand = Object.fromEntries(
		Object.entries(BRAND).map(([name, b]) => {
			const anchor = vars.idea[b.token];
			if (!/^#[0-9a-f]{6}$/i.test(anchor ?? '')) throw new Error(`${b.token} is not a literal hex in colors.css`);
			return [name, { anchor: anchor.toLowerCase(), means: b.means, source: `src/lib/design-system/colors.css ${b.token}`, status: 'brand' }];
		})
	);
	for (const name of [...USED, ...Object.keys(BRAND)]) {
		const entry = lib[name] ?? brand[name];
		if (!entry) throw new Error(`${name} is not in colors.json`);
		const pick = (s) => ({ ink: s.ink, fill: s.fill, on: s.on, line: s.line, wash: s.wash });
		out[name] = {
			anchor: entry.anchor,
			means: entry.means,
			source: entry.source,
			status: entry.status,
			dark: pick(solve(entry.anchor, th.dark)),
			light: pick(solve(entry.anchor, th.light))
		};
	}
	return out;
}

/* ---- writing ----------------------------------------------------------- */

const ROLES = ['ink', 'fill', 'on', 'line', 'wash'];
const decls = (solved, side, indent) =>
	Object.entries(solved)
		.flatMap(([name, s]) => ROLES.map((r) => `${indent}--id-${name}-${r}: ${s[side][r]};`))
		.join('\n');

export function renderCss(solved) {
	return `/* GENERATED by tools/identity-colors.mjs from tools/hx-kit/kit/colors.json
   through solve() in tools/hx-kit/color.mjs (ledger 0467). Do not edit:
   change the library or the USED list and run \`node tools/identity-colors.mjs\`.
   tests/identity-colors.test.ts fails while this file is stale.

   --id-<name>-ink   a word or a glyph      --id-<name>-fill  a mark or a strip
   --id-<name>-on    a word on the fill     --id-<name>-line  the fill's edge
   --id-<name>-wash  a quiet tint

   IDEA and Matrix read :root, solved over both themes' grounds at once. Space
   White has its own answers, and its dark islands keep the dark ones. */

:root {
${decls(solved, 'dark', '\t')}
}

:root[data-theme='space-white'] {
${decls(solved, 'light', '\t')}
}

:root[data-theme='space-white'] :where(.ic-root, .nb-island, .deck-stage) {
${decls(solved, 'dark', '\t')}
}
`;
}

export function renderTs(solved) {
	const body = JSON.stringify(solved, null, '\t');
	return `/* GENERATED by tools/identity-colors.mjs from tools/hx-kit/kit/colors.json
   through solve() in tools/hx-kit/color.mjs (ledger 0467). Do not edit:
   change the library or the USED list and run \`node tools/identity-colors.mjs\`.
   tests/identity-colors.test.ts fails while this file is stale. */

export interface IdentitySide {
	ink: string;
	fill: string;
	on: string;
	line: string;
	wash: string;
}

export interface IdentityColor {
	anchor: string;
	means: string;
	source: string;
	status: string;
	/** IDEA and Matrix. */
	dark: IdentitySide;
	/** Space White. */
	light: IdentitySide;
}

export const IDENTITY = ${body} as const satisfies Record<string, IdentityColor>;

export type IdentityName = keyof typeof IDENTITY;

/** The custom property one role of one entry is drawn through. */
export function identityVar(name: IdentityName, role: keyof IdentitySide): string {
	return \`var(--id-\${name}-\${role})\`;
}
`;
}

export function generate() {
	const solved = solveIdentity();
	return { css: renderCss(solved), ts: renderTs(solved), solved };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { css, ts } = generate();
	if (process.argv.includes('--check')) {
		const stale = [
			[CSS_OUT, css],
			[TS_OUT, ts]
		].filter(([p, want]) => {
			try {
				return read(p) !== want;
			} catch {
				return true;
			}
		});
		for (const [p] of stale) console.error(`stale: ${p}`);
		process.exit(stale.length ? 1 : 0);
	}
	writeFileSync(CSS_OUT, css);
	writeFileSync(TS_OUT, ts);
	console.log(`wrote ${CSS_OUT}\nwrote ${TS_OUT}`);
}
