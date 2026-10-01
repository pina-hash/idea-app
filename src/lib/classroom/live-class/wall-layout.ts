/**
 * HOW THE WALL FITS ITS SCREEN (reports R12, R13): the pure half of the
 * projector's layout.
 *
 * WHY THE OLD WALL FILLED NOTHING. With no agenda lines the time column was a
 * shrink-to-fit grid item that was also an inline-size container, so it
 * collapsed to zero width and every size measured against it fell to its clamp
 * floor: a 32px clock and 48px timer digits pinned to the top of a 1440x982
 * window, which is the screenshot Mr. Pina filed. No spec caught it because
 * every harness demo seeded four agenda lines.
 *
 * THE WALL IS TWO REGIONS NOW. The HERO is the timer, drawn as the Plate's
 * progress ring with the digits in its middle, or the clock when no timer is
 * set; it is sized by CSS against a container whose size is set by the window
 * and never by its contents. The SIDE is a column of cards (the clock and the
 * hall pass, a shown pick, today's agenda, Coming up, and student activity
 * when the teacher turns it on), and this module decides how large the side's
 * type can be and, at the floor, what is cut.
 *
 * THE SIDE IS FITTED, NEVER CLIPPED. A pane that hides its overflow satisfies
 * a "does it fit" measurement by hiding the content (CLAUDE.md), so nothing
 * here relies on `overflow: hidden`. Instead the view measures the side
 * column's box and hands it in; `wallFit` estimates each card's height at a
 * candidate size (wrapping every line at a measured average character width
 * with a margin) and picks the LARGEST size that fits, never below the 8H
 * floor (1/50 of the window's height). Only when even the floor does not fit
 * does it cut, in a fixed order, and every cut is said on the wall as "+N
 * more": names first (the room needs the counts more than the list), but
 * only down to three a group, because the teacher asked for them; then the
 * agenda's tail (four lines kept); then Coming up (one kept); then names
 * again, down to one a group and then whole groups folded into one "+N more
 * names" line, Done first and Not typing last; and as a last resort, for a
 * small screen holding long lines, the agenda down to one line and Coming up
 * to none.
 *
 * The estimate is calibrated against the browser, not argued: the character
 * widths below were measured in the harness Chromium on the wall's own faces
 * (Rajdhani 0.418em average, Share Tech Mono 0.54em) and carry a margin, and
 * the `classroom-projector-demo-*` specs measure the real wall for overflow
 * card by card.
 *
 * No Svelte, no DOM and no clock: `now` is handed in, like every other module
 * in this folder.
 */

import { WALL_ACTIVITY_GROUPS, WALL_ACTIVITY_STALE_MS, type ProjectorFrame, type WallActivityKey } from './projector';

/** Average advance of the wall's faces, in em, with a margin over what was measured. */
export const WALL_CHAR_EM = { display: 0.47, bold: 0.56, mono: 0.62 } as const;

/** Line heights the stylesheet draws, so the estimate and the paint agree. */
const LH = { body: 1.25, label: 1.2, name: 1.25, big: 1.1 } as const;

/** The type sizes relative to the side's body size `f`. The stylesheet reads the same numbers. */
export const WALL_SCALE = {
	/** A card's label, never below the floor. */
	label: 0.72,
	/** The clock card beside a timer. */
	clock: 2,
	/** A picked name. */
	pick: 1.8,
	/** The numeral in an activity count. */
	count: 1.3,
	/** A name under an activity group. */
	name: 0.9,
	/** "+N more". */
	more: 0.8
} as const;

/** Card chrome, in units of `f`: padding top plus bottom, side to side, the gap between cards, the label's foot. */
const CARD = { padY: 0.9, padX: 1.6, gap: 0.5, labelFoot: 0.25, lineGap: 0.25, border: 4 } as const;

