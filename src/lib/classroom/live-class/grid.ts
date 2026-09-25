/**
 * WHO IS WORKING, AT A GLANCE (ledger 0297, package LIVE): the pure half of the
 * live students-by-work grid on the teacher's control view.
 *
 * Every student on the roster lands in exactly ONE state for the item the
 * teacher picked, and the states are ordered so the ones a teacher acts on come
 * first: idle, away, not opened, then working, needs grading, handed in. That
 * is Formative's students-by-work view and GoGuardian's idle flag, built from
 * two records this codebase already keeps and nothing new:
 *
 *   - THE HEARTBEAT (0200), through `classroom_presence_state` and
 *     `$lib/classroom/presence/state`'s mirror of it. Written only by a
 *     student's ASSIGNMENT page, so a material or an announcement emits none,
 *     and that absence is a state here (`no-signal`) rather than a column of
 *     "Not opened" that would be a confident false statement about a class.
 *   - THE HAND-IN, through the same `loadGrading` payload the grading console
 *     reads, reshaped by `studentWorkRows` (so 0138's manager exclusion is
 *     applied in the one place it lives) and judged by `assignmentLockState`
 *     and `isAwaitingGrade`, the lock module's and the feed's own predicates.
 *
 * AND "MISSING" IS ASKED OF `assignmentStanding` AND OF NOTHING ELSE, the one
 * predicate the to-do page, the class filter and the student's own chip read
 * (TODO's report): a past-due assignment with nothing handed in carries a
 * Missing mark on this grid for exactly the students it would say Missing to.
 *
 * A FINISHED PORTED WORKSHEET IS HANDED IN HERE TOO (decision 37, ledger
 * 0298). It has no turn-in, so without its manifest this grid read a student
 * who had filled in every block as working or away, and past the due time as
 * Missing, while their own class page said Complete. The grading payload
 * already carries the item's answers and photographs, so the only thing added
 * is the manifest (`LiveGradingData.worksheet`, from `withWorksheetManifest`),
 * judged by `worksheetCompletedAt` and put on the row by
 * `withWorksheetCompletions`: the same judgment and the same rule the class
 * page, the home page and the to-do read. No manifest (a spec assignment, or a
 * read that could not answer) is exactly the grid it was.
 *
 * NO CLOCK IS READ HERE. `now` is threaded in by the control view, which reads
 * one clock for the timer, the wall clock and this grid, so the three cannot
 * disagree in one paint.
 */

import {
	presenceLastWorkedLabel,
	presenceState,
	PRESENCE_LIMITS_FALLBACK,
	type PresenceLimits,
	type PresencePayload,
	type PresenceRow
} from '$lib/classroom/presence/state';
import {
	studentWorkRows,
	type GradingData,
	type StudentWork,
	type SubmissionRow
} from '$lib/classroom/assignment-spec';
import { assignmentLockState } from '$lib/classroom/html-assignment/lock';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { isAwaitingGrade } from '$lib/classroom/feed';
import {
	assignmentStanding,
	itemTitle,
	splitRoster,
	studentWorkChip,
	type ClassroomEnrollment,
	type ClassroomItem,
	type StudentWork as WorkSummary,
	type TxResult
} from '$lib/classroom/classroom';
import { schoolDayOf } from '$lib/classroom/school-calendar';
import { withWorksheetCompletions, worksheetCompletedAt, worksheetKey } from '$lib/classroom/student-work';

