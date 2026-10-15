/**
 * Fixtures for the student harnesses (ledger 0391): one full package
 * (MILL-1, every part exercised), the catalog it sits in, `cert_get` payloads
 * for each state the certification page can be in, and the payloads of My
 * certifications, the holders board, the verify page and the notifications.
 * Every date is pinned so a render is the same twice; `FAR_FUTURE` is what a
 * live cooldown or an unexpired award needs.
 */
import type {
	CertAttemptJson,
	CertCheckJson,
	CertGetJson,
	CertMeJson,
	CertNotification,
	CertPackage,
	CertSettings,
	CertSummary,
	HoldersJson,
	SignedPayload
} from '$lib/certifications/types';
import type { VerifyRecord } from '$lib/certifications/student/verify';

export const NOW = '2026-10-15T17:30:00Z';
export const FAR_FUTURE = '2031-06-01T19:00:00Z';

export const SETTINGS: CertSettings = {
	school_year_expiry: '2027-08-16',
	dormancy_days: 60,
	checkin_timeout_seconds: 60,
	release_window_minutes: 10
};

export const CERT_ID = '7d3d4b64-1a0c-4b0e-9a40-5a4f4a0b1c01';
export const ATTEMPT_ID = '2f1a9c5e-7b3d-4e2a-8c1f-0d9e8b7a6c02';
export const LESSON_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03';
export const SEAT_ID = '6c5b4a39-2817-4f0e-9d8c-7b6a5f4e3d04';
export const SITTING_ID = '0f1e2d3c-4b5a-4968-8776-655443322105';
export const EXAM_ID = '9e8d7c6b-5a49-4382-9170-8f7e6d5c4b06';

