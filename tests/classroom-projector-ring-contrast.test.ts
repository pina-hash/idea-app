// tests/classroom-projector-ring-contrast.test.ts
//
// THE WALL TIMER'S RING READS FROM THE BACK OF THE ROOM, IN EVERY THEME
// (reports R12, R13).
//
// The projector draws its timer as the Plate's progress ring (PlateRing.svelte)
// with the digits in the middle of its face, and the arc says how much time is
// left. Neither is something the browser harness's contrast walk can see: the
// face is an SVG radial gradient and the walk reads ancestors' background-color,
// so it would report the page plate behind the ring and pass for a reason
// nobody checked. So the arithmetic is done here, on the TOKENS the ring is
// painted from, read out of the theme CSS the way the class-theme test reads
// them, through the harness's own projector model (imported, not copied):
//
//   - the digits, `--text-1`, against BOTH stops of the face, washed: 4.5;
//   - the arc, `--plate-ring-value` (the theme's green) and in the last ten
//     seconds `--status-warn` (amber), against the wall's FLATTENED track, a
//     projector boundary: 2. The wall flattens the Plate's two-tone track to its
//     darker stop on a dark theme and its lighter stop on Space White; the
//     unflattened track is the NEGATIVE CONTROL, and on Space White it fails
//     (1.29 washed), which is the reason the flattening exists.
//
// The browser half is `RING_FACE_CONTRAST` in
// tools/browser-verify/routes/_classroom-live.mjs, which reads the stops the
// browser actually RESOLVED and applies the same model; the two agree.

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

type Rgb255 = { r: number; g: number; b: number };
let washedRatio: (a: Rgb255, b: Rgb255) => number;
let PROJECTOR_MODEL: { contrast: number; ambient: number };
beforeAll(async () => {
	const checks = await import(new URL('../tools/browser-verify/checks.mjs', import.meta.url).href);
	({ PROJECTOR_MODEL, washedRatio } = checks);
	expect(typeof washedRatio).toBe('function');
});