/**
 * HOW LONG WITHOUT TYPING BEFORE A STUDENT WHO HAS THE ASSIGNMENT OPEN READS AS
 * IDLE: FIVE MINUTES, and the number is a judgment between three others.
 *
 *   - PRESENCE'S OWN INPUT WINDOW IS 60 SECONDS (`inputWindowSeconds`), which
 *     is right for its word "Working" (typed in the last minute) and far too
 *     short for "stuck": reading a step, measuring a part or sketching on
 *     paper all take longer than a minute and are the work. A grid that
 *     flagged every student reading the instructions as idle would teach the
 *     teacher to ignore the column in a day.
 *   - PRESENCE'S AWAY WINDOW IS 120 SECONDS, which answers a different
 *     question (has the page stopped beating at all) and has its own state
 *     here, `away`.
 *   - GOGUARDIAN FLAGS IDLE AT 10 MINUTES, which is tuned to a whole browsing
 *     session. Mr. Pina's front-of-room task is a 10-minute timer, so a
 *     10-minute threshold would flag a stuck student exactly when the activity
 *     was over, which is too late to be worth knowing.
 *
 * Five is half the activity: late enough that ordinary reading and thinking
 * never trip it (five times the input window), early enough to walk over while
 * there is still time to help. The heartbeat and the poll are both 30 seconds,
 * so the flag lands between 5:00 and 6:00 after the last keystroke.
 */
export const LIVE_IDLE_MS = 5 * 60_000;

/** One student's state on the grid. Exhaustive everywhere below: a new one is a type error, never a blank chip. */
export type LiveCellState =
	| 'idle'
	| 'away'
	| 'not-opened'
	| 'working'
	| 'needs-grading'
	| 'submitted'
	| 'unknown'
	| 'no-signal';

/**
 * THE ORDER THE GROUPS ARE READ IN: stuck first, then not started, then the
 * students who are fine, then what has been handed in, then the two states that
 * are about the instrument rather than the student.
 */
export const LIVE_GROUP_ORDER: readonly LiveCellState[] = [
	'idle',
	'away',
	'not-opened',
	'working',
	'needs-grading',
	'submitted',
	'unknown',
	'no-signal'
];

/**
 * THE WORD, THE GLYPH AND THE TONE, read through ONE map. Colour is never the
 * only signal: every renderer prints the word, and the glyph is `aria-hidden`
 * because the word is always beside it. The glyphs extend presence's alphabet
 * (a filled dot at work, a hollow one present-not-working, a dash for gone)
 * rather than inventing a second one for the same facts.
 */
export const LIVE_CELL_DISPLAY: Record<
	LiveCellState,
	{ label: string; glyph: string; tone: 'ok' | 'warn' | 'info' | 'quiet' | 'done' }
> = {
	idle: { label: 'Idle', glyph: '○', tone: 'warn' },
	away: { label: 'Away', glyph: '◇', tone: 'quiet' },
	'not-opened': { label: 'Not opened', glyph: '◌', tone: 'quiet' },
	working: { label: 'Working', glyph: '●', tone: 'ok' },
	'needs-grading': { label: 'Needs grading', glyph: '↑', tone: 'info' },
	submitted: { label: 'Handed in', glyph: '✓', tone: 'done' },
	unknown: { label: 'Not known', glyph: '?', tone: 'quiet' },
	'no-signal': { label: 'No signal', glyph: '⌀', tone: 'quiet' }
};

/**
 * WHAT THIS VIEW KNOWS ABOUT PRESENCE, as four states rather than a nullable
 * payload: the grading console's rule (ledger 0278), for the same reason. Only
 * `ready` and `stale` carry a payload; `pending` and `unavailable` never earn a
 * "Not opened".
 */
export type LivePresenceStatus = 'pending' | 'ready' | 'unavailable' | 'stale';

/** One student on the grid. */
export interface LiveCell {
	email: string;
	name: string;
	state: LiveCellState;
	/** A few words of evidence ("Typed 3m ago", "No typing for 7 min"), or null. */
	detail: string | null;
	/** Past due with nothing handed in, by `assignmentStanding`. */
	missing: boolean;
	/** On the assignment page right now (working or idle), for the picker's pool. */
	present: boolean;
}

/**
 * The submission columns the hand-in half reads, and nothing else, plus the
 * derived `completed_at` a finished ported worksheet carries (never selected:
 * `withWorksheetCompletions` puts it on a draft row, the feed's own rule).
 */
export type HandInFacts = Pick<
	SubmissionRow,
	'item_id' | 'student_email' | 'state' | 'submitted_at' | 'graded_at'
> & { completed_at?: string | null };