export const PACKAGE: CertPackage = {
	format: 'idea-certification',
	version: 1,
	code: 'MILL-1',
	name: 'Manual Mill Level 1',
	level: 1,
	category: 'Machining',
	sort_order: 10,
	renewal: 'never',
	definition:
		'You can set up and run the manual mill alone: tram the head, square stock in the vise, locate an edge, and face, slot and drill to a drawing within 0.005 in. You read the drawing, pick the speeds and feeds, and leave the machine clean.',
	allows: 'Run the manual mill without a certifier in the room, on steel, aluminum and plastics, with the end mills and drills in the shop drawer.',
	does_not_allow: 'Fly cutting, boring heads, indexable tooling, or any job over 6 in of travel. Those are MILL-2.',
	prerequisites: ['SAFE-1'],
	parts: { guided: true, exam: true, autonomous: true, checkout: true },
	training: {
		items: [
			{ kind: 'video', key: 'yt:dQw4w9WgXcQ', title: 'Part 1: the vise, parallels and squaring stock', youtube_id: 'dQw4w9WgXcQ', start: 0 },
			{ kind: 'lesson', key: 'lesson:speeds', title: 'Speeds and feeds, worked by hand', slug: 'speeds' },
			{ kind: 'video', key: 'yt:9bZkp7q19f0', title: 'Part 2: edge finding and the first cut', youtube_id: '9bZkp7q19f0', start: 42 }
		],
		quick_checks: [
			{
				id: 'qc-vise',
				after: 'yt:dQw4w9WgXcQ',
				prompt: 'Which vise jaw is the one you square the stock against?',
				options: ['The moving jaw, nearest you', 'The fixed jaw, at the back'],
				answer: 1,
				explain: 'The fixed jaw is machined parallel to the table travel. The moving jaw only holds.'
			},
			{
				id: 'qc-rpm',
				after: 'lesson:speeds',
				prompt: 'Doubling the cutter diameter at the same surface speed does what to the RPM?',
				options: ['Doubles it', 'Halves it', 'Leaves it alone'],
				answer: 1,
				explain: 'RPM = SFM x 3.82 / diameter. A bigger cutter turns slower for the same surface speed.'
			}
		]
	},
	practice_quiz: [
		{ id: 'pq-1', prompt: 'A 1/2 in HSS end mill in 6061 aluminum at 300 SFM runs at about', options: ['600 RPM', '1,150 RPM', '2,300 RPM', '4,600 RPM'], answer: 2, explain: '300 x 3.82 / 0.5 is about 2,292 RPM.' },
		{ id: 'pq-2', prompt: 'Climb milling feeds the work', options: ['Against the cutter rotation', 'With the cutter rotation', 'Straight down'], answer: 1, explain: 'Climb milling moves the table the same direction the cutter teeth travel at the cut.' },
		{ id: 'pq-3', prompt: 'Before switching the spindle on you', options: ['Lock the quill', 'Clear the table and check the vise handle is off', 'Open the coolant valve'], answer: 1, explain: 'The vise handle is the one thing on the table that will fly.' }
	],
	study_guide:
		'# Manual Mill Level 1 study guide\n\nThis guide is thorough enough that a student who masters it passes the exam easily.\n\n## Workholding\n\nStock is squared against the **fixed jaw**. Parallels lift the work so the cut never reaches the vise.\n\n## Speeds and feeds\n\n- RPM = SFM x 3.82 / diameter\n- Chip load per tooth times teeth times RPM is the feed\n\n## Finishing\n\nDeburr every edge. Measure every dimension on the drawing before you call it done.',
	common_mistakes: [
		{ title: 'Leaving the vise handle on', body: 'The spindle starts, the table moves, and the handle meets the cutter. Take it off every time, even for a moment.' },
		{ title: 'Trusting the dial without a tram', body: 'A head that is 0.002 in out trams a step into every face you cut. Check it before the first cut of the day.' }
	],
	exam: {
		time_limit_minutes: 30,
		questions_per_exam: 20,
		topics: [
			{ id: 'setup', name: 'Workholding and setup', minimum: 4 },
			{ id: 'speeds', name: 'Speeds and feeds', minimum: 4 },
			{ id: 'safety', name: 'Safety at the mill', minimum: 4 },
			{ id: 'measure', name: 'Measurement and finishing', minimum: 3 }
		]
	},
	guided_project: {
		objective: 'Machine the stepped block on drawing MILL-1-G from 1 x 2 x 3 in aluminum stock, following the steps.',
		spec: 'Face all six sides square to 0.002 in, cut the 0.500 in step to depth within 0.005 in, drill and ream the two 0.250 in holes on the pattern.\n\n**Acceptance** is every dimension on the drawing within tolerance and every edge deburred.',
		acceptance: ['Six faces square to 0.002 in', 'Step depth 0.500 in within 0.005 in', 'Two 0.250 in holes on the drawing pattern', 'Every edge deburred'],
		references: [
			{ label: 'Drawing MILL-1-G (PDF)', href: 'https://ideabosco.com/materials/mill-1-g.pdf' },
			{ label: 'Speeds and feeds card', href: 'https://ideabosco.com/materials/speeds-card.pdf' }
		],
		steps: [
			{ title: 'Square the stock', body: 'Set the parallels, seat the stock against the fixed jaw, tap it down with the dead blow, and face the top. Flip against the fixed jaw and repeat for each face.', fade: 'full' },
			{ title: 'Locate the edges', body: 'Find the left and front edges with the edge finder and zero the dials.', fade: 'full' },
			{ title: 'Cut the step', body: 'Bring the step to 0.500 in deep, 1.000 in wide, in no more than 0.100 in passes.', fade: 'goal', hint: 'Climb mill the last pass for the finish, and take it at half depth.' },
			{ title: 'Drill and ream the holes', body: '', fade: 'hint', hint: 'A reamer only trues a hole that is already within 0.010 in. Think about what drill size leaves that.' },
			{ title: 'Deburr and measure', body: '', fade: 'hint', hint: 'Every dimension on the drawing, written down, before you call it done.' }
		],
		self_inspection: ['I measured every dimension on the drawing', 'I deburred every edge', 'The machine and the vise are clean'],
		evidence: [
			{ kind: 'photo', label: 'The finished block beside the drawing', required: true },
			{ kind: 'text', label: 'Your measured dimensions, one per line', required: true },
			{ kind: 'youtube', label: 'A short clip of the last pass', required: false }
		]
	},
	autonomous_project: {
		objective: 'Machine the fixture plate on drawing MILL-1-A, alone, from the stock you are handed.',
		spec: 'Drawing MILL-1-A: a 0.750 in plate with a 1.250 in pocket and four tapped holes. Every dimension within tolerance, every edge deburred, nothing else said.',
		acceptance: ['Pocket depth and width within 0.005 in', 'Four holes tapped square', 'Every edge deburred'],
		references: [{ label: 'Drawing MILL-1-A (PDF)', href: 'https://ideabosco.com/materials/mill-1-a.pdf' }],
		self_inspection: ['I did this alone, with no help of any kind', 'I measured every dimension on the drawing'],
		evidence: [
			{ kind: 'photo', label: 'The finished plate, both faces', required: true },
			{ kind: 'file', label: 'Your inspection sheet', required: false }
		]
	},
	checkout: {
		card: '## What the checkout shows\n\nFrom bare stock to a faced, squared block with one located hole, start to finish, with no help. The certifier watches for the vise handle, the tram check and the speeds you pick.',
		filming_guide:
			'One continuous, unedited take. The camera sees your hands, the vise and the spindle. Say the RPM you chose out loud. Upload to YouTube as **unlisted** and paste the link.'
	}
};

