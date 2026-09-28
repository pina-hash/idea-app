/**
 * THE RAIN'S RULES, ASSERTED ON THE PURE HALF WITH NOTHING STUBBED.
 *
 * `$lib/design-system/themes/matrix-rain.ts` is what a column is, how it
 * falls, which glyph it shows and how bright it may be under the page's copy.
 * Every one of those can regress silently -- a column that never restarts is
 * a canvas that empties from the top over a minute, a speed range that
 * collapses is a field falling in lockstep, and a gain that drifts up is a
 * word on the landing page that stops clearing 4.5:1 for one frame in every
 * twenty -- and none of it fails a type check or a build. So it is asserted
 * here, in the `node` project, off the same functions the painter calls.
 *
 * THE LOAD-BEARING TEST IS THE LAST BLOCK. The contrast a text tier keeps at
 * the rain's WORST FRAME is computed from the theme's own hexes (read out of
 * `matrix.css`, so a repaint moves the assertion with it) and the module's own
 * head and trail colours at the module's own content-band gain. A positive
 * control shows the same arithmetic FAILS at gain 1, which is what makes the
 * band load-bearing rather than decorative.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	RAIN,
	GLYPHS,
	GLYPH_COUNT,
	glyphAt,
	createColumns,
	stepColumns,
	fadeFrames,
	tailRows,
	trailAlpha,
	fadeAlpha,
	bandGain,
	mulberry32,
	relativeLuminance,
	contrastRatio,
	overSrgb,
	worstFrame,
	headColour,
	rainForWidth,
	paintDue,
	createSlowJudge,
	judgeFrame,
	judgeMeanMs,
	type CellEvent,
	type RainConfig
} from '../src/lib/design-system/themes/matrix-rain';

describe('the glyph set', () => {
	it('is non-empty, unique, printable, and doubled by mirroring', () => {
		expect(GLYPHS.length).toBeGreaterThan(20);
		expect(new Set(GLYPHS).size).toBe(GLYPHS.length);
		for (const g of GLYPHS) expect(g).toMatch(/^\S$/);
		expect(GLYPH_COUNT).toBe(GLYPHS.length * 2);
		expect(glyphAt(0)).toEqual({ char: GLYPHS[0], mirrored: false });
		expect(glyphAt(GLYPHS.length)).toEqual({ char: GLYPHS[0], mirrored: true });
		expect(glyphAt(GLYPH_COUNT - 1)).toEqual({ char: GLYPHS[GLYPHS.length - 1], mirrored: true });
		// Wraps rather than throws on a bad index.
		expect(glyphAt(GLYPH_COUNT)).toEqual(glyphAt(0));
		expect(glyphAt(-1)).toEqual(glyphAt(GLYPH_COUNT - 1));
	});

	it('carries no katakana: a school desktop with no CJK font would draw tofu', () => {
		for (const g of GLYPHS) expect(g.charCodeAt(0)).toBeLessThan(0x80);
	});
});

describe('columns fall at varying speeds, restart, and change their glyphs', () => {
	const rng = mulberry32(7);
	const COLS = 60;
	const ROWS = 40;

	it('createColumns scatters heads over the field and picks speeds inside the range', () => {
		const cols = createColumns(COLS, ROWS, rng);
		expect(cols.length).toBe(COLS);
		const speeds = new Set<number>();
		for (const c of cols) {
			expect(c.head).toBeGreaterThanOrEqual(-ROWS);
			expect(c.head).toBeLessThan(ROWS);
			expect(c.speed).toBeGreaterThanOrEqual(RAIN.minSpeed);
			expect(c.speed).toBeLessThanOrEqual(RAIN.maxSpeed);
			speeds.add(c.speed);
		}
		/* "Varying speeds" is a claim about the distribution, so it is counted:
		   sixty columns with fewer than thirty distinct speeds would be a
		   field falling in a few locked bands. */
		expect(speeds.size).toBeGreaterThanOrEqual(30);
		expect(RAIN.maxSpeed / RAIN.minSpeed).toBeGreaterThanOrEqual(3);
	});

	it('every emitted cell is on the field, heads advance one row at a time, and mutations trail the head', () => {
		const cols = createColumns(COLS, ROWS, mulberry32(11));
		const lastHead = new Map<number, number>();
		const out: CellEvent[] = [];
		let heads = 0;
		let trails = 0;
		let mutations = 0;
		for (let frame = 0; frame < 600; frame++) {
			out.length = 0;
			stepColumns(cols, ROWS, 1, rng, out);
			for (const e of out) {
				expect(e.row).toBeGreaterThanOrEqual(0);
				expect(e.row).toBeLessThan(ROWS);
				expect(e.col).toBeGreaterThanOrEqual(0);
				expect(e.col).toBeLessThan(COLS);
				expect(e.glyph).toBeGreaterThanOrEqual(0);
				expect(e.glyph).toBeLessThan(GLYPH_COUNT);
				expect(e.alpha).toBeGreaterThan(0);
				expect(e.alpha).toBeLessThanOrEqual(1);
				if (e.kind === 'head') {
					heads++;
					const prev = lastHead.get(e.col);
					// A head that skipped a row would leave a gap in the streak.
					if (prev !== undefined && e.row > prev) expect(e.row - prev).toBe(1);
					lastHead.set(e.col, e.row);
					expect(e.alpha).toBe(1);
				} else if (e.kind === 'trail') {
					trails++;
					expect(e.alpha).toBe(1);
				} else {
					mutations++;
					const c = cols[e.col];
					const back = c.head - e.row;
					expect(back).toBeGreaterThanOrEqual(2);
					expect(back).toBeLessThanOrEqual(tailRows(c.speed));
					expect(e.alpha).toBeCloseTo(trailAlpha(back, c.speed), 10);
				}
			}
		}
		// The sweep saw all three kinds, so the branches above were exercised.
		expect(heads).toBeGreaterThan(1000);
		expect(trails).toBeGreaterThan(1000);
		expect(mutations).toBeGreaterThan(1000);
	});

	it('a column that has left the bottom restarts above the top with a new speed, and never stalls', () => {
		const cols = createColumns(8, 30, mulberry32(3));
		const out: CellEvent[] = [];
		let restarts = 0;
		const seenSpeeds = new Set<number>();
		for (let frame = 0; frame < 3000; frame++) {
			const before = cols.map((c) => ({ head: c.head, speed: c.speed }));
			out.length = 0;
			stepColumns(cols, 30, 1, rng, out);
			cols.forEach((c, i) => {
				seenSpeeds.add(c.speed);
				if (c.head < before[i].head) {
					restarts++;
					expect(c.head).toBeLessThan(0);
					expect(c.speed).toBeGreaterThanOrEqual(RAIN.minSpeed);
					expect(c.speed).toBeLessThanOrEqual(RAIN.maxSpeed);
				}
				// A head never sits below the field plus its own tail.
				expect(c.head - tailRows(c.speed)).toBeLessThanOrEqual(30);
			});
		}
		expect(restarts).toBeGreaterThan(8 * 3); // every column cycled at least a few times
		expect(seenSpeeds.size).toBeGreaterThan(8 * 3);
	});

	it('the glyph a column shows keeps changing', () => {
		const cols = createColumns(1, 200, mulberry32(5));
		cols[0].head = 0;
		cols[0].speed = 1;
		cols[0].acc = 0;
		const out: CellEvent[] = [];
		stepColumns(cols, 200, 120, mulberry32(9), out);
		const headGlyphs = out.filter((e) => e.kind === 'head').map((e) => e.glyph);
		expect(headGlyphs.length).toBeGreaterThanOrEqual(100);
		expect(new Set(headGlyphs).size).toBeGreaterThan(30);
	});

	it('a fractional frame accumulates rather than being dropped', () => {
		const cols = createColumns(1, 100, mulberry32(1));
		cols[0].head = 10;
		cols[0].speed = 0.5;
		cols[0].acc = 0;
		const out: CellEvent[] = [];
		// 0.5 rows/frame over 1.2 frames is 0.6 of a row: no advance yet...
		stepColumns(cols, 100, 1.2, rng, out);
		expect(out.filter((e) => e.kind === 'head').length).toBe(0);
		expect(cols[0].acc).toBeCloseTo(0.6, 12);
		// ...and the second 1.2 frames carries it over exactly one row, not two.
		stepColumns(cols, 100, 1.2, rng, out);
		expect(out.filter((e) => e.kind === 'head').length).toBe(1);
		expect(cols[0].head).toBe(11);
		expect(cols[0].acc).toBeCloseTo(0.2, 12);
	});
});

