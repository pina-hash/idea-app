import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	DRAG_SLOP_PX,
	NUDGE_EDGE_PX,
	canScrollEnd,
	canScrollStart,
	dragCanStart,
	dragPastSlop,
	dragScrollLeft,
	maxScroll,
	nudgeScrollTarget,
	stripOverflows,
	wheelStripScroll,
	type StripMetrics,
	type TabSpan
} from '../src/lib/classroom/tab-strip';

/**
 * THE REFERENCE DOCUMENT'S SECTION TAB STRIP CAN BE OPERATED.
 *
 * It could not. The strip shipped with its scrollbar hidden (on the grounds
 * that an edge fade had replaced the affordance), no scroll buttons, no wheel
 * handling and no drag -- so the only thing that moved it was clicking a
 * half-visible tab, which also changed the section, and tabs past the last one
 * reachable that way were unreachable. None of that is visible to a type check,
 * and the previous pass measured `scrollWidth` against `clientWidth` and
 * reported success: that proves the strip CAN scroll, which was never the
 * question.
 *
 * So the rules that decide how far each control moves live in
 * $lib/classroom/tab-strip.ts as pure functions, and this file drives them over
 * whole layouts rather than the handful a browser pass can. The strongest test
 * here is the REACHABILITY SWEEP: across 240 generated strips it asserts that
 * every tab can be brought fully into view from every scroll position, by
 * buttons alone, which is the literal bug report. A fixed-step pager -- the
 * first cut of this, and the obvious implementation -- fails it.
 *
 * The rest is source-walking, the tests/classroom-measure.test.ts convention:
 * the scrollbar being present, the two controls being wired, and the retired
 * exception staying retired are all facts about files nobody opens together.
 */

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * The same source with its comments removed. An assertion that a declaration is
 * ABSENT has to read the code alone: this component explains at length WHY it no
 * longer hides its scrollbar and no longer snaps, quoting both declarations, and
 * a plain search finds the explanation and calls it the thing it describes.
 */
function readCode(path: string): string {
	return read(path)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/<!--[\s\S]*?-->/g, '');
}

const DOC = 'src/lib/classroom/ReferenceDoc.svelte';
const SPLIT_CSS = 'src/lib/shell/split.css';

/** A strip of `count` tabs of the given widths, laid out with a 3.2px gap (0.2rem). */
function layout(widths: number[], gap = 3.2): TabSpan[] {
	const spans: TabSpan[] = [];
	let x = 0;
	for (const w of widths) {
		spans.push({ start: x, end: x + w });
		x += w + gap;
	}
	return spans;
}

function strip(tabs: TabSpan[], clientWidth: number, scrollLeft = 0): StripMetrics {
	return { scrollLeft, clientWidth, scrollWidth: tabs[tabs.length - 1].end };
}

function fullyVisible(t: TabSpan, m: StripMetrics): boolean {
	return t.start >= m.scrollLeft - 0.6 && t.end <= m.scrollLeft + m.clientWidth + 0.6;
}