/**
 * THE GRADING PAYLOAD THE GRID READS: `loadGrading`'s own, plus the item's
 * manifest when the item is a ported worksheet. Optional, so a payload without
 * it (a spec assignment, a harness, a read that could not answer) is the grid
 * it always was.
 */
export type LiveGradingData = GradingData & { worksheet?: HtmlAssignmentManifest | null };

/** The hand-in half, as the lock module and the feed judge it. */
function handInState(
	submission: HandInFacts | null,
	item?: Pick<ClassroomItem, 'due_at'> | null
): { state: 'needs-grading' | 'submitted'; detail: string } | null {
	if (!submission) return null;
	if (submission.state === 'returned') return { state: 'submitted', detail: 'Returned' };
	const lock = assignmentLockState(submission);
	if (lock === 'closed') return { state: 'submitted', detail: 'Closed' };
	if (lock !== 'turned-in') {
		/*
		 * FINISHED BY FILLING IT IN (decision 37): a draft carrying the derived
		 * `completed_at`. Waiting is `isAwaitingGrade`'s answer, the feed's own,
		 * and the word is the student's own chip's ("Complete", or "Complete,
		 * late" when the work was finished after the due instant), so this row
		 * and their class page cannot say two different things.
		 */
		if (submission.state === 'draft' && typeof submission.completed_at === 'string') {
			if (!isAwaitingGrade(submission)) return { state: 'submitted', detail: 'Graded' };
			const chip = studentWorkChip(
				{ kind: 'assignment', due_at: item?.due_at ?? null, points: null },
				{ state: 'in-progress', score: null, completedAt: submission.completed_at },
				null
			);
			return { state: 'needs-grading', detail: chip.label };
		}
		return null;
	}
	if (isAwaitingGrade(submission)) {
		return {
			state: 'needs-grading',
			detail: submission.graded_at ? 'Handed in again' : 'Handed in'
		};
	}
	return { state: 'submitted', detail: 'Graded' };
}

function stamp(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : null;
}

function minutesLabel(ms: number): string {
	const m = Math.max(1, Math.floor(ms / 60_000));
	return `${m} min`;
}

/**
 * THE ONE CLASSIFIER. Its order is the rule:
 *
 *   1. HANDED IN outranks everything: a student who turned the work in is not
 *      idle for having closed the tab, and saying so would contradict the
 *      record the teacher grades from.
 *   2. NO SIGNAL: the item is not one whose page beats (a material, an
 *      announcement), so presence can say nothing about anybody.
 *   3. PRESENCE NOT ANSWERED: `unknown`, never a verdict.
 *   4. A HEARTBEAT ROW that is not away: working or idle, by `LIVE_IDLE_MS`
 *      against the latest of the last keystroke and the moment this view saw
 *      them arrive (`arrivedAt`), so a student who sat down a minute ago is not
 *      idle for not having typed since yesterday.
 *   5. A ROW THAT IS AWAY, or no row with a draft saved: `away`.
 *   6. No row and nothing arrived: `not-opened`, the only reading that earns
 *      the verdict (presence's own `presenceLineKind` rule).
 */
