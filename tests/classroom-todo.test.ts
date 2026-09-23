// tests/classroom-todo.test.ts
//
// A STUDENT'S TO-DO ACROSS EVERY CLASS (ledger 0297): the classifier, the
// grouping, the counts every door prints, and the one clock they all read.
//
// WHY THIS IS A TEST AND NOT ONLY A HARNESS DRIVE. Every failure here is
// silent. A missing assignment listed under Assigned reads as work not yet due;
// a count one short reads as a student almost caught up; a due date counted in
// UTC calls a 9am deadline "today" every evening after 5pm Pacific. The page
// renders, the words are plausible, and the only reader who could notice is a
// student who then misses something. So every exclusion is paired with the row
// the same fixture DOES keep, and the expected values are written out by hand
// here rather than derived from the functions under test.
//
// ONE CLOCK, AT AN INSTANT WHERE THE TWO CALENDARS DISAGREE: 8pm Pacific on
// Thursday 2026-08-27, which is 03:00 UTC on Friday the 28th (the instrument
// CLAUDE.md names). A deadline at 9am Pacific on the 28th is "tomorrow" to the
// school and "today" to UTC, so a UTC day anywhere in the chain reddens this
// file. Nothing here depends on the zone the test runner is in.

import { describe, expect, it } from 'vitest';
import {
	assignmentStanding,
	formatDue,
	studentWorkChip,
	type ClassroomItem,
	type ClassroomSection,
	type StudentWork
} from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import {
	buildFeed,
	dueUrgency,
	feedIndicator,
	sectionManagedBy,
	type FeedEntry,
	type FeedSubmission
} from '$lib/classroom/feed';
import { daysBetween, laCalendarDay, schoolDayOf, weekOffset } from '$lib/classroom/school-calendar';
import {
	buildTodo,
	isTodoView,
	rowsForClass,
	summaryWords,
	todoGroups,
	todoSections,
	todoSummary,
	todoViewCounts,
	todoWhen,
	type TodoRow
} from '$lib/classroom/todo';
import { classroomCrumbs, classroomMeasure, locateClassroom } from '$lib/classroom/nav';
import { commandById, runnableCommands, type CommandEnv } from '$lib/shell/commands';

const NOW = '2026-08-28T03:00:00.000Z'; // 8pm Pacific, Thursday 2026-08-27
const CLOCK = { now: NOW, today: '2026-08-27' };
const ME = 'alice@boscotech.net';
const TEACHER = 'vargas@boscotech.edu';

/** An instant relative to the clock, in hours. */
function at(hours: number): string {
	return new Date(Date.parse(NOW) + hours * 3_600_000).toISOString();
}

function section(id: string, code: string, label: string, teacher = TEACHER): ClassroomSection {
	return {
		id,
		course_id: `c-${id}`,
		label,
		block: null,
		teacher_email: teacher,
		active: true,
		course: { id: `c-${id}`, code, title: code, active: true }
	};
}

// In the shared class order (by course code), which is the order the loader hands down.
const S_ENG = section('s-eng', 'ENG1H', 'Period 2');
const S_FRC = section('s-frc', 'FRC', 'Period 7');
const S_IDEA = section('s-idea', 'IDEA209H', 'Period 5');
/** A class the student TEACHES (a student aide's own section): nothing in it is theirs to do. */
const S_TAUGHT = section('s-taught', 'IDEA100', 'Period 1', ME);
const SECTIONS = [S_ENG, S_FRC, S_IDEA, S_TAUGHT];

function item(id: string, sectionIds: string[], over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'assignment',
		title: id,
		body: '',
		body_doc: null,
		points: 20,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: at(-400),
		edited_at: null,
		created_at: at(-400),
		updated_at: at(-400),
		links: [],
		attachments: [],
		postings: sectionIds.map((section_id) => ({ section_id })),
		viewed_at: null,
		...over
	} as ClassroomItem;
}

