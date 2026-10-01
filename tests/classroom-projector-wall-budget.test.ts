// tests/classroom-projector-wall-budget.test.ts
//
// THE WALL'S SIDE COLUMN IS FITTED, NEVER CLIPPED (reports R12, R13).
//
// `wallFit` in live-class/wall-layout.ts picks the largest type the side's
// measured box holds, never below the 8H floor, and cuts only at the floor, in
// a fixed order, saying every cut on the wall. A wrong plan is invisible until
// a real projector shows a card hanging off the bottom of the screen, or a
// name list cut with nothing saying so, so the plan is held here over a
// generated sweep of frames in the side boxes the browser measured:
//
//   1280x800   574x633   (the harness's strip on, measured)
//   1440x900   638x720   (measured)
//   1920x1080  926x877   (measured)
//   1920x1080  926x937   (full screen: no strip)
//   1024x768   385x603   (a 4:3 projector, from the same layout arithmetic)
//
// The estimate the plan rests on is held to the browser separately: the
// `classroom-projector-demo-full*` specs read every real card's own content
// height (`WALL_CARDS_FIT`), and at 1280x800 and 1920x1080 the estimate came
// within 5px of every card (measured with the harness's own dump).

import { describe, expect, it } from 'vitest';
import {
	wallActivityLive,
	wallFit,
	wallSideHeight,
	WALL_AGENDA_KEEP,
	WALL_FLOOR_VH,
	WALL_NAMES_KEEP,
	WALL_NEXT_KEEP,
	WALL_SIDE_MAX_VH,
	type WallBox
} from '$lib/classroom/live-class/wall-layout';
import {
	buildProjectorFrame,
	WALL_ACTIVITY_GROUPS,
	WALL_ACTIVITY_STALE_MS,
	type ProjectorFrame,
	type WallActivityKey
} from '$lib/classroom/live-class/projector';
import { countdown } from '$lib/classroom/live-class/timer';
import type { LiveCellState } from '$lib/classroom/live-class/grid';
import type { HallPassManagerState } from '$lib/classroom/hall-pass';

const DAY = '2026-09-23';
const AT = Date.parse('2026-09-23T17:30:00Z');

const BOXES: { name: string; box: WallBox }[] = [
	{ name: '1280x800', box: { width: 574, height: 633, viewHeight: 800 } },
	{ name: '1440x900', box: { width: 638, height: 720, viewHeight: 900 } },
	{ name: '1920x1080', box: { width: 926, height: 877, viewHeight: 1080 } },
	{ name: '1920x1080 full screen', box: { width: 926, height: 937, viewHeight: 1080 } },
	{ name: '1024x768', box: { width: 385, height: 603, viewHeight: 768 } }
];

const HALL: HallPassManagerState = {
	scope: 'manager',
	section_id: 's-1',
	taken: true,
	mine: false,
	open: { pass_id: 'p', student_email: 'a@x', student_name: 'Out', opened_at: '2026-09-23T17:20:00Z' },
	history: []
};

const line = (i: number, len: number) => `Line ${i + 1} ${'abcdefghij klmnopq rstuvwxyz '.repeat(10)}`.slice(0, len);

/** A class with `per` names in each named group, plus some working. */
function cells(per: number): { state: LiveCellState; name: string }[] {
	const out: { state: LiveCellState; name: string }[] = [];
	const states: LiveCellState[] = ['idle', 'away', 'not-opened', 'submitted'];
	for (const state of states) for (let i = 0; i < per; i++) out.push({ state, name: `Stu${state.slice(0, 2)}${i} Last${i}` });
	for (let i = 0; i < 8; i++) out.push({ state: 'working', name: `Work${i} Er` });
	return out;
}

type Activity = 'off' | 'counts' | 'names';
interface Case {
	box: (typeof BOXES)[number];
	frame: ProjectorFrame;
	label: string;
}

