/**
 * THE PER-STUDENT PAGE'S FIXTURE (the 2026-10-07 round), as RAW READS rather
 * than as a finished page: the harness hands these to the real
 * `buildStudentPage`, exactly as the route hands it the real reads, so what the
 * harness measures is the shipping projection and not a hand-shaped copy.
 *
 * It deliberately carries CLASSMATES in the reads that carry the whole class
 * (the notebook grid, the team board), so a projection that leaked one would
 * show it on screen and in the browser pass's absence check. Names are
 * invented; no real student is in this file.
 *
 * Pinned to 2pm on Wednesday 7 October 2026 in Los Angeles.
 */
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import { worksheetKey } from '$lib/classroom/student-work';
import type { Team, TeamBoardResult } from '$lib/classroom/teams';
import type { SectionGrid } from '$lib/notebook-review';
import {
	buildStudentPage,
	parseStudentOverview,
	type StudentPageData,
	type StudentPageInputs
} from '$lib/classroom/student-overview';

export const NOW = '2026-10-07T21:00:00.000Z';
export const TODAY = '2026-10-07';
export const EMAIL = 'ana.reyes@boscotech.net';
export const STUDENT_ID = '00000000-0000-4000-8000-0000000000a1';
/** Classmates who appear in the whole-class reads and must never reach the page. */
export const CLASSMATES = [
	{ email: 'ben.cho@boscotech.net', name: 'Ben Cho' },
	{ email: 'cara.diaz@boscotech.net', name: 'Cara Diaz' },
	{ email: 'dev.patel@boscotech.net', name: 'Dev Patel' }
];

export const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 1',
	block: 'A',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
} as ClassroomSection;

function item(id: string, kind: ClassroomItem['kind'], title: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind,
		title,
		body: '',
		points: kind === 'assignment' ? 20 : null,
		due_at: null,
		category: null,
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		publish_at: null,
		sort_order: 0,
		first_published_at: '2026-09-01T15:00:00Z',
		edited_at: null,
		created_at: '2026-09-01T15:00:00Z',
		updated_at: '2026-09-01T15:00:00Z',
		links: [],
		attachments: [],
		...over
	} as ClassroomItem;
}

export const ITEMS: ClassroomItem[] = [
	item('a-bridge', 'assignment', 'Bridge truss lab', { due_at: '2026-09-20T06:59:00Z' }),
	item('a-gear', 'assignment', 'Gear train worksheet', { due_at: '2026-09-26T06:59:00Z' }),
	item('a-motor', 'assignment', 'Motor sizing', { due_at: '2026-10-02T06:59:00Z' }),
	item('a-safety', 'assignment', 'Shop safety quiz', { due_at: '2026-09-11T06:59:00Z', points: 10 }),
	item('a-cad', 'assignment', 'CAD sketch of the bracket', { due_at: '2026-10-15T06:59:00Z' }),
	item('a-essay', 'assignment', 'Design reflection', { due_at: '2026-10-06T06:59:00Z' }),
	// Taken back to a draft, but it holds their work, so it stays on the page.
	item('a-old', 'assignment', 'Old pulley worksheet', { published: false, due_at: '2026-09-05T06:59:00Z' }),
	// Scheduled ahead and untouched: not asked for yet, so not listed.
	item('a-next', 'assignment', 'Next week build', { publish_at: '2026-10-12T15:00:00Z', due_at: '2026-10-20T06:59:00Z' }),
	item('m-handout', 'material', 'Gearbox handout'),
	item('p-trip', 'post', 'Field trip permission slips')
];

const GRID: SectionGrid = {
	section: { id: 's-1', label: 'Period 1', block: 'A', course_code: 'IDEA209H' } as SectionGrid['section'],
	unit_number: null,
	generated_at: NOW,
	sessions: [
		{ id: 'ns-1', unit_number: 2, session_date: '2026-09-30', session_label: 'Day 14 gear ratios' },
		{ id: 'ns-2', unit_number: 2, session_date: '2026-10-01', session_label: 'Day 15 test rig' },
		{ id: 'ns-3', unit_number: 2, session_date: '2026-10-06', session_label: 'Day 18 motor bench' },
		{ id: 'ns-4', unit_number: 2, session_date: '2026-10-07', session_label: 'Day 19 teardown' },
		{ id: 'ns-5', unit_number: 3, session_date: '2026-10-09', session_label: 'Day 20 next unit' }
	],
	students: [
		{ student_key: EMAIL, id: STUDENT_ID, name: 'Ana Reyes', email: EMAIL, enrolled: true, free_entries: 2 },
		...CLASSMATES.map((c, i) => ({
			student_key: c.email,
			id: `00000000-0000-4000-8000-0000000000b${i}`,
			name: c.name,
			email: c.email,
			enrolled: true,
			free_entries: 0
		}))
	],
	cells: [
		cell(EMAIL, STUDENT_ID, 'ns-1', 'compliant', { on_time: true, entry_id: 'e-1' }),
		cell(EMAIL, STUDENT_ID, 'ns-2', 'compliant', { on_time: false, entry_id: 'e-2' }),
		cell(EMAIL, STUDENT_ID, 'ns-3', 'flagged', { on_time: true, entry_id: 'e-3', flag_reason: 'illegible' }),
		cell(EMAIL, STUDENT_ID, 'ns-4', 'missing'),
		cell(EMAIL, STUDENT_ID, 'ns-5', 'scheduled'),
		...CLASSMATES.flatMap((c, i) =>
			['ns-1', 'ns-2', 'ns-3', 'ns-4', 'ns-5'].map((s) =>
				cell(c.email, `00000000-0000-4000-8000-0000000000b${i}`, s, s === 'ns-5' ? 'scheduled' : 'missing')
			)
		)
	]
};