const ITEMS: ClassroomItem[] = [
	item('i-overdue', ['s-eng'], { due_at: at(-12) }), // 8am today, nothing turned in
	item('i-just-past', ['s-eng'], { due_at: at(-1 / 60) }), // one minute ago
	item('i-overdue-lastweek', ['s-idea'], { due_at: '2026-08-20T06:59:00.000Z' }), // 11:59pm Wed Aug 19
	item('i-overdue-earlier', ['s-frc'], { due_at: '2026-08-01T06:59:00.000Z' }), // Jul 31
	item('i-draft-late', ['s-idea'], { due_at: at(-30) }), // 2pm Aug 26, a draft saved
	item('i-tonight', ['s-eng'], { due_at: at(3.98) }), // 11:58pm tonight
	item('i-tomorrow-morning', ['s-idea'], { due_at: '2026-08-28T16:00:00.000Z' }), // 9am Fri Aug 28
	item('i-sat', ['s-frc'], { due_at: '2026-08-30T06:59:00.000Z' }), // 11:59pm Sat Aug 29
	item('i-sunday', ['s-idea'], { due_at: '2026-08-31T06:59:00.000Z' }), // 11:59pm Sun Aug 30
	item('i-nextweek', ['s-eng'], { due_at: '2026-09-01T06:59:00.000Z' }), // 11:59pm Mon Aug 31
	item('i-shared', ['s-idea', 's-eng'], { due_at: '2026-09-03T06:59:00.000Z' }), // Wed Sep 2, two classes
	item('i-later', ['s-frc'], { due_at: '2026-09-10T06:59:00.000Z' }),
	item('i-undated', ['s-eng'], { created_at: at(-10) }),
	item('i-submitted', ['s-idea'], { due_at: at(-72) }),
	item('i-returned-unseen', ['s-eng'], { due_at: at(-100) }),
	item('i-returned-seen', ['s-frc'], { due_at: at(-300), viewed_at: at(-150) }),
	item('i-material', ['s-eng'], { kind: 'material', due_at: null }),
	item('i-post', ['s-eng'], { kind: 'post' }),
	item('i-taught', ['s-taught'], { due_at: at(-5) })
];

function sub(item_id: string, over: Partial<FeedSubmission>): FeedSubmission {
	return { item_id, student_email: ME, state: 'draft', submitted_at: null, returned_at: null, graded_at: null, ...over };
}

const SUBMISSIONS: FeedSubmission[] = [
	sub('i-draft-late', { state: 'draft' }),
	sub('i-submitted', { state: 'submitted', submitted_at: at(-80) }),
	sub('i-returned-unseen', { state: 'returned', submitted_at: at(-110), returned_at: at(-5), graded_at: at(-5), score: 18 }),
	sub('i-returned-seen', { state: 'returned', submitted_at: at(-310), returned_at: at(-200), graded_at: at(-200), score: 12 }),
	// Somebody else's row a teacher's read would carry: never this student's work.
	{ item_id: 'i-overdue', student_email: 'bob@boscotech.net', state: 'submitted', submitted_at: at(-20) }
];

function checkIn(session_id: string, section_id: string, session_date: string, status: ClassCheckIn['status']): ClassCheckIn {
	return {
		session_id,
		section_id,
		unit_number: 2,
		session_date,
		session_label: session_id,
		status,
		flag_reason: null,
		item_id: null
	};
}

const CHECK_INS: ClassCheckIn[] = [
	checkIn('c-yesterday', 's-eng', '2026-08-26', 'missing'),
	checkIn('c-today', 's-idea', '2026-08-27', 'missing'),
	checkIn('c-filed', 's-frc', '2026-08-25', 'filed'),
	checkIn('c-flagged', 's-eng', '2026-08-20', 'flagged'),
	checkIn('c-scheduled', 's-eng', '2026-09-02', 'scheduled'),
	checkIn('c-draft-late', 's-idea', '2026-08-24', 'draft'),
	checkIn('c-taught', 's-taught', '2026-08-26', null)
];

function rows(): TodoRow[] {
	return buildTodo({
		sections: SECTIONS,
		items: ITEMS,
		submissions: SUBMISSIONS,
		checkIns: CHECK_INS,
		myEmail: ME,
		isAdmin: false,
		clock: CLOCK
	});
}

const keysOf = (list: TodoRow[]) => list.map((r) => r.key.replace(/^item:/, '').replace(/^check-in:([^:]+):.*$/, '$1'));

// ---------------------------------------------------------------------------