function* sweep(): Generator<Case> {
	for (const box of BOXES)
		for (const agendaN of [0, 1, 4, 8, 12])
			for (const len of [24, 140])
				for (const nextN of [0, 1, 3])
					for (const pick of [false, true])
						for (const hall of [false, true])
							for (const activity of ['off', 'counts', 'names'] as Activity[])
								for (const per of activity === 'names' ? [3, 12, 40] : [12]) {
									const frame = buildProjectorFrame({
										day: DAY,
										at: AT,
										agenda: Array.from({ length: agendaN }, (_, i) => line(i, len)),
										timer: countdown(10, AT),
										hallPass: hall ? HALL : null,
										pick: pick ? { name: 'Cruz Delgado', seed: 'K7Q2' } : null,
										next: Array.from({ length: nextN }, (_, i) => line(i, Math.min(len, 60))),
										activity:
											activity === 'off'
												? null
												: { item: 'Truss sketch', at: AT - 5000, cells: cells(per), names: activity === 'names' }
									});
									yield {
										box,
										frame,
										label: `${box.name} agenda ${agendaN}x${len} next ${nextN} pick ${pick} hall ${hall} ${activity}${activity === 'names' ? ' ' + per : ''}`
									};
								}
}

const CASES = [...sweep()];
const room = (b: WallBox) => b.height - Math.max(8, b.height * 0.012);