function cell(
	key: string,
	id: string,
	session: string,
	status: SectionGrid['cells'][number]['status'],
	over: Partial<SectionGrid['cells'][number]> = {}
): SectionGrid['cells'][number] {
	return {
		student_key: key,
		student_id: id,
		session_id: session,
		status,
		entry_id: null,
		entry_count: over.entry_id ? 1 : 0,
		upload_timestamp: over.entry_id ? '2026-10-01T18:00:00Z' : null,
		on_time: null,
		excused: false,
		flag_reason: null,
		...over
	};
}

const BOARD: TeamBoardResult = {
	ok: true,
	manages: true,
	editsReady: true,
	sets: [
		{
			id: 'ts-1',
			label: 'Gearbox build teams',
			seed: '42',
			mode: 'size',
			mode_value: 3,
			created_at: '2026-09-28T16:00:00Z',
			posted_at: '2026-09-28T16:05:00Z',
			visible_until: null,
			showing: true,
			edited_at: '2026-09-29T16:00:00Z',
			edited_by: 'vargas@boscotech.edu',
			teams: [
				team('t-1', 1, 'The Gearheads', [EMAIL, CLASSMATES[0].email, CLASSMATES[1].email]),
				team('t-2', 2, null, [CLASSMATES[2].email])
			]
		},
		{
			id: 'ts-2',
			label: 'Lab partners',
			seed: '7',
			mode: 'count',
			mode_value: 2,
			created_at: '2026-09-08T16:00:00Z',
			posted_at: null,
			visible_until: null,
			showing: false,
			edited_at: null,
			edited_by: null,
			teams: [team('t-3', 1, null, [CLASSMATES[2].email, EMAIL]), team('t-4', 2, 'Sprockets', [CLASSMATES[0].email, CLASSMATES[1].email])]
		}
	]
};

function team(id: string, n: number, name: string | null, emails: string[]): Team {
	return {
		id,
		team_number: n,
		name,
		accent_color: null,
		background_type: null,
		background_value: null,
		badge: null,
		flourish: null,
		tagline: null,
		style_updated_by: null,
		style_updated_at: null,
		mine: false,
		members: emails.map((e) => ({
			student_email: e,
			display_name: e === EMAIL ? 'Ana Reyes' : (CLASSMATES.find((c) => c.email === e)?.name ?? e),
			still_enrolled: true
		}))
	};
}

/** The new read's payload, in the shape the database answers it. */
function overviewPayload(opts: { active: boolean; hasAccount: boolean }): unknown {
	return {
		section_id: 's-1',
		student_email: EMAIL,
		display_name: 'Ana Reyes',
		active: opts.active,
		enrolled_at: '2026-08-14T16:00:00Z',
		has_account: opts.hasAccount,
		user_id: opts.hasAccount ? STUDENT_ID : null,
		at: NOW,
		hall_passes: {
			total: 6,
			limits: { cooldown_minutes: 10, daily_limit: 3 },
			entries: [
				pass('hp-6', '2026-10-07T20:52:00Z', null),
				pass('hp-5', '2026-10-06T18:10:00Z', '2026-10-06T18:16:30Z'),
				pass('hp-4', '2026-10-01T17:40:00Z', '2026-10-01T17:58:10Z', 'vargas@boscotech.edu'),
				pass('hp-3', '2026-09-24T19:05:00Z', '2026-09-24T19:09:00Z'),
				pass('hp-2', '2026-09-17T16:30:00Z', '2026-09-17T16:41:00Z'),
				pass('hp-1', '2026-09-03T21:00:00Z', '2026-09-03T21:03:00Z')
			]
		},
		item_views: [
			{ item_id: 'a-bridge', viewed_at: '2026-09-19T17:00:00Z' },
			{ item_id: 'a-cad', viewed_at: '2026-10-06T18:30:00Z' },
			{ item_id: 'm-handout', viewed_at: '2026-10-02T16:12:00Z' }
		],
		songs: { requested: 3, approved: 1, rejected: 1, pending: 1 },
		coins: {
			balance: 4,
			physical_balance: 3,
			digital_balance: 1,
			total: 5,
			transactions: [
				coin('c-5', 'coin_payout', 'IDEA Coin Payout', 'adjustment', -5, 'digital', 'tr-1', '2026-10-03T19:00:00Z'),
				coin('c-4', 'coin_payout', 'IDEA Coin Payout', 'adjustment', 5, 'physical', 'tr-1', '2026-10-03T19:00:00Z'),
				coin('c-3', 'classmate_trust_violation', 'Classmate Trust Violation', 'fine', -5, 'physical', null, '2026-09-25T18:00:00Z'),
				coin('c-2', 'highest_grade_weekly', 'Highest Grade in Section (Weekly)', 'award', 3, 'physical', null, '2026-09-19T18:00:00Z'),
				coin('c-1', 'quality_desktop_background', 'Quality Desktop Background', 'award', 6, 'digital', null, '2026-09-05T18:00:00Z')
			]
		},
		presence_limits: {
			input_window_seconds: 60,
			away_window_seconds: 120,
			heartbeat_seconds: 30,
			min_gap_seconds: 20,
			retention_days: 90
		}
	};
}