function blockAfter(css: string, header: string): string {
	const start = css.indexOf(header);
	if (start < 0) throw new Error(`no block ${header}`);
	const open = css.indexOf('{', start);
	return css.slice(open + 1, css.indexOf('\n}', open));
}
function hexIn(block: string, name: string): string | null {
	return block.match(new RegExp(`\\n\\s*${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1] ?? null;
}
const rgb = (hex: string): Rgb255 => ({
	r: parseInt(hex.slice(1, 3), 16),
	g: parseInt(hex.slice(3, 5), 16),
	b: parseInt(hex.slice(5, 7), 16)
});

const colorsCss = readFileSync('src/lib/design-system/colors.css', 'utf8');
const plateCss = readFileSync('src/lib/classroom/plate.css', 'utf8');
const viewSrc = readFileSync('src/lib/classroom/live-class/ProjectorView.svelte', 'utf8');

const SITE = {
	idea: blockAfter(colorsCss, ':root {'),
	matrix: blockAfter(readFileSync('src/lib/design-system/themes/matrix.css', 'utf8'), ":root[data-theme='matrix'] {"),
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

type Theme = keyof typeof SITE;
const THEMES: Theme[] = ['idea', 'matrix', 'space-white'];

/** A token as the theme resolves it: its own block, else IDEA's (a theme block holds only what it moves). */
function site(theme: Theme, name: string): string {
	const v = hexIn(SITE[theme], name) ?? hexIn(SITE.idea, name);
	if (!v) throw new Error(`${theme} ${name}`);
	return v;
}
function plate(theme: Theme, name: string): string {
	const v = hexIn(PLATE[theme], name) ?? hexIn(PLATE.idea, name);
	if (!v) throw new Error(`${theme} ${name}`);
	return v;
}
/** The face the wall paints: the Plate's own, untouched. */
const face = (theme: Theme, name: '--plate-ring-face' | '--plate-ring-face-hi') => plate(theme, name);
/**
 * The wall's flattened track: which stop the component picks, read off its own
 * rules, so the test and the paint name the same stop.
 */
const SW_TRACK = viewSrc.match(/:root\[data-theme='space-white'\]\) \.lp-timer \{\s*--lp-rest: var\((--plate-ring-rest-[ab])\)/)?.[1];
const DARK_TRACK = viewSrc.match(/\n\t\t--lp-rest: var\((--plate-ring-rest-[ab])\);/)?.[1];
const track = (theme: Theme) => plate(theme, (theme === 'space-white' ? SW_TRACK : DARK_TRACK) ?? 'missing');
const w = (a: string, b: string) => washedRatio(rgb(a), rgb(b));

describe('the wall ring, through the projector model', () => {
	it('uses the harness projector model, not a copy of it', () => {
		expect(PROJECTOR_MODEL).toEqual({ contrast: 300, ambient: 0.1 });
		// A known pair, so the import is the real function and not a stub.
		expect(w('#0d1311', '#f7f9f9')).toBeCloseTo(9.56, 1);
	});

	it("reads the wall's own track choice out of the component", () => {
		expect(DARK_TRACK).toBe('--plate-ring-rest-b');
		expect(SW_TRACK).toBe('--plate-ring-rest-a');
	});

	it('reads every token it needs in all three themes (the sweep is not empty)', () => {
		const read = THEMES.flatMap((t) => [site(t, '--text-1'), face(t, '--plate-ring-face'), face(t, '--plate-ring-face-hi'), track(t)]);
		expect(read).toHaveLength(12);
		for (const v of read) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
	});

	for (const theme of THEMES) {
		it(`${theme}: the digits clear 4.5 washed on both stops of the ring face`, () => {
			const ink = site(theme, '--text-1');
			for (const stop of ['--plate-ring-face', '--plate-ring-face-hi'] as const) {
				expect(w(ink, face(theme, stop)), `${theme} ${stop}`).toBeGreaterThanOrEqual(4.5);
			}
		});

		it(`${theme}: the arc, green and in the last seconds amber, clears 2 washed on the flattened track`, () => {
			expect(w(site(theme, '--green'), track(theme)), `${theme} value`).toBeGreaterThanOrEqual(2);
			expect(w(site(theme, '--amber'), track(theme)), `${theme} warn`).toBeGreaterThanOrEqual(2);
		});
	}

	it('NEGATIVE CONTROL: on Space White the Plate track UNflattened fails the arc, which is why the wall flattens it', () => {
		// The Plate's two-tone track puts the green arc against its darker stop
		// on Space White: dark on dark.
		expect(w(site('space-white', '--green'), plate('space-white', '--plate-ring-rest-b'))).toBeLessThan(2);
	});
});

/*
 * THE CLOCK FACE ON THE SAME RING (idea 26033e4b). `WallClock.svelte` draws
 * hands and indices over the ring's face; the face is the same SVG gradient the
 * contrast walk cannot see, so the hands are judged here too, with the token
 * names READ OUT OF THE COMPONENT so the test and the paint name the same ink:
 *
 *   - the hour and minute hands and the twelve indices, which the class reads
 *     the time from: 4.5 washed on both face stops (they are the text tier);
 *   - the second hand: 3 washed on both stops (a graphical object);
 *   - every hand against its own halo, which is what keeps a light hand legible
 *     where it crosses the ring's light glowing segments: 3 washed.
 *
 * NEGATIVE CONTROL: the Plate's own tick colour, the obvious ink for an index,
 * fails on Space White (about 1.6 washed), which is why the indices do not use it.
 */
const clockSrc = readFileSync('src/lib/classroom/live-class/WallClock.svelte', 'utf8');
function strokeOf(selector: string, prop: 'stroke' | 'fill' = 'stroke'): string | undefined {
	const at = clockSrc.indexOf(`\n\t${selector} {`);
	if (at < 0) return undefined;
	const body = clockSrc.slice(at, clockSrc.indexOf('}', at));
	return body.match(new RegExp(`\\n\\s*${prop}: var\\((--[a-z0-9-]+)\\);`))?.[1];
}
const HOUR_INK = strokeOf('.wc-hour .wc-ink');
const MIN_INK = strokeOf('.wc-min .wc-ink');
const INDEX_INK = strokeOf('.wc-index');
const SEC_INK = strokeOf('.wc-sec-ink');
const HALO = strokeOf('.wc-halo');
const token = (theme: Theme, name: string) => (name.startsWith('--plate-ring-') ? plate(theme, name) : site(theme, name));

describe('the clock face, through the projector model', () => {
	it("reads the dial's own inks out of the component", () => {
		expect(HOUR_INK).toBe('--text-1');
		expect(MIN_INK).toBe('--text-1');
		expect(INDEX_INK).toBe('--text-1');
		expect(SEC_INK).toBe('--plate-ring-text');
		expect(HALO).toBe('--plate-ring-band');
	});

	for (const theme of THEMES) {
		it(`${theme}: the hour and minute hands and the indices clear 4.5 washed on both face stops`, () => {
			for (const ink of [HOUR_INK!, MIN_INK!, INDEX_INK!]) {
				for (const stop of ['--plate-ring-face', '--plate-ring-face-hi'] as const) {
					expect(w(token(theme, ink), face(theme, stop)), `${theme} ${ink} on ${stop}`).toBeGreaterThanOrEqual(4.5);
				}
			}
		});

		it(`${theme}: the second hand clears 3 washed on both face stops`, () => {
			for (const stop of ['--plate-ring-face', '--plate-ring-face-hi'] as const) {
				expect(w(token(theme, SEC_INK!), face(theme, stop)), `${theme} ${stop}`).toBeGreaterThanOrEqual(3);
			}
		});

		it(`${theme}: every hand stands off its own halo by 3 washed`, () => {
			for (const ink of [HOUR_INK!, SEC_INK!]) {
				expect(w(token(theme, ink), token(theme, HALO!)), `${theme} ${ink}`).toBeGreaterThanOrEqual(3);
			}
		});
	}

	it("NEGATIVE CONTROL: the Plate's tick colour would fail as an index on Space White", () => {
		const worst = Math.min(
			w(plate('space-white', '--plate-ring-ticks'), face('space-white', '--plate-ring-face')),
			w(plate('space-white', '--plate-ring-ticks'), face('space-white', '--plate-ring-face-hi'))
		);
		expect(worst).toBeLessThan(3);
	});
});