describe('the fade, solved both ways', () => {
	it('fadeFrames and tailRows follow from fadePerFrame', () => {
		expect(fadeFrames()).toBe(Math.ceil(Math.log(0.05) / Math.log(1 - RAIN.fadePerFrame)));
		expect(tailRows(RAIN.minSpeed)).toBeGreaterThanOrEqual(1);
		expect(tailRows(RAIN.maxSpeed)).toBeGreaterThan(tailRows(RAIN.minSpeed));
		expect(tailRows(RAIN.maxSpeed)).toBe(Math.ceil(RAIN.maxSpeed * fadeFrames()));
	});

	it('trailAlpha is the per-frame curve solved for rows behind the head', () => {
		expect(trailAlpha(0, 0.5)).toBe(1);
		for (let d = 1; d < 20; d++) {
			expect(trailAlpha(d, 0.5)).toBeCloseTo(Math.pow(1 - RAIN.fadePerFrame, d / 0.5), 12);
			expect(trailAlpha(d, 0.5)).toBeLessThan(trailAlpha(d - 1, 0.5));
		}
		// A faster column has a longer, brighter tail at the same distance.
		expect(trailAlpha(6, RAIN.maxSpeed)).toBeGreaterThan(trailAlpha(6, RAIN.minSpeed));
	});

	it('fadeAlpha is per frame at 60fps, compounds for a slower frame, and is clamped for a hidden tab', () => {
		expect(fadeAlpha(1000 / 60)).toBeCloseTo(RAIN.fadePerFrame, 6);
		expect(fadeAlpha(2000 / 60)).toBeCloseTo(1 - Math.pow(1 - RAIN.fadePerFrame, 2), 6);
		expect(fadeAlpha(0)).toBe(0);
		expect(fadeAlpha(60_000)).toBe(fadeAlpha(250));
		expect(fadeAlpha(60_000)).toBeLessThanOrEqual(0.5);
	});
});