const PKG_SAFE: Pick<CertSummary, 'definition' | 'allows' | 'does_not_allow'> = {
	definition: 'You know the shop rules, where every stop is, and what to do when something goes wrong.',
	allows: 'Be in the shop during open hours and use the hand tools.',
	does_not_allow: 'Run any machine without its own certification.'
};

const summary = (over: Partial<CertSummary> & Pick<CertSummary, 'id' | 'code' | 'name' | 'level' | 'category' | 'sort_order'>): CertSummary => ({
	renewal: 'never',
	...PKG_SAFE,
	parts: { guided: true, exam: true, autonomous: true, checkout: true },
	prerequisites: [],
	holders_count: 0,
	avg_completion_days: null,
	my: { state: 'none', attempt_id: null, held: false, expired: false },
	...over
});

/** The catalog a student mid-way through MILL-1 sees. */
export const CATALOG: CertSummary[] = [
	summary({
		id: '11111111-1111-4111-8111-111111111111',
		code: 'SAFE-1',
		name: 'Shop Safety',
		level: 1,
		category: 'Safety',
		sort_order: 1,
		renewal: 'school_year',
		parts: { guided: false, exam: true, autonomous: false, checkout: false },
		holders_count: 48,
		avg_completion_days: 3,
		my: { state: 'complete', attempt_id: 'aaaaaaaa-1111-4111-8111-111111111111', held: true, expired: false }
	}),
	summary({
		id: CERT_ID,
		code: 'MILL-1',
		name: PACKAGE.name,
		level: 1,
		category: 'Machining',
		sort_order: 10,
		definition: PACKAGE.definition,
		allows: PACKAGE.allows,
		does_not_allow: PACKAGE.does_not_allow,
		prerequisites: [{ code: 'SAFE-1', name: 'Shop Safety', held: true }],
		holders_count: 12,
		avg_completion_days: 21,
		my: { state: 'active', attempt_id: ATTEMPT_ID, held: false, expired: false }
	}),
	summary({
		id: '22222222-2222-4222-8222-222222222222',
		code: 'MILL-2',
		name: 'Manual Mill Level 2',
		level: 2,
		category: 'Machining',
		sort_order: 11,
		prerequisites: [{ code: 'MILL-1', name: PACKAGE.name, held: false }],
		holders_count: 3,
		avg_completion_days: null
	}),
	summary({
		id: '33333333-3333-4333-8333-333333333333',
		code: 'LATHE-1',
		name: 'Engine Lathe Level 1',
		level: 1,
		category: 'Machining',
		sort_order: 20,
		prerequisites: [{ code: 'SAFE-1', name: 'Shop Safety', held: true }],
		holders_count: 7,
		avg_completion_days: 18
	}),
	summary({
		id: '44444444-4444-4444-8444-444444444444',
		code: 'PROG-1',
		name: 'Robot Programming Level 1',
		level: 1,
		category: 'Software',
		sort_order: 30,
		parts: { guided: true, exam: true, autonomous: true, checkout: false },
		holders_count: 15,
		avg_completion_days: 30,
		my: { state: 'withdrawn', attempt_id: 'bbbbbbbb-2222-4222-8222-222222222222', held: false, expired: false }
	}),
	summary({
		id: '55555555-5555-4555-8555-555555555555',
		code: 'CAD-1',
		name: 'CAD Modeling Level 1',
		level: 1,
		category: 'Software',
		sort_order: 31,
		parts: { guided: true, exam: true, autonomous: true, checkout: false },
		holders_count: 22,
		avg_completion_days: 14,
		my: { state: 'dormant', attempt_id: 'cccccccc-3333-4333-8333-333333333333', held: false, expired: false }
	}),
	summary({
		id: '66666666-6666-4666-8666-666666666666',
		code: 'SCOUT-1',
		name: 'Match Scouting',
		level: 1,
		category: 'Team roles',
		sort_order: 40,
		parts: { guided: true, exam: false, autonomous: true, checkout: false },
		holders_count: 9,
		avg_completion_days: 9,
		my: { state: 'complete', attempt_id: 'dddddddd-4444-4444-8444-444444444444', held: true, expired: false }
	})
];

