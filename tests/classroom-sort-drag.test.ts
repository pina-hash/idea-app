// tests/classroom-sort-drag.test.ts
//
// The pointer-sort arithmetic behind the class list's drag-to-reorder
// (prompt 0118, item TWELVE). Pure functions over rects and indices, no DOM:
// a wrong drop index reads as a row that "landed one off", which nobody
// reports as a bug and everybody works around, so it is pinned here.

import { describe, expect, it } from 'vitest';
import { movedList, sortDropIndex, sortShifts, type SortRect } from '../src/lib/classroom/sort-drag';

/** Five 40px rows with an 8px gap, starting at y=100. */
function rows(n = 5, height = 40, gap = 8, top = 100): SortRect[] {
	return Array.from({ length: n }, (_, i) => ({ top: top + i * (height + gap), height }));
}

describe('sortDropIndex: the new index is how many OTHER centres sit above the dragged centre', () => {
	it('an item that has not moved keeps its index', () => {
		const r = rows();
		for (let i = 0; i < r.length; i++) {
			expect(sortDropIndex(r, i, r[i].top + r[i].height / 2)).toBe(i);
		}
	});

	it('crossing the next row’s centre moves one down, and only then', () => {
		const r = rows();
		const centre1 = r[1].top + r[1].height / 2;
		expect(sortDropIndex(r, 0, centre1 - 1)).toBe(0);
		expect(sortDropIndex(r, 0, centre1 + 1)).toBe(1);
	});

	it('crossing the previous row’s centre moves one up', () => {
		const r = rows();
		const centre2 = r[2].top + r[2].height / 2;
		expect(sortDropIndex(r, 3, centre2 + 1)).toBe(3);
		expect(sortDropIndex(r, 3, centre2 - 1)).toBe(2);
	});

	it('is clamped to the list at both ends', () => {
		const r = rows();
		expect(sortDropIndex(r, 2, -10_000)).toBe(0);
		expect(sortDropIndex(r, 2, 10_000)).toBe(r.length - 1);
		expect(sortDropIndex([], 0, 50)).toBe(0);
	});

	it('skips over several rows in one move', () => {
		const r = rows();
		const centre3 = r[3].top + r[3].height / 2;
		expect(sortDropIndex(r, 0, centre3 + 1)).toBe(3);
		expect(sortDropIndex(r, 4, r[0].top)).toBe(0);
	});
});

describe('sortShifts: the rows between from and to shift by the dragged slot', () => {
	it('dragging down shifts the passed rows UP by one slot and nothing else', () => {
		const r = rows();
		const s = sortShifts(r, 0, 2);
		expect(s).toEqual([0, -48, -48, 0, 0]);
	});

	it('dragging up shifts the passed rows DOWN by one slot', () => {
		const r = rows();
		const s = sortShifts(r, 4, 2);
		expect(s).toEqual([0, 0, 48, 48, 0]);
	});

	it('no move, no shift', () => {
		const r = rows();
		expect(sortShifts(r, 2, 2)).toEqual([0, 0, 0, 0, 0]);
		expect(sortShifts([r[0]], 0, 0)).toEqual([0]);
	});

	it('the slot uses the gap on the side the row has one', () => {
		// The last row has no row after it, so its slot is its height plus the
		// gap BEFORE it -- the distance the row above must travel to take its
		// place.
		const r = rows(3, 30, 10);
		expect(sortShifts(r, 2, 0)).toEqual([40, 40, 0]);
	});
});

describe('movedList', () => {
	it('moves one element and leaves the rest in order', () => {
		expect(movedList(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
		expect(movedList(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
	});
	it('a bad index is a no-op copy, never a throw', () => {
		const list = ['a', 'b'];
		expect(movedList(list, 0, 5)).toEqual(list);
		expect(movedList(list, -1, 0)).toEqual(list);
		expect(movedList(list, 1, 1)).not.toBe(list);
	});
});

describe('the two halves agree: a drop index computed from a shifted centre lands where the shifts opened a hole', () => {
	it('for every (from, to) pair on a five-row list', () => {
		const r = rows();
		for (let from = 0; from < r.length; from++) {
			for (let to = 0; to < r.length; to++) {
				// Put the dragged row's centre exactly on the target slot's centre.
				const target = r[to].top + r[to].height / 2 + (to > from ? 1 : to < from ? -1 : 0);
				expect(sortDropIndex(r, from, target), `from ${from} to ${to}`).toBe(to);
			}
		}
	});
});
