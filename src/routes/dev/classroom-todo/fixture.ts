/**
 * Fixture for /dev/classroom-todo: a student's to-do across three classes
 * (ledger 0297), on the REAL ClassroomShell, the REAL TodoPage and the REAL
 * MyClasses.
 *
 * EVERY STANDING THE PAGE CAN SHOW IS HERE ON PURPOSE: an assignment overdue
 * with nothing turned in, one overdue with a draft saved, one due later
 * tonight, one due tomorrow morning, one due next week, one later, one with no
 * due date, one turned in, one handed back with a grade the student has not
 * opened, one handed back and read, and notebook check-ins owed yesterday,
 * owed today, flagged, filed and not asked for yet. A material and a class the
 * student teaches are here too, as the two things that must NOT be listed.
 *
 * ONE CLOCK, AT THE INSTANT WHERE THE TWO CALENDARS DISAGREE: 8pm Pacific on
 * Thursday 2026-08-27, which is 03:00 UTC on the 28th. The page reads no other
 * clock, so what it shows is the same whatever day the harness is opened on,
 * and a deadline at 9am Pacific on the 28th must read "Due tomorrow".
 */
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { FeedSubmission } from '$lib/classroom/feed';

export const BASE = '/dev/classroom-todo';

export const CLOCK = { now: '2026-08-28T03:00:00.000Z', today: '2026-08-27' };

export const ME = 'alice.alvarez@boscotech.net';
const TEACHER = 'vargas@boscotech.edu';

function section(id: string, code: string, title: string, label: string, block: string, teacher = TEACHER): ClassroomSection {
	return {
		id,
		course_id: `c-${id}`,
		label,
		block,
		teacher_email: teacher,
		active: true,
		course: { id: `c-${id}`, code, title, active: true }
	};
}

export const SECTIONS: ClassroomSection[] = [
	section('s-eng', 'ENG1H', 'Engineering 1 Honors', 'Period 2', 'B'),
	section('s-frc', 'FRC', 'FRC Robotics', 'Period 7', 'G'),
	section('s-idea', 'IDEA209H', 'Design and Fabrication', 'Period 5', 'E'),
	// A class this student TEACHES (a student aide): nothing in it is theirs to do.
	section('s-aide', 'IDEA100', 'Intro to Engineering Design', 'Period 1', 'A', ME)
];

/** An instant relative to the clock, in hours. */
function at(hours: number): string {
	return new Date(Date.parse(CLOCK.now) + hours * 3_600_000).toISOString();
}

function item(id: string, title: string, sectionIds: string[], over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'assignment',
		title,
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
		instructorAttachments: [],
		instructorLinks: [],
		...over
	};
}

export const ITEMS: ClassroomItem[] = [
	item('i-truss', 'Truss sketch', ['s-eng'], { due_at: at(-12) }),
	item('i-gears', 'Gear ratio worksheet', ['s-idea'], { due_at: '2026-08-20T06:59:00.000Z' }),
	item('i-safety', 'Shop safety quiz', ['s-frc'], { due_at: '2026-08-01T06:59:00.000Z' }),
	item('i-bracket', 'Bracket redesign', ['s-idea'], { due_at: at(-30) }),
	item('i-loadlog', 'Load test log', ['s-eng'], { due_at: at(3.98) }),
	item('i-cad', 'CAD model of the gripper', ['s-idea'], { due_at: '2026-08-28T16:00:00.000Z' }),
	item('i-scout', 'Scouting sheet', ['s-frc'], { due_at: '2026-08-30T06:59:00.000Z' }),
	item('i-beam', 'Beam deflection lab', ['s-eng'], { due_at: '2026-09-01T06:59:00.000Z' }),
	item('i-portfolio', 'Portfolio page: design decisions', ['s-idea', 's-eng'], { due_at: '2026-09-03T06:59:00.000Z' }),
	item('i-drivetrain', 'Drivetrain report', ['s-frc'], { due_at: '2026-09-10T06:59:00.000Z' }),
	item('i-reflection', 'Design reflection', ['s-eng'], { created_at: at(-10) }),
	item('i-photos', 'Bridge photos', ['s-idea'], { due_at: at(-72) }),
	item('i-materials', 'Material ID checkpoint', ['s-eng'], { due_at: at(-100) }),
	item('i-bumpers', 'Bumper build log', ['s-frc'], { due_at: at(-300), viewed_at: at(-150) }),
	item('i-syllabus', 'Syllabus', ['s-eng'], { kind: 'material' }),
	item('i-aide', 'Grade the warm-up', ['s-aide'], { due_at: at(-5) })
];

function sub(item_id: string, over: Partial<FeedSubmission>): FeedSubmission {
	return { item_id, student_email: ME, state: 'draft', submitted_at: null, returned_at: null, graded_at: null, ...over };
}

export const SUBMISSIONS: FeedSubmission[] = [
	sub('i-bracket', { state: 'draft' }),
	sub('i-photos', { state: 'submitted', submitted_at: at(-80) }),
	sub('i-materials', { state: 'returned', submitted_at: at(-110), returned_at: at(-5), graded_at: at(-5), score: 18 }),
	sub('i-bumpers', { state: 'returned', submitted_at: at(-310), returned_at: at(-200), graded_at: at(-200), score: 12 })
];

function checkIn(session_id: string, label: string, section_id: string, session_date: string, status: ClassCheckIn['status']): ClassCheckIn {
	return {
		session_id,
		section_id,
		unit_number: 2,
		session_date,
		session_label: label,
		status,
		flag_reason: null,
		item_id: null
	};
}

export const CHECK_INS: ClassCheckIn[] = [
	checkIn('ns-12', 'Day 12 sketches', 's-eng', '2026-08-26', 'missing'),
	checkIn('ns-13', 'Day 13 load test', 's-idea', '2026-08-27', 'missing'),
	checkIn('ns-11', 'Day 11 truss', 's-frc', '2026-08-25', 'filed'),
	checkIn('ns-9', 'Day 9 bridge fit', 's-eng', '2026-08-20', 'flagged'),
	checkIn('ns-14', 'Day 14 bridge fit', 's-eng', '2026-09-02', 'scheduled'),
	checkIn('ns-10', 'Day 10 bracket', 's-idea', '2026-08-24', 'draft')
];
