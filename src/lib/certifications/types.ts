/**
 * IDEA Certification Portal: the shared shapes (ledger 0391).
 *
 * This module is the TypeScript half of `docs/certifications/DATA_MODEL.md`:
 * every enumeration here mirrors a CHECK constraint one-for-one, and every
 * `*Json` type mirrors what a `cert_*` database function returns. Adding a
 * value is a migration plus an entry here, never one without the other.
 *
 * Pure data and types only: no Svelte, no `$lib/server`, no `?raw`, so both the
 * browser and every server module read the one copy.
 */

export const CERT_STATES = ['draft', 'published', 'retired'] as const;
export type CertState = (typeof CERT_STATES)[number];

export const CERT_RENEWALS = ['never', 'school_year'] as const;
export type CertRenewal = (typeof CERT_RENEWALS)[number];

/** The fixed order a certification is earned in. `training` is never waived. */
export const CERT_PARTS = ['training', 'guided', 'exam', 'autonomous', 'checkout'] as const;
export type CertPart = (typeof CERT_PARTS)[number];
export type WaivablePart = Exclude<CertPart, 'training'>;
export const WAIVABLE_PARTS: readonly WaivablePart[] = ['guided', 'exam', 'autonomous', 'checkout'];

export const CHECK_STATES = ['pending', 'done', 'waived'] as const;
export type CheckState = (typeof CHECK_STATES)[number];

export const ATTEMPT_STATES = ['active', 'withdrawn', 'dormant', 'complete'] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const SUBMISSION_PARTS = ['guided', 'autonomous', 'checkout'] as const;
export type SubmissionPart = (typeof SUBMISSION_PARTS)[number];

