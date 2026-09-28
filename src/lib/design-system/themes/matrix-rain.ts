/**
 * THE RAIN, THE PURE HALF: what a column is, how it falls, which glyph it
 * shows, how bright it may be under the page's own copy, and the arithmetic
 * that says so. No DOM, no canvas, no clock -- `MatrixRain.svelte` is the
 * half that paints, and everything in this file is assertable in the `node`
 * test project (`tests/theme-rain.test.ts`) with nothing stubbed.
 *
 * WHY THE SPLIT IS THE REPOSITORY'S OWN SHAPE. "A pure, client-safe registry
 * per subsystem holds plain data and pure helpers"; `track-runtime.ts` and
 * `abilities.ts` do exactly this for GREENLINE, and `theme.ts` beside
 * `theme.svelte.ts` does it for the preference. A simulation whose every
 * rule lives in a component can only be measured by running the component,
 * which needs a real canvas and a real clock -- and then a wrong speed, a
 * bad brightness cap or a column that never restarts is a thing somebody has
 * to notice on screen.
 *
 * ------------------------------------------------------------------------
 * WHAT THE FILM DOES, AND WHAT THIS REPRODUCES. Columns of glyphs descend at
 * different speeds; the LEADING glyph is the bright one, near white; the
 * trail behind it is green and fades with distance; and glyphs in the trail
 * keep changing as the column falls. Every one of those is a rule below:
 *
 *   - a column is a HEAD row, a SPEED in rows per frame and an accumulator
 *     (`Column`); it advances one row at a time and restarts above the top
 *     once its whole streak has left the bottom, at a new random speed;
 *   - `stepColumns` emits three kinds of CELL EVENT per advance -- the head
 *     cell in the head colour, the cell it just left re-drawn in the trail
 *     colour with a NEW glyph (the film's "the head turns green behind
 *     itself"), and a couple of MUTATIONS further up the trail, each at the
 *     alpha the trail already has at that distance;
 *   - the fade itself is not simulated per cell: the painter strips a fixed
 *     fraction of the canvas's alpha every frame (`fadeAlpha`), so every
 *     glyph decays geometrically from the moment it was drawn. `trailAlpha`
 *     is the SAME curve, solved for "how bright is a cell d rows behind a
 *     head moving at speed s", which is what makes a mutation land at the
 *     brightness its neighbours already have rather than flashing.
 *
 * ------------------------------------------------------------------------
 * THE CONTENT BAND, AND WHY IT IS THE RAIN'S RULE RATHER THAN A STYLE.
 * The canvas is the whole viewport and the page's copy sits on top of it.
 * WCAG contrast is a claim about the pixels immediately behind a glyph of
 * text, and a moving background has a WORST FRAME: the instant a rain head
 * passes under a word. So the rain runs at full brightness only where the
 * shell puts no copy -- the margins outside a centred `contentBandPx` band
 * (1100px, the landing page's own measure and the widest thing the portal
 * shell centres) -- and inside the band it is drawn at `contentGain`, a
 * whisper behind the writing. At 375px the whole width is the band.
 *
 * AND INSIDE THE BAND THERE IS NO BRIGHT HEAD. Measured on the landing page
 * with heads drawn at the band gain: the body copy and the metadata held
 * 4.5:1 at every sampled frame, but the hero subtitle (--dim) dipped to 3.7
 * and the eyebrow (--teal, a semantic token this theme never touches) to
 * 3.92 for the frames a head cell sat under them -- both holding against
 * the trail at 4.59 and 4.68. So `headColour` answers the trail colour for
 * any column whose gain is the band's: under the page's copy the brightest
 * cell the rain can put behind a word is a fresh trail cell, and the bright
 * leader exists only in the margins, where nothing sits on it. The picture
 * inside the band is a whisper of green glyphs; the picture outside it is
 * the film.
 *
 * `contentGain` IS SOLVED, NOT CHOSEN. `worstFrame` composites the brightest
 * cell a column at a given gain can draw -- the head outside the band, the
 * trail inside it -- over a ground and returns the contrast a text token
 * keeps at that instant; `tests/theme-rain.test.ts` runs it for every text
 * tier the theme paints on the bare page ground and asserts each holds
 * 4.5:1, with a positive control showing the same arithmetic fails at gain
 * 1, which is what makes the band load-bearing rather than decorative.
 *
 * ------------------------------------------------------------------------
 * GLYPHS ARE DIGITS, CAPITALS AND OPERATORS, HALF OF THEM MIRRORED, AND NOT
 * KATAKANA. The film's set is half-width katakana; a school desktop with no
 * CJK font would draw every one of them as a tofu box, and the harness
 * Chromium has no such font to measure with either. Mirroring a Latin glyph
 * (`glyphAt` marks the upper half of the index space as mirrored, and the
 * painter's atlas draws those with a flipped transform) gives the
 * unfamiliar, reversed look without a font this platform cannot promise.
 *
 * ------------------------------------------------------------------------
 * A PHONE IS NOT A SLOW DEVICE (report R09, "Matrix theme not animated on
 * mobile"). Three things stood between a phone and a moving field, and each
 * is a rule below rather than a tweak in the painter:
 *
 *   - THE DEGRADE TRIPPED ON A 30 FPS DISPLAY. It counted frames over 34ms,
 *     ninety in a row, and a phone in power saving runs 33.3ms frames -- 0.7ms
 *     inside the line, where any lateness or one missed vsync on a 90 or 120Hz
 *     panel (44.4 or 41.7ms) counts as slow, and a phone's first seconds of
 *     page load count too. A degrade is permanent for the page, so a phone
 *     that tripped it once showed a still field until a reload. Now a device
 *     is judged on the MEDIAN of its last `slowWindow` frames against
 *     `slowFrameMs` (45ms, see the constant), and nothing is judged for the
 *     first `slowGraceMs` after the loop starts (`judgeFrame`).
 *   - THE PAINT CADENCE WAS COUNTED IN FRAMES, so "every other frame" was
 *     30 fps on a 60Hz desktop, 15 on a 30Hz phone and 60 on a 120Hz one --
 *     the slowest device painting least often and the fastest paying double.
 *     It is counted in milliseconds now (`paintDue`): about 30 paints a
 *     second whatever the panel's rate, which is what it always was at 60Hz.
 *   - AT PHONE WIDTH THE WHOLE SCREEN IS THE CONTENT BAND, so every glyph is
 *     the band's whisper and none is the film. The whisper CANNOT get brighter:
 *     `worstFrame` puts --dim, the hero subtitle, at 4.59:1 over a fresh trail
 *     cell at `contentGain`, 0.09 above the floor, and a whiter head at that
 *     gain measured 3.7. What CAN change without lighting a single pixel past
 *     that is how many glyphs are lit at once: a canvas with no margin
 *     (`rainForWidth`) fades at `bandFadePerFrame`, half the film's rate, so
 *     each column drags twice the visible streak. The fade never brightens a
 *     cell (every draw is at or below a fresh cell's alpha, and a cell is
 *     cleared before it is redrawn), so the worst frame is unchanged by
 *     construction, and the test says so for every tier rather than assuming.
 */

