// tests/classroom-projector-clock.test.ts
//
// THE WALL'S CLOCK FACE TELLS THE SCHOOL'S TIME, AND MOVES ONLY WHERE MOTION
// IS ALLOWED (idea 26033e4b).
//
// Two things here fail silently. A dial whose hands are drawn from the
// projector computer's own zone looks perfectly like a clock and is hours
// wrong on a laptop set to UTC, so the angles are asserted at PINNED instants
// where Los Angeles and UTC disagree (CLAUDE.md: a test of that calendar needs
// one), across both 2026 clock changes, with literal expected angles rather
// than ones derived from the code under test. And a motion rule outside its
// `prefers-reduced-motion: no-preference` block moves on a wall thirty
// students face under the setting that asked it not to; the browser pass's
// `motion` row measures the hands, and this file reads the stylesheet for the
// second hand, which that row deliberately does not discover (it has no
// animation of its own, only a `display: none` under `reduce`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clockHandAngles, WALL_CLOCK_FACES, wallClockFace } from '../src/lib/classroom/live-class/wall-clock';
import { clockParts } from '../src/lib/classroom/live-class/timer';
import { schoolClockParts, schoolWallInstant } from '../src/lib/classroom/school-calendar';

const at = (iso: string) => Date.parse(iso);

describe('the hands, in school time', () => {
	it('8:00 PM Pacific, where the UTC hour is 3: the hour hand is at 240, not 90', () => {
		const t = at('2026-08-28T03:00:00Z');
		expect(schoolClockParts(t)).toEqual({ hour: 20, minute: 0, second: 0 });
		expect(clockHandAngles(t)).toEqual({ hour: 240, minute: 0, second: 0 });
		// The instant is one where the two zones disagree: a UTC reading is 90.
		expect(new Date(t).getUTCHours() % 12 * 30).toBe(90);
	});

	it('the morning the clocks go forward: 3:15 AM PDT', () => {
		const t = at('2026-03-08T10:15:00Z');
		expect(clockHandAngles(t)).toEqual({ hour: 97.5, minute: 90, second: 0 });
		// An hour of UTC earlier is 1:15 AM PST, the other side of the change.
		expect(clockHandAngles(at('2026-03-08T09:15:00Z'))).toEqual({ hour: 37.5, minute: 90, second: 0 });
	});

	it('the morning the clocks go back: 1:30:15 AM PST, and the hands step by the minute', () => {
		const t = at('2026-11-01T09:30:15Z');
		// Railway-clock hands: the minute hand sits on the whole minute (180,
		// not 181.5), and only the second hand reads the seconds.
		expect(clockHandAngles(t)).toEqual({ hour: 45, minute: 180, second: 90 });
		// An hour of UTC earlier is ALSO 1:30:15 AM, in PDT: the same reading.
		expect(clockHandAngles(at('2026-11-01T08:30:15Z'))).toEqual({ hour: 45, minute: 180, second: 90 });
	});

	it('within a minute only the second hand moves, and within a second nothing does', () => {
		const start = at('2026-09-15T18:41:00Z');
		const first = clockHandAngles(start);
		for (let s = 0; s < 60; s++) {
			const a = clockHandAngles(start + s * 1000 + 999);
			expect(a.hour, `${s}s`).toBe(first.hour);
			expect(a.minute, `${s}s`).toBe(first.minute);
			expect(a.second, `${s}s`).toBe(s * 6);
		}
		const next = clockHandAngles(start + 60_000);
		expect(next.minute).toBe(first.minute + 6);
		expect(next.hour).toBeCloseTo(first.hour + 0.5, 10);
	});

	it("across a school day the hands agree with the wall's own digits", () => {
		let checked = 0;
		for (let minutes = 7 * 60; minutes <= 16 * 60; minutes += 7) {
			const t = Date.parse(schoolWallInstant('2026-09-15', minutes)!);
			const digits = clockParts(t);
			const [h, m] = digits.time.split(':').map(Number);
			const h12 = h % 12;
			const a = clockHandAngles(t);
			expect(a.minute, digits.time).toBe(m * 6);
			expect(a.hour, digits.time).toBeCloseTo((h12 + m / 60) * 30, 10);
			expect(digits.period, digits.time).toBe(minutes < 12 * 60 ? 'AM' : 'PM');
			checked++;
		}
		// The sweep generated its cases.
		expect(checked).toBe(78);
	});
});