export const SUBMISSION_STATES = ['pending', 'passed', 'failed'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

export const REVIEW_DECISIONS = ['pass', 'fail'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const SEAT_STATES = ['requested', 'approved', 'declined', 'booked', 'cancelled', 'used'] as const;
export type SeatState = (typeof SEAT_STATES)[number];

export const EXAM_STATES = ['released', 'in_progress', 'submitted', 'expired'] as const;
export type ExamState = (typeof EXAM_STATES)[number];

export const EXAM_FLAG_KINDS = [
	'blur',
	'hidden',
	'fullscreen_exit',
	'resize',
	'copy',
	'paste',
	'contextmenu'
] as const;
export type ExamFlagKind = (typeof EXAM_FLAG_KINDS)[number];

export const QUESTION_TYPES = ['multiple_choice', 'multiple_select', 'numeric', 'short'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** What the database stores. `expired` is derived, never stored. */
export const AWARD_STORED_STATUSES = ['active', 'suspended', 'revoked'] as const;
export type AwardStoredStatus = (typeof AWARD_STORED_STATUSES)[number];

/** What every surface shows, the verify page included. */
export const AWARD_SHOWN_STATUSES = ['valid', 'suspended', 'revoked', 'expired'] as const;
export type AwardShownStatus = (typeof AWARD_SHOWN_STATUSES)[number];

export const AWARD_ACTIONS = ['awarded', 'suspended', 'reinstated', 'revoked', 'corrected'] as const;
export type AwardAction = (typeof AWARD_ACTIONS)[number];

export const NOTIFICATION_KINDS = [
	'part_checked',
	'review_returned',
	'sitting_approved',
	'sitting_declined',
	'cooldown_ended',
	'awarded',
	'suspended',
	'reinstated',
	'revoked',
	'expiring',
	'queue_submission',
	'queue_request'
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TRAINING_ITEM_KINDS = ['video', 'lesson'] as const;
export type TrainingItemKind = (typeof TRAINING_ITEM_KINDS)[number];

export const EVIDENCE_KINDS = ['photo', 'file', 'text', 'link', 'youtube'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const FADE_LEVELS = ['full', 'goal', 'hint'] as const;
export type FadeLevel = (typeof FADE_LEVELS)[number];

export const EXPORT_KINDS = [
	'events',
	'audit',
	'sync',
	'errors',
	'attempts',
	'awards',
	'exams',
	'watch',
	'practice',
	'notifications'
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** Rules Mr. Pina decided; constants, not settings. */
export const EXAM_COOLDOWN_DAYS = 7;
export const WATCH_COVERAGE = 0.95;
export const WATCH_MAX_RATE = 2;
export const EXPIRY_REMINDER_DAYS = 30;
export const EXAM_PASS_FRACTION = 1;

/* ------------------------------------------------------------------------ */
/* The revision package                                                      */
/* ------------------------------------------------------------------------ */

export interface TrainingVideoItem {
	kind: 'video';
	key: string; // `yt:<id>`
	title: string;
	youtube_id: string;
	start?: number;
}
export interface TrainingLessonItem {
	kind: 'lesson';
	key: string; // `lesson:<slug>`
	title: string;
	slug: string;
}
export type TrainingItem = TrainingVideoItem | TrainingLessonItem;

export interface QuickCheck {
	id: string;
	after: string; // a training item key
	prompt: string;
	options: string[];
	answer: number;
	explain?: string;
}

export interface PracticeQuestion {
	id: string;
	prompt: string;
	options: string[];
	answer: number;
	explain?: string;
}

export interface CommonMistake {
	title: string;
	body: string;
}

export interface ExamTopic {
	id: string;
	name: string;
	minimum: number;
}

export interface ExamConfig {
	time_limit_minutes: number;
	questions_per_exam: number;
	topics: ExamTopic[];
}

export interface ProjectReference {
	label: string;
	href: string;
}
export interface ProjectStep {
	title: string;
	body: string;
	fade: FadeLevel;
	hint?: string;
}
export interface EvidenceItem {
	kind: EvidenceKind;
	label: string;
	required: boolean;
}
export interface ProjectSpec {
	objective: string;
	spec: string;
	acceptance: string[];
	references: ProjectReference[];
	steps?: ProjectStep[]; // guided only
	self_inspection: string[];
	evidence: EvidenceItem[];
}

export interface CheckoutSpec {
	card: string;
	filming_guide: string;
}

export interface CertParts {
	guided: boolean;
	exam: boolean;
	autonomous: boolean;
	checkout: boolean;
}

export interface CertPackage {
	format: 'idea-certification';
	version: 1;
	code: string;
	name: string;
	level: number;
	category: string;
	sort_order: number;
	renewal: CertRenewal;
	definition: string;
	allows: string;
	does_not_allow: string;
	prerequisites: string[];
	parts: CertParts;
	training: { items: TrainingItem[]; quick_checks: QuickCheck[] };
	practice_quiz: PracticeQuestion[];
	study_guide: string;
	common_mistakes: CommonMistake[];
	exam: ExamConfig | null;
	guided_project: ProjectSpec | null;
	autonomous_project: ProjectSpec | null;
	checkout: CheckoutSpec | null;
}

/** An empty package: what the engine's "New certification" form starts from. */
export function emptyPackage(): CertPackage {
	return {
		format: 'idea-certification',
		version: 1,
		code: '',
		name: '',
		level: 1,
		category: '',
		sort_order: 0,
		renewal: 'never',
		definition: '',
		allows: '',
		does_not_allow: '',
		prerequisites: [],
		parts: { guided: true, exam: true, autonomous: true, checkout: true },
		training: { items: [], quick_checks: [] },
		practice_quiz: [],
		study_guide: '',
		common_mistakes: [],
		exam: { time_limit_minutes: 30, questions_per_exam: 20, topics: [] },
		guided_project: {
			objective: '',
			spec: '',
			acceptance: [],
			references: [],
			steps: [],
			self_inspection: [],
			evidence: []
		},
		autonomous_project: {
			objective: '',
			spec: '',
			acceptance: [],
			references: [],
			self_inspection: [],
			evidence: []
		},
		checkout: { card: '', filming_guide: '' }
	};
}

/* ------------------------------------------------------------------------ */
/* Exam pool                                                                 */
/* ------------------------------------------------------------------------ */

export interface ExamOption {
	key: string;
	text: string;
}
export type ExamAnswerKey =
	| string // multiple_choice: an option key
	| string[] // multiple_select: option keys
	| { value: number; tolerance: number; unit?: string } // numeric
	| { accept: string[] }; // short

/** A pool question WITH its key. Reaches only the admin's pool editor. */
export interface ExamQuestion {
	id?: string;
	topic: string;
	type: QuestionType;
	prompt: string;
	options: ExamOption[] | null;
	answer: ExamAnswerKey;
	explain?: string | null;
	active: boolean;
}

/** What a student's browser receives: never the key. */
export interface ExamQuestionView {
	index: number;
	total: number;
	type: QuestionType;
	prompt: string;
	options: ExamOption[] | null;
	unit: string | null;
	deadline: string;
}

/** What a student sends back for one question. */
export type ExamAnswer = string | string[] | number | null;

/* ------------------------------------------------------------------------ */
/* Catalog and certification page                                            */
/* ------------------------------------------------------------------------ */

export interface CertSummary {
	id: string;
	code: string;
	name: string;
	level: number;
	category: string;
	sort_order: number;
	renewal: CertRenewal;
	definition: string;
	allows: string;
	does_not_allow: string;
	parts: CertParts;
	prerequisites: { code: string; name: string; held: boolean }[];
	holders_count: number;
	avg_completion_days: number | null;
	my: {
		state: 'none' | AttemptState;
		attempt_id: string | null;
		held: boolean;
		expired: boolean;
	};
}

export interface CertSeatJson {
	id: string;
	state: SeatState;
	sitting_id: string | null;
	scheduled_at: string | null;
	requested_at: string;
	decision_note: string | null;
}

export interface CertReviewJson {
	decision: ReviewDecision;
	feedback: string;
	reviewer_name: string | null;
	reviewed_at: string;
}

export interface CertEvidenceFile {
	path: string;
	name: string;
	size: number;
}
export interface CertEvidence {
	text: string;
	links: string[];
	youtube_id: string | null;
	files: CertEvidenceFile[];
}
export interface SelfInspectionAnswer {
	item: string;
	checked: boolean;
}

export interface CertSubmissionJson {
	id: string;
	part: SubmissionPart;
	state: SubmissionState;
	in_person: boolean;
	submitted_at: string;
	decided_at: string | null;
	evidence: CertEvidence;
	self_inspection: SelfInspectionAnswer[];
	review: CertReviewJson | null;
}

export interface CertExamSummary {
	id: string;
	state: ExamState;
	released_at: string;
	started_at: string | null;
	submitted_at: string | null;
	passed: boolean | null;
	missed_topics: string[];
	flags_count: number;
	/** Only for a certifier (`cert_student_view`, `cert_exam_result`). */
	detail?: ExamResultJson | null;
}

export interface CertCheckJson {
	part: CertPart;
	state: CheckState;
	checked_by_name: string | null;
	checked_at: string | null;
	note: string | null;
}

export interface CertAttemptJson {
	id: string;
	certification: { id: string; code: string; name: string; level: number; category: string };
	revision_id: string;
	email: string;
	state: AttemptState;
	started_at: string;
	finished_at: string | null;
	withdrawn_at: string | null;
	dormant_at: string | null;
	last_activity_at: string;
	parts: CertParts;
	checks: CertCheckJson[];
	next_part: CertPart | null;
	submissions: CertSubmissionJson[];
	exams: CertExamSummary[];
	cooldown_until: string | null;
	seat: CertSeatJson | null;
	award: { serial: string; awarded_at: string; expires_at: string | null; status: AwardShownStatus } | null;
}

export interface CertTrainingProgress {
	item_key: string;
	covered_seconds: number;
	duration_seconds: number | null;
	completed_at: string | null;
}

export interface CertSittingJson {
	id: string;
	starts_at: string;
	ends_at: string;
	seat_limit: number;
	seats_taken: number;
	location: string | null;
	note: string | null;
	certification: { code: string; name: string } | null;
	state: 'open' | 'closed' | 'cancelled';
}

export interface CertLessonRef {
	id: string;
	slug: string;
	title: string;
}

export interface CertGetJson extends CertSummary {
	state: CertState;
	revision_id: string;
	package: CertPackage;
	lessons: CertLessonRef[];
	my_attempt: CertAttemptJson | null;
	my_training: CertTrainingProgress[];
	cooldown_until: string | null;
	seat: CertSeatJson | null;
	sittings: CertSittingJson[];
}

export interface CertAwardMine {
	id: string;
	serial: string;
	code: string;
	name: string;
	level: number;
	category: string;
	awarded_at: string;
	awarded_by_name: string;
	expires_at: string | null;
	status: AwardShownStatus;
	revision_id: string;
}

export interface CertMeJson {
	attempts: CertAttemptJson[];
	awards: CertAwardMine[];
	notifications_unread: number;
}

export interface CertSettings {
	school_year_expiry: string | null; // YYYY-MM-DD
	dormancy_days: number;
	checkin_timeout_seconds: number;
	release_window_minutes: number;
}

/* ------------------------------------------------------------------------ */
/* Exam runtime                                                              */
/* ------------------------------------------------------------------------ */

export interface ExamFlag {
	at: string;
	kind: ExamFlagKind;
}

export interface ExamOpenJson {
	ok: true;
	exam: { id: string; state: ExamState; total: number; current_index: number; deadline: string };
	question: ExamQuestionView | null;
}

export interface ExamStudentResult {
	ok: true;
	passed: boolean;
	total: number;
	correct: number;
	missed_topics: string[];
	cooldown_until: string | null;
}

export interface ExamResultJson {
	score: {
		correct: number;
		total: number;
		by_topic: Record<string, { correct: number; total: number }>;
		missed_topics: string[];
		per_question: { index: number; topic: string; correct: boolean }[];
	} | null;
	per_question: { index: number; topic: string; type: QuestionType; prompt: string; answer_given: ExamAnswer; correct: boolean }[];
	flags: ExamFlag[];
	released_at: string;
	started_at: string | null;
	submitted_at: string | null;
	deadline: string | null;
	passed: boolean | null;
}

export interface ExamLiveRow {
	exam_id: string;
	student: { email: string; name: string | null };
	certification: { code: string; name: string };
	state: ExamState;
	current_index: number;
	total: number;
	released_at: string;
	release_expires_at: string;
	started_at: string | null;
	deadline: string | null;
	flags: ExamFlag[];
	passed: boolean | null;
	submitted_at: string | null;
}

/* ------------------------------------------------------------------------ */
/* Awards, verify, certificate                                               */
/* ------------------------------------------------------------------------ */

/** The exact fields the Ed25519 signature covers, in this key order. */
export interface SignedPayload {
	v: 1;
	serial: string;
	code: string;
	level: number;
	holder_name: string;
	email_sha256: string;
	awarded_at: string; // ISO 8601 UTC, `Z`, no fractional seconds
	certifier_name: string;
}

export interface AwardRecordPreview {
	attempt_id: string;
	student: { email: string; name: string };
	certification: { id: string; code: string; name: string; level: number; category: string };
	revision_id: string;
	awarded_at: string;
	expires_at: string | null;
	certifier: { email: string; name: string };
}

export interface CertAwardJson {
	id: string;
	serial: string;
	attempt_id: string;
	certification_id: string;
	revision_id: string;
	email: string;
	holder_name: string;
	code: string;
	name: string;
	level: number;
	category: string;
	awarded_at: string;
	awarded_by_email: string;
	awarded_by_name: string;
	expires_at: string | null;
	status: AwardShownStatus;
	signature: string;
	signed_payload: SignedPayload;
	key_id: string;
	history?: AwardHistoryRow[];
}

export interface AwardHistoryRow {
	at: string;
	actor_name: string | null;
	action: AwardAction;
	reason: string | null;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
}

export interface CertificateJson {
	serial: string;
	holder_name: string;
	code: string;
	name: string;
	level: number;
	category: string;
	awarded_at: string;
	expires_at: string | null;
	awarded_by_name: string;
	status: AwardShownStatus;
	signature: string;
	signed_payload: SignedPayload;
	key_id: string;
	definition: string;
	verify_url_path: string;
}

export type VerifyJson =
	| { found: false }
	| {
			found: true;
			holder_name: string;
			code: string;
			name: string;
			level: number;
			category: string;
			awarded_at: string;
			awarded_by_name: string;
			expires_at: string | null;
			status: AwardShownStatus;
			signature: string;
			signed_payload: SignedPayload;
			key_id: string;
	  };

export interface HoldersJson {
	by_certification: {
		code: string;
		name: string;
		level: number;
		category: string;
		holders: { name: string; awarded_at: string; status: AwardShownStatus }[];
	}[];
	by_person: {
		name: string;
		email_hash: string;
		certifications: { code: string; level: number; awarded_at: string; status: AwardShownStatus }[];
	}[];
}

/* ------------------------------------------------------------------------ */
/* Notifications, desk, telemetry                                            */
/* ------------------------------------------------------------------------ */

export interface CertNotification {
	id: string;
	email?: string;
	kind: NotificationKind;
	title: string;
	body: string;
	href: string;
	payload: Record<string, unknown>;
	created_at: string;
	read_at: string | null;
}

export interface DeskQueueRow {
	submission_id: string;
	attempt_id: string;
	part: SubmissionPart;
	in_person: boolean;
	submitted_at: string;
	waited_seconds: number;
	student: { email: string; name: string | null };
	certification: { id: string; code: string; name: string };
}

export interface DeskRequestRow {
	seat_id: string;
	attempt_id: string;
	requested_at: string;
	note: string | null;
	student: { email: string; name: string | null };
	certification: { id: string; code: string; name: string };
}

export interface DeskJson {
	queue: DeskQueueRow[];
	requests: DeskRequestRow[];
	exams_today: number;
	tiles: {
		active_attempts: number;
		dormant_attempts: number;
		pending_reviews: number;
		oldest_wait_seconds: number;
		awards_total: number;
		awards_30d: number;
	};
}

export interface TelemetryJson {
	active_by_certification: { code: string; name: string; active: number; dormant: number }[];
	stalled: { attempt_id: string; student_name: string | null; code: string; days_idle: number }[];
	pending: { kind: string; count: number; oldest_wait_seconds: number }[];
	pass_rates: { code: string; part: CertPart; passed: number; failed: number }[];
	exam_topics: { code: string; topic: string; correct: number; total: number }[];
	completion_days: { code: string; average: number; count: number }[];
	time_per_part_hours: { code: string; part: CertPart; average: number }[];
	most_missed_topics: { code: string; topic: string; missed: number }[];
	withdrawals_30d: number;
	watch_sessions_30d: number;
}

/** Every refusal a caller must render. Misuse raises instead. */
export interface CertRefusal {
	ok: false;
	reason: string;
	message: string;
	problems?: string[];
	missing?: string[];
	[key: string]: unknown;
}

export function isRefusal(value: unknown): value is CertRefusal {
	return !!value && typeof value === 'object' && (value as { ok?: unknown }).ok === false;
}