/** The same catalog for somebody who holds nothing: every prerequisite missing, nothing started. */
export const CATALOG_LOCKED: CertSummary[] = CATALOG.map((c) => ({
	...c,
	prerequisites: c.prerequisites.map((p) => ({ ...p, held: false })),
	my: { state: 'none', attempt_id: null, held: false, expired: false }
}));

export const SERIALS: Record<string, string> = { 'SAFE-1': 'IDEA-7K3Q-M9XD-2HTR-W4PB', 'SCOUT-1': 'IDEA-0A1B-2C3D-4E5F-6G7H' };

export type PageState = 'fresh' | 'training' | 'guided' | 'exam' | 'review' | 'cooldown' | 'complete';
export const PAGE_STATES: PageState[] = ['fresh', 'training', 'guided', 'exam', 'review', 'cooldown', 'complete'];

const check = (part: CertCheckJson['part'], state: CertCheckJson['state'], by: string | null = null, at: string | null = null): CertCheckJson => ({
	part,
	state,
	checked_by_name: by,
	checked_at: at,
	note: null
});

const baseAttempt = (checks: CertCheckJson[], over: Partial<CertAttemptJson> = {}): CertAttemptJson => ({
	id: ATTEMPT_ID,
	certification: { id: CERT_ID, code: 'MILL-1', name: PACKAGE.name, level: 1, category: 'Machining' },
	revision_id: 'rev-0000-0001',
	email: 'ana.reyes@boscotech.net',
	state: 'active',
	started_at: '2026-09-28T16:05:00Z',
	finished_at: null,
	withdrawn_at: null,
	dormant_at: null,
	last_activity_at: '2026-10-14T22:10:00Z',
	parts: PACKAGE.parts,
	checks,
	next_part: checks.find((c) => c.state === 'pending')?.part ?? null,
	submissions: [],
	exams: [],
	cooldown_until: null,
	seat: null,
	award: null,
	...over
});

const baseGet = (over: Partial<CertGetJson>): CertGetJson => ({
	...(CATALOG[1] as CertSummary),
	state: 'published',
	revision_id: 'rev-0000-0001',
	package: PACKAGE,
	lessons: [{ id: LESSON_ID, slug: 'speeds', title: 'Speeds and feeds, worked by hand' }],
	my_attempt: null,
	my_training: [],
	cooldown_until: null,
	seat: null,
	sittings: [
		{
			id: SITTING_ID,
			starts_at: '2026-10-22T22:30:00Z',
			ends_at: '2026-10-23T00:00:00Z',
			seat_limit: 6,
			seats_taken: 2,
			location: 'Room 112',
			note: 'Bring your drawing.',
			certification: null,
			state: 'open'
		},
		{
			id: '0f1e2d3c-4b5a-4968-8776-655443322106',
			starts_at: '2026-10-29T22:30:00Z',
			ends_at: '2026-10-30T00:00:00Z',
			seat_limit: 4,
			seats_taken: 4,
			location: 'Room 112',
			note: null,
			certification: { code: 'MILL-1', name: PACKAGE.name },
			state: 'open'
		}
	],
	...over
});

const PENDING_ALL: CertCheckJson[] = [check('training', 'pending'), check('guided', 'pending'), check('exam', 'pending'), check('autonomous', 'pending'), check('checkout', 'pending')];