/** Fewest agenda lines, Coming up lines and names a group the ordinary cuts leave. */
export const WALL_AGENDA_KEEP = 4;
export const WALL_NEXT_KEEP = 1;
export const WALL_NAMES_KEEP = 3;

/** The order whole name groups are folded away in when capping is not enough: the least actionable first. */
export const WALL_NAME_DROP_ORDER: readonly WallActivityKey[] = ['done', 'away', 'not-opened', 'idle'];

/** The largest side size, as a fraction of the window height: big enough to read, small enough to leave room. */
export const WALL_SIDE_MAX_VH = 0.05;
/** The 8H floor with a hair of margin: text a class reads from the back of a room is at least 1/50 of the height. */
export const WALL_FLOOR_VH = 0.0205;

export interface WallBox {
	/** The side column's measured box, in CSS px. */
	width: number;
	height: number;
	/** The window's height, which the floor and the ceiling are fractions of. */
	viewHeight: number;
	/** A portrait window is not a wall: it stacks and scrolls, and nothing is cut. */
	portrait?: boolean;
}

export interface WallPlan {
	hero: 'timer' | 'clock';
	/** The side column has nothing to show; the hero takes the whole width. */
	sideEmpty: boolean;
	/** The side's body type size, px. */
	fontPx: number;
	/**
	 * The clock card's type size, px: twice the body size, or, when the clock
	 * is the side's ONLY card (a timer and nothing else on the wall), as large
	 * as the side allows, so the wall is not a ring beside an empty column.
	 */
	clockPx: number;
	/** The floor every text on the side respects, px. */
	floorPx: number;
	clock: boolean;
	hall: boolean;
	pick: boolean;
	agendaShown: number;
	agendaMore: number;
	nextShown: number;
	nextMore: number;
	/** Activity is on the frame and fresh enough to show. */
	activityLive: boolean;
	/** Names drawn per group; a group folded away is absent. */
	namesShown: Partial<Record<WallActivityKey, number>>;
	/** "+N more" after a capped group's names. */
	namesMore: Partial<Record<WallActivityKey, number>>;
	/** Groups whose names were folded into one "+N more names" line. */
	namesDropped: WallActivityKey[];
	/** How many names that line stands for. */
	namesDroppedCount: number;
	/** Whether the plan fits the box at `fontPx` by the estimate. False only when even every cut does not fit. */
	fits: boolean;
}

/** Is the frame's activity fresh enough to be on the wall at `now`? */
export function wallActivityLive(frame: Pick<ProjectorFrame, 'activity'> | null, now: number): boolean {
	const a = frame?.activity;
	return !!a && Number.isFinite(a.at) && now - a.at <= WALL_ACTIVITY_STALE_MS && now - a.at >= -60_000;
}

/** Lines a text of `chars` characters wraps into, at `fontPx`, in `widthPx`. */
function wrapRows(chars: number, fontPx: number, widthPx: number, em: number): number {
	if (chars <= 0) return 1;
	const perRow = Math.max(4, Math.floor(widthPx / (fontPx * em)));
	return Math.ceil(chars / perRow);
}

/** Rows a list of pieces of given widths takes when packed left to right with a gap, in `widthPx`. */
function packWidths(widths: readonly number[], gap: number, widthPx: number): number {
	if (widths.length === 0) return 0;
	let rows = 1;
	let used = 0;
	for (const raw of widths) {
		const w = Math.min(widthPx, raw);
		if (used > 0 && used + gap + w > widthPx) {
			rows += 1;
			used = w;
		} else {
			used += (used > 0 ? gap : 0) + w;
		}
	}
	return rows;
}

interface Cuts {
	agenda: number;
	next: number;
	/** The most names any one group shows; Infinity is all of them. */
	names: number;
	/** Groups folded into the "+N more names" line. */
	dropped: readonly WallActivityKey[];
}

type PlanShape = Pick<WallPlan, 'clock' | 'hall' | 'pick' | 'activityLive'>;