function pass(id: string, opened: string, closed: string | null, by: string | null = null) {
	return {
		pass_id: id,
		student_email: EMAIL,
		student_name: 'Ana Reyes',
		opened_at: opened,
		closed_at: closed,
		closed_by: closed ? EMAIL : null,
		opened_by: by
	};
}

function coin(
	id: string,
	category_id: string,
	category_name: string,
	category_kind: string,
	amount: number,
	medium: string,
	transfer_id: string | null,
	created_at: string
) {
	return { id, category_id, category_name, category_kind, amount, medium, transfer_id, created_at };
}

export type FixtureState = 'full' | 'no-account' | 'unavailable' | 'inactive';

/** The raw reads for one state, before `buildStudentPage`. */
export function fixtureInputs(state: FixtureState): StudentPageInputs {
	const hasAccount = state !== 'no-account';
	const active = state !== 'inactive';
	const overview =
		state === 'unavailable'
			? { state: 'unavailable' as const, value: null }
			: { state: 'ready' as const, value: parseStudentOverview(overviewPayload({ active, hasAccount })) };
	return {
		email: EMAIL,
		roster: { display_name: 'Ana Reyes', active, avatar: null, avatar_url: null },
		items: ITEMS,
		now: NOW,
		overview,
		submissions: [
			{ item_id: 'a-bridge', student_email: EMAIL, state: 'returned', score: 18, submitted_at: '2026-09-19T18:00:00Z', returned_at: '2026-09-22T15:00:00Z', graded_at: '2026-09-22T15:00:00Z' },
			{ item_id: 'a-motor', student_email: EMAIL, state: 'draft', score: null, submitted_at: null, returned_at: null, graded_at: null },
			{ item_id: 'a-essay', student_email: EMAIL, state: 'submitted', score: null, submitted_at: '2026-10-06T19:30:00Z', returned_at: null, graded_at: null },
			{ item_id: 'a-old', student_email: EMAIL, state: 'returned', score: 9, submitted_at: '2026-09-04T18:00:00Z', returned_at: '2026-09-08T15:00:00Z', graded_at: '2026-09-08T15:00:00Z' }
		],
		presence: hasAccount
			? [
					{ item_id: 'a-bridge', last_input_at: '2026-09-19T17:55:00Z', active_seconds: 4800 },
					{ item_id: 'a-gear', last_input_at: '2026-09-26T18:00:00Z', active_seconds: 2700 },
					{ item_id: 'a-motor', last_input_at: '2026-10-01T18:20:00Z', active_seconds: 900 },
					{ item_id: 'a-essay', last_input_at: '2026-10-06T19:25:00Z', active_seconds: 1500 }
				]
			: [],
		completions: hasAccount ? new Map([[worksheetKey('a-gear', EMAIL), '2026-09-26T18:00:00Z']]) : new Map(),
		grid: { state: 'ready', value: GRID },
		streak: hasAccount ? 2 : 0,
		entriesFiled: hasAccount ? 5 : 0,
		board: BOARD,
		ideacad: hasAccount
			? [
					{ id: 'doc-1', item_id: 'a-cad', title: 'Bracket v2', updated_at: '2026-10-06T18:40:00Z', archived_at: null },
					{ id: 'doc-2', item_id: 'a-gear', title: null, updated_at: '2026-09-25T18:00:00Z', archived_at: '2026-09-30T18:00:00Z' }
				]
			: [],
		foundry: hasAccount ? [{ id: 'app-1', slug: 'gear-calculator', title: 'Gear Calculator' }] : []
	};
}

export function fixturePage(state: FixtureState): StudentPageData {
	return buildStudentPage(fixtureInputs(state));
}

export function fixtureState(raw: string | null): FixtureState {
	return raw === 'no-account' || raw === 'unavailable' || raw === 'inactive' ? raw : 'full';
}