describe('the content band', () => {
	it('is the gain inside, full outside, and a monotonic ramp between, symmetric about the centre', () => {
		const W = 1920;
		expect(bandGain(W / 2, W)).toBe(RAIN.contentGain);
		expect(bandGain(0, W)).toBe(1);
		expect(bandGain(W, W)).toBe(1);
		const inner = W / 2 - RAIN.contentBandPx / 2;
		expect(bandGain(inner + 1, W)).toBe(RAIN.contentGain);
		expect(bandGain(inner - RAIN.bandRampPx, W)).toBe(1);
		let prev = 1;
		for (let x = 0; x <= W / 2; x += 4) {
			const g = bandGain(x, W);
			expect(g).toBeLessThanOrEqual(prev + 1e-12);
			expect(g).toBeCloseTo(bandGain(W - x, W), 12);
			prev = g;
		}
	});

	it('at a phone width the whole canvas is the band', () => {
		for (const x of [0, 10, 187, 370, 375]) expect(bandGain(x, 375)).toBe(RAIN.contentGain);
	});
});

describe('the seeded generator', () => {
	it('is deterministic per seed and stays in [0, 1)', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const c = mulberry32(43);
		const sa = Array.from({ length: 50 }, () => a());
		const sb = Array.from({ length: 50 }, () => b());
		const sc = Array.from({ length: 50 }, () => c());
		expect(sa).toEqual(sb);
		expect(sa).not.toEqual(sc);
		for (const v of sa) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('the contrast arithmetic', () => {
	it('agrees with WCAG on the known points', () => {
		expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
		expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
		expect(relativeLuminance('#fff')).toBeCloseTo(1, 6);
		expect(overSrgb('#123456', 1, '#ffffff')).toBe('#123456');
		expect(overSrgb('#123456', 0, '#ffffff')).toBe('#ffffff');
		expect(overSrgb('#ffffff', 0.5, '#000000')).toBe('#808080');
	});
});

/* ------------------------------------------------------------------------- */

const themeCss = readFileSync(
	fileURLToPath(new URL('../src/lib/design-system/themes/matrix.css', import.meta.url)),
	'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');
const themeToken = (name: string): string => {
	const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(themeCss);
	if (!m) throw new Error(`matrix.css declares no hex for ${name}`);
	return m[1];
};

describe('THE WORST FRAME: every text tier the theme paints on the bare page ground, over the rain at the content-band gain', () => {
	const ground = themeToken('--bg0');
	const body = ['--white', '--text-1'] as const;
	const meta = ['--ice', '--text-2'] as const;

	it('the body tiers clear 4.5:1 with a HEAD cell behind them, and with a trail cell', () => {
		for (const t of body) {
			const w = worstFrame(themeToken(t), ground, RAIN.contentGain);
			expect(w.head, `${t} under a head`).toBeGreaterThanOrEqual(4.5);
			expect(w.trail, `${t} under a trail`).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('the meta tiers --ice and --text-2 clear 4.5:1 at the head frame too', () => {
		for (const t of meta) {
			const w = worstFrame(themeToken(t), ground, RAIN.contentGain);
			expect(w.head, `${t} under a head`).toBeGreaterThanOrEqual(4.5);
			expect(w.trail, `${t} under a trail`).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('--dim clears 4.5:1 at every frame inside the band, BECAUSE the band draws no bright head', () => {
		/* --dim is the landing page's hero subtitle, the one --dim role that
		   sits on the bare shell ground. It measures 5.31:1 on the base --bg0
		   with no rain at all, so it has 0.8 of headroom and ANY lit pixel
		   behind it eats some of that. Measured with bright heads drawn at the
		   band gain, it dipped to 3.7 under a head cell; `headColour` is what
		   closed that, and this is the assertion that keeps it closed. */
		const w = worstFrame(themeToken('--dim'), ground, RAIN.contentGain);
		expect(w.trail).toBeGreaterThanOrEqual(4.5);
		expect(w.head).toBeGreaterThanOrEqual(4.5);
		expect(headColour(RAIN.contentGain)).toBe(RAIN.trail);
		expect(headColour(1)).toBe(RAIN.head);
		// And the same statement for the one SEMANTIC token that sits bare on
		// the landing page: --teal, the hero eyebrow, which this theme never
		// repaints and which measured 3.92 under a bright head.
		expect(worstFrame('#3ea368', ground, RAIN.contentGain).head).toBeGreaterThanOrEqual(4.5);
	});

	it('POSITIVE CONTROL: at gain 1 the same tiers FAIL, so the band gain is load-bearing', () => {
		expect(worstFrame(themeToken('--text-2'), ground, 1).head).toBeLessThan(4.5);
		expect(worstFrame(themeToken('--dim'), ground, 1).head).toBeLessThan(4.5);
		expect(worstFrame(themeToken('--dim'), ground, 1).trail).toBeLessThan(4.5);
		// And the arithmetic is not vacuous: the margin rain is vividly brighter than its ground.
		expect(contrastRatio(RAIN.head, ground)).toBeGreaterThan(10);
		expect(contrastRatio(RAIN.trail, ground)).toBeGreaterThan(5);
	});

	it('the rain under content is still a picture: the head and the trail both read against the ground', () => {
		const head = overSrgb(RAIN.head, RAIN.contentGain, ground);
		const trail = overSrgb(RAIN.trail, RAIN.contentGain, ground);
		expect(contrastRatio(head, ground)).toBeGreaterThan(1.5);
		expect(contrastRatio(trail, ground)).toBeGreaterThan(1.25);
		expect(relativeLuminance(head)).toBeGreaterThan(relativeLuminance(trail));
	});
});

/* ------------------------------------------------------------------------- *
 * REPORT R09, "Matrix theme not animated on mobile". Three rules in the pure
 * module answer it, and each regresses silently: a judge that trips on a
 * phone parks the field as a still that looks deliberate, a cadence counted
 * in frames paints a 30Hz phone at half the rate with nothing to say so, and
 * a narrow-screen change that lit a brighter pixel under the copy fails a
 * word on the landing page for one frame in twenty. So all three are here.
 * ------------------------------------------------------------------------- */

/** Feed `intervals` to a fresh judge and return the 1-based frames it tripped on. */
function trips(intervals: number[], r: RainConfig = RAIN): number[] {
	const j = createSlowJudge(r);
	const out: number[] = [];
	intervals.forEach((dt, i) => {
		if (judgeFrame(j, dt, r)) out.push(i + 1);
	});
	return out;
}
const repeat = (n: number, pattern: number[]): number[] => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
/** Whole-vsync frame lengths a panel at `hz` can deliver, up to `maxMs`. */
const vsyncs = (hz: number, maxMs: number): number[] => {
	const out: number[] = [];
	for (let k = 1; (k * 1000) / hz <= maxMs + 1e-9; k++) out.push((k * 1000) / hz);
	return out;
};

describe('R09: a phone at 30 fps is not a slow device', () => {
	it('the threshold sits between a 30 fps frame and a 20 fps one, above every 24 fps-or-better vsync interval', () => {
		expect(RAIN.slowFrameMs).toBeGreaterThan((1000 / 30) * 1.25);
		expect(RAIN.slowFrameMs).toBeLessThanOrEqual(1000 / 20);
		let checked = 0;
		for (const hz of [60, 90, 120, 144]) {
			for (const ms of vsyncs(hz, 1000 / 24)) {
				expect(ms, `${hz}Hz ${ms.toFixed(1)}ms`).toBeLessThan(RAIN.slowFrameMs);
				checked++;
			}
		}
		// Sixteen intervals examined: 2 at 60Hz, 3 at 90Hz, 5 at 120Hz, 6 at 144Hz.
		expect(checked).toBe(16);
		// Three 60Hz vsyncs -- a desktop that cannot hold 30 -- is slow.
		expect((3 * 1000) / 60).toBeGreaterThanOrEqual(RAIN.slowFrameMs);
	});

	it('a steady 30 fps display never degrades, with timestamp jitter and a dropped frame in seven', () => {
		const rng = mulberry32(30);
		const frames = Array.from({ length: 3000 }, (_, i) => (i % 7 === 6 ? 2000 / 30 : 1000 / 30 + (rng() - 0.5) * 8));
		expect(trips(frames)).toEqual([]);
	});

	it('nor does a 90Hz panel held at four vsyncs (44.4ms) or a 120Hz one at five (41.7ms), which 34ms called slow', () => {
		expect(trips(repeat(3000, [4000 / 90]))).toEqual([]);
		expect(trips(repeat(3000, [5000 / 120]))).toEqual([]);
		/* POSITIVE CONTROL: the same streams under the old 34ms line trip, so
		   it is the threshold that keeps them running and not a judge that
		   never answers true. */
		const old = { ...RAIN, slowFrameMs: 34 };
		expect(trips(repeat(3000, [4000 / 90]), old).length).toBeGreaterThan(0);
		expect(trips(repeat(3000, [5000 / 120]), old).length).toBeGreaterThan(0);
	});

	it('a genuinely slow machine still degrades: 20 fps trips once the grace is over and a window is full, then trips again', () => {
		const graceFrames = Math.ceil(RAIN.slowGraceMs / 50);
		expect(trips(repeat(graceFrames + 3 * RAIN.slowWindow + 10, [50]))).toEqual([
			graceFrames + RAIN.slowWindow,
			graceFrames + 2 * RAIN.slowWindow,
			graceFrames + 3 * RAIN.slowWindow
		]);
	});

	it('it judges the median, not a run: slow three frames in four degrades, where one fast frame used to reset the count', () => {
		expect(trips(repeat(600, [60, 60, 60, 30])).length).toBeGreaterThan(0);
		// Exactly half slow is not a slow median.
		expect(trips(repeat(600, [60, 30]))).toEqual([]);
	});

	it('a start-up burst of long frames is forgiven, and without the grace the same burst would trip', () => {
		const burst = [...repeat(58, [50]), ...repeat(600, [1000 / 30])];
		expect(trips(burst)).toEqual([]);
		expect(trips(burst, { ...RAIN, slowGraceMs: 0 }).length).toBeGreaterThan(0);
	});

	it("a hidden tab's gap is neither judged nor spends the grace, and the mean reads the window", () => {
		const j = createSlowJudge();
		expect(Number.isNaN(judgeMeanMs(j))).toBe(true);
		for (let i = 0; i < 50; i++) expect(judgeFrame(j, 5000)).toBe(false);
		expect(j.graceLeftMs).toBe(RAIN.slowGraceMs);
		expect(j.filled).toBe(0);
		for (let i = 0; i < 400; i++) judgeFrame(j, 1000 / 30);
		expect(j.filled).toBe(RAIN.slowWindow);
		expect(judgeMeanMs(j)).toBeCloseTo(1000 / 30, 6);
	});
});

describe('R09: the paint cadence is time, not frames', () => {
	/** Paints per second the painter makes on a panel at `hz`, each frame jittered by up to +-`jitter` ms. */
	const paintsPerSecond = (hz: number, level: number, jitter = 0, r: RainConfig = RAIN) => {
		const rng = mulberry32(hz * 10 + level);
		let pending = 0;
		let paints = 0;
		const seconds = 20;
		for (let i = 0; i < hz * seconds; i++) {
			pending += 1000 / hz + (rng() - 0.5) * 2 * jitter;
			if (paintDue(pending, level, r)) {
				paints++;
				pending = 0;
			}
		}
		return paints / seconds;
	};

	it('about 30 paints a second on a 30, 60, 90 or 120Hz panel, and 15 at the half rate', () => {
		for (const hz of [30, 60, 90, 120]) {
			expect(paintsPerSecond(hz, 0), `${hz}Hz`).toBe(30);
			expect(paintsPerSecond(hz, 1), `${hz}Hz half`).toBe(15);
		}
		// The panels that do not divide evenly land either side of it, never at double.
		for (const hz of [75, 144]) {
			expect(paintsPerSecond(hz, 0)).toBeGreaterThanOrEqual(24);
			expect(paintsPerSecond(hz, 0)).toBeLessThanOrEqual(31);
		}
	});

	it('a 60Hz frame pair a hair under 33.3ms still paints on the second frame, not the third', () => {
		expect(paintsPerSecond(60, 0, 1.5)).toBeGreaterThanOrEqual(29);
		/* POSITIVE CONTROL: with no slack the same jittered panel loses paints
		   to the third frame, which is what the slack is for. */
		expect(paintsPerSecond(60, 0, 1.5, { ...RAIN, paintSlackMs: 0 })).toBeLessThan(28);
	});
});

describe('R09: at phone width the rain drags a longer streak, and no pixel behind the copy gets brighter', () => {
	const ground = themeToken('--bg0');
	const narrow = rainForWidth(375);

	it('a canvas no wider than the band takes the band fade; a wider one keeps the film and is the same object', () => {
		expect(narrow.fadePerFrame).toBe(RAIN.bandFadePerFrame);
		expect(RAIN.bandFadePerFrame).toBeLessThan(RAIN.fadePerFrame);
		expect(rainForWidth(RAIN.contentBandPx).fadePerFrame).toBe(RAIN.bandFadePerFrame);
		expect(rainForWidth(RAIN.contentBandPx + 1)).toBe(RAIN);
		expect(rainForWidth(1440)).toBe(RAIN);
		/* ONLY the fade moves: every other constant, the brightness rules
		   among them, is the film's. */
		const moved = (Object.keys(RAIN) as (keyof RainConfig)[]).filter((k) => narrow[k] !== RAIN[k]);
		expect(moved).toEqual(['fadePerFrame']);
	});

	it('each column shows a visibly longer streak at phone width, at every speed', () => {
		/* Visible = the composite still reads 1.1:1 against the bare ground at
		   the band's gain. Counted in rows behind the head. */
		const visibleRows = (speed: number, r: RainConfig) => {
			let k = 0;
			while (contrastRatio(overSrgb(r.trail, r.contentGain * Math.pow(1 - r.fadePerFrame, k), ground), ground) >= 1.1) k++;
			return speed * k;
		};
		for (const speed of [RAIN.minSpeed, (RAIN.minSpeed + RAIN.maxSpeed) / 2, RAIN.maxSpeed]) {
			expect(visibleRows(speed, RAIN), `speed ${speed}`).toBeGreaterThan(1);
			expect(visibleRows(speed, narrow), `speed ${speed}`).toBeGreaterThanOrEqual(1.8 * visibleRows(speed, RAIN));
		}
	});

	it('THE WORST FRAME, RE-DERIVED AT 375: every column is the band, and every pinned tier still clears 4.5:1', () => {
		const tiers: (readonly [string, string])[] = ['--white', '--text-1', '--ice', '--text-2', '--dim'].map(
			(t) => [t, themeToken(t)] as const
		);
		tiers.push(['--teal (hero eyebrow)', '#3ea368']);
		let cells = 0;
		for (let x = 0; x <= 375; x += RAIN.cell / 2) {
			const g = bandGain(x, 375, narrow);
			expect(g).toBe(narrow.contentGain);
			for (const [name, hex] of tiers) {
				const w = worstFrame(hex, ground, g, narrow);
				expect(w.head, `${name} under a head at x=${x}`).toBeGreaterThanOrEqual(4.5);
				expect(w.trail, `${name} under a trail at x=${x}`).toBeGreaterThanOrEqual(4.5);
				cells++;
			}
		}
		// 47 sample points across the width, six tiers each.
		expect(cells).toBe(47 * 6);
	});

	it('the slower fade never draws a cell brighter than a fresh one', () => {
		const cols = createColumns(24, 42, mulberry32(375), narrow);
		const out: CellEvent[] = [];
		let seen = 0;
		for (let frame = 0; frame < 900; frame++) {
			out.length = 0;
			stepColumns(cols, 42, 2, mulberry32(frame), out, narrow);
			for (const e of out) {
				expect(e.alpha).toBeLessThanOrEqual(1);
				expect(e.alpha).toBeGreaterThan(0);
				seen++;
			}
		}
		expect(seen).toBeGreaterThan(1000);
	});

	it('POSITIVE CONTROL: the two brighter answers the report invites both fail --dim at phone width', () => {
		const dim = themeToken('--dim');
		// A bright head at the band gain: the 3.7 the module's header records.
		expect(contrastRatio(dim, overSrgb(RAIN.head, narrow.contentGain, ground))).toBeLessThan(4.5);
		// A quarter more gain on the trail.
		expect(worstFrame(dim, ground, narrow.contentGain * 1.25, narrow).trail).toBeLessThan(4.5);
	});
});
