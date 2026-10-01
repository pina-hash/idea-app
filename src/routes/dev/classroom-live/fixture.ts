/**
 * THE LIVE-CLASS HARNESS FIXTURE (ledger 0297). Every instant is an OFFSET
 * against the real clock, because presence and "due today" are functions of
 * elapsed time and a literal would drift into `away` or into yesterday and go
 * on looking plausible while it did. Shared by /dev/classroom-live and
 * /dev/classroom-projector so the two pages name the same class and viewer.
 */
import { laCalendarDay, schoolDayOf } from '$lib/classroom/school-calendar';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { ClassroomEnrollment, ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import type { GradingData, ResponseRow, SubmissionRow } from '$lib/classroom/assignment-spec';
import type { HallPassManagerState } from '$lib/classroom/hall-pass';
import { PRESENCE_LIMITS_FALLBACK, type PresencePayload, type PresenceRow } from '$lib/classroom/presence/state';
import { countdown, stopwatch, type LiveTimer } from '$lib/classroom/live-class/timer';

export const BASE = '/dev/classroom-live';
export const PROJECTOR_HREF = '/dev/classroom-projector';
/** The same viewer on both pages: the channel is per viewer and per class. */
export const VIEWER = 'harness-teacher';
export const SECTION_ID = 's-live';
export const ASSIGNMENT_ID = 'i-truss';

export const SECTION: ClassroomSection = {
	id: SECTION_ID,
	course_id: 'c-1',
	label: 'Period 3',
	block: '3',
	teacher_email: 'pina@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering Design Honors', active: true }
};

export const CLASS_LABEL = 'IDEA209H · Period 3 · Block 3';

export const today = (now = Date.now()) => laCalendarDay(new Date(now));

/**
 * THE TIMERS EITHER HARNESS CAN SEED (ledger 0298), from the instant `now`:
 *
 *   running    a ten-minute countdown 1:23 in (the wall reads 8:37.0)
 *   ready      a ten-minute countdown, set and not started
 *   final      a ten-minute countdown with 7.42 s left, running
 *   paused     the same, paused
 *   done       a ten-minute countdown that ran out 32 s ago
 *   stopwatch  a stopwatch 1:02:05.34 in
 *
 * With `?clock=pinned` a harness's clock stops at `now`, so the last-seconds
 * and finished faces hold still and read exactly (0:07.42, 0:00.00); without
 * it they run on the real clock, which is how a person watches them.
 */
export function demoTimer(kind: string | null, now: number): LiveTimer | null {
	const TEN = 600_000;
	switch (kind) {
		case 'running':
			return countdown(10, now - 83_000);
		case 'ready':
			return countdown(10, now, false);
		case 'final':
			return { mode: 'countdown', durationMs: TEN, startedAt: now - (TEN - 7_420), bankedMs: 0 };
		case 'paused':
			return { mode: 'countdown', durationMs: TEN, startedAt: null, bankedMs: TEN - 7_420 };
		case 'done':
			return { mode: 'countdown', durationMs: TEN, startedAt: now - (TEN + 32_000), bankedMs: 0 };
		case 'stopwatch':
			return stopwatch(now - 3_725_340);
		default:
			return null;
	}
}

/** 11:58pm on the school day, in whichever offset Los Angeles is on. */
function tonight(day: string): string {
	for (const off of ['-07:00', '-08:00']) {
		const iso = new Date(`${day}T23:58:00${off}`).toISOString();
		if (schoolDayOf(iso) === day) return iso;
	}
	return new Date(`${day}T23:58:00-07:00`).toISOString();
}

const ago = (seconds: number, now = Date.now()) => new Date(now - seconds * 1000).toISOString();
const ahead = (seconds: number, now = Date.now()) => new Date(now + seconds * 1000).toISOString();

const item = (over: Partial<ClassroomItem>): ClassroomItem =>
	({
		kind: 'assignment',
		body: '',
		points: 20,
		category: null,
		author_email: 'pina@boscotech.edu',
		author_name: 'Mr. Pina',
		published: true,
		pinned: false,
		publish_at: null,
		due_at: null,
		first_published_at: ago(3 * 86_400),
		...over
	}) as unknown as ClassroomItem;

export function items(now = Date.now()): ClassroomItem[] {
	const day = today(now);
	return [
		item({ id: ASSIGNMENT_ID, title: 'Truss sketch', due_at: tonight(day) }),
		item({ id: 'i-levers', kind: 'material', title: 'Slides: levers and linkages', points: null, first_published_at: ago(2 * 3600, now) }),
		// Scheduled to open later today, so it is on the agenda but held back from the wall.
		// Ninety minutes on, but never past 23:57 of the school day: after 22:30
		// Pacific a plain +90 lands tomorrow, drops off today's agenda, and the
		// `classroom-live` spec's agenda row went red every night for that reason.
		item({
			id: 'i-quiz',
			title: 'Quiz 2: gear ratios',
			publish_at: new Date(Math.min(now + 90 * 60_000, Date.parse(tonight(day)) - 60_000)).toISOString(),
			first_published_at: null
		}),
		item({ id: 'i-bridge', title: 'Cantilever bridge', due_at: ahead(4 * 86_400, now) })
	];
}

