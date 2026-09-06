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
 */

export type Rng = () => number;

export const RAIN = Object.freeze({
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
	/** A frame slower than this counts as slow; this many in a row degrade. */
	slowFrameMs: 34,
	slowFramesToDegrade: 90
});

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
	const frames = Math.max(0, Math.min(dtMs, 250)) / (1000 / 60);
	return Math.min(0.5, 1 - Math.pow(1 - r.fadePerFrame, frames));
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
