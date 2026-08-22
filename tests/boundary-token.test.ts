// tests/boundary-token.test.ts
//
// THE TWO-TOKEN SPLIT, AND THE REJECTED ALTERNATIVE THAT WOULD UNDO IT.
//
// A boundary that carries meaning is measured; a boundary that decorates is
// not (IDEA_INTERFACE_STANDARDS 10). The app carries the two as separate
// tokens -- `--boundary` for a load-bearing edge, `--hairline` for everything
// else -- and the whole value of that split is that MOST rules stay on the
// decorative one. Measured before this landed: `--hairline` was 1.18-1.40:1
// against every ground it sits on, across the classroom, the portal and all
// three notebook plates.
//
// THE REJECTED ALTERNATIVE IS RAISING `--hairline` GLOBALLY. It is one line,
// it makes every measurement in the audit pass, and it is wrong: 189 of the
// rendered edges in the classroom alone are decoration -- a rule between two
// paragraphs in a card, a table cell edge, the frame on a thumbnail -- and
// drawing all of them at 3:1 turns a tuned surface into a wireframe. Nothing
// on screen SAYS that has happened; it just looks noisier, which is not a
// regression anyone files. That is what this file exists to redden.
//
// SO IT ASSERTS BOTH DIRECTIONS, which is the only way either claim means
// anything:
//
//   - the load-bearing token clears 3:1 on every ground in its room, and
//   - the decorative token is still BELOW it, and the named decorative rules
//     still read it.
//
// WHERE THE EXPECTED VALUES COME FROM. The ratios are computed here, from the
// WCAG 2.x relative-luminance formula, against the ground colours parsed out of
// the same stylesheet. That is arithmetic this repo does not otherwise perform,
// so it cannot agree with a wrong implementation by construction: if somebody
// re-tunes `--boundary` to a colour that does not clear, this reddens even
// though every file still parses and every page still renders.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const COLORS = readFileSync(join(ROOT, 'src/lib/design-system/colors.css'), 'utf8');
const NB_THEME = readFileSync(join(ROOT, 'src/lib/notebook/notebook-theme.css'), 'utf8');

