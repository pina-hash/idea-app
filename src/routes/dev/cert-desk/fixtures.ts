/**
 * Seeded data for the five certifier harnesses (`/dev/cert-desk`,
 * `/dev/cert-review`, `/dev/cert-award`, `/dev/cert-engine`,
 * `/dev/cert-telemetry`). Every shape is the one the database functions return
 * (`$lib/certifications/types`, `$lib/certifications/desk/desk`), so the real
 * components are mounted over exactly what a route would hand them. Plain
 * data: a `+page.server.ts` serializes it, and nothing here reads a clock
 * except through `NOW`.
 */
import type {
	AdminGetJson,
	AdminListRow,
	AuthorityRow,
	ImportAnswer,
	SeatTodayRow,
	StudentViewJson,
	SyncLogRow
} from '$lib/certifications/desk/desk';
import type {
	AwardRecordPreview,
	CertAttemptJson,
	CertAwardJson,
	CertPackage,
	CertSettings,
	CertSittingJson,
	CertSubmissionJson,
	DeskJson,
	ExamLiveRow,
	ExamQuestion,
	TelemetryJson
} from '$lib/certifications/types';

export const NOW = Date.parse('2026-10-15T21:30:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const ahead = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

export const ANA = { email: 'ana.reyes@boscotech.net', name: 'Ana Reyes' };
export const BEN = { email: 'ben.okafor@boscotech.net', name: 'Ben Okafor' };
export const DANA = { email: 'dana.kim@boscotech.net', name: 'Dana Kim' };
export const PINA = { email: 'apina@boscotech.edu', name: 'Mr. Pina' };

export const MILL = { id: 'c0000000-0000-4000-8000-000000000001', code: 'MILL-1', name: 'Manual Mill Level 1', level: 1, category: 'Machining' };
export const SAFE = { id: 'c0000000-0000-4000-8000-000000000002', code: 'SAFE-1', name: 'Shop Safety', level: 1, category: 'Safety' };
export const LATHE = { id: 'c0000000-0000-4000-8000-000000000003', code: 'LATHE-1', name: 'Engine Lathe Level 1', level: 1, category: 'Machining' };

const ATTEMPT_ANA = 'a0000000-0000-4000-8000-000000000001';
const ATTEMPT_BEN = 'a0000000-0000-4000-8000-000000000002';
const ATTEMPT_DANA = 'a0000000-0000-4000-8000-000000000003';
const SUB_GUIDED = 's0000000-0000-4000-8000-000000000001';
const SUB_CHECKOUT = 's0000000-0000-4000-8000-000000000002';
const SUB_DECIDED = 's0000000-0000-4000-8000-000000000003';
const SEAT_BEN = 'e0000000-0000-4000-8000-000000000001';
const SEAT_DANA = 'e0000000-0000-4000-8000-000000000002';

/** The harness's stand-in for the evidence route: the site's own emblem. */
export const PICTURE_SRC = '/IDEA/idea-logo-600.png';

export const GUIDED_SUBMISSION: CertSubmissionJson = {
	id: SUB_GUIDED,
	part: 'guided',
	state: 'pending',
	in_person: false,
	submitted_at: ago(50),
	decided_at: null,
	evidence: {
		text: 'Squared the stock to 2.000 x 1.500 x 0.750, then cut the 0.250 step. Measured 2.001, 1.499, 0.751. Every edge deburred.',
		links: ['https://docs.google.com/document/d/example/edit'],
		youtube_id: null,
		files: [
			{ path: `${ATTEMPT_ANA}/11111111-1111-4111-8111-111111111111.jpg`, name: 'part-beside-drawing.jpg', size: 412_000 },
			{ path: `${ATTEMPT_ANA}/22222222-2222-4222-8222-222222222222.jpg`, name: 'step-closeup.jpg', size: 388_000 },
			{ path: `${ATTEMPT_ANA}/33333333-3333-4333-8333-333333333333.SLDPRT`, name: 'step-block.SLDPRT', size: 1_204_000 }
		]
	},
	self_inspection: [
		{ item: 'I measured every dimension on the drawing', checked: true },
		{ item: 'I deburred every edge', checked: true },
		{ item: 'The part is clean and labeled', checked: true }
	],
	review: null
};

export const CHECKOUT_SUBMISSION: CertSubmissionJson = {
	id: SUB_CHECKOUT,
	part: 'checkout',
	state: 'pending',
	in_person: false,
	submitted_at: ago(6),
	decided_at: null,
	evidence: { text: '', links: [], youtube_id: 'dQw4w9WgXcQ', files: [] },
	self_inspection: [
		{ item: 'The take is one continuous recording', checked: true },
		{ item: 'My face and hands are both in frame', checked: true }
	],
	review: null
};

export const DECIDED_SUBMISSION: CertSubmissionJson = {
	id: SUB_DECIDED,
	part: 'autonomous',
	state: 'failed',
	in_person: false,
	submitted_at: ago(100),
	decided_at: ago(90),
	evidence: { text: 'Finished part attached.', links: [], youtube_id: null, files: [{ path: `${ATTEMPT_BEN}/44444444-4444-4444-8444-444444444444.jpg`, name: 'finished-part.jpg', size: 300_000 }] },
	self_inspection: [{ item: 'I measured every dimension', checked: true }],
	review: { decision: 'fail', feedback: 'The step depth is 0.030 over. Take a finishing pass and measure before you call it done.', reviewer_name: PINA.name, reviewed_at: ago(90) }
};

const checks = (training: 'done' | 'pending', guided: 'done' | 'pending' | 'waived', exam: 'done' | 'pending' | 'waived', autonomous: 'done' | 'pending' | 'waived', checkout: 'done' | 'pending' | 'waived'): CertAttemptJson['checks'] => [
	{ part: 'training', state: training, checked_by_name: training === 'done' ? 'the system' : null, checked_at: training === 'done' ? ago(200) : null, note: null },
	{ part: 'guided', state: guided, checked_by_name: guided === 'done' ? PINA.name : null, checked_at: guided === 'done' ? ago(150) : null, note: null },
	{ part: 'exam', state: exam, checked_by_name: exam === 'done' ? PINA.name : null, checked_at: exam === 'done' ? ago(80) : null, note: null },
	{ part: 'autonomous', state: autonomous, checked_by_name: autonomous === 'done' ? PINA.name : null, checked_at: autonomous === 'done' ? ago(30) : null, note: null },
	{ part: 'checkout', state: checkout, checked_by_name: checkout === 'done' ? PINA.name : null, checked_at: checkout === 'done' ? ago(2) : null, note: null }
];

const PARTS_ALL = { guided: true, exam: true, autonomous: true, checkout: true };

export const ATTEMPT_IN_PROGRESS: CertAttemptJson = {
	id: ATTEMPT_ANA,
	certification: MILL,
	revision_id: 'r0000000-0000-4000-8000-000000000003',
	email: ANA.email,
	state: 'active',
	started_at: ago(400),
	finished_at: null,
	withdrawn_at: null,
	dormant_at: null,
	last_activity_at: ago(50),
	parts: PARTS_ALL,
	checks: checks('done', 'pending', 'pending', 'pending', 'pending'),
	next_part: 'guided',
	submissions: [GUIDED_SUBMISSION],
	exams: [],
	cooldown_until: null,
	seat: null,
	award: null
};

export const ATTEMPT_READY: CertAttemptJson = {
	id: ATTEMPT_BEN,
	certification: MILL,
	revision_id: 'r0000000-0000-4000-8000-000000000003',
	email: BEN.email,
	state: 'active',
	started_at: ago(900),
	finished_at: null,
	withdrawn_at: null,
	dormant_at: null,
	last_activity_at: ago(2),
	parts: PARTS_ALL,
	checks: checks('done', 'done', 'done', 'done', 'done'),
	next_part: null,
	submissions: [DECIDED_SUBMISSION, { ...CHECKOUT_SUBMISSION, state: 'passed', decided_at: ago(2), review: { decision: 'pass', feedback: 'Clean, continuous, every step shown.', reviewer_name: PINA.name, reviewed_at: ago(2) } }],
	exams: [
		{ id: 'x0000000-0000-4000-8000-000000000001', state: 'submitted', released_at: ago(81), started_at: ago(80.9), submitted_at: ago(80.2), passed: true, missed_topics: [], flags_count: 1, detail: { score: { correct: 20, total: 20, by_topic: { setup: { correct: 8, total: 8 }, speeds: { correct: 12, total: 12 } }, missed_topics: [], per_question: [] }, per_question: [{ index: 0, topic: 'setup', type: 'multiple_choice', prompt: 'The vise should be...', answer_given: 'a', correct: true }, { index: 1, topic: 'speeds', type: 'numeric', prompt: 'RPM for a 1/2 in HSS end mill in aluminum at 300 SFM?', answer_given: 2290, correct: true }], flags: [{ at: ago(80.6), kind: 'blur' }], released_at: ago(81), started_at: ago(80.9), submitted_at: ago(80.2), deadline: ago(80.4), passed: true } },
		{ id: 'x0000000-0000-4000-8000-000000000002', state: 'submitted', released_at: ago(300), started_at: ago(299.9), submitted_at: ago(299.5), passed: false, missed_topics: ['speeds'], flags_count: 0 }
	],
	cooldown_until: null,
	seat: null,
	award: null
};

export const ATTEMPT_SEAT: CertAttemptJson = {
	id: ATTEMPT_DANA,
	certification: SAFE,
	revision_id: 'r0000000-0000-4000-8000-000000000004',
	email: DANA.email,
	state: 'active',
	started_at: ago(120),
	finished_at: null,
	withdrawn_at: null,
	dormant_at: null,
	last_activity_at: ago(20),
	parts: { guided: false, exam: true, autonomous: false, checkout: false },
	checks: checks('done', 'waived', 'pending', 'waived', 'waived'),
	next_part: 'exam',
	submissions: [],
	exams: [],
	cooldown_until: null,
	seat: { id: SEAT_DANA, state: 'approved', sitting_id: null, scheduled_at: ahead(2), requested_at: ago(30), decision_note: 'Bring your safety glasses.' },
	award: null
};

export const ATTEMPT_AWARDED: CertAttemptJson = {
	...ATTEMPT_READY,
	id: 'a0000000-0000-4000-8000-000000000004',
	certification: SAFE,
	state: 'complete',
	finished_at: ago(600),
	submissions: [],
	exams: [],
	award: { serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB', awarded_at: ago(600), expires_at: '2027-08-16T07:00:00Z', status: 'valid' }
};

export const STUDENT_ANA: StudentViewJson = { email: ANA.email, name: ANA.name, attempts: [ATTEMPT_IN_PROGRESS], awards: [] };
export const STUDENT_BEN: StudentViewJson = {
	email: BEN.email,
	name: BEN.name,
	attempts: [ATTEMPT_READY, ATTEMPT_AWARDED],
	awards: [{ id: 'w0000000-0000-4000-8000-000000000001', serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB', code: SAFE.code, name: SAFE.name, level: 1, category: SAFE.category, awarded_at: ago(600), awarded_by_name: PINA.name, expires_at: '2027-08-16T07:00:00Z', status: 'valid', revision_id: 'r0000000-0000-4000-8000-000000000004' }]
};
export const STUDENT_DANA: StudentViewJson = { email: DANA.email, name: DANA.name, attempts: [ATTEMPT_SEAT], awards: [] };

export const DESK_EMPTY: DeskJson = {
	queue: [],
	requests: [],
	exams_today: 0,
	tiles: { active_attempts: 0, dormant_attempts: 0, pending_reviews: 0, oldest_wait_seconds: 0, awards_total: 0, awards_30d: 0 }
};

export const DESK_BUSY: DeskJson = {
	queue: [
		{ submission_id: SUB_CHECKOUT, attempt_id: ATTEMPT_BEN, part: 'checkout', in_person: false, submitted_at: ago(6), waited_seconds: 6 * 3600, student: BEN, certification: MILL },
		{ submission_id: SUB_GUIDED, attempt_id: ATTEMPT_ANA, part: 'guided', in_person: false, submitted_at: ago(50), waited_seconds: 50 * 3600, student: ANA, certification: MILL }
	],
	requests: [{ seat_id: SEAT_BEN, attempt_id: ATTEMPT_BEN, requested_at: ago(26), note: 'Any day after 3:30 works for me.', student: BEN, certification: MILL }],
	exams_today: 1,
	tiles: { active_attempts: 7, dormant_attempts: 2, pending_reviews: 2, oldest_wait_seconds: 50 * 3600, awards_total: 12, awards_30d: 3 }
};

export const SEATS_TODAY: SeatTodayRow[] = [
	{ seat_id: SEAT_DANA, attempt_id: ATTEMPT_DANA, state: 'approved', scheduled_at: ahead(2), student: DANA, certification: SAFE }
];

export const TELEMETRY_EMPTY: TelemetryJson = {
	active_by_certification: [],
	stalled: [],
	pending: [],
	pass_rates: [],
	exam_topics: [],
	completion_days: [],
	time_per_part_hours: [],
	most_missed_topics: [],
	withdrawals_30d: 0,
	watch_sessions_30d: 0
};

export const TELEMETRY_DATA: TelemetryJson = {
	active_by_certification: [
		{ code: 'MILL-1', name: MILL.name, active: 5, dormant: 2 },
		{ code: 'SAFE-1', name: SAFE.name, active: 11, dormant: 1 },
		{ code: 'LATHE-1', name: LATHE.name, active: 2, dormant: 0 }
	],
	stalled: [{ attempt_id: ATTEMPT_ANA, student_name: 'Cy Nguyen', code: 'MILL-1', days_idle: 41 }],
	pending: [{ kind: 'submission', count: 2, oldest_wait_seconds: 50 * 3600 }],
	pass_rates: [
		{ code: 'MILL-1', part: 'guided', passed: 9, failed: 3 },
		{ code: 'MILL-1', part: 'exam', passed: 6, failed: 4 },
		{ code: 'MILL-1', part: 'autonomous', passed: 5, failed: 2 },
		{ code: 'SAFE-1', part: 'exam', passed: 14, failed: 2 }
	],
	exam_topics: [
		{ code: 'MILL-1', topic: 'setup', correct: 70, total: 80 },
		{ code: 'MILL-1', topic: 'speeds', correct: 52, total: 80 },
		{ code: 'SAFE-1', topic: 'ppe', correct: 95, total: 96 }
	],
	completion_days: [
		{ code: 'MILL-1', average: 34.5, count: 5 },
		{ code: 'SAFE-1', average: 6.2, count: 14 }
	],
	time_per_part_hours: [
		{ code: 'MILL-1', part: 'training', average: 3.4 },
		{ code: 'MILL-1', part: 'guided', average: 120.5 },
		{ code: 'MILL-1', part: 'exam', average: 48 }
	],
	most_missed_topics: [
		{ code: 'MILL-1', topic: 'speeds', missed: 28 },
		{ code: 'MILL-1', topic: 'setup', missed: 10 },
		{ code: 'SAFE-1', topic: 'ppe', missed: 1 }
	],
	withdrawals_30d: 1,
	watch_sessions_30d: 212
};

export const SITTINGS: CertSittingJson[] = [
	{ id: 'g0000000-0000-4000-8000-000000000001', starts_at: ahead(26), ends_at: ahead(28), seat_limit: 8, seats_taken: 3, location: 'Room 12', note: 'Bring your safety glasses.', certification: null, state: 'open' },
	{ id: 'g0000000-0000-4000-8000-000000000002', starts_at: ahead(26 + 168), ends_at: ahead(28 + 168), seat_limit: 8, seats_taken: 8, location: 'Room 12', note: null, certification: { code: MILL.code, name: MILL.name }, state: 'open' }
];

export const SETTINGS: CertSettings = { school_year_expiry: '2027-08-16', dormancy_days: 60, checkin_timeout_seconds: 60, release_window_minutes: 10 };

export const LIVE_ROWS: ExamLiveRow[] = [
	{ exam_id: 'x0000000-0000-4000-8000-000000000009', student: DANA, certification: { code: SAFE.code, name: SAFE.name }, state: 'in_progress', current_index: 7, total: 20, released_at: ago(0.2), release_expires_at: ago(0.03), started_at: ago(0.15), deadline: ahead(0.35), flags: [{ at: ago(0.05), kind: 'blur' }], passed: null, submitted_at: null }
];

export const AWARD_RECORD: AwardRecordPreview = {
	attempt_id: ATTEMPT_BEN,
	student: BEN,
	certification: MILL,
	revision_id: 'r0000000-0000-4000-8000-000000000003',
	awarded_at: new Date(NOW).toISOString(),
	expires_at: null,
	certifier: PINA
};

export const AWARD_JSON: CertAwardJson = {
	id: 'w0000000-0000-4000-8000-000000000001',
	serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB',
	attempt_id: ATTEMPT_AWARDED.id,
	certification_id: SAFE.id,
	revision_id: 'r0000000-0000-4000-8000-000000000004',
	email: BEN.email,
	holder_name: BEN.name,
	code: SAFE.code,
	name: SAFE.name,
	level: 1,
	category: SAFE.category,
	awarded_at: ago(600),
	awarded_by_email: PINA.email,
	awarded_by_name: PINA.name,
	expires_at: '2027-08-16T07:00:00Z',
	status: 'valid',
	signature: 'MEUCIQDexample==',
	signed_payload: { v: 1, serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB', code: 'SAFE-1', level: 1, holder_name: BEN.name, email_sha256: 'ab'.repeat(32), awarded_at: ago(600).replace(/\.\d{3}Z$/, 'Z'), certifier_name: PINA.name },
	key_id: '1a2b3c4d',
	history: [
		{ at: ago(600), actor_name: PINA.name, action: 'awarded', reason: 'Every part checked.', before: null, after: null },
		{ at: ago(100), actor_name: PINA.name, action: 'corrected', reason: 'Name spelled Okafur on the first print.', before: { holder_name: 'Ben Okafur' }, after: { holder_name: BEN.name } }
	]
};

export const AWARDS_LIST: CertAwardJson[] = [
	AWARD_JSON,
	{ ...AWARD_JSON, id: 'w0000000-0000-4000-8000-000000000002', serial: 'IDEA-2HTR-W4PB-7K3Q-M9XD', email: ANA.email, holder_name: ANA.name, code: MILL.code, name: MILL.name, category: MILL.category, status: 'suspended', expires_at: null, history: [] },
	{ ...AWARD_JSON, id: 'w0000000-0000-4000-8000-000000000003', serial: 'IDEA-M9XD-2HTR-W4PB-7K3Q', email: DANA.email, holder_name: DANA.name, status: 'expired', expires_at: ago(24), history: [] }
];

export const PACKAGE_MILL: CertPackage = {
	format: 'idea-certification',
	version: 1,
	code: MILL.code,
	name: MILL.name,
	level: 1,
	category: 'Machining',
	sort_order: 10,
	renewal: 'never',
	definition: 'The holder can set up and run a manual mill alone, to a drawing, safely.',
	allows: 'Face, square and step stock on the Bridgeport without supervision.',
	does_not_allow: 'Climb milling, indexable heads, or any setup the card does not name.',
	prerequisites: ['SAFE-1'],
	parts: { guided: true, exam: true, autonomous: true, checkout: true },
	training: {
		items: [
			{ kind: 'video', key: 'yt:dQw4w9WgXcQ', title: 'Part 1: the vise', youtube_id: 'dQw4w9WgXcQ', start: 0 },
			{ kind: 'lesson', key: 'lesson:tramming', title: 'Tramming the head', slug: 'tramming' }
		],
		quick_checks: [{ id: 'qc-1', after: 'yt:dQw4w9WgXcQ', prompt: 'Which jaw is fixed?', options: ['The back jaw', 'The front jaw'], answer: 0, explain: 'The fixed jaw is at the back; work seats against it.' }]
	},
	practice_quiz: [{ id: 'pq-1', prompt: 'Before changing a tool you...', options: ['Stop the spindle', 'Lower the knee'], answer: 0, explain: 'The spindle is stopped before any hand goes near it.' }],
	study_guide: '# Manual Mill Level 1\n\nRead the **vise** section first.\n\n- Tram the head\n- Square the stock\n',
	common_mistakes: [{ title: 'Climb milling by accident', body: 'Feed against the cutter rotation unless the card says otherwise.' }],
	exam: { time_limit_minutes: 30, questions_per_exam: 20, topics: [{ id: 'setup', name: 'Workholding and setup', minimum: 6 }, { id: 'speeds', name: 'Speeds and feeds', minimum: 6 }] },
	guided_project: {
		objective: 'Make the step block to the drawing.',
		spec: 'Square 2 x 1.5 x 0.75 stock and cut a 0.250 deep step.\n\n**Acceptance** is on the drawing.',
		acceptance: ['Flat to 0.002 in', 'Step depth 0.250 within 0.005', 'Edges deburred'],
		references: [{ label: 'Drawing', href: 'https://example.com/step-block.pdf' }],
		steps: [
			{ title: 'Square the stock', body: 'Face every side, checking with the square.', fade: 'full' },
			{ title: 'Cut the step', body: 'Cut to the line.', fade: 'goal', hint: 'Leave 0.010 for a finishing pass.' },
			{ title: 'Finish', body: '', fade: 'hint', hint: 'Think about tool deflection.' }
		],
		self_inspection: ['I measured every dimension on the drawing', 'I deburred every edge'],
		evidence: [
			{ kind: 'photo', label: 'The finished part beside the drawing', required: true },
			{ kind: 'text', label: 'Your measured dimensions', required: true }
		]
	},
	autonomous_project: {
		objective: 'Make the T-slot clamp to the drawing, alone.',
		spec: 'No walkthrough. The drawing is the spec.',
		acceptance: ['Every dimension within tolerance', 'No visible chatter'],
		references: [],
		self_inspection: ['I did this alone'],
		evidence: [{ kind: 'photo', label: 'The clamp beside the drawing', required: true }]
	},
	checkout: { card: 'Square a block from rough stock in under 30 minutes, start to finish.', filming_guide: 'One continuous take, your hands and the machine in frame.' }
};

export const ADMIN_ROWS: AdminListRow[] = [
	{ id: MILL.id, code: MILL.code, name: MILL.name, level: 1, category: 'Machining', sort_order: 10, state: 'published', renewal: 'never', revision: 3, revision_id: 'r0000000-0000-4000-8000-000000000003', published_at: ago(2000), retired_at: null, holders_count: 4, active_attempts: 7, pending_reviews: 2, publish_problems: [] },
	{ id: SAFE.id, code: SAFE.code, name: SAFE.name, level: 1, category: 'Safety', sort_order: 1, state: 'published', renewal: 'school_year', revision: 4, revision_id: 'r0000000-0000-4000-8000-000000000004', published_at: ago(3000), retired_at: null, holders_count: 12, active_attempts: 12, pending_reviews: 0, publish_problems: [] },
	{ id: LATHE.id, code: LATHE.code, name: LATHE.name, level: 1, category: 'Machining', sort_order: 20, state: 'draft', renewal: 'never', revision: 1, revision_id: 'r0000000-0000-4000-8000-000000000005', published_at: null, retired_at: null, holders_count: 0, active_attempts: 0, pending_reviews: 0, publish_problems: ['The study guide is empty.', 'The exam pool holds 3 active questions; 40 are needed.', 'Topic "speeds" holds 0 active questions; at least 6 are needed.'] }
];

export const ADMIN_GET_DRAFT: AdminGetJson = {
	id: LATHE.id,
	code: LATHE.code,
	name: LATHE.name,
	level: 1,
	category: 'Machining',
	sort_order: 20,
	state: 'draft',
	renewal: 'never',
	current_revision_id: 'r0000000-0000-4000-8000-000000000005',
	published_at: null,
	retired_at: null,
	package: { ...PACKAGE_MILL, code: LATHE.code, name: LATHE.name, sort_order: 20, study_guide: '', definition: 'The holder can turn, face and drill on the engine lathe alone.' },
	revisions: [{ id: 'r0000000-0000-4000-8000-000000000005', revision: 1, note: 'Created in the engine', created_at: ago(30), created_by: PINA.email }],
	lessons: [{ id: 'l0000000-0000-4000-8000-000000000001', slug: 'tramming', title: 'Tramming the head', updated_at: ago(40) }],
	pool_summary: { total: 3, by_topic: { setup: 3 } },
	publish_problems: ADMIN_ROWS[2].publish_problems,
	authority: [],
	prerequisites: ['SAFE-1'],
	holders_count: 0,
	active_attempts: 0
};

export const POOL: ExamQuestion[] = [
	{ id: 'q0000000-0000-4000-8000-000000000001', topic: 'setup', type: 'multiple_choice', prompt: 'The vise should be...', options: [{ key: 'a', text: 'Trammed to the table' }, { key: 'b', text: 'Left as found' }], answer: 'a', explain: null, active: true },
	{ id: 'q0000000-0000-4000-8000-000000000002', topic: 'setup', type: 'multiple_select', prompt: 'Which of these are checked before the first cut?', options: [{ key: 'a', text: 'Spindle speed' }, { key: 'b', text: 'Workholding' }, { key: 'c', text: 'Coolant color' }], answer: ['a', 'b'], explain: null, active: true },
	{ id: 'q0000000-0000-4000-8000-000000000003', topic: 'setup', type: 'numeric', prompt: 'RPM for a 1/2 in HSS end mill in aluminum at 300 SFM?', options: null, answer: { value: 2292, tolerance: 50, unit: 'rpm' }, explain: null, active: true },
	{ id: 'q0000000-0000-4000-8000-000000000004', topic: 'setup', type: 'short', prompt: 'Name the tool that trues a hole to size.', options: null, answer: { accept: ['reamer', 'a reamer'] }, explain: null, active: false }
];

export const AUTHORITY_ROWS: AuthorityRow[] = [
	{ certification_id: MILL.id, code: MILL.code, name: MILL.name, email: 'maria.lopez@boscotech.edu', person_name: 'Maria Lopez', granted_at: ago(500), granted_by: PINA.email, note: 'Runs the machine shop after school.' },
	{ certification_id: SAFE.id, code: SAFE.code, name: SAFE.name, email: 'maria.lopez@boscotech.edu', person_name: 'Maria Lopez', granted_at: ago(500), granted_by: PINA.email, note: null }
];

export const SYNC_ROWS: SyncLogRow[] = [
	{ id: 3, at: ago(1), trigger: 'award', ok: true, http_status: 200, catalog_count: 2, holder_count: 16, source_revision: 'idea-certs-2026-10-15T20:00:00Z', error: null, duration_ms: 412, remote_log_id: 77 },
	{ id: 2, at: ago(25), trigger: 'daily', ok: false, http_status: 422, catalog_count: 2, holder_count: 16, source_revision: 'idea-certs-2026-10-14T20:00:00Z', error: 'holders[3].status: unknown value', duration_ms: 388, remote_log_id: 76 }
];

export const EVENT_ROWS: Record<string, unknown>[] = [
	{ id: 901, at: ago(2), kind: 'review.decided', actor_email: PINA.email, subject_email: BEN.email, certification_id: MILL.id, attempt_id: ATTEMPT_BEN, reason: null, payload: { decision: 'pass' } },
	{ id: 900, at: ago(6), kind: 'submission.sent', actor_email: BEN.email, subject_email: BEN.email, certification_id: MILL.id, attempt_id: ATTEMPT_BEN, reason: null, payload: { part: 'checkout' } }
];

export const IMPORT_DIFF: ImportAnswer = {
	ok: true,
	problems: [],
	summary: { code: MILL.code, name: MILL.name, existing: true, existing_id: MILL.id, current_revision: 3, questions: 42, lessons: 1, training_items: 3, changes: 3 },
	diff: [
		{ path: 'certification.json/definition', before: PACKAGE_MILL.definition, after: 'The holder can set up and run a manual mill alone, to a drawing, safely and to time.' },
		{ path: 'videos.json/items[2]', before: undefined, after: { kind: 'video', key: 'yt:9bZkp7q19f0', title: 'Part 2: the edge finder', youtube_id: '9bZkp7q19f0' } },
		{ path: 'exam-pool.json', before: '40 questions', after: '42 questions' }
	]
};

export const IMPORT_PROBLEMS: ImportAnswer = {
	ok: false,
	problems: ['certification.json: prerequisites names "WELD-1", which the portal does not know.', 'exam-pool.json[7]: option keys are not unique (a, a).'],
	summary: { code: MILL.code, name: MILL.name, existing: true, existing_id: MILL.id, current_revision: 3, questions: 42, lessons: 1, training_items: 3, changes: 5 },
	diff: IMPORT_DIFF.diff
};