describe('the school calendar reads no clock and names its zone', () => {
	it('the pinned instant is two different days to the school and to UTC (positive control for every case below)', () => {
		expect(laCalendarDay(new Date(NOW))).toBe('2026-08-27');
		expect(new Date(NOW).toISOString().slice(0, 10)).toBe('2026-08-28');
		expect(schoolDayOf('2026-08-28T16:00:00.000Z')).toBe('2026-08-28');
		expect(schoolDayOf('2026-08-28T06:30:00.000Z')).toBe('2026-08-27');
		expect(schoolDayOf(null)).toBeNull();
		expect(schoolDayOf('not a date')).toBeNull();
	});

	it('weeks start on Sunday, in both directions from a Thursday', () => {
		expect(weekOffset('2026-08-23', '2026-08-27')).toBe(0); // Sunday this week
		expect(weekOffset('2026-08-29', '2026-08-27')).toBe(0); // Saturday this week
		expect(weekOffset('2026-08-30', '2026-08-27')).toBe(1); // the next Sunday
		expect(weekOffset('2026-08-22', '2026-08-27')).toBe(-1); // last Saturday
		expect(weekOffset('2026-09-06', '2026-08-27')).toBe(2);
		expect(weekOffset('2026-08-01', '2026-08-27')).toBe(-4);
		// On a Sunday, the school week about to start is this week.
		expect(weekOffset('2026-09-04', '2026-08-30')).toBe(0);
		expect(daysBetween('2026-08-27', '2026-08-28')).toBe(1);
		expect(daysBetween('2026-08-27', '2026-08-26')).toBe(-1);
	});
});

describe('the home feed counts calendar days on the school calendar', () => {
	const soon = (due: string): FeedEntry => ({ reason: 'due-soon', item: item('x', ['s-eng'], { due_at: due }) });
	const now = new Date(NOW);

	it('a 9am deadline tomorrow is "tomorrow" at 8pm Pacific, never "today" (the UTC day)', () => {
		expect(feedIndicator(soon('2026-08-28T16:00:00.000Z'), now)).toBe('Due tomorrow');
		expect(dueUrgency(soon('2026-08-28T16:00:00.000Z'), now)).toBe('imminent');
	});

	it('and a deadline later tonight is still "today" (positive control on the same clock)', () => {
		expect(feedIndicator(soon('2026-08-28T06:30:00.000Z'), now)).toBe('Due today');
		expect(dueUrgency(soon('2026-08-28T06:30:00.000Z'), now)).toBe('today');
	});
});

