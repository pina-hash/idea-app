import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sweepCases, encode, type SweepCase } from './panzoom-cases';
import {
	FIT_MARGIN,
	fitScale,
	maxScale,
	scaleBounds,
	clampScale,
	clampPan,
	fitView,
	zoomAt,
	panBy,
	resizeView
} from '$lib/panzoom/transform';

/**
 * THE CHARACTERIZATION TEST for the pan/zoom engine extracted out of
 * `src/lib/gauntlet/DrawingViewer.svelte` into `$lib/panzoom/transform.ts`.
 *
 * The golden file was produced BEFORE the extraction, by splicing the literal
 * expression text out of the .svelte source into a runnable module and driving
 * it with the very cases below (see `tests/panzoom-cases.ts` for the full note).
 * So this suite does not ask whether the new module is self-consistent -- it
 * asks whether it reproduces, value for value, what GAUNTLET's viewer did.
 *
 * Every mismatch is reported with the geometry that produced it, because a bare
 * "22815 rows differ" says nothing about WHICH layout regressed.
 */

const golden = JSON.parse(
	readFileSync(fileURLToPath(new URL('./fixtures/panzoom-golden.json', import.meta.url)), 'utf8')
) as { count: number; rows: string[]; source: string };

const stage = (c: SweepCase) => ({ w: c.W, h: c.H });
const content = (c: SweepCase) => ({ w: c.cw, h: c.ch });
const view = (c: SweepCase) => ({ s: c.s, tx: c.tx, ty: c.ty });

function run(c: SweepCase): unknown {
	const st = stage(c);
	const co = content(c);
	switch (c.op) {
		case 'sFit':
			return fitScale(st, co);
		case 'maxS':
			return maxScale(fitScale(st, co));
		case 'clampScale':
			return clampScale(c.a as number, scaleBounds(st, co));
		case 'clampPan':
			return clampPan(view(c), st, co);
		case 'fit':
			return fitView(st, co);
		case 'zoom':
			return zoomAt(view(c), c.a as number, c.b as number, c.c as number, st, co);
		case 'pan':
			return panBy(view(c), c.a as number, c.b as number, st, co);
		case 'resize':
			return resizeView(view(c), st, { w: c.a as number, h: c.b as number }, co);
	}
}

describe('pan/zoom arithmetic reproduces the pre-extraction viewer exactly', () => {
	const cases = sweepCases();

	it('replays the whole recorded sweep with no drift', () => {
		expect(cases.length).toBe(golden.count);
		// A sweep that generated nothing would pass every assertion below it.
		expect(cases.length).toBeGreaterThan(20_000);

		const drift: string[] = [];
		for (let i = 0; i < cases.length; i++) {
			const got = encode(run(cases[i]));
			if (got !== golden.rows[i]) {
				const c = cases[i];
				drift.push(
					`#${i} ${c.op}(a=${c.a} b=${c.b} c=${c.c}) stage ${c.W}x${c.H} content ${c.cw}x${c.ch} ` +
						`view s=${c.s} tx=${c.tx} ty=${c.ty} :: want ${golden.rows[i]} got ${got}`
				);
			}
		}
		expect(drift.slice(0, 12).join('\n')).toBe('');
		expect(drift.length).toBe(0);
	});

	it('exercises every operation, so no branch is silently unvisited', () => {
		const seen = new Map<string, number>();
		for (const c of cases) seen.set(c.op, (seen.get(c.op) ?? 0) + 1);
		for (const op of ['sFit', 'maxS', 'clampScale', 'clampPan', 'fit', 'zoom', 'pan', 'resize']) {
			expect(seen.get(op) ?? 0).toBeGreaterThan(100);
		}
	});

	it('reaches both pan-clamp branches and both scale bounds', () => {
		let centred = 0;
		let edgeLocked = 0;
		let atMin = 0;
		let atMax = 0;
		for (const c of cases) {
			if (c.op !== 'clampPan') continue;
			const st = stage(c);
			const co = content(c);
			const r = clampPan(view(c), st, co);
			if (co.w * c.s <= st.w) centred++;
			else edgeLocked++;
			const b = scaleBounds(st, co);
			if (clampScale(c.s, b) === b.min && c.s <= b.min) atMin++;
			if (clampScale(c.s, b) === b.max && c.s >= b.max) atMax++;
			expect(Number.isFinite(r.tx) || Number.isNaN(r.tx)).toBe(true);
		}
		expect(centred).toBeGreaterThan(50);
		expect(edgeLocked).toBeGreaterThan(50);
		expect(atMin).toBeGreaterThan(50);
		expect(atMax).toBeGreaterThan(50);
	});
});