/** The estimated height of the side column at body size `f`, under `cuts`. */
function sideHeight(frame: ProjectorFrame, plan: PlanShape, cuts: Cuts, f: number, box: WallBox, floor: number): number {
	const cards = cardHeights(frame, plan, cuts, f, box, floor);
	if (cards.length === 0) return 0;
	return cards.reduce((x, y) => x + y, 0) + CARD.gap * f * (cards.length - 1);
}

/** Each side card's estimated height, in the order the side draws them. */
function cardHeights(frame: ProjectorFrame, plan: PlanShape, cuts: Cuts, f: number, box: WallBox, floor: number): number[] {
	const inner = Math.max(40, box.width - CARD.padX * f - CARD.border);
	const small = Math.max(floor, WALL_SCALE.label * f);
	const label = small * LH.label + CARD.labelFoot * f;
	const more = Math.max(floor, WALL_SCALE.more * f) * LH.body;
	const chrome = CARD.padY * f + CARD.border;
	const cards: number[] = [];
	// The clock and the hall pass share one card, side by side, stacking only
	// where the side is too narrow for both.
	if (plan.clock || plan.hall) {
		const clockH = plan.clock ? WALL_SCALE.clock * f * LH.big : 0;
		const hallH = plan.hall ? f * LH.body + 0.2 * f + 4 : 0;
		const clockW = plan.clock ? 8 * WALL_CHAR_EM.mono * WALL_SCALE.clock * f : 0;
		const hallW = plan.hall ? 9 * WALL_CHAR_EM.mono * small + 8 * WALL_CHAR_EM.bold * f + 2.4 * f : 0;
		const side = plan.clock && plan.hall && clockW + 1.2 * f + hallW <= inner;
		cards.push(chrome + (side || !(plan.clock && plan.hall) ? Math.max(clockH, hallH) : clockH + hallH + 0.3 * f));
	}
	if (plan.pick && frame.pick) {
		const big = WALL_SCALE.pick * f;
		cards.push(chrome + small * LH.label + 0.15 * f + wrapRows(frame.pick.name.length, big, inner, WALL_CHAR_EM.bold) * big * LH.big);
	}
	const list = (lines: readonly string[], shown: number) => {
		const kept = lines.slice(0, shown);
		let h = chrome + label;
		kept.forEach((l, i) => {
			h += wrapRows(l.length + 2, f, inner - 1.4 * f, WALL_CHAR_EM.display) * f * LH.body + (i > 0 ? CARD.lineGap * f : 0);
		});
		if (lines.length > shown) h += CARD.lineGap * f + more;
		return h;
	};
	if (frame.agenda.length > 0) cards.push(list(frame.agenda, Math.min(frame.agenda.length, cuts.agenda)));
	if (frame.next.length > 0) cards.push(list(frame.next, Math.min(frame.next.length, cuts.next)));
	if (plan.activityLive && frame.activity) {
		const a = frame.activity;
		let h = chrome + label;
		// The item it is about, with "as of 11:02 AM" after it on the same line.
		h += wrapRows(a.item.length + 16, f, inner, WALL_CHAR_EM.display) * f * LH.body + CARD.lineGap * f;
		// Five recessed counts, packed left to right: a numeral over its word.
		const tileH = WALL_SCALE.count * f * LH.big + small * LH.label + 0.4 * f + 2;
		const tileGap = 0.4 * f;
		const tiles = WALL_ACTIVITY_GROUPS.map(
			(g) =>
				Math.max(
					3.2 * f,
					String(a.counts[g.key]).length * WALL_CHAR_EM.mono * WALL_SCALE.count * f + f,
					g.word.length * WALL_CHAR_EM.display * small + f
				) + 2
		);
		const rows = packWidths(tiles, tileGap, inner);
		h += rows * tileH + (rows - 1) * tileGap;
		// Names, when the second toggle is on: each group's word, then its names
		// on the same flowing line; folded groups, one "+N more names" line.
		const nameFont = Math.max(floor, WALL_SCALE.name * f);
		const gap = 0.9 * nameFont;
		let folded = false;
		for (const g of WALL_ACTIVITY_GROUPS) {
			const names = a.names?.[g.key] ?? [];
			if (names.length === 0) continue;
			if (cuts.dropped.includes(g.key)) {
				folded = true;
				continue;
			}
			const shown = Math.min(names.length, cuts.names);
			const pieces = [
				g.word.length * WALL_CHAR_EM.mono * small,
				...names.slice(0, shown).map((n) => n.length * WALL_CHAR_EM.display * nameFont),
				...(names.length > shown ? [9 * WALL_CHAR_EM.display * nameFont] : [])
			];
			h += CARD.lineGap * f + packWidths(pieces, gap, inner) * nameFont * LH.name;
		}
		if (folded) h += CARD.lineGap * f + more;
		cards.push(h);
	}
	return cards;
}