export type Rng = () => number;

/* A plain object literal first, so its fields type as `number` and `string`
   rather than as the literals `Object.freeze` would infer: `rainForWidth`
   hands out a variant with a different fade, and a test builds variants with
   a different threshold, both of which a literal type would refuse. */
const RAIN_VALUES = {
	/** CSS px per glyph cell. The canvas is scaled by DPR underneath. */
	cell: 16,
	/** The face for the atlas: the platform's mono first, then whatever
	 *  monospace the machine has. Never Arial or a proportional fallback. */
	font: '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace',
	/** The leading glyph: phosphor pushed almost to white. */
	head: '#d2ffd9',
	/** The glyph a head leaves behind, and what a mutation is drawn in. */
	trail: '#1fc35a',
	/** Alpha stripped from the whole canvas per frame at 60fps. 0.09 puts a
	 *  glyph at 5% after ~32 frames, about half a second. */
	fadePerFrame: 0.09,
	/** Rows per frame at 60fps: ~10 rows/s to ~36 rows/s. */
	minSpeed: 0.16,
	maxSpeed: 0.6,
	/** Trail cells re-glyphed per head advance, and how far back they reach. */
	mutationsPerStep: 2,
	mutationReach: 12,
	/** The centred band the page's copy sits in, and the gain inside it. */
	contentBandPx: 1100,
	bandRampPx: 48,
	contentGain: 0.2,
	/** Device pixel ratio cap: a 3x phone would otherwise fade a 2.2 Mpx
	 *  canvas every frame for glyphs nobody can see the difference in. */
	maxDpr: 2,
	/** The fade on a canvas with no margin (see `rainForWidth`): half the
	 *  film's, so a column drags twice the visible streak behind its head. */
	bandFadePerFrame: 0.045,
	/**
	 * A FRAME OF THIS LENGTH OR LONGER IS SLOW. 45ms sits between the two
	 * frame lengths that matter: a steady 30 fps display's 33.3ms (two 60Hz
	 * vsyncs, three at 90Hz, four at 120Hz), which is 11.7ms clear of it, and
	 * a 60Hz machine that cannot hold 30 and drops to three vsyncs, 50ms, 20
	 * fps, which is past it. Every interval a panel delivering 24 fps or
	 * better can produce is under it (41.7ms is the longest, five 120Hz
	 * vsyncs), so the rain is degraded only on a device that cannot hold
	 * the film's own frame rate.
	 */
	slowFrameMs: 45,
	/** How many frames the judge looks back over; slow means MORE THAN HALF
	 *  of them were slow, which is "the median frame is slow". */
	slowWindow: 90,
	/** Nothing is judged for this long after the loop starts or resumes: a
	 *  phone's page load (hydration, fonts, image decode) produces long
	 *  frames that say nothing about whether it can keep up with the rain,
	 *  and a degrade lasts as long as the page. */
	slowGraceMs: 3000,
	/** A gap this long between frames is a hidden tab coming back, not a slow
	 *  device: it is neither judged nor allowed to wipe the field. */
	gapMs: 250,
	/** Paints per second, whatever the panel's refresh rate (see `paintDue`). */
	paintFps: 30,
	/** How early a paint may land, so a 60Hz pair of frames summing to a hair
	 *  under 33.3ms is not pushed to a third frame (half a 120Hz frame). */
	paintSlackMs: 4
};