/** `cert_get` for each state of the page. */
export function certFor(state: PageState): CertGetJson {
	switch (state) {
		case 'fresh':
			return baseGet({ my: { state: 'none', attempt_id: null, held: false, expired: false }, my_attempt: null });
		case 'training':
			return baseGet({
				my_attempt: baseAttempt(PENDING_ALL),
				my_training: [
					{ item_key: 'yt:dQw4w9WgXcQ', covered_seconds: 612, duration_seconds: 640, completed_at: '2026-10-01T17:00:00Z' },
					{ item_key: 'lesson:speeds', covered_seconds: 0, duration_seconds: null, completed_at: null },
					{ item_key: 'yt:9bZkp7q19f0', covered_seconds: 250, duration_seconds: 580, completed_at: null }
				]
			});
		case 'guided':
			return baseGet({
				my_attempt: baseAttempt([check('training', 'done', 'system', '2026-10-03T17:00:00Z'), ...PENDING_ALL.slice(1)]),
				my_training: PACKAGE.training.items.map((i) => ({ item_key: i.key, covered_seconds: 600, duration_seconds: i.kind === 'video' ? 620 : null, completed_at: '2026-10-03T17:00:00Z' }))
			});
		case 'review':
			return baseGet({
				my_attempt: baseAttempt([check('training', 'done', 'system', '2026-10-03T17:00:00Z'), ...PENDING_ALL.slice(1)], {
					submissions: [
						{
							id: 'sub-0001',
							part: 'guided',
							state: 'failed',
							in_person: false,
							submitted_at: '2026-10-06T21:40:00Z',
							decided_at: '2026-10-07T16:15:00Z',
							evidence: {
								text: 'Length 2.998\nWidth 1.001\nStep 0.512',
								links: [],
								youtube_id: null,
								files: [{ path: `${ATTEMPT_ID}/f1.jpg`, name: 'block-front.jpg', size: 1_204_112 }]
							},
							self_inspection: [{ item: 'I measured every dimension on the drawing', checked: true }],
							review: {
								decision: 'fail',
								feedback: 'The step is 0.012 in deep, which is outside the 0.005 in tolerance. Your passes were too deep at the end; take the last one at half depth and measure before the final pass. Everything else is right. Resubmit when the step is in.',
								reviewer_name: 'Mr. Pina',
								reviewed_at: '2026-10-07T16:15:00Z'
							}
						},
						{
							id: 'sub-0002',
							part: 'guided',
							state: 'pending',
							in_person: false,
							submitted_at: '2026-10-14T22:10:00Z',
							decided_at: null,
							evidence: {
								text: 'Length 2.999\nWidth 1.000\nStep 0.503',
								links: [],
								youtube_id: 'dQw4w9WgXcQ',
								files: [{ path: `${ATTEMPT_ID}/f2.jpg`, name: 'block-second.jpg', size: 980_004 }]
							},
							self_inspection: [{ item: 'I measured every dimension on the drawing', checked: true }],
							review: null
						}
					]
				}),
				my_training: PACKAGE.training.items.map((i) => ({ item_key: i.key, covered_seconds: 600, duration_seconds: i.kind === 'video' ? 620 : null, completed_at: '2026-10-03T17:00:00Z' }))
			});
		case 'exam':
			return baseGet({
				my_attempt: baseAttempt(
					[check('training', 'done', 'system', '2026-10-03T17:00:00Z'), check('guided', 'done', 'Mr. Pina', '2026-10-08T16:00:00Z'), ...PENDING_ALL.slice(2)],
					{
						seat: { id: SEAT_ID, state: 'booked', sitting_id: SITTING_ID, scheduled_at: '2026-10-22T22:30:00Z', requested_at: '2026-10-09T15:00:00Z', decision_note: null },
						exams: [{ id: EXAM_ID, state: 'released', released_at: '2026-10-15T17:25:00Z', started_at: null, submitted_at: null, passed: null, missed_topics: [], flags_count: 0 }]
					}
				),
				seat: { id: SEAT_ID, state: 'booked', sitting_id: SITTING_ID, scheduled_at: '2026-10-22T22:30:00Z', requested_at: '2026-10-09T15:00:00Z', decision_note: null }
			});
		case 'cooldown':
			return baseGet({
				cooldown_until: FAR_FUTURE,
				my_attempt: baseAttempt(
					[check('training', 'done', 'system', '2026-10-03T17:00:00Z'), check('guided', 'done', 'Mr. Pina', '2026-10-08T16:00:00Z'), ...PENDING_ALL.slice(2)],
					{
						cooldown_until: FAR_FUTURE,
						exams: [
							{ id: EXAM_ID, state: 'submitted', released_at: '2026-10-13T22:00:00Z', started_at: '2026-10-13T22:02:00Z', submitted_at: '2026-10-13T22:28:00Z', passed: false, missed_topics: ['speeds', 'measure'], flags_count: 1 }
						]
					}
				)
			});
		case 'complete':
			return baseGet({
				my: { state: 'complete', attempt_id: ATTEMPT_ID, held: true, expired: false },
				my_attempt: baseAttempt(
					[
						check('training', 'done', 'system', '2026-10-03T17:00:00Z'),
						check('guided', 'done', 'Mr. Pina', '2026-10-08T16:00:00Z'),
						check('exam', 'done', 'Mr. Pina', '2026-10-22T23:10:00Z'),
						check('autonomous', 'done', 'Mr. Pina', '2026-11-03T18:00:00Z'),
						check('checkout', 'done', 'Mr. Pina', '2026-11-05T21:00:00Z')
					],
					{
						state: 'complete',
						finished_at: '2026-11-05T21:30:00Z',
						exams: [{ id: EXAM_ID, state: 'submitted', released_at: '2026-10-22T22:40:00Z', started_at: '2026-10-22T22:41:00Z', submitted_at: '2026-10-22T23:08:00Z', passed: true, missed_topics: [], flags_count: 0 }],
						award: { serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB', awarded_at: '2026-11-05T21:30:00Z', expires_at: null, status: 'valid' }
					}
				)
			});
	}
}

export const PAYLOAD: SignedPayload = {
	v: 1,
	serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB',
	code: 'MILL-1',
	level: 1,
	holder_name: 'Ana Reyes',
	email_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
	awarded_at: '2026-11-05T21:30:00Z',
	certifier_name: 'Mr. Pina'
};

export const VERIFY_RECORD: VerifyRecord = {
	holder_name: 'Ana Reyes',
	code: 'MILL-1',
	name: PACKAGE.name,
	level: 1,
	category: 'Machining',
	awarded_at: '2026-11-05T21:30:00Z',
	awarded_by_name: 'Mr. Pina',
	expires_at: null,
	status: 'valid',
	signature: 'c2lnbmF0dXJlLWZpeHR1cmUtNjQtYnl0ZXMtbG9uZy1iYXNlNjQtZm9yLXRoZS1oYXJuZXNz',
	signed_payload: PAYLOAD,
	key_id: 'a1b2c3d4'
};

export const ME: CertMeJson = {
	attempts: [
		certFor('guided').my_attempt as CertAttemptJson,
		{
			...(baseAttempt(PENDING_ALL) as CertAttemptJson),
			id: 'cccccccc-3333-4333-8333-333333333333',
			certification: { id: '55555555-5555-4555-8555-555555555555', code: 'CAD-1', name: 'CAD Modeling Level 1', level: 1, category: 'Software' },
			state: 'dormant',
			dormant_at: '2026-10-01T07:00:00Z',
			started_at: '2026-07-20T16:00:00Z',
			parts: { guided: true, exam: true, autonomous: true, checkout: false }
		},
		{
			...(baseAttempt(PENDING_ALL) as CertAttemptJson),
			id: 'bbbbbbbb-2222-4222-8222-222222222222',
			certification: { id: '44444444-4444-4444-8444-444444444444', code: 'PROG-1', name: 'Robot Programming Level 1', level: 1, category: 'Software' },
			state: 'withdrawn',
			withdrawn_at: '2026-09-12T20:00:00Z',
			started_at: '2026-08-30T16:00:00Z'
		}
	],
	awards: [
		{
			id: 'aw-safe',
			serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB',
			code: 'SAFE-1',
			name: 'Shop Safety',
			level: 1,
			category: 'Safety',
			awarded_at: '2026-08-20T16:00:00Z',
			awarded_by_name: 'Mr. Pina',
			expires_at: '2027-08-16T07:00:00Z',
			status: 'valid',
			revision_id: 'rev-safe-1'
		},
		{
			id: 'aw-scout',
			serial: 'IDEA-0A1B-2C3D-4E5F-6G7H',
			code: 'SCOUT-1',
			name: 'Match Scouting',
			level: 1,
			category: 'Team roles',
			awarded_at: '2026-03-02T18:00:00Z',
			awarded_by_name: 'Mr. Pina',
			expires_at: null,
			status: 'valid',
			revision_id: 'rev-scout-1'
		},
		{
			id: 'aw-safe-old',
			serial: 'IDEA-ZZZZ-YYYY-XXXX-WWWW',
			code: 'SAFE-1',
			name: 'Shop Safety',
			level: 1,
			category: 'Safety',
			awarded_at: '2025-08-21T16:00:00Z',
			awarded_by_name: 'Mr. Pina',
			expires_at: '2026-08-17T07:00:00Z',
			status: 'expired',
			revision_id: 'rev-safe-0'
		}
	],
	notifications_unread: 2
};

export const HOLDERS: HoldersJson = {
	by_certification: [
		{
			code: 'SAFE-1',
			name: 'Shop Safety',
			level: 1,
			category: 'Safety',
			holders: [
				{ name: 'Ana Reyes', awarded_at: '2026-08-20T16:00:00Z', status: 'valid' },
				{ name: 'Ben Okafor', awarded_at: '2026-08-20T16:10:00Z', status: 'valid' },
				{ name: 'Maria Lopez', awarded_at: '2026-08-21T16:00:00Z', status: 'suspended' },
				{ name: 'Jordan Vance', awarded_at: '2025-08-21T16:00:00Z', status: 'expired' }
			]
		},
		{
			code: 'MILL-1',
			name: PACKAGE.name,
			level: 1,
			category: 'Machining',
			holders: [
				{ name: 'Ben Okafor', awarded_at: '2026-09-30T21:00:00Z', status: 'valid' },
				{ name: 'Priya Natarajan', awarded_at: '2026-10-02T21:00:00Z', status: 'valid' }
			]
		},
		{
			code: 'SCOUT-1',
			name: 'Match Scouting',
			level: 1,
			category: 'Team roles',
			holders: [
				{ name: 'Ana Reyes', awarded_at: '2026-03-02T18:00:00Z', status: 'valid' },
				{ name: 'Sam Whitaker', awarded_at: '2026-03-02T18:05:00Z', status: 'revoked' }
			]
		}
	],
	by_person: [
		{ name: 'Ana Reyes', email_hash: 'h1', certifications: [{ code: 'SAFE-1', level: 1, awarded_at: '2026-08-20T16:00:00Z', status: 'valid' }, { code: 'SCOUT-1', level: 1, awarded_at: '2026-03-02T18:00:00Z', status: 'valid' }] },
		{ name: 'Ben Okafor', email_hash: 'h2', certifications: [{ code: 'SAFE-1', level: 1, awarded_at: '2026-08-20T16:10:00Z', status: 'valid' }, { code: 'MILL-1', level: 1, awarded_at: '2026-09-30T21:00:00Z', status: 'valid' }] },
		{ name: 'Maria Lopez', email_hash: 'h3', certifications: [{ code: 'SAFE-1', level: 1, awarded_at: '2026-08-21T16:00:00Z', status: 'suspended' }] },
		{ name: 'Priya Natarajan', email_hash: 'h4', certifications: [{ code: 'MILL-1', level: 1, awarded_at: '2026-10-02T21:00:00Z', status: 'valid' }] },
		{ name: 'Sam Whitaker', email_hash: 'h5', certifications: [{ code: 'SCOUT-1', level: 1, awarded_at: '2026-03-02T18:05:00Z', status: 'revoked' }] },
		{ name: 'Jordan Vance', email_hash: 'h6', certifications: [{ code: 'SAFE-1', level: 1, awarded_at: '2025-08-21T16:00:00Z', status: 'expired' }] }
	]
};

export const NOTIFICATIONS: CertNotification[] = [
	{
		id: 'n-1',
		kind: 'review_returned',
		title: 'Your guided project was returned',
		body: 'Mr. Pina reviewed your Manual Mill Level 1 guided project: not passed, with feedback.',
		href: '/certifications/MILL-1',
		payload: {},
		created_at: '2026-10-07T16:15:00Z',
		read_at: null
	},
	{
		id: 'n-2',
		kind: 'part_checked',
		title: 'Training checked off',
		body: 'Every training video and lesson for Manual Mill Level 1 is done.',
		href: '/certifications/MILL-1',
		payload: {},
		created_at: '2026-10-03T17:00:00Z',
		read_at: null
	},
	{
		id: 'n-3',
		kind: 'awarded',
		title: 'You earned Shop Safety',
		body: 'Serial IDEA-7K3Q-M9XD-2HTR-W4PB. Print your certificate any time.',
		href: '/certifications/me',
		payload: {},
		created_at: '2026-08-20T16:00:00Z',
		read_at: '2026-08-20T18:00:00Z'
	}
];