/** Deterministic, so a failure is reproducible and a mutation check is honest. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------------------------------------------------------------------------
// 8. REACHABILITY -- the actual bug report.
// ---------------------------------------------------------------------------
describe('every tab can be brought fully into view, from anywhere, without selecting anything', () => {
	/**
	 * The generated strips deliberately include the shape that broke the fixed
	 * step: tabs wide relative to the strip, so a blind page overshoots one and
	 * lands with it clipped on the other edge.
	 */
	function sweep(seed: number, rounds: number) {
		const rand = rng(seed);
		const failures: string[] = [];
		let cases = 0;
		let worstPresses = 0;
		for (let r = 0; r < rounds; r++) {
			const count = 4 + Math.floor(rand() * 16);
			const widths = Array.from({ length: count }, () => 40 + Math.round(rand() * 170));
			const tabs = layout(widths);
			const clientWidth = 120 + Math.round(rand() * 700);
			const total = tabs[tabs.length - 1].end;
			if (total <= clientWidth + 3) continue; // no overflow: nothing to reach
			const m0 = strip(tabs, clientWidth);
			const top = maxScroll(m0);
			for (const from of [0, top * 0.13, top * 0.37, top * 0.61, top * 0.88, top]) {
				for (let i = 0; i < tabs.length; i++) {
					// A tab wider than the whole strip can never be WHOLE in it; the
					// requirement there is only that pressing still makes progress,
					// which the no-progress break below would catch.
					if (tabs[i].end - tabs[i].start > clientWidth) continue;
					let m: StripMetrics = { ...m0, scrollLeft: Math.round(from) };
					let presses = 0;
					while (!fullyVisible(tabs[i], m) && presses < 60) {
						const dir = tabs[i].start < m.scrollLeft ? -1 : 1;
						const next = nudgeScrollTarget(m, tabs, dir);
						if (next === m.scrollLeft) break; // no progress: unreachable
						m = { ...m, scrollLeft: next };
						presses++;
					}
					cases++;
					worstPresses = Math.max(worstPresses, presses);
					if (!fullyVisible(tabs[i], m)) {
						failures.push(
							`w=${clientWidth} tab#${i}(${widths[i]}px) from=${Math.round(from)} after ${presses}`
						);
					}
				}
			}
		}
		return { cases, failures, worstPresses };
	}

	it('holds across 240 generated strips, by the buttons alone', () => {
		const { cases, failures, worstPresses } = sweep(20260817, 240);
		// Kept honest: a sweep that generated nothing would also report no failures.
		expect(cases).toBeGreaterThan(4000);
		expect(failures.slice(0, 6)).toEqual([]);
		expect(failures).toHaveLength(0);
		// And it converges rather than merely terminating.
		expect(worstPresses).toBeLessThan(30);
	});

	/**
	 * The exact shape that failed in the browser, as a fixed case: a 249px strip
	 * of 14 real tab widths, where a ~193px blind step swapped 'shop-rules'
	 * between the two edges forever.
	 */
	it('reaches the tab a blind one-strip-width step could never land', () => {
		const widths = [70, 77, 70, 90, 83, 83, 64, 90, 77, 103, 96, 70, 77, 77];
		const tabs = layout(widths);
		const clientWidth = 249;
		let m = strip(tabs, clientWidth);
		const target = tabs[7];
		let presses = 0;
		while (!fullyVisible(target, m) && presses < 20) {
			m = { ...m, scrollLeft: nudgeScrollTarget(m, tabs, 1) };
			presses++;
		}
		expect(fullyVisible(target, m)).toBe(true);
		expect(presses).toBeLessThanOrEqual(4);

		// The blind step, for contrast: it oscillates and never lands it.
		const step = clientWidth - 56;
		const seen = new Set<number>();
		let blind = 0;
		let ok = false;
		for (let i = 0; i < 20; i++) {
			const dir = target.start < blind ? -1 : 1;
			blind = Math.max(0, Math.min(maxScroll(m), blind + dir * step));
			if (fullyVisible(target, { ...m, scrollLeft: blind })) {
				ok = true;
				break;
			}
			if (seen.has(blind)) break;
			seen.add(blind);
		}
		expect(ok).toBe(false);
	});

	it('every press makes progress and lands the tab it brought in', () => {
		const tabs = layout([80, 120, 200, 90, 140, 110, 95]);
		const m0 = strip(tabs, 300);
		let m = m0;
		const positions: number[] = [];
		for (let i = 0; i < 8; i++) {
			const next = nudgeScrollTarget(m, tabs, 1);
			if (next === m.scrollLeft) break;
			m = { ...m, scrollLeft: next };
			positions.push(next);
			// Whatever the press was bringing in is now whole (or is the end).
			const anyWhole = tabs.some((t) => fullyVisible(t, m));
			expect(anyWhole).toBe(true);
		}
		expect(positions.length).toBeGreaterThan(1);
		expect(positions[positions.length - 1]).toBe(maxScroll(m0));
		// and back again, symmetric
		while (m.scrollLeft > 0) {
			const next = nudgeScrollTarget(m, tabs, -1);
			expect(next).toBeLessThan(m.scrollLeft);
			m = { ...m, scrollLeft: next };
		}
		expect(m.scrollLeft).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 11. BUTTONS
// ---------------------------------------------------------------------------
describe('prev / next', () => {
	const tabs = layout([90, 120, 110, 130, 100, 140, 95, 105]);
	const m = strip(tabs, 320);

	it('moves roughly one strip-width, and never more', () => {
		const moved = nudgeScrollTarget(m, tabs, 1) - m.scrollLeft;
		expect(moved).toBeGreaterThan(m.clientWidth * 0.5);
		expect(moved).toBeLessThanOrEqual(m.clientWidth);
	});

	it('lands the tab it brought in with breathing room, not flush', () => {
		const next = nudgeScrollTarget(m, tabs, 1);
		const brought = tabs.find((t) => t.end > m.clientWidth + 0.5)!;
		expect(brought.start - next).toBeCloseTo(NUDGE_EDGE_PX, 5);
	});

	it('clamps at both ends rather than running past them', () => {
		const atEnd = { ...m, scrollLeft: maxScroll(m) };
		expect(nudgeScrollTarget(atEnd, tabs, 1)).toBe(maxScroll(m));
		expect(nudgeScrollTarget({ ...m, scrollLeft: 0 }, tabs, -1)).toBe(0);
	});

	it('still moves when a single tab is wider than the whole strip', () => {
		const wide = layout([600, 120, 130]);
		const narrow = strip(wide, 300);
		const next = nudgeScrollTarget(narrow, wide, 1);
		expect(next).toBeGreaterThan(0);
		// and again from there, so it cannot stall halfway across that tab
		expect(nudgeScrollTarget({ ...narrow, scrollLeft: next }, wide, 1)).toBeGreaterThan(next);
	});

	/** What drives `disabled` and the faded-out state on each button. */
	it('is dead at its own end and live everywhere else', () => {
		expect(canScrollStart({ ...m, scrollLeft: 0 })).toBe(false);
		expect(canScrollEnd({ ...m, scrollLeft: 0 })).toBe(true);
		expect(canScrollStart({ ...m, scrollLeft: 40 })).toBe(true);
		expect(canScrollEnd({ ...m, scrollLeft: 40 })).toBe(true);
		expect(canScrollStart({ ...m, scrollLeft: maxScroll(m) })).toBe(true);
		expect(canScrollEnd({ ...m, scrollLeft: maxScroll(m) })).toBe(false);
	});

	it('offers no buttons at all on a strip that does not overflow', () => {
		const fits = { scrollLeft: 0, clientWidth: 800, scrollWidth: 700 };
		expect(stripOverflows(fits)).toBe(false);
		expect(canScrollStart(fits)).toBe(false);
		expect(canScrollEnd(fits)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 9. WHEEL
// ---------------------------------------------------------------------------
describe('wheel over the strip', () => {
	const m = { scrollLeft: 200, clientWidth: 400, scrollWidth: 1200 };

	it('translates a vertical wheel into horizontal scroll, both ways', () => {
		expect(wheelStripScroll(m, 0, 120)).toEqual({ consume: true, scrollLeft: 320 });
		expect(wheelStripScroll(m, 0, -120)).toEqual({ consume: true, scrollLeft: 80 });
	});

	it('uses a trackpad gesture on whichever axis is larger', () => {
		expect(wheelStripScroll(m, 90, 10).scrollLeft).toBe(290);
		expect(wheelStripScroll(m, 10, 90).scrollLeft).toBe(290);
		// A diagonal gesture must not be applied twice.
		expect(wheelStripScroll(m, -60, 30).scrollLeft).toBe(140);
	});

	/**
	 * THE PAGE MUST KEEP SCROLLING. `consume: false` is what leaves the event's
	 * default action alone, and the default action is the page scroll.
	 */
	it('passes through to the page at the end in the wheel direction', () => {
		const atStart = { ...m, scrollLeft: 0 };
		expect(wheelStripScroll(atStart, 0, -120).consume).toBe(false);
		expect(wheelStripScroll(atStart, 0, 120).consume).toBe(true);
		const atEnd = { ...m, scrollLeft: maxScroll(m) };
		expect(wheelStripScroll(atEnd, 0, 120).consume).toBe(false);
		expect(wheelStripScroll(atEnd, 0, -120).consume).toBe(true);
	});

	/**
	 * TWO GUARDS COVER THIS ONE INPUT, and a mutation check is how that was
	 * established: on a strip that does not overflow `maxScroll` is 0, so the
	 * edge test above refuses the wheel whichever way it goes and removing the
	 * overflow guard alone leaves this green. Removing BOTH reddens it. The
	 * overflow guard is therefore belt-and-braces here rather than the thing this
	 * assertion proves -- worth knowing before "simplifying" either one away.
	 */
	it('never takes the wheel on a strip that does not overflow', () => {
		expect(wheelStripScroll({ scrollLeft: 0, clientWidth: 800, scrollWidth: 700 }, 0, 120)).toEqual({
			consume: false,
			scrollLeft: 0
		});
	});

	it('moves by exactly the delta, so a small wheel is not swallowed', () => {
		// The scroll-snap that used to be on the strip snapped any move shorter
		// than the gap to the next tab back to where it started, which read as the
		// wheel doing nothing.
		expect(wheelStripScroll(m, 0, 12).scrollLeft).toBe(212);
		expect(wheelStripScroll(m, 0, 3).scrollLeft).toBe(203);
	});

	it('clamps rather than overshooting the ends', () => {
		expect(wheelStripScroll({ ...m, scrollLeft: 780 }, 0, 400).scrollLeft).toBe(maxScroll(m));
		expect(wheelStripScroll({ ...m, scrollLeft: 20 }, 0, -400).scrollLeft).toBe(0);
	});

	it('ignores a wheel with no delta', () => {
		expect(wheelStripScroll(m, 0, 0).consume).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 10. DRAG
// ---------------------------------------------------------------------------
describe('pointer drag', () => {
	const m = { scrollLeft: 300, clientWidth: 400, scrollWidth: 1200 };

	it('leaves touch to the browser, so its momentum survives', () => {
		expect(dragCanStart('touch', 0, true)).toBe(false);
		expect(dragCanStart('mouse', 0, true)).toBe(true);
		expect(dragCanStart('pen', 0, true)).toBe(true);
	});

	it('starts on the primary button only, and only when there is scroll to give', () => {
		expect(dragCanStart('mouse', 1, true)).toBe(false);
		expect(dragCanStart('mouse', 2, true)).toBe(false);
		expect(dragCanStart('mouse', 0, false)).toBe(false);
	});

	/** The threshold is what keeps a tap a tap: under it the tab's click runs. */
	it('becomes a drag only past the slop threshold', () => {
		expect(dragPastSlop(0)).toBe(false);
		expect(dragPastSlop(DRAG_SLOP_PX - 1)).toBe(false);
		expect(dragPastSlop(-(DRAG_SLOP_PX - 1))).toBe(false);
		expect(dragPastSlop(DRAG_SLOP_PX)).toBe(true);
		expect(dragPastSlop(-DRAG_SLOP_PX)).toBe(true);
		expect(dragPastSlop(80)).toBe(true);
	});

	it('follows the pointer 1:1 and clamps at the ends', () => {
		expect(dragScrollLeft(m, 300, -120)).toBe(420);
		expect(dragScrollLeft(m, 300, 120)).toBe(180);
		expect(dragScrollLeft(m, 300, 4000)).toBe(0);
		expect(dragScrollLeft(m, 300, -4000)).toBe(maxScroll(m));
	});
});

// ---------------------------------------------------------------------------
// 1, 2, 3, 4, 5, 7. THE WIRING -- facts about files nobody opens together.
// ---------------------------------------------------------------------------
describe('the strip is wired to those rules, and the scrollbar is back', () => {
	it('hides no scrollbar anywhere in the reference document', () => {
		const code = readCode(DOC);
		expect(code).not.toMatch(/scrollbar-width:\s*none/);
		expect(code).not.toMatch(/-ms-overflow-style:\s*none/);
		expect(code).not.toMatch(/::-webkit-scrollbar/);
		// It takes the module's treatment rather than restyling one of its own.
		expect(code).not.toMatch(/scrollbar-color/);
		expect(code).not.toMatch(/scrollbar-width/);
	});

	/**
	 * The shared rule carried an "unless it has replaced the affordance"
	 * exception, and the strip was its only claimant. Replacing an affordance
	 * means providing a control, not a hint. The doctrine lives in that file's
	 * comments, so this one reads the prose as well as the code.
	 */
	it('leaves no scrollbar exception in the shared stylesheet', () => {
		const css = read(SPLIT_CSS);
		expect(css).toMatch(/scrollbar-width:\s*thin/);
		expect(readCode(SPLIT_CSS)).not.toMatch(/scrollbar-width:\s*none/);
		expect(css).not.toMatch(/ONE DELIBERATE EXCEPTION/);
		expect(css).not.toMatch(/tab rail hides its scrollbar/);
		expect(css).toMatch(/NO EXCEPTIONS/);
	});

	it('has no edge fades left standing in place of a control', () => {
		const code = readCode(DOC);
		expect(code).not.toMatch(/fade-start/);
		expect(code).not.toMatch(/fade-end/);
	});

	it('attaches wheel non-passively and the click cancel in the capture phase', () => {
		const doc = read(DOC);
		// A passive wheel listener cannot preventDefault, so the page would scroll
		// too; a bubble-phase click listener runs after the tab's own onclick.
		expect(doc).toMatch(/addEventListener\('wheel', onRailWheel, \{ passive: false \}\)/);
		expect(doc).toMatch(/addEventListener\('click', onRailClickCapture, \{ capture: true \}\)/);
		expect(doc).toMatch(/removeEventListener\('wheel', onRailWheel\)/);
		expect(doc).toMatch(/removeEventListener\('click', onRailClickCapture, \{ capture: true \}\)/);
		for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
			expect(doc).toContain(`addEventListener('${ev}'`);
			expect(doc).toContain(`removeEventListener('${ev}'`);
		}
	});

	it('renders both buttons while the strip overflows, disabled at their own end', () => {
		const doc = read(DOC);
		expect(doc).toMatch(/data-nudge="prev"/);
		expect(doc).toMatch(/data-nudge="next"/);
		expect(doc).toMatch(/disabled=\{!canStart\}/);
		expect(doc).toMatch(/disabled=\{!canEnd\}/);
		expect(doc).toMatch(/aria-label="Scroll sections left"/);
		expect(doc).toMatch(/aria-label="Scroll sections right"/);
		// Faded out rather than removed, so the strip does not resize mid-scroll.
		expect(doc).toMatch(/\.rail-nudge\.spent \{\s*opacity: 0;/);
	});

	it('keeps scroll-into-view on selection, and it is no longer the only mover', () => {
		const doc = read(DOC);
		expect(doc).toMatch(/keepActiveVisible\(\)/);
		expect(doc).toMatch(/function nudge\(/);
		expect(doc).toMatch(/function onRailWheel\(/);
		expect(doc).toMatch(/function onRailPointerMove\(/);
	});

	it('leaves touch scrolling to the platform', () => {
		expect(read(DOC)).toMatch(/-webkit-overflow-scrolling: touch/);
		// Scroll snap is gone: it snapped short moves back to where they started.
		const code = readCode(DOC);
		expect(code).not.toMatch(/scroll-snap-type/);
		expect(code).not.toMatch(/scroll-snap-align/);
	});

	/**
	 * 7. THE PHONE GETS A LABELLED SELECT. Measured at a 375px viewport: the
	 * buttons cost 88px, which takes the classroom item page's strip from 3 whole
	 * tabs to 2 -- a peephole rather than a strip. Both controls are always in
	 * the DOM and a media query picks one, so nothing measures a viewport in JS
	 * and the server and the client cannot disagree about which exists.
	 */
	it('swaps the strip for a labelled select below 40rem', () => {
		const doc = read(DOC);
		expect(doc).toMatch(/class="tab-picker"/);
		expect(doc).toMatch(/<span class="picker-label">Section<\/span>/);
		expect(doc).toMatch(/@media \(max-width: 40rem\) \{[\s\S]*?\.tab-rail \{\s*display: none;/);
		expect(doc).toMatch(/\.tab-picker \{\s*display: none;\s*\}/);
		// A label wrapping the select needs no id to associate them.
		expect(doc).toMatch(/<label class="tab-picker">/);
		// Selecting through it goes through the same path a tab click does, so the
		// deep link and the history entry come with it.
		expect(doc).toMatch(/onchange=\{\(e\) => selectTab\(/);
	});

	it('hides both controls in print, where every section is expanded', () => {
		const doc = read(DOC);
		expect(doc).toMatch(
			/@media print \{\s*\.tab-rail,\s*\.tab-picker,\s*\.rail-anchor \{\s*display: none;/
		);
	});
});