/** The rain's constants, or any variant of them `rainForWidth` hands out. */
export type RainConfig = Readonly<typeof RAIN_VALUES>;

export const RAIN: RainConfig = Object.freeze(RAIN_VALUES);

/**
 * THE CONSTANTS FOR A CANVAS `width` CSS px WIDE. A canvas no wider than the
 * content band has no margin: every column is under the page's copy, drawn at
 * `contentGain` with no bright head, so it gets the band's slower fade and a
 * longer streak for the one reason the header gives. A wider canvas keeps the
 * film's fade, which its margins are drawn in. Nothing but the fade differs,
 * so every brightness rule -- the gain, the head colour, the worst frame --
 * is the same function of the same numbers at every width.
 */
export function rainForWidth(width: number, r: RainConfig = RAIN): RainConfig {
	return width <= r.contentBandPx ? { ...r, fadePerFrame: r.bandFadePerFrame } : r;
}

export const GLYPHS: readonly string[] = Object.freeze([...'0123456789ABCDEFGHJKLMNPQRSTUVWXYZ+-*/=<>|:;']);
/** Plain glyphs first, the same set mirrored after them. */
export const GLYPH_COUNT = GLYPHS.length * 2;

export function glyphAt(index: number): { char: string; mirrored: boolean } {
	const i = ((index % GLYPH_COUNT) + GLYPH_COUNT) % GLYPH_COUNT;
	return { char: GLYPHS[i % GLYPHS.length], mirrored: i >= GLYPHS.length };
}

export type Column = { head: number; speed: number; acc: number };
export type CellEvent = {
	col: number;
	row: number;
	kind: 'head' | 'trail' | 'mutate';
	glyph: number;
	/** Brightness relative to a freshly drawn glyph, before the band gain. */
	alpha: number;
};

const randSpeed = (rng: Rng, r = RAIN) => r.minSpeed + rng() * (r.maxSpeed - r.minSpeed);
const randGlyph = (rng: Rng) => Math.floor(rng() * GLYPH_COUNT);

/** Frames until a drawn glyph is under 5% alpha, from the per-frame fade. */
export function fadeFrames(r = RAIN): number {
	return Math.ceil(Math.log(0.05) / Math.log(1 - r.fadePerFrame));
}

/** How many rows of visible trail a column at `speed` drags behind its head. */
export function tailRows(speed: number, r = RAIN): number {
	return Math.max(1, Math.ceil(speed * fadeFrames(r)));
}