export function liveCellState(facts: {
	submission: HandInFacts | null;
	workArrived: boolean;
	row: PresenceRow | null;
	presence: LivePresenceStatus;
	/** Does the chosen item's page send heartbeats at all? */
	signal: boolean;
	now: number;
	limits?: PresenceLimits;
	arrivedAt?: number | null;
	/** The item's due instant, which is what says whether a finished worksheet was finished late. */
	item?: Pick<ClassroomItem, 'due_at'> | null;
}): { state: LiveCellState; detail: string | null } {
	const limits = facts.limits ?? PRESENCE_LIMITS_FALLBACK;
	const handIn = handInState(facts.submission, facts.item);
	if (handIn) return handIn;
	if (!facts.signal) return { state: 'no-signal', detail: null };
	const answered = facts.presence === 'ready' || facts.presence === 'stale';
	if (!answered) return { state: 'unknown', detail: facts.workArrived ? 'Draft saved' : null };

	const row = facts.row;
	if (row) {
		const p = presenceState(row, facts.now, limits);
		if (p !== 'away') {
			const lastInput = stamp(row.last_input_at);
			const activity = Math.max(lastInput ?? -Infinity, facts.arrivedAt ?? -Infinity);
			const elsewhere = row.page_visible !== true ? ' · other tab' : '';
			if (Number.isFinite(activity) && facts.now - activity <= LIVE_IDLE_MS) {
				const typing =
					p === 'working'
						? 'Typing'
						: lastInput !== null
							? `Typed ${presenceLastWorkedLabel(row.last_input_at, facts.now).toLowerCase()}`
							: 'Just opened';
				return { state: 'working', detail: `${typing}${elsewhere}` };
			}
			const since = Number.isFinite(activity) ? facts.now - activity : null;
			return {
				state: 'idle',
				detail:
					since !== null && lastInput !== null
						? `No typing for ${minutesLabel(since)}${elsewhere}`
						: `No typing yet${elsewhere}`
			};
		}
		return {
			state: 'away',
			detail: `Last seen ${presenceLastWorkedLabel(row.last_seen_at, facts.now).toLowerCase()}`
		};
	}
	if (facts.workArrived) return { state: 'away', detail: 'Draft saved' };
	return { state: 'not-opened', detail: null };
}

/** The minimal slice of a student's work this reads. */
function workArrived(s: StudentWork): boolean {
	return !!s.submission || s.responses.length > 0 || s.files.length > 0;
}

/**
 * A grading-payload submission as the one Missing predicate reads it, with the
 * derived `completed_at` carried the way `studentWorkMap` carries it, so a
 * finished worksheet is `done` to `assignmentStanding` here as on the class page.
 */
function workSummary(s: StudentWork, facts: HandInFacts | null): WorkSummary {
	const state = s.submission?.state ?? null;
	const out: WorkSummary = {
		state:
			state === 'returned'
				? 'returned'
				: state === 'submitted'
					? 'submitted'
					: workArrived(s)
						? 'in-progress'
						: 'not-started',
		score: null
	};
	if (typeof facts?.completed_at === 'string') out.completedAt = facts.completed_at;
	return out;
}

/**
 * THE ROW THE HAND-IN HALF READS: the student's own submission, or -- when the
 * item is a ported worksheet and `worksheetCompletedAt` says this student's
 * answers finish it -- that row as `withWorksheetCompletions` leaves it: a
 * draft (or no row at all) carries `completed_at`, a row that is turned in,
 * closed or returned keeps its own word. Called with a one-entry map rather
 * than restating the rule, so the grid cannot attach an instant to a row the
 * class page would not.
 */
function handInFacts(
	s: StudentWork,
	itemId: string,
	worksheet: HtmlAssignmentManifest | null | undefined
): HandInFacts | null {
	if (!worksheet) return s.submission;
	const at = worksheetCompletedAt(worksheet, s.responses, s.files);
	if (at === null) return s.submission;
	const id = s.submission?.item_id ?? itemId;
	const [row] = withWorksheetCompletions<HandInFacts>(
		s.submission ? [s.submission] : [],
		new Map([[worksheetKey(id, s.email), at]]),
		(item_id, student_email) => ({ item_id, student_email, state: 'draft', submitted_at: null, graded_at: null })
	);
	return row ?? s.submission;
}

/**
 * EVERY STUDENT'S CELL, roster-ordered, managers dropped.
 *
 * `grading` null means the hand-in read has not landed (or there is no item):
 * rows come from `roster` alone, through the same `splitRoster`, so the grid
 * never shows a manager as a student while it waits.
 */