export function checkIns(now = Date.now()): ClassCheckIn[] {
	return [
		{
			session_id: 'ns-9',
			section_id: SECTION_ID,
			unit_number: 3,
			session_date: today(now),
			session_label: 'Gearbox teardown'
		} as ClassCheckIn
	];
}

const enrol = (email: string, name: string, extra: Partial<ClassroomEnrollment> = {}): ClassroomEnrollment => ({
	section_id: SECTION_ID,
	student_email: email,
	display_name: name,
	active: true,
	manages: false,
	...extra
});

/** Twelve students, one who left, and the teacher enrolled in their own class (0138). */
export const ROSTER: ClassroomEnrollment[] = [
	enrol('ana@boscotech.net', 'Ana Reyes'),
	enrol('ben@boscotech.net', 'Ben Okafor'),
	enrol('cruz@boscotech.net', 'Cruz Delgado'),
	enrol('dee@boscotech.net', 'Dee Marsh'),
	enrol('eli@boscotech.net', 'Eli Nakamura'),
	enrol('fay@boscotech.net', 'Fay Obi'),
	enrol('gus@boscotech.net', 'Gus Varga'),
	enrol('hana@boscotech.net', 'Hana Ito'),
	enrol('ivan@boscotech.net', 'Ivan Petrov'),
	enrol('jo@boscotech.net', 'Jo Lindqvist'),
	enrol('kim@boscotech.net', 'Kim Soto'),
	enrol('lee@boscotech.net', 'Lee Amari'),
	enrol('max@boscotech.net', 'Max Left', { active: false }),
	enrol('pina@boscotech.edu', 'Mr. Pina', { manages: true })
];

const sub = (email: string, over: Partial<SubmissionRow>): SubmissionRow =>
	({
		id: `sub-${email}`,
		item_id: ASSIGNMENT_ID,
		student_email: email,
		state: 'submitted',
		submitted_at: null,
		returned_at: null,
		rubric_scores: null,
		criterion_comments: null,
		score: null,
		teacher_comment: null,
		graded_by: null,
		graded_at: null,
		...over
	}) as SubmissionRow;

/** The grading read for one item: the fixture's hand-ins belong to the assignment alone. */
export function grading(itemId = ASSIGNMENT_ID, now = Date.now()): GradingData {
	const responses: ResponseRow[] = [
		{ item_id: ASSIGNMENT_ID, student_email: 'hana@boscotech.net', block_id: 'm1-q1', value: { text: 'Half of it' }, updated_at: ago(3600, now) }
	];
	if (itemId !== ASSIGNMENT_ID) return { roster: ROSTER, submissions: [], responses: [], files: [], approvals: [] };
	return {
		roster: ROSTER,
		submissions: [
			sub('eli@boscotech.net', { submitted_at: ago(600, now) }),
			sub('fay@boscotech.net', { submitted_at: ago(1800, now), graded_at: ago(900, now), graded_by: 'pina@boscotech.edu', score: 18 }),
			sub('ivan@boscotech.net', { state: 'returned', submitted_at: ago(5400, now), returned_at: ago(3000, now), graded_at: ago(3000, now), score: 16 })
		],
		responses,
		files: [],
		approvals: []
	};
}

/** Presence as the RPC answers it: one row per student who has opened the page. */
export function presence(itemId: string, now = Date.now()): PresencePayload {
	const row = (email: string, seen: number, input: number | null, visible = true, first = 1800): PresenceRow => ({
		student_email: email,
		state: null,
		last_seen_at: ago(seen, now),
		last_input_at: input === null ? null : ago(input, now),
		page_visible: visible,
		active_seconds: 600,
		first_seen_at: ago(first, now)
	});
	return {
		item_id: itemId,
		section_id: SECTION_ID,
		at: new Date(now).toISOString(),
		limits: PRESENCE_LIMITS_FALLBACK,
		students:
			itemId === ASSIGNMENT_ID
				? [
						row('ana@boscotech.net', 400, 420), // out on the hall pass: away
						row('ben@boscotech.net', 8, 6),
						row('cruz@boscotech.net', 12, 7 * 60), // on the page, no typing for seven minutes
						row('dee@boscotech.net', 20, 45, false), // typing a moment ago, now in another tab
						row('eli@boscotech.net', 30, 700),
						row('jo@boscotech.net', 10, 25),
						row('kim@boscotech.net', 9, 11 * 60),
						row('lee@boscotech.net', 15, 90),
						row('pina@boscotech.edu', 5, 5) // the teacher testing their own page: never a row
					]
				: []
	};
}

/** Ana is out, and has been for six minutes. */
export function hallPass(now = Date.now()): HallPassManagerState {
	return {
		scope: 'manager',
		section_id: SECTION_ID,
		taken: true,
		mine: false,
		open: { pass_id: 'pass-1', student_email: 'ana@boscotech.net', student_name: 'Ana Reyes', opened_at: ago(360, now) },
		history: []
	};
}