/** Alpha of a trail cell `rowsBehind` the head of a column moving at `speed`
 *  rows per frame -- the fade curve solved for distance. */
export function trailAlpha(rowsBehind: number, speed: number, r = RAIN): number {
	if (rowsBehind <= 0) return 1;
	const frames = rowsBehind / Math.max(speed, 1e-6);
	return Math.pow(1 - r.fadePerFrame, frames);
}

/** The alpha the painter strips this frame, for a frame of `dtMs`. Clamped so
 *  a tab coming back from the background does not wipe the field. */
export function fadeAlpha(dtMs: number, r = RAIN): number {
	const frames = Math.max(0, Math.min(dtMs, r.gapMs)) / (1000 / 60);
	return Math.min(0.5, 1 - Math.pow(1 - r.fadePerFrame, frames));
}

/**
 * IS A PAINT DUE, once `pendingMs` of frame time has built up since the last
 * one, at degrade `level` (0 full rate, 1 half). Time, not a frame count: a
 * 60Hz desktop paints every other frame exactly as it always did, a 30Hz phone
 * every frame rather than every other, a 120Hz phone every fourth rather than
 * every other. The half rate is half of that, 15 paints a second.
 */
export function paintDue(pendingMs: number, level: number, r = RAIN): boolean {
	const interval = (1000 / r.paintFps) * (level > 0 ? 2 : 1);
	return pendingMs >= interval - r.paintSlackMs;
}

/**
 * THE SLOW-DEVICE JUDGE: the last `slowWindow` frame intervals in a ring, how
 * many of them were slow, and how much of the start-up grace is left.
 * `judgeFrame` is the whole rule; the painter only acts on its answer.
 */
export type SlowJudge = {
	intervals: Float64Array;
	slow: Uint8Array;
	at: number;
	filled: number;
	slowCount: number;
	graceLeftMs: number;
};

export function createSlowJudge(r = RAIN): SlowJudge {
	return {
		intervals: new Float64Array(r.slowWindow),
		slow: new Uint8Array(r.slowWindow),
		at: 0,
		filled: 0,
		slowCount: 0,
		graceLeftMs: r.slowGraceMs
	};
}

/**
 * Record one frame interval and answer TRUE when the device should be
 * degraded one step: the window is full and MORE THAN HALF of it was slow,
 * which is the median frame being `slowFrameMs` or longer. A median rather
 * than "N in a row" because a real display is not metronomic -- one early
 * frame used to reset a slow machine's count, and one late frame on a 30 fps
 * phone was a vote against it -- and the median is the one reading neither
 * kind of outlier moves. A true answer EMPTIES the window, so a second step
 * needs a second full window of evidence taken at the new rate. Frames inside
 * the start-up grace, and a gap of `gapMs` or more (a hidden tab), are not
 * recorded at all.
 */
export function judgeFrame(j: SlowJudge, dtMs: number, r = RAIN): boolean {
	if (!(dtMs > 0) || dtMs >= r.gapMs) return false;
	if (j.graceLeftMs > 0) {
		j.graceLeftMs -= dtMs;
		return false;
	}
	const isSlow = dtMs >= r.slowFrameMs ? 1 : 0;
	if (j.filled === r.slowWindow) j.slowCount -= j.slow[j.at];
	else j.filled += 1;
	j.intervals[j.at] = dtMs;
	j.slow[j.at] = isSlow;
	j.slowCount += isSlow;
	j.at = (j.at + 1) % r.slowWindow;
	if (j.filled === r.slowWindow && j.slowCount * 2 > r.slowWindow) {
		j.at = 0;
		j.filled = 0;
		j.slowCount = 0;
		return true;
	}
	return false;
}

/** The mean of the intervals the judge holds, in ms, or NaN before it holds
 *  any -- the frame length a harness reads off the canvas. */
export function judgeMeanMs(j: SlowJudge): number {
	if (j.filled === 0) return NaN;
	let sum = 0;
	for (let i = 0; i < j.filled; i++) sum += j.intervals[i];
	return sum / j.filled;
}

/** Heads scattered over the whole height and above it, so the first frames
 *  are already a field rather than a row of drops leaving the top together. */