describe('formatDue prints the school day, no weekday, the same on both sides of hydration', () => {
	it('midnight on the 20th in Los Angeles reads the 20th', () => {
		expect(formatDue('2026-08-20T07:00:00.000Z', '2026-08-27')).toBe('Aug 20, 12:00 AM');
		expect(formatDue('2026-08-28T06:59:00.000Z', '2026-08-27')).toBe('Aug 27, 11:59 PM');
	});

	it('names the year only when it is not this year', () => {
		expect(formatDue('2027-01-05T08:00:00.000Z', '2026-08-27')).toBe('Jan 5, 2027, 12:00 AM');
		expect(formatDue(null)).toBe('No due date');
	});

	it('never names a weekday, across two weeks of deadlines', () => {
		let checked = 0;
		for (let h = 0; h < 14 * 24; h += 7) {
			expect(formatDue(at(h), '2026-08-27')).not.toMatch(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
			checked += 1;
		}
		expect(checked).toBe(48);
	});
});

describe('the row chip asks the one missing predicate', () => {
	const due = (h: number) => ({ kind: 'assignment' as const, due_at: at(h), points: 20 });
	const none: StudentWork | undefined = undefined;
	const draft: StudentWork = { state: 'in-progress', score: null };
	const handedIn: StudentWork = { state: 'submitted', score: null };

	it('past due with nothing turned in is Missing in its own tone, never "Not started"', () => {
		expect(studentWorkChip(due(-12), none, NOW)).toEqual({ label: 'Missing', tone: 'missing', done: false, missing: true });
		expect(studentWorkChip(due(-30), draft, NOW)).toEqual({
			label: 'Missing, draft saved',
			tone: 'missing',
			done: false,
			missing: true
		});
	});

	it('the same assignments before their deadline, and turned in after it, are not (both directions)', () => {
		expect(studentWorkChip(due(4), none, NOW)).toMatchObject({ label: 'Not started', tone: 'muted', missing: false });
		expect(studentWorkChip(due(4), draft, NOW)).toMatchObject({ label: 'In progress', tone: 'attention', missing: false });
		expect(studentWorkChip(due(-12), handedIn, NOW)).toMatchObject({ label: 'Submitted', done: true, missing: false });
		expect(studentWorkChip({ ...due(-12), points: 20 }, { state: 'returned', score: 18 }, NOW)).toMatchObject({
			label: 'Returned · 18/20',
			tone: 'good',
			done: true
		});
	});

	it('with no clock it says only what the work says, never a guess about the deadline', () => {
		expect(studentWorkChip(due(-12), none, null)).toMatchObject({ label: 'Not started', missing: false });
	});

	it('agrees with assignmentStanding on every fixture assignment, both answers counted', () => {
		const work: Record<string, StudentWork> = {
			'i-draft-late': draft,
			'i-submitted': handedIn,
			'i-returned-unseen': { state: 'returned', score: 18 },
			'i-returned-seen': { state: 'returned', score: 12 }
		};
		let missing = 0;
		let notMissing = 0;
		for (const it of ITEMS.filter((i) => i.kind === 'assignment')) {
			const chip = studentWorkChip(it, work[it.id], NOW);
			const standing = assignmentStanding(it, work[it.id], NOW);
			expect(chip.missing, it.id).toBe(standing === 'missing');
			if (chip.missing) missing += 1;
			else notMissing += 1;
		}
		expect([missing, notMissing]).toEqual([6, 11]);
	});
});

describe('buildTodo: what is a row, and under which class', () => {
	it('lists assignments and asked-for check-ins in the classes the student does not teach, and nothing else', () => {
		const list = rows();
		const keys = new Set(keysOf(list));
		// Present: every assignment in a class they take, and four check-ins.
		for (const id of [
			'i-overdue',
			'i-just-past',
			'i-overdue-lastweek',
			'i-overdue-earlier',
			'i-draft-late',
			'i-tonight',
			'i-tomorrow-morning',
			'i-sat',
			'i-sunday',
			'i-nextweek',
			'i-shared',
			'i-later',
			'i-undated',
			'i-submitted',
			'i-returned-unseen',
			'i-returned-seen',
			'c-yesterday',
			'c-today',
			'c-filed',
			'c-flagged',
			'c-draft-late'
		]) {
			expect(keys.has(id), `${id} should be listed`).toBe(true);
		}
		// Absent: a material, an announcement, a class they teach, a check-in not asked for yet.
		for (const id of ['i-material', 'i-post', 'i-taught', 'c-scheduled', 'c-taught']) {
			expect(keys.has(id), `${id} should not be listed`).toBe(false);
		}
		expect(list).toHaveLength(21);
	});

	it('an item posted to two of their classes is one row, under the first in class order', () => {
		const shared = rows().filter((r) => r.key === 'item:i-shared');
		expect(shared).toHaveLength(1);
		expect(shared[0].section.id).toBe('s-eng');
		expect(shared[0].href).toBe('/classroom/s-eng/item/i-shared');
	});

	it('the class filter offers the classes they take, including one with nothing in it, and never one they teach', () => {
		expect(todoSections(SECTIONS, ME, false).map((s) => s.id)).toEqual(['s-eng', 's-frc', 's-idea']);
		expect(sectionManagedBy(S_TAUGHT, 'ALICE@boscotech.net ', false)).toBe(true);
		// An admin manages every class, so an admin's to-do lists nothing.
		expect(todoSections(SECTIONS, ME, true)).toEqual([]);
	});

	it("another student's submission is never read as this student's work", () => {
		const overdue = rows().find((r) => r.key === 'item:i-overdue')!;
		expect(overdue.view).toBe('missing');
		expect(overdue.state).toBe('Missing');
	});
});

describe('todoGroups: the three views, grouped by week, at the pinned instant', () => {
	const list = rows();

	it('Assigned: feedback to read first, then this week, next week, later, and no due date last', () => {
		const groups = todoGroups(list, 'assigned', CLOCK.today);
		expect(groups.map((g) => g.id)).toEqual(['feedback', 'this-week', 'next-week', 'later', 'no-date']);
		expect(groups.map((g) => keysOf(g.rows))).toEqual([
			['i-returned-unseen'],
			['c-flagged', 'c-today', 'i-tonight', 'i-tomorrow-morning', 'i-sat'],
			['i-sunday', 'i-nextweek', 'i-shared'],
			['i-later'],
			['i-undated']
		]);
	});

	it('Missing: newest first, this week, last week, earlier', () => {
		const groups = todoGroups(list, 'missing', CLOCK.today);
		expect(groups.map((g) => g.id)).toEqual(['this-week', 'last-week', 'earlier']);
		expect(groups.map((g) => keysOf(g.rows))).toEqual([
			['i-just-past', 'i-overdue', 'i-draft-late', 'c-yesterday', 'c-draft-late'],
			['i-overdue-lastweek'],
			['i-overdue-earlier']
		]);
		for (const g of groups) for (const r of g.rows) expect(r.tone, r.key).toBe('missing');
	});

	it('Done: by when it was turned in or handed back, most recent first', () => {
		const groups = todoGroups(list, 'done', CLOCK.today);
		expect(groups.map((g) => g.id)).toEqual(['this-week', 'last-week']);
		expect(groups.map((g) => keysOf(g.rows))).toEqual([
			['i-returned-unseen', 'c-filed', 'i-submitted'],
			['i-returned-seen']
		]);
		for (const g of groups) for (const r of g.rows) expect(r.done, r.key).toBe(true);
	});

	it('the views partition the rows: every row is in exactly one of the three', () => {
		const counts = todoViewCounts(list);
		expect(counts).toEqual({ assigned: 10, missing: 7, done: 4 });
		expect(counts.assigned + counts.missing + counts.done).toBe(list.length);
	});

	it('an empty view has no groups, and a class filter narrows every view', () => {
		const frc = rowsForClass(list, 's-frc');
		expect(keysOf(frc).sort()).toEqual(['c-filed', 'i-later', 'i-overdue-earlier', 'i-returned-seen', 'i-sat']);
		expect(todoGroups(rowsForClass(list, 's-frc'), 'assigned', CLOCK.today).map((g) => g.id)).toEqual([
			'this-week',
			'later'
		]);
		expect(todoGroups([], 'missing', CLOCK.today)).toEqual([]);
		expect(rowsForClass(list, null)).toHaveLength(list.length);
	});
});

describe('the counts every door prints are the list, not a second opinion', () => {
	const list = rows();

	it('across every class: missing, due this week (never an undated one), returned to read', () => {
		expect(todoSummary(list, CLOCK.today)).toEqual({ missing: 7, dueThisWeek: 5, feedback: 1 });
		expect(summaryWords(todoSummary(list, CLOCK.today))).toEqual({
			missing: '7 missing',
			dueThisWeek: '5 due this week',
			feedback: '1 returned'
		});
		// Zero is no news.
		expect(summaryWords({ missing: 0, dueThisWeek: 0, feedback: 0 })).toEqual({
			missing: null,
			dueThisWeek: null,
			feedback: null
		});
	});

	it('per class, and the per-class numbers add up to the total', () => {
		expect(todoSummary(list, CLOCK.today, 's-eng')).toEqual({ missing: 3, dueThisWeek: 2, feedback: 1 });
		expect(todoSummary(list, CLOCK.today, 's-idea')).toEqual({ missing: 3, dueThisWeek: 2, feedback: 0 });
		expect(todoSummary(list, CLOCK.today, 's-frc')).toEqual({ missing: 1, dueThisWeek: 1, feedback: 0 });
	});

	it('equal to the groups the page shows: Missing is the Missing view, due this week is the This week group', () => {
		const summary = todoSummary(list, CLOCK.today);
		const missingShown = todoGroups(list, 'missing', CLOCK.today).reduce((n, g) => n + g.rows.length, 0);
		const thisWeek = todoGroups(list, 'assigned', CLOCK.today).find((g) => g.id === 'this-week')!.rows.length;
		expect(summary.missing).toBe(missingShown);
		expect(summary.dueThisWeek).toBe(thisWeek);
	});

	it("the home feed's overdue rows are exactly the to-do's missing assignments", () => {
		const feeds = buildFeed({
			sections: SECTIONS,
			items: ITEMS,
			submissions: SUBMISSIONS,
			myEmail: ME,
			now: new Date(NOW),
			urgentLimit: 100
		});
		const overdue = feeds.flatMap((f) => f.urgent.filter((e) => e.reason === 'overdue').map((e) => e.item.id)).sort();
		const missing = list.filter((r) => r.kind === 'assignment' && r.view === 'missing').map((r) => r.key.slice(5)).sort();
		expect(overdue).toEqual(missing);
		expect(overdue).toHaveLength(5);
	});
});

describe('the words on a row', () => {
	const list = rows();
	const byKey = (id: string) => list.find((r) => keysOf([r])[0] === id)!;

	it('near deadlines say today and tomorrow on the school calendar; the rest print a date', () => {
		expect(todoWhen(byKey('i-tonight'), CLOCK.today)).toBe('Due today, 11:58 PM');
		expect(todoWhen(byKey('i-tomorrow-morning'), CLOCK.today)).toBe('Due tomorrow, 9:00 AM');
		expect(todoWhen(byKey('i-nextweek'), CLOCK.today)).toBe('Due Aug 31, 11:59 PM');
		expect(todoWhen(byKey('c-today'), CLOCK.today)).toBe('Due today');
		expect(todoWhen(byKey('c-yesterday'), CLOCK.today)).toBe('Due yesterday');
		expect(todoWhen(byKey('i-undated'), CLOCK.today)).toBe('No due date');
	});

	it('finished work says when it was turned in or handed back', () => {
		expect(todoWhen(byKey('i-returned-unseen'), CLOCK.today)).toBe('Returned today');
		expect(todoWhen(byKey('i-submitted'), CLOCK.today)).toBe('Turned in Aug 24');
		expect(byKey('i-returned-unseen').state).toBe('Returned · 18/20');
		expect(byKey('i-returned-unseen').feedbackUnread).toBe(true);
		expect(byKey('i-returned-seen').feedbackUnread).toBe(false);
	});

	it('a check-in reads the class page\'s own status words', () => {
		expect(byKey('c-yesterday').state).toBe('Not filed yet');
		expect(byKey('c-draft-late').state).toBe('Draft, not turned in');
		expect(byKey('c-flagged').state).toBe('Needs another look');
		expect(byKey('c-yesterday').href).toBe('/notebook?checkin=c-yesterday&section=s-eng');
	});
});

describe('the route, the doors and the registry', () => {
	it('/classroom/todo is its own place, never a class whose id is "todo"', () => {
		const loc = locateClassroom('/classroom/todo');
		expect(loc).toEqual({ place: 'todo', sectionId: null, itemId: null });
		expect(locateClassroom('/classroom/todo/').place).toBe('todo');
		// Positive control: a real class id still reads as a class.
		expect(locateClassroom('/classroom/s-eng')).toEqual({ place: 'section', sectionId: 's-eng', itemId: null });
		expect(classroomCrumbs(loc)).toEqual([{ label: 'My Classes', href: '/classroom' }, { label: 'To-do' }]);
		expect(classroomMeasure(loc)).toBe('split');
	});

	it('"Open to-do" is a student command that goes to the page, and a manager is not offered it', () => {
		const env = (role: 'student' | 'manager'): CommandEnv => ({
			role,
			surface: 'classroom',
			sectionId: null,
			itemId: null,
			basePath: '/classroom',
			handlers: new Set()
		});
		expect(commandById('go.todo')!.href!(env('student'))).toBe('/classroom/todo');
		expect(runnableCommands(env('student')).map((c) => c.id)).toContain('go.todo');
		expect(runnableCommands(env('manager')).map((c) => c.id)).not.toContain('go.todo');
	});

	it('a view named in a link is honoured and anything else is the default', () => {
		expect(isTodoView('missing')).toBe(true);
		expect(isTodoView('done')).toBe(true);
		expect(isTodoView('everything')).toBe(false);
		expect(isTodoView(null)).toBe(false);
	});
});