/**
 * THE PLAN FOR ONE FRAME IN ONE BOX: the hero, which cards the side shows, the
 * side's type size, and anything cut. Deterministic, so the same frame in the
 * same box always paints the same wall.
 */
export function wallFit(frame: ProjectorFrame, now: number, box: WallBox): WallPlan {
	const viewH = Math.max(200, box.viewHeight || 0);
	const floorPx = Math.max(12, viewH * WALL_FLOOR_VH);
	const maxPx = Math.max(floorPx, viewH * WALL_SIDE_MAX_VH);
	const activityLive = wallActivityLive(frame, now);
	const hero: WallPlan['hero'] = frame.timer ? 'timer' : 'clock';
	const shape: PlanShape = {
		clock: hero === 'timer',
		hall: !!frame.hallPass,
		pick: !!frame.pick,
		activityLive
	};
	const sideEmpty = !shape.clock && !shape.hall && !shape.pick && frame.agenda.length === 0 && frame.next.length === 0 && !activityLive;
	const clockOnly = shape.clock && !shape.hall && !shape.pick && frame.agenda.length === 0 && frame.next.length === 0 && !activityLive;
	const groupNames = (key: WallActivityKey) => (activityLive ? (frame.activity?.names?.[key] ?? []) : []);

	const finish = (cuts: Cuts, fontPx: number, fits: boolean): WallPlan => {
		const namesShown: WallPlan['namesShown'] = {};
		const namesMore: WallPlan['namesMore'] = {};
		let namesDroppedCount = 0;
		const namesDropped: WallActivityKey[] = [];
		for (const g of WALL_ACTIVITY_GROUPS) {
			const list = groupNames(g.key);
			if (list.length === 0) continue;
			if (cuts.dropped.includes(g.key)) {
				namesDropped.push(g.key);
				namesDroppedCount += list.length;
				continue;
			}
			namesShown[g.key] = Math.min(list.length, cuts.names);
			if (list.length > cuts.names) namesMore[g.key] = list.length - cuts.names;
		}
		const agendaShown = Math.min(frame.agenda.length, cuts.agenda);
		const nextShown = Math.min(frame.next.length, cuts.next);
		// "11:02 AM" is about 3.1em of the mono face; the card's padding takes the rest.
		const lone = Math.min((box.width - CARD.padX * fontPx - CARD.border) / 3.3, box.height * 0.42, viewH * 0.24);
		const clockPx = clockOnly && !box.portrait ? Math.max(WALL_SCALE.clock * fontPx, lone) : WALL_SCALE.clock * fontPx;
		return {
			hero,
			sideEmpty,
			// Not rounded: the size the plan checked is the size the wall paints.
			fontPx,
			clockPx,
			floorPx,
			...shape,
			agendaShown,
			agendaMore: frame.agenda.length - agendaShown,
			nextShown,
			nextMore: frame.next.length - nextShown,
			namesShown,
			namesMore,
			namesDropped,
			namesDroppedCount,
			fits
		};
	};
	const all: Cuts = { agenda: Infinity, next: Infinity, names: Infinity, dropped: [] };
	if (sideEmpty) return finish(all, maxPx, true);
	if (box.portrait) {
		// A phone is not a wall: everything, at a size that reads in the hand.
		return finish(all, Math.max(floorPx, Math.min(maxPx, 18)), true);
	}
	// A margin for what the estimate does not model (a baseline-aligned row of
	// two type sizes runs a few px taller than either line): measured 4-5px
	// short on the activity card at 1280x800 and 1920x1080.
	const room = box.height - Math.max(8, box.height * 0.012);
	const fitsAt = (cuts: Cuts, f: number) => sideHeight(frame, shape, cuts, f, box, floorPx) <= room;
	// The largest size that fits with nothing cut, stepping down 4% at a time.
	for (let f = maxPx; f > floorPx; f *= 0.96) {
		if (fitsAt(all, f)) return finish(all, f, true);
	}
	if (fitsAt(all, floorPx)) return finish(all, floorPx, true);
	// At the floor, cut in order. Names first, but the teacher asked for them,
	// so only down to a few a group before anything else gives way...
	const cuts: Cuts = { ...all, dropped: [] };
	const maxNames = Math.max(0, ...WALL_ACTIVITY_GROUPS.map((g) => groupNames(g.key).length));
	for (let cap = maxNames - 1; cap >= WALL_NAMES_KEEP; cap--) {
		cuts.names = cap;
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	// ...then the agenda's tail, keeping four...
	for (let keep = frame.agenda.length - 1; keep >= Math.min(WALL_AGENDA_KEEP, frame.agenda.length); keep--) {
		cuts.agenda = keep;
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	cuts.agenda = Math.min(WALL_AGENDA_KEEP, frame.agenda.length);
	// ...then Coming up, keeping one...
	for (let keep = frame.next.length - 1; keep >= Math.min(WALL_NEXT_KEEP, frame.next.length); keep--) {
		cuts.next = keep;
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	cuts.next = Math.min(WALL_NEXT_KEEP, frame.next.length);
	// ...then names again, down to one a group, then whole groups folded into
	// one "+N more names" line, least actionable first.
	for (let cap = Math.min(cuts.names, maxNames) - 1; cap >= 1; cap--) {
		cuts.names = cap;
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	const dropped: WallActivityKey[] = [];
	for (const key of WALL_NAME_DROP_ORDER) {
		if (groupNames(key).length === 0) continue;
		dropped.push(key);
		cuts.dropped = [...dropped];
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	// LAST RESORT, for a small screen holding long lines: a wall that says
	// "+N more" is still a wall; one that scrolls is not. The agenda goes down
	// to its first line, then Coming up to none.
	for (let keep = cuts.agenda - 1; keep >= Math.min(1, frame.agenda.length); keep--) {
		cuts.agenda = keep;
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	for (let keep = cuts.next - 1; keep >= 0; keep--) {
		cuts.next = keep;
		if (fitsAt(cuts, floorPx)) return finish(cuts, floorPx, true);
	}
	return finish(cuts, floorPx, fitsAt(cuts, floorPx));
}

function cutsOf(plan: WallPlan): Cuts {
	const shownCaps = Object.values(plan.namesShown).map((n) => n ?? 0);
	const capped = Object.keys(plan.namesMore).length > 0;
	return {
		agenda: plan.agendaShown,
		next: plan.nextShown,
		names: capped ? Math.max(0, ...shownCaps) : Infinity,
		dropped: plan.namesDropped
	};
}

/** The estimate itself, for a test that holds a plan to its own box. */
export function wallSideHeight(frame: ProjectorFrame, box: WallBox, plan: WallPlan): number {
	return sideHeight(frame, plan, cutsOf(plan), plan.fontPx, box, plan.floorPx);
}