describe('the wall fits its side column, by the plan', () => {
	it('the sweep is the size it says (an empty sweep cannot pass)', () => {
		// 5 boxes x 5 agenda counts x 2 lengths x 3 Coming up x 2 x 2 x (off + counts + 3 name sizes)
		expect(CASES).toHaveLength(5 * 5 * 2 * 3 * 2 * 2 * 5);
	});

	it('never sets type below the 8H floor, and never above its ceiling', () => {
		for (const c of CASES) {
			const p = wallFit(c.frame, AT, c.box.box);
			expect(p.floorPx, c.label).toBeGreaterThanOrEqual(c.box.box.viewHeight / 50);
			expect(p.fontPx, c.label).toBeGreaterThanOrEqual(p.floorPx - 0.05);
			expect(p.fontPx, c.label).toBeLessThanOrEqual(c.box.box.viewHeight * WALL_SIDE_MAX_VH + 0.05);
		}
		expect(WALL_FLOOR_VH).toBeGreaterThanOrEqual(1 / 50);
	});

	it('fits every frame in every measured box, and the estimate holds it to the box', () => {
		let cut = 0;
		for (const c of CASES) {
			const p = wallFit(c.frame, AT, c.box.box);
			expect(p.fits, c.label).toBe(true);
			expect(wallSideHeight(c.frame, c.box.box, p), c.label).toBeLessThanOrEqual(room(c.box.box));
			if (p.agendaMore || p.nextMore || p.namesDroppedCount || Object.keys(p.namesMore).length) cut++;
		}
		// The sweep really does reach the floor: a stress that never cut would prove nothing about the cuts.
		expect(cut).toBeGreaterThan(100);
	});

	it('takes the largest size that fits: one step bigger would not', () => {
		let checked = 0;
		for (const c of CASES) {
			const p = wallFit(c.frame, AT, c.box.box);
			const uncut = !p.agendaMore && !p.nextMore && !p.namesDroppedCount && !Object.keys(p.namesMore).length;
			if (!uncut || p.fontPx >= c.box.box.viewHeight * WALL_SIDE_MAX_VH - 0.2) continue;
			checked++;
			expect(wallSideHeight(c.frame, c.box.box, { ...p, fontPx: p.fontPx / 0.95 }), c.label).toBeGreaterThan(room(c.box.box));
		}
		expect(checked).toBeGreaterThan(100);
	});

	it('says every cut: shown plus "+N more" is the whole, for every list and every name group', () => {
		for (const c of CASES) {
			const p = wallFit(c.frame, AT, c.box.box);
			expect(p.agendaShown + p.agendaMore, c.label).toBe(c.frame.agenda.length);
			expect(p.nextShown + p.nextMore, c.label).toBe(c.frame.next.length);
			let dropped = 0;
			for (const g of WALL_ACTIVITY_GROUPS) {
				const list = c.frame.activity?.names?.[g.key] ?? [];
				if (list.length === 0) {
					expect(p.namesShown[g.key], c.label).toBeUndefined();
					continue;
				}
				if (p.namesDropped.includes(g.key)) {
					dropped += list.length;
					expect(p.namesShown[g.key], c.label).toBeUndefined();
				} else {
					expect((p.namesShown[g.key] ?? 0) + (p.namesMore[g.key] ?? 0), c.label).toBe(list.length);
				}
			}
			expect(p.namesDroppedCount, c.label).toBe(dropped);
			expect(p.namesShown.working, c.label).toBeUndefined();
		}
	});

	it('cuts in its fixed order: names to three, the agenda to four, Coming up to one, then names again', () => {
		const order = { namesToKeep: 0, agendaToKeep: 0, nextToKeep: 0, namesFolded: 0, lastResort: 0 };
		for (const c of CASES) {
			const p = wallFit(c.frame, AT, c.box.box);
			const named = WALL_ACTIVITY_GROUPS.filter((g) => (c.frame.activity?.names?.[g.key]?.length ?? 0) > 0).map((g) => g.key);
			const shownCap = (k: WallActivityKey) => p.namesShown[k] ?? 0;
			const lens = (k: WallActivityKey) => c.frame.activity?.names?.[k]?.length ?? 0;
			if (p.agendaMore > 0) {
				order.agendaToKeep++;
				// The agenda was cut only after every name group was down to three.
				for (const k of named) if (!p.namesDropped.includes(k)) expect(shownCap(k), c.label).toBeLessThanOrEqual(Math.min(WALL_NAMES_KEEP, lens(k)));
			}
			if (p.nextMore > 0) {
				order.nextToKeep++;
				expect(p.agendaShown, c.label).toBeLessThanOrEqual(Math.min(WALL_AGENDA_KEEP, c.frame.agenda.length));
			}
			const namesBelowKeep = named.some((k) => p.namesDropped.includes(k) || shownCap(k) < Math.min(WALL_NAMES_KEEP, lens(k)));
			if (namesBelowKeep) {
				order.namesFolded++;
				expect(p.agendaShown, c.label).toBeLessThanOrEqual(Math.min(WALL_AGENDA_KEEP, c.frame.agenda.length));
				expect(p.nextShown, c.label).toBeLessThanOrEqual(Math.min(WALL_NEXT_KEEP, c.frame.next.length));
			}
			if (p.agendaShown < Math.min(WALL_AGENDA_KEEP, c.frame.agenda.length)) {
				order.lastResort++;
				for (const k of named) expect(p.namesDropped, c.label).toContain(k);
			}
			if (Object.keys(p.namesMore).length && !p.agendaMore) order.namesToKeep++;
		}
		// Each step of the order was actually reached by some frame.
		for (const [step, n] of Object.entries(order)) expect(n, step).toBeGreaterThan(0);
	});

	it('a portrait window is not a wall: nothing is cut there', () => {
		const portrait = { width: 343, height: 400, viewHeight: 812, portrait: true };
		for (const c of CASES.filter((x) => x.box.name === '1440x900')) {
			const p = wallFit(c.frame, AT, portrait);
			expect(p.agendaShown, c.label).toBe(c.frame.agenda.length);
			expect(p.nextShown, c.label).toBe(c.frame.next.length);
			expect(p.namesDroppedCount, c.label).toBe(0);
		}
	});

	it('activity older than the stale window is not on the wall, and its names go with it', () => {
		const fresh = CASES.find((c) => c.frame.activity?.names && c.box.name === '1440x900')!.frame;
		const stale: ProjectorFrame = { ...fresh, activity: { ...fresh.activity!, at: AT - WALL_ACTIVITY_STALE_MS - 1000 } };
		expect(wallActivityLive(fresh, AT)).toBe(true);
		expect(wallActivityLive(stale, AT)).toBe(false);
		const p = wallFit(stale, AT, BOXES[1].box);
		expect(p.activityLive).toBe(false);
		expect(p.namesShown).toEqual({});
		// Positive control: the fresh frame does draw names.
		expect(Object.keys(wallFit(fresh, AT, BOXES[1].box).namesShown).length).toBeGreaterThan(0);
	});

	it('the hero is the timer when there is one, and the clock fills the side when it is alone', () => {
		const timerOnly = buildProjectorFrame({ day: DAY, at: AT, agenda: [], timer: countdown(10, AT), hallPass: null, pick: null });
		const p = wallFit(timerOnly, AT, BOXES[1].box);
		expect(p.hero).toBe('timer');
		expect(p.sideEmpty).toBe(false);
		expect(p.clock).toBe(true);
		expect(p.clockPx).toBeGreaterThan(2 * p.fontPx);
		const nothing = buildProjectorFrame({ day: DAY, at: AT, agenda: [], timer: null, hallPass: null, pick: null });
		const q = wallFit(nothing, AT, BOXES[1].box);
		expect(q.hero).toBe('clock');
		expect(q.sideEmpty).toBe(true);
	});
});