// --------------------------------------------------------------------------
// WCAG contrast, computed here rather than read from anything under test.
// --------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '').trim();
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16)
	];
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
	const ch = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(fg: string, bg: string): number {
	const a = luminance(hexToRgb(fg));
	const b = luminance(hexToRgb(bg));
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `rgba(255,255,255,0.08)` over an opaque ground, as a hex. */
function over(rgba: string, bgHex: string): string {
	const m = rgba.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
	if (!m) throw new Error(`not an rgb(a) colour: ${rgba}`);
	const [fr, fg, fb] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const alpha = m[4] === undefined ? 1 : Number(m[4]);
	const [br, bg, bb] = hexToRgb(bgHex);
	const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
	return (
		'#' +
		[mix(fr, br), mix(fg, bg), mix(fb, bb)].map((v) => v.toString(16).padStart(2, '0')).join('')
	);
}

/**
 * A token's value inside a given block of CSS. Blocks are matched by their
 * OPENING SELECTOR LINE, so the three notebook palettes can be told apart even
 * though they declare the same names.
 */
function tokenIn(css: string, selector: string, name: string): string {
	const at = css.indexOf(selector);
	expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
	const block = css.slice(at, css.indexOf('\n}', at));
	const m = block.match(new RegExp(`\\${name}:\\s*([^;]+);`));
	expect(m, `${name} not declared in ${selector}`).not.toBeNull();
	return m![1].trim();
}

// --------------------------------------------------------------------------
// The rooms, and every ground a colour-neutral boundary can land on in each.
//
// `--plate` is deliberately absent from the portal list: nothing in the app
// renders on it (`var(--plate)` appears in no rule), and a boundary that ever
// does land there needs its own measurement -- #2c3c2c would put the current
// value at 2.66.
// --------------------------------------------------------------------------

const ROOMS = [
	{
		name: 'classroom + portal',
		css: COLORS,
		selector: ':root {',
		boundary: '--boundary',
		grounds: ['--surface-0', '--surface-1', '--surface-2', '--bg0', '--bg1', '--bg2']
	},
	{
		name: 'notebook light',
		css: COLORS,
		selector: ':root {',
		boundary: '--nb-boundary',
		grounds: ['--nb-bg', '--nb-surface', '--nb-surface-dim']
	},
	{
		name: 'notebook dark (system)',
		css: COLORS,
		selector: '@media (prefers-color-scheme: dark) {',
		boundary: '--nb-boundary',
		grounds: ['--nb-bg', '--nb-surface', '--nb-surface-dim']
	},
	{
		name: 'notebook dark (opt-in)',
		css: COLORS,
		selector: "[data-nb-theme='dark'] {",
		boundary: '--nb-boundary',
		grounds: ['--nb-bg', '--nb-surface', '--nb-surface-dim']
	},
	{
		name: 'notebook idea',
		css: COLORS,
		selector: "[data-nb-theme='idea'] {",
		boundary: '--nb-boundary',
		grounds: ['--nb-bg', '--nb-surface', '--nb-surface-dim']
	}
] as const;

describe('the load-bearing boundary token', () => {
	it('is declared for every room, and the notebook room aliases it', () => {
		// Five palettes, and the count is asserted so a sweep that generated
		// nothing cannot pass silently.
		expect(ROOMS.length).toBe(5);
		for (const room of ROOMS) {
			expect(tokenIn(room.css, room.selector, room.boundary), room.name).toMatch(/^#[0-9a-f]{6}$/i);
		}
		// Without this alias the notebook would inherit the :root value, which
		// is measured against dark green plate and is 1.29:1 on paper.
		expect(NB_THEME).toMatch(/--boundary:\s*var\(--nb-boundary\)/);
	});

	it('clears 3:1 against every ground it can sit on, in every room', () => {
		let cases = 0;
		const failures: string[] = [];
		for (const room of ROOMS) {
			const fg = tokenIn(room.css, room.selector, room.boundary);
			for (const g of room.grounds) {
				const bg = tokenIn(room.css, room.selector, g);
				const ratio = contrast(fg, bg);
				cases++;
				if (ratio < 3) failures.push(`${room.name}: ${fg} on ${g} (${bg}) = ${ratio.toFixed(2)}`);
			}
		}
		// 6 portal/classroom grounds + 3 per notebook plate x 4 plates.
		expect(cases, 'the sweep must actually generate its cases').toBe(18);
		expect(failures).toEqual([]);
	});
});

describe('the decorative hairline, which must NOT be raised', () => {
	it('is still the 8%-white rule and still fails 3:1 -- that is its job', () => {
		const hairline = tokenIn(COLORS, ':root {', '--hairline');
		expect(hairline).toBe('rgba(255, 255, 255, 0.08)');

		// THE REJECTED ALTERNATIVE, stated as an assertion. Raising this one
		// token makes every load-bearing case pass and draws 189 decorative
		// edges in the classroom alone at full strength. If a future change
		// raises it, this reddens before anybody has to notice the wireframe.
		let cases = 0;
		for (const g of ['--surface-0', '--surface-1', '--surface-2', '--bg0', '--bg1', '--bg2']) {
			const bg = tokenIn(COLORS, ':root {', g);
			const ratio = contrast(over(hairline, bg), bg);
			cases++;
			expect(ratio, `--hairline on ${g} should stay decorative`).toBeLessThan(3);
		}
		expect(cases).toBe(6);
	});

	it('still paints the decorative rules -- they were not swept along', () => {
		// A named sample of rules that are DECORATION by the standard's own
		// examples: a rule between two blocks inside one card, a table cell
		// edge, the frame on a thumbnail, a static chip. Each is a real
		// file:selector pair, so a mechanical sweep that moved everything
		// reddens here with the file named.
		const DECORATIVE: [string, string][] = [
			['src/lib/classroom/MarkdownText.svelte', '.md :global(code)'],
			['src/lib/classroom/MarkdownText.svelte', '.md :global(.md-table td)'],
			['src/lib/classroom/MarkdownText.svelte', '.md :global(.md-figure img)'],
			['src/lib/classroom/GradeCalculator.svelte', '.calc-table td'],
			['src/lib/classroom/AttachmentList.svelte', '.attach-preview'],
			['src/lib/classroom/ContentComposer.svelte', 'kbd'],
			['src/lib/classroom/ItemDetail.svelte', '.insp-block'],
			['src/lib/classroom/RubricView.svelte', '.rubric-head'],
			['src/lib/notebook/SectionGrid.svelte', 'th'],
			['src/lib/notebook/EntryThumb.svelte', '.thumb'],
			['src/lib/notebook/PhotoViewer.svelte', '.pv-bottom'],
			['src/lib/classroom/classroom.css', '.cr-root .tool-rule']
		];
		expect(DECORATIVE.length, 'the sample must not shrink to nothing').toBe(12);
		const moved: string[] = [];
		for (const [file, selector] of DECORATIVE) {
			const css = readFileSync(join(ROOT, file), 'utf8');
			// A selector may open its rule (`sel {`) or be one of several joined
			// by commas (`sel,`). Match either, then read forward to the brace.
			const at = [`\n${selector} {`, `\n\t${selector} {`, `\n${selector},`, `\n\t${selector},`]
				.map((needle) => css.indexOf(needle))
				.filter((n) => n > -1)
				.sort((a, b) => a - b)[0];
			expect(at, `${file}: selector vanished: ${selector}`).toBeGreaterThan(-1);
			// A component's CSS is tab-indented, so its blocks close on `\n\t}`
			// while a plain stylesheet's close on `\n}`. Take whichever comes
			// first after the opening brace -- reading to the wrong one swallows
			// the next rule and turns this into a much weaker check.
			const open = css.indexOf('{', at);
			const ends = ['\n\t}', '\n}'].map((e) => css.indexOf(e, open)).filter((n) => n > -1);
			const block = css.slice(open, Math.min(...ends));
			if (!block.includes('var(--hairline)')) moved.push(`${file} ${selector}`);
		}
		expect(moved, 'decorative rules must stay on --hairline').toEqual([]);
	});

	it('still outnumbers nothing: both tokens are in real use', () => {
		// A partition where one side is empty is a partition that was not made.
		// Counted over the shipped source rather than asserted as a fixed
		// number, so adding a surface does not redden this for no reason.
		const files = sourceFiles();
		let hairline = 0;
		let boundary = 0;
		for (const f of files) {
			const css = readFileSync(f, 'utf8');
			hairline += (css.match(/var\(--hairline\)/g) ?? []).length;
			boundary += (css.match(/var\(--boundary\)/g) ?? []).length;
		}
		expect(files.length, 'the file sweep must actually find files').toBeGreaterThan(100);
		expect(hairline, 'decoration still uses --hairline').toBeGreaterThan(40);
		expect(boundary, 'load-bearing edges use --boundary').toBeGreaterThan(20);
		// The decorative side is the MAJORITY, which is the whole argument for
		// not raising one token: if this ever inverts, the split has drifted
		// into "measure everything" and the wireframe is back.
		expect(hairline).toBeGreaterThan(boundary / 2);
	});
});

function sourceFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith('.svelte') || e.name.endsWith('.css')) out.push(p);
		}
	};
	walk(join(ROOT, 'src'));
	return out;
}

import { readdirSync } from 'node:fs';