export function liveCells(input: {
	item: (Pick<ClassroomItem, 'kind' | 'due_at'> & { id?: string }) | null;
	/** Does the item's page send heartbeats? Assignments do; materials and announcements do not. */
	signal: boolean;
	/** The hand-in read, carrying the worksheet's manifest when the item is one (`LiveGradingData`). */
	grading: LiveGradingData | null;
	roster: readonly ClassroomEnrollment[];
	presence: PresencePayload | null;
	presenceStatus: LivePresenceStatus;
	now: number;
	arrivals?: ReadonlyMap<string, number>;
}): LiveCell[] {
	const rows: StudentWork[] = input.grading
		? studentWorkRows(input.grading).rows
		: splitRoster([...input.roster])
				.students.slice()
				.sort((a, b) =>
					(a.display_name || a.student_email).localeCompare(b.display_name || b.student_email, undefined, {
						sensitivity: 'base'
					})
				)
				.map((e) => ({
					email: e.student_email,
					displayName: e.display_name || e.student_email.split('@')[0],
					active: e.active,
					submission: null,
					responses: [],
					files: [],
					approvals: []
				}));
	const byEmail = new Map((input.presence?.students ?? []).map((r) => [r.student_email, r]));
	const limits = input.presence?.limits ?? PRESENCE_LIMITS_FALLBACK;
	const nowIso = new Date(input.now).toISOString();
	const worksheet = input.grading?.worksheet ?? null;
	const itemId = input.item?.id ?? '';
	return rows
		.filter((s) => s.active)
		.map((s) => {
			const facts = handInFacts(s, itemId, worksheet);
			const { state, detail } = liveCellState({
				submission: facts,
				workArrived: workArrived(s),
				row: byEmail.get(s.email) ?? null,
				presence: input.presenceStatus,
				signal: input.signal,
				now: input.now,
				limits,
				arrivedAt: input.arrivals?.get(s.email) ?? null,
				item: input.item
			});
			const missing = input.item
				? assignmentStanding(input.item, workSummary(s, facts), nowIso) === 'missing'
				: false;
			return {
				email: s.email,
				name: s.displayName,
				state,
				detail,
				missing,
				present: state === 'working' || state === 'idle'
			};
		});
}

/**
 * THE LIVE VIEW'S GRADING READ, WITH THE WORKSHEET'S MANIFEST BESIDE IT
 * (decision 37, ledger 0298). `loadGrading` is the grading console's own read,
 * which already carries every answer and photograph on the ONE item, pinned to
 * that item; `readManifest` is two small reads pinned to the same id and never
 * an answers read (`readWorksheetManifests`). So a finished worksheet costs
 * this view the manifest and nothing else: measured on the test cluster, one
 * section of 30 on a 60-block worksheet, the grading read took 259 to 289ms
 * and the manifest 3.6 to 4.4ms, in parallel with it.
 *
 * THE MANIFEST NEVER DECIDES WHETHER THE READ SUCCEEDS. A manifest read that
 * fails or throws is `worksheet: null`, which is the grid as it was before a
 * worksheet could read Complete here: never "complete", never an error on a
 * screen a teacher is running a class from.
 */
export function withWorksheetManifest(
	loadGrading: (itemId: string, sectionId: string) => Promise<TxResult<GradingData>>,
	readManifest: (itemId: string) => Promise<HtmlAssignmentManifest | null>
): (itemId: string, sectionId: string) => Promise<TxResult<LiveGradingData>> {
	return async (itemId, sectionId) => {
		const [res, worksheet] = await Promise.all([
			loadGrading(itemId, sectionId),
			Promise.resolve()
				.then(() => readManifest(itemId))
				.catch(() => null)
		]);
		if (!res.ok) return res;
		return { ok: true, data: { ...res.data, worksheet: worksheet ?? null } };
	};
}

/** How many students sit in each state, every state named (zero included). */
export function liveTally(cells: readonly LiveCell[]): Record<LiveCellState, number> {
	const out = Object.fromEntries(LIVE_GROUP_ORDER.map((s) => [s, 0])) as Record<LiveCellState, number>;
	for (const c of cells) out[c.state] += 1;
	return out;
}

/** The cells grouped in reading order, empty groups dropped. */
export function liveGroups(cells: readonly LiveCell[]): { state: LiveCellState; cells: LiveCell[] }[] {
	return LIVE_GROUP_ORDER.map((state) => ({ state, cells: cells.filter((c) => c.state === state) })).filter(
		(g) => g.cells.length > 0
	);
}