describe('the properties the sweep is checking for', () => {
	it('fits the whole content inside the stage, with the margin', () => {
		const st = { w: 800, h: 600 };
		const co = { w: 1000, h: 750 };
		const v = fitView(st, co);
		expect(v.s).toBeCloseTo((800 / 1000) * FIT_MARGIN, 12);
		expect(co.w * v.s).toBeLessThanOrEqual(st.w);
		expect(co.h * v.s).toBeLessThanOrEqual(st.h);
		// Centred on both axes.
		expect(v.tx).toBeCloseTo((st.w - co.w * v.s) / 2, 9);
		expect(v.ty).toBeCloseTo((st.h - co.h * v.s) / 2, 9);
	});

	it('holds the world point under the cursor fixed while zooming', () => {
		const st = { w: 800, h: 600 };
		const co = { w: 1000, h: 750 };
		// Start zoomed in, so the pan clamp is not what decides the result.
		const start = clampPan({ s: 2, tx: -300, ty: -200 }, st, co);
		for (const [px, py] of [
			[0, 0],
			[800, 0],
			[0, 600],
			[800, 600],
			[400, 300]
		]) {
			const before = (px - start.tx) / start.s;
			const beforeY = (py - start.ty) / start.s;
			const after = zoomAt(start, 1.4, px, py, st, co);
			// Only an axis that is edge-locked by the clamp may move.
			if (co.w * after.s > st.w && after.tx > st.w - co.w * after.s && after.tx < 0) {
				expect((px - after.tx) / after.s).toBeCloseTo(before, 9);
			}
			if (co.h * after.s > st.h && after.ty > st.h - co.h * after.s && after.ty < 0) {
				expect((py - after.ty) / after.s).toBeCloseTo(beforeY, 9);
			}
		}
	});

	it('refuses to zoom past either bound, and changes nothing when it cannot', () => {
		const st = { w: 800, h: 600 };
		const co = { w: 1000, h: 750 };
		const b = scaleBounds(st, co);
		const fitted = fitView(st, co);
		// Already fitted: zooming out is a no-op, byte for byte.
		const out = zoomAt(fitted, 1 / 1.4, 400, 300, st, co);
		expect(out).toEqual(fitted);
		// Zooming in past the ceiling stops exactly at it.
		const inn = zoomAt({ s: b.max, tx: -100, ty: -100 }, 4, 400, 300, st, co);
		expect(inn.s).toBe(b.max);
	});

	it('never leaves a gap on an overflowing axis, at any pan', () => {
		const st = { w: 375, h: 600 };
		const co = { w: 3000, h: 2000 };
		for (const s of [1, 2, 5]) {
			for (const tx of [-1e6, -500, 0, 500, 1e6]) {
				const r = clampPan({ s, tx, ty: 0 }, st, co);
				expect(r.tx).toBeLessThanOrEqual(0);
				expect(r.tx).toBeGreaterThanOrEqual(st.w - co.w * s);
			}
		}
	});

	/**
	 * MUTATION NOTE, so nobody spends a session on it: flipping clampPan's
	 * `ow <= stage.w` to `ow < stage.w` survives the whole sweep, and it is a
	 * genuinely EQUIVALENT mutant rather than a hole. At exact equality the
	 * centred branch gives `(W - ow) / 2 === 0`, and the edge-lock branch gives
	 * `Math.min(0, Math.max(0, tx))`, which is 0 for every tx. The two agree by
	 * construction. The sweep does reach the boundary -- 312 clampPan cases sit
	 * at a scale that fills one axis exactly -- so this is checked, not missed.
	 */
	it('cannot tell <= from < at an exactly-filled axis, because nothing can', () => {
		const st = { w: 800, h: 600 };
		const co = { w: 1000, h: 750 };
		const s = st.w / co.w; // fills the width exactly
		expect(co.w * s).toBe(st.w);
		for (const tx of [-1e9, -50, -1, 0, 1, 50, 1e9]) {
			expect(clampPan({ s, tx, ty: 0 }, st, co).tx).toBe(0);
		}
	});

	it('centres content that is smaller than the stage, whatever the pan', () => {
		const st = { w: 800, h: 600 };
		const co = { w: 100, h: 100 };
		for (const tx of [-9999, 0, 9999]) {
			const r = clampPan({ s: 1, tx, ty: tx }, st, co);
			expect(r.tx).toBe((800 - 100) / 2);
			expect(r.ty).toBe((600 - 100) / 2);
		}
	});

	it('keeps the stage-centre world point across a resize', () => {
		const st = { w: 800, h: 600 };
		const st2 = { w: 1440, h: 900 };
		const co = { w: 3000, h: 2000 };
		const start = clampPan({ s: 1.5, tx: -900, ty: -400 }, st, co);
		const cx = (st.w / 2 - start.tx) / start.s;
		const after = resizeView(start, st, st2, co);
		expect(after.s).toBe(start.s);
		expect((st2.w / 2 - after.tx) / after.s).toBeCloseTo(cx, 9);
	});
});