describe('the face is one of two words', () => {
	it('lists the default first and reads anything else as the default', () => {
		expect([...WALL_CLOCK_FACES]).toEqual(['digits', 'dial']);
		expect(wallClockFace('dial')).toBe('dial');
		for (const v of ['digits', 'Dial', 'analog', '', null, undefined, 1, true, {}]) expect(wallClockFace(v)).toBe('digits');
	});
});

/* -------------------------------------------------------------------------
 * THE STYLESHEET: motion only under no-preference, the second hand gone under
 * reduce, and no transition on a hand anywhere.
 * ---------------------------------------------------------------------- */

const component = readFileSync('src/lib/classroom/live-class/WallClock.svelte', 'utf8');
const style = component.slice(component.indexOf('<style>'), component.indexOf('</style>'));

/** Every `@media <query> { ... }` block's body, by brace matching. */
function mediaBlocks(css: string, query: string): string[] {
	const out: string[] = [];
	let from = 0;
	for (;;) {
		const start = css.indexOf(`@media ${query}`, from);
		if (start < 0) return out;
		const open = css.indexOf('{', start);
		let depth = 1;
		let i = open + 1;
		for (; i < css.length && depth > 0; i++) {
			if (css[i] === '{') depth++;
			else if (css[i] === '}') depth--;
		}
		out.push(css.slice(open + 1, i - 1));
		from = i;
	}
}

describe("the clock face's motion", () => {
	const moving = mediaBlocks(style, '(prefers-reduced-motion: no-preference)');
	const reduced = mediaBlocks(style, '(prefers-reduced-motion: reduce)');
	const outside = (() => {
		let rest = style;
		for (const q of ['(prefers-reduced-motion: no-preference)', '(prefers-reduced-motion: reduce)']) {
			for (const b of mediaBlocks(rest, q)) rest = rest.replace(b, '');
		}
		return rest;
	})();

	it('POSITIVE CONTROL: both media blocks exist, and the hands do animate in one', () => {
		expect(moving.length).toBe(1);
		expect(reduced.length).toBe(1);
		expect(moving[0]).toMatch(/\.wc-hour \.wc-arrive \{\s*animation: wc-arrive/);
		expect(moving[0]).toMatch(/\.wc-min \.wc-arrive \{\s*animation: wc-arrive/);
	});

	it('every animation sits inside no-preference, and none is on the second hand', () => {
		expect(outside).not.toMatch(/\banimation(-name)?\s*:/);
		expect(moving[0]).not.toMatch(/\.wc-sec[^{]*\{[^}]*animation/);
		// The arrival is transform only and ends on no transform.
		expect(style).toMatch(/@keyframes wc-arrive \{\s*from \{\s*transform: rotate\(var\(--wc-from\)\);\s*\}\s*to \{\s*transform: none;\s*\}\s*\}/);
	});

	it('under reduce the second hand is not drawn', () => {
		expect(reduced[0]).toMatch(/\.wc-sec \{\s*display: none;\s*\}/);
	});

	it('no hand is ever moved by a transition, and the second hand carries no filter', () => {
		// A transition on a rotation sweeps 354 degrees to 0 the long way round.
		expect(style).not.toMatch(/\btransition\s*:/);
		expect(style).not.toMatch(/\.wc-sec[^{]*\{[^}]*filter/);
		// The hands are placed by an SVG attribute, never a CSS rotate.
		expect(component).toMatch(/class="wc-hand wc-hour" transform="rotate\(\{a\.hour\}\)"/);
		expect(component).toMatch(/class="wc-hand wc-min" transform="rotate\(\{a\.minute\}\)"/);
		expect(component).toMatch(/transform="translate\(100 100\) rotate\(\{a\.second\}\)"/);
	});

	it('has no effect and reads no clock of its own', () => {
		expect(component).not.toMatch(/\$effect/);
		expect(component).not.toMatch(/Date\.now|setInterval|requestAnimationFrame/);
	});
});