/**
 * WHO ARRIVED WHILE THIS VIEW WAS WATCHING. A student present now who was NOT
 * present at the previous read gets the instant of this read; a student still
 * present keeps theirs; a student gone is dropped. The FIRST read (`previous`
 * null) records nobody, because a student already there when the teacher opened
 * the view arrived at an instant nobody saw, and inventing one would make an
 * idle student read as working for five minutes.
 */
export function nextArrivals(
	previous: ReadonlySet<string> | null,
	arrivals: ReadonlyMap<string, number>,
	presentNow: ReadonlySet<string>,
	at: number
): Map<string, number> {
	const out = new Map<string, number>();
	for (const email of presentNow) {
		const held = arrivals.get(email);
		if (held !== undefined) out.set(email, held);
		else if (previous !== null && !previous.has(email)) out.set(email, at);
	}
	return out;
}

/** The students a payload shows on the page right now (not away), at `now`. */
export function presentEmails(payload: PresencePayload | null, now: number): Set<string> {
	const limits = payload?.limits ?? PRESENCE_LIMITS_FALLBACK;
	return new Set(
		(payload?.students ?? [])
			.filter((r) => presenceState(r, now, limits) !== 'away')
			.map((r) => r.student_email)
	);
}

/**
 * THE COUNT BESIDE THE CLASS PAGE'S LIVE DOOR: students on the assignment page
 * right now, judged at the instant the SERVER read the rows (`payload.at`), so
 * the door reads no clock of its own and cannot disagree with the grid about
 * which rule decided. Null when there is no payload to count.
 */
export function liveCountOf(payload: PresencePayload | null): number | null {
	if (!payload) return null;
	const at = Date.parse(payload.at);
	return presentEmails(payload, Number.isFinite(at) ? at : Date.now()).size;
}

/** An item the grid may be pointed at, in the order the chooser offers them. */
export interface LiveItemChoice {
	id: string;
	title: string;
	kind: ClassroomItem['kind'];
	/** Whether the item's page sends heartbeats (assignments only). */
	signal: boolean;
	due_at: string | null;
}

function liveNow(item: ClassroomItem, now: number): boolean {
	if (!item.published) return false;
	const opens = stamp(item.publish_at ?? null);
	return opens === null || opens <= now;
}

/**
 * WHICH ITEMS THE GRID CAN WATCH, BEST GUESS FIRST.
 *
 * Only what the class can see right now (published and past its go-live), so
 * the grid never watches a draft nobody can open. ASSIGNMENTS FIRST, ranked:
 * due today (soonest first), then posted today, then due later (soonest
 * first), then the rest (newest first). Then today's materials and
 * announcements, which the chooser offers so a teacher who posted a reading
 * sees the grid say "No signal" rather than wonder where the reading went.
 */
export function liveItemChoices(items: readonly ClassroomItem[], now: number, today: string): LiveItemChoice[] {
	const live = items.filter((i) => liveNow(i, now));
	const rank = (i: ClassroomItem): [number, number] => {
		const due = stamp(i.due_at);
		const posted = stamp(i.first_published_at ?? i.publish_at ?? i.created_at) ?? 0;
		if (due !== null && schoolDayOf(i.due_at) === today) return [0, due];
		if (schoolDayOf(i.first_published_at ?? i.publish_at ?? null) === today) return [1, -posted];
		if (due !== null && due > now) return [2, due];
		return [3, -posted];
	};
	const assignments = live
		.filter((i) => i.kind === 'assignment')
		.map((i) => ({ i, r: rank(i) }))
		.sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1])
		.map(({ i }) => i);
	const others = live
		.filter((i) => i.kind !== 'assignment')
		.filter((i) => schoolDayOf(i.first_published_at ?? i.publish_at ?? null) === today)
		.sort((a, b) => (stamp(b.first_published_at) ?? 0) - (stamp(a.first_published_at) ?? 0));
	return [...assignments, ...others].map((i) => ({
		id: i.id,
		title: itemTitle(i),
		kind: i.kind,
		signal: i.kind === 'assignment',
		due_at: i.due_at
	}));
}