export function createColumns(cols: number, rows: number, rng: Rng, r = RAIN): Column[] {
	const out: Column[] = [];
	for (let i = 0; i < cols; i++) {
		out.push({ head: Math.floor(rng() * rows * 2) - rows, speed: randSpeed(rng, r), acc: rng() });
	}
	return out;
}

/**
 * Advance every column by `dtFrames` (1 = one frame at 60fps) and push the
 * cells to paint into `out`. Mutates the columns; returns `out`.
 */
export function stepColumns(columns: Column[], rows: number, dtFrames: number, rng: Rng, out: CellEvent[], r = RAIN): CellEvent[] {
	for (let i = 0; i < columns.length; i++) {
		const c = columns[i];
		c.acc += c.speed * dtFrames;
		while (c.acc >= 1) {
			c.acc -= 1;
			c.head += 1;
			const tail = tailRows(c.speed, r);
			if (c.head - tail > rows) {
				/* The whole streak is below the bottom edge: restart above the
				   top with a random delay and a new speed, so columns never fall
				   in step and no two share a head row for long. */
				c.head = -1 - Math.floor(rng() * rows * 0.7);
				c.speed = randSpeed(rng, r);
				c.acc = 0;
				break;
			}
			if (c.head >= 0 && c.head < rows) out.push({ col: i, row: c.head, kind: 'head', glyph: randGlyph(rng), alpha: 1 });
			const prev = c.head - 1;
			if (prev >= 0 && prev < rows) out.push({ col: i, row: prev, kind: 'trail', glyph: randGlyph(rng), alpha: 1 });
			for (let k = 0; k < r.mutationsPerStep; k++) {
				const back = 2 + Math.floor(rng() * r.mutationReach);
				const row = c.head - back;
				if (row < 0 || row >= rows || back > tail) continue;
				out.push({ col: i, row, kind: 'mutate', glyph: randGlyph(rng), alpha: trailAlpha(back, c.speed, r) });
			}
		}
	}
	return out;
}

/**
 * The gain for a column whose centre is at CSS x on a canvas `width` wide:
 * 1 outside the centred content band, `contentGain` inside it, and a linear
 * ramp `bandRampPx` wide between them so the edge of the band is not a seam.
 */
export function bandGain(x: number, width: number, r = RAIN): number {
	const half = width / 2;
	const inner = Math.min(r.contentBandPx / 2, half);
	const d = Math.abs(x - half) - inner;
	if (d <= 0) return r.contentGain;
	if (d >= r.bandRampPx) return 1;
	return r.contentGain + (1 - r.contentGain) * (d / r.bandRampPx);
}

/**
 * Which atlas colour a HEAD cell takes for a column at `gain`: the bright
 * leader outside the content band, the trail colour inside it. See the header
 * for the measurement that put this rule here.
 */
export function headColour(gain: number, r = RAIN): string {
	return gain > r.contentGain ? r.head : r.trail;
}

/** A seeded generator, for the still frame and for tests. */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* ---- The contrast arithmetic, kept beside the constants it judges. ------ */

const hexToRgb = (hex: string): [number, number, number] => {
	const s = hex.replace('#', '');
	const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const toHex = (rgb: [number, number, number]) =>
	'#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
	const f = (v: number) => {
		const x = v / 255;
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	const [r, g, b] = hexToRgb(hex);
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` at `alpha` composited over an opaque `bg`, in sRGB as the browser
 *  does it for a canvas over the page. */
export function overSrgb(fg: string, alpha: number, bg: string): string {
	const f = hexToRgb(fg);
	const b = hexToRgb(bg);
	return toHex([0, 1, 2].map((i) => f[i] * alpha + b[i] * (1 - alpha)) as [number, number, number]);
}

/**
 * The contrast a text colour keeps at the worst instant of the rain for a
 * column at `gain`: over its HEAD cell (which inside the band is drawn in the
 * trail colour, see `headColour`) and over a freshly laid TRAIL cell, both
 * composited at `gain` onto `ground`. Everything else in the rain is dimmer
 * than the trail frame.
 */
export function worstFrame(text: string, ground: string, gain: number, r = RAIN): { head: number; trail: number } {
	return {
		head: contrastRatio(text, overSrgb(headColour(gain, r), gain, ground)),
		trail: contrastRatio(text, overSrgb(r.trail, gain, ground))
	};
}
