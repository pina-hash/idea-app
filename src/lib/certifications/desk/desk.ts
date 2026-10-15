/**
 * The certifier desk's pure layer (ledger 0391, surface d). Every decision a
 * desk component draws from is a function here: whether a review may be sent,
 * what tone a status takes, how a school-time instant becomes a
 * `datetime-local` value and back, which bars a telemetry chart draws. No
 * Svelte, no `$app`, no `$lib/server`, so `tests/cert-desk-*.test.ts` can hold
 * every rule at a pinned instant.
 *
 * THE SHAPES BELOW THAT `$lib/certifications/types.ts` DOES NOT CARRY are the
 * engine and records reads (`cert_admin_list`, `cert_admin_get`,
 * `cert_authority_list`, `cert_sync_log_list`) as `docs/certifications/
 * DATA_MODEL.md` and 0260 spell them. They live here rather than in the shared
 * module because the desk is their only reader; a second reader moves them.
 */
import { laCalendarDay, schoolClockParts, schoolWallInstant } from '$lib/classroom/school-calendar';
import { AWARD_LOCKED_SENTENCE, EXPIRY_UNSET_SENTENCE, NO_NAME_SENTENCE } from '$lib/certifications/copy';
import { CERT_API } from '$lib/certifications/nav';
import { PART_WORDS } from '$lib/certifications/parts';
import { waitedWords } from '$lib/certifications/status';
import type {
	AttemptState,
	AwardAction,
	AwardShownStatus,
	CertAttemptJson,
	CertAwardMine,
	CertPackage,
	CertPart,
	CertState,
	CheckState,
	DeskJson,
	ExamAnswerKey,
	ExamQuestion,
	QuestionType,
	ReviewDecision,
	SeatState,
	TelemetryJson,
	TrainingItem
} from '$lib/certifications/types';

/* ------------------------------------------------------------------------ */
/* Shapes the desk reads that the shared module does not name              */
/* ------------------------------------------------------------------------ */

export interface AdminListRow {
	id: string;
	code: string;
	name: string;
	level: number;
	category: string;
	sort_order: number;
	state: CertState;
	renewal: 'never' | 'school_year';
	revision: number | null;
	revision_id: string | null;
	published_at: string | null;
	retired_at: string | null;
	holders_count: number;
	active_attempts: number;
	pending_reviews: number;
	publish_problems: string[];
}

export interface RevisionRow {
	id: string;
	revision: number;
	note: string | null;
	created_at: string;
	created_by: string | null;
}

export interface LessonRow {
	id: string;
	slug: string;
	title: string;
	updated_at?: string | null;
}

export interface AdminGetJson {
	id: string;
	code: string;
	name: string;
	level: number;
	category: string;
	sort_order: number;
	state: CertState;
	renewal: 'never' | 'school_year';
	current_revision_id: string | null;
	published_at: string | null;
	retired_at: string | null;
	package: CertPackage | null;
	revisions: RevisionRow[];
	lessons: LessonRow[];
	pool_summary: { total: number; by_topic: Record<string, number> };
	publish_problems: string[];
	authority: string[] | null;
	prerequisites: string[];
	holders_count: number;
	active_attempts: number;
}

export interface AuthorityRow {
	certification_id: string;
	code: string;
	name: string;
	email: string;
	person_name: string | null;
	granted_at: string;
	granted_by: string | null;
	note: string | null;
}

export interface StudentViewJson {
	email: string;
	name: string | null;
	attempts: CertAttemptJson[];
	awards: CertAwardMine[];
}

export interface SyncLogRow {
	id: number;
	at: string;
	trigger: string;
	ok: boolean;
	http_status: number | null;
	catalog_count: number;
	holder_count: number;
	source_revision: string | null;
	error: string | null;
	duration_ms: number;
	remote_log_id: number | null;
}

/** A seat a certifier may release today. See DEVIATIONS in the desk's report: no catalogued function lists these yet. */
export interface SeatTodayRow {
	seat_id: string;
	attempt_id: string;
	state: SeatState;
	scheduled_at: string | null;
	student: { email: string; name: string | null };
	certification: { id: string; code: string; name: string };
}

/* ------------------------------------------------------------------------ */
/* Tones: colour never alone, the word always beside it                     */
/* ------------------------------------------------------------------------ */

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'quiet';

export interface Readout {
	word: string;
	tone: Tone;
	/** A one-character mark that says the same thing as the hue. */
	glyph: string;
}

export const ATTEMPT_READOUTS: Record<AttemptState, Readout> = {
	active: { word: 'Active', tone: 'info', glyph: '>' },
	dormant: { word: 'Dormant', tone: 'warn', glyph: 'z' },
	withdrawn: { word: 'Withdrawn', tone: 'quiet', glyph: 'x' },
	complete: { word: 'Complete', tone: 'ok', glyph: '✓' }
};

export const AWARD_READOUTS: Record<AwardShownStatus, Readout> = {
	valid: { word: 'Valid', tone: 'ok', glyph: '✓' },
	suspended: { word: 'Suspended', tone: 'warn', glyph: '!' },
	revoked: { word: 'Revoked', tone: 'bad', glyph: 'x' },
	expired: { word: 'Expired', tone: 'quiet', glyph: 'o' }
};

export const CERT_STATE_READOUTS: Record<CertState, Readout> = {
	draft: { word: 'Draft', tone: 'quiet', glyph: 'o' },
	published: { word: 'Published', tone: 'ok', glyph: '✓' },
	retired: { word: 'Retired', tone: 'warn', glyph: 'z' }
};

export const CHECK_READOUTS: Record<CheckState, Readout> = {
	done: { word: 'Done', tone: 'ok', glyph: '✓' },
	pending: { word: 'Pending', tone: 'quiet', glyph: 'o' },
	waived: { word: 'Waived', tone: 'quiet', glyph: '~' }
};

export const SUBMISSION_READOUTS: Record<'pending' | 'passed' | 'failed', Readout> = {
	pending: { word: 'Waiting for review', tone: 'warn', glyph: 'o' },
	passed: { word: 'Passed', tone: 'ok', glyph: '✓' },
	failed: { word: 'Failed', tone: 'bad', glyph: 'x' }
};

export const SEAT_READOUTS: Record<SeatState, Readout> = {
	requested: { word: 'Requested', tone: 'warn', glyph: '?' },
	approved: { word: 'Approved', tone: 'ok', glyph: '✓' },
	declined: { word: 'Declined', tone: 'bad', glyph: 'x' },
	booked: { word: 'Booked', tone: 'ok', glyph: '✓' },
	cancelled: { word: 'Cancelled', tone: 'quiet', glyph: 'x' },
	used: { word: 'Used', tone: 'quiet', glyph: '✓' }
};

export const EXAM_READOUTS: Record<'released' | 'in_progress' | 'submitted' | 'expired', Readout> = {
	released: { word: 'Released', tone: 'info', glyph: '>' },
	in_progress: { word: 'In progress', tone: 'info', glyph: '>' },
	submitted: { word: 'Submitted', tone: 'ok', glyph: '✓' },
	expired: { word: 'Release expired', tone: 'quiet', glyph: 'x' }
};

export const HISTORY_WORDS: Record<AwardAction, string> = {
	awarded: 'Awarded',
	suspended: 'Suspended',
	reinstated: 'Reinstated',
	revoked: 'Revoked',
	corrected: 'Corrected'
};

/* ------------------------------------------------------------------------ */
/* The review decision                                                       */
/* ------------------------------------------------------------------------ */

/**
 * ONE PREDICATE DRIVES THE SEND KEY AND THE HANDLER (the Foundry review rule):
 * a pass may go with no words, a fail needs feedback. Two spellings of "is
 * this ready" is what produces a click that does nothing.
 */
export function reviewCanSend(input: { decision: ReviewDecision | null; feedback: string }): boolean {
	if (input.decision === 'pass') return true;
	if (input.decision !== 'fail') return false;
	return input.feedback.trim().length > 0;
}

/** Why Send is held, in words, or null when it may go. */
export function reviewBlockedBecause(input: { decision: ReviewDecision | null; feedback: string }): string | null {
	if (reviewCanSend(input)) return null;
	if (!input.decision) return 'Choose Pass or Fail first.';
	return 'A fail needs written feedback before it can be sent.';
}

/* ------------------------------------------------------------------------ */
/* People, waits, links                                                      */
/* ------------------------------------------------------------------------ */

export interface DeskPerson {
	email: string;
	name: string | null;
}

/** Every student the desk payload names, once each, for the search box's list. */
export function peopleFromDesk(desk: DeskJson | null | undefined): DeskPerson[] {
	const seen = new Map<string, DeskPerson>();
	const add = (p: { email: string; name: string | null } | null | undefined) => {
		if (!p?.email) return;
		const email = p.email.trim().toLowerCase();
		if (!email || seen.has(email)) return;
		seen.set(email, { email, name: p.name?.trim() || null });
	};
	for (const row of desk?.queue ?? []) add(row.student);
	for (const row of desk?.requests ?? []) add(row.student);
	return [...seen.values()].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

/**
 * What the search box typed resolves to: an address as typed, or the address
 * of the one person whose name matches. Null when nothing matches.
 */
export function resolveSearch(typed: string, people: DeskPerson[]): string | null {
	const q = typed.trim().toLowerCase();
	if (!q) return null;
	if (q.includes('@')) return q;
	const exact = people.filter((p) => (p.name ?? '').toLowerCase() === q);
	if (exact.length === 1) return exact[0].email;
	const starts = people.filter((p) => (p.name ?? '').toLowerCase().startsWith(q));
	if (starts.length === 1) return starts[0].email;
	return null;
}

export const personWords = (p: { email: string; name: string | null }): string => p.name?.trim() || p.email;

export function waitedSentence(seconds: number): string {
	const w = waitedWords(seconds);
	return w === 'just now' ? 'arrived just now' : `waited ${w}`;
}

export const partWord = (part: CertPart | string): string => PART_WORDS[part as CertPart] ?? part;

/** The evidence route with the shown name, so the download carries it. */
export function evidenceHref(path: string, name: string): string {
	return `${CERT_API.evidence(path)}?name=${encodeURIComponent(name)}`;
}

/** The embedded player for a review: privacy-enhanced host, no related videos. */
export function youtubeEmbedUrl(id: string): string {
	return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1`;
}

/* ------------------------------------------------------------------------ */
/* School time in a datetime-local box                                      */
/* ------------------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** An instant as the `datetime-local` value a certifier reads in Los Angeles. */
export function schoolLocalInput(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const { hour, minute } = schoolClockParts(d.getTime());
	return `${laCalendarDay(d)}T${pad2(hour)}:${pad2(minute)}`;
}

/** A `datetime-local` value typed in school time, as an ISO instant; null when it does not parse. */
export function schoolLocalToIso(value: string | null | undefined): string | null {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec((value ?? '').trim());
	if (!m) return null;
	const h = Number(m[2]);
	const min = Number(m[3]);
	if (h > 23 || min > 59) return null;
	return schoolWallInstant(m[1], h * 60 + min);
}

/* ------------------------------------------------------------------------ */
/* Telemetry charts                                                          */
/* ------------------------------------------------------------------------ */

export interface ChartBar {
	label: string;
	value: number;
	tone?: 'ok' | 'bad' | 'warn';
	/** A second value drawn beside the first (fails beside passes). */
	second?: number;
}

export interface ChartSpec {
	id: string;
	title: string;
	/** The word for the figure on each bar. */
	unit: string;
	bars: ChartBar[];
	/** The legend in words: what the first and second bar mean. */
	legend: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function telemetryCharts(t: TelemetryJson | null | undefined): ChartSpec[] {
	if (!t) return [];
	const active: ChartSpec = {
		id: 'active',
		title: 'Active attempts by certification',
		unit: 'attempts',
		bars: (t.active_by_certification ?? []).map((r) => ({ label: r.code, value: r.active, second: r.dormant })),
		legend: ['Green: active', 'Amber: dormant']
	};
	const pass: ChartSpec = {
		id: 'pass-rates',
		title: 'Pass and fail per part',
		unit: 'reviews',
		bars: (t.pass_rates ?? []).map((r) => ({ label: `${r.code} ${partWord(r.part)}`, value: r.passed, second: r.failed })),
		legend: ['Green: passed', 'Red: failed']
	};
	const topics: ChartSpec = {
		id: 'exam-topics',
		title: 'Exam pass rate per topic',
		unit: '% correct',
		bars: (t.exam_topics ?? []).map((r) => ({
			label: `${r.code} ${r.topic}`,
			value: r.total > 0 ? Math.round((100 * r.correct) / r.total) : 0
		})),
		legend: ['Green: percent of answers correct']
	};
	const missed: ChartSpec = {
		id: 'missed',
		title: 'Most missed topics',
		unit: 'misses',
		bars: (t.most_missed_topics ?? []).map((r) => ({ label: `${r.code} ${r.topic}`, value: r.missed, tone: 'warn' })),
		legend: ['Amber: times a topic was missed on an exam']
	};
	const completion: ChartSpec = {
		id: 'completion',
		title: 'Average days to complete',
		unit: 'days',
		bars: (t.completion_days ?? []).map((r) => ({ label: `${r.code} (${r.count})`, value: round1(r.average) })),
		legend: ['Green: average days from start to award; the count of completions in brackets']
	};
	return [active, pass, topics, missed, completion];
}

/** The fixed geometry of a bar chart: pure arithmetic so a test can read it. */
export interface BarLayout {
	width: number;
	height: number;
	rows: { label: string; y: number; w1: number; w2: number; value: number; second: number | null; tone: ChartBar['tone'] }[];
	labelWidth: number;
}

export const CHART_ROW_H = 26;
export const CHART_LABEL_W = 150;
export const CHART_W = 520;

export function barLayout(bars: ChartBar[]): BarLayout {
	const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.second ?? 0)));
	const span = CHART_W - CHART_LABEL_W - 56;
	const rows = bars.map((b, i) => ({
		label: b.label,
		y: i * CHART_ROW_H,
		w1: Math.max(b.value > 0 ? 2 : 0, Math.round((span * b.value) / max)),
		w2: b.second == null ? 0 : Math.max(b.second > 0 ? 2 : 0, Math.round((span * b.second) / max)),
		value: b.value,
		second: b.second ?? null,
		tone: b.tone
	}));
	return { width: CHART_W, height: Math.max(CHART_ROW_H, bars.length * CHART_ROW_H), rows, labelWidth: CHART_LABEL_W };
}

export const CHART_EMPTY_WORDS = 'Nothing to chart yet.';

/** The tiles, each figure with its word. */
export function telemetryTiles(desk: DeskJson | null | undefined, t: TelemetryJson | null | undefined) {
	const tiles = desk?.tiles;
	return [
		{ id: 'active', word: 'Active attempts', value: tiles?.active_attempts ?? 0 },
		{ id: 'dormant', word: 'Dormant attempts', value: tiles?.dormant_attempts ?? 0 },
		{ id: 'pending', word: 'Waiting for review', value: tiles?.pending_reviews ?? 0 },
		{ id: 'oldest', word: 'Oldest wait', value: waitedWords(tiles?.oldest_wait_seconds ?? 0), text: true },
		{ id: 'awards30', word: 'Awards, last 30 days', value: tiles?.awards_30d ?? 0 },
		{ id: 'awards', word: 'Awards, all time', value: tiles?.awards_total ?? 0 },
		{ id: 'exams', word: 'Exams today', value: desk?.exams_today ?? 0 },
		{ id: 'withdrawals', word: 'Withdrawals, last 30 days', value: t?.withdrawals_30d ?? 0 },
		{ id: 'watch', word: 'Watch sessions, last 30 days', value: t?.watch_sessions_30d ?? 0 }
	];
}

/* ------------------------------------------------------------------------ */
/* Form actions: what every desk action answers                             */
/* ------------------------------------------------------------------------ */

/**
 * What a desk form action returns, success or refusal: which action it was
 * (so a page with several forms shows the sentence beside the right one), ok,
 * and the message verbatim from the function. Anything else rides on `data`.
 */
export interface DeskFormResult {
	action: string;
	ok: boolean;
	message: string | null;
	data?: Record<string, unknown>;
}

export function formFor(form: unknown, action: string): DeskFormResult | null {
	if (!form || typeof form !== 'object') return null;
	const f = form as Partial<DeskFormResult>;
	if (f.action !== action || typeof f.ok !== 'boolean') return null;
	return { action, ok: f.ok, message: typeof f.message === 'string' ? f.message : null, data: f.data };
}

/* ------------------------------------------------------------------------ */
/* The award page                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Why the award key is dark, in words beside it. The function's own sentence
 * for its reasons; the shared sentences for the two the copy module names;
 * the locked sentence for a part still pending; and the one refusal the
 * client can see on its own, the certifier being the student.
 */
export function awardHeldWords(input: {
	refusal: { reason: string; message: string } | null;
	self: boolean;
	allDone: boolean;
}): string | null {
	if (input.self) return 'A certifier cannot award their own attempt. Another certifier has to press this.';
	if (!input.refusal) return input.allDone ? null : AWARD_LOCKED_SENTENCE;
	switch (input.refusal.reason) {
		case 'no_name':
			return NO_NAME_SENTENCE;
		case 'expiry_unset':
			return EXPIRY_UNSET_SENTENCE;
		case 'incomplete':
		case 'pending':
			return AWARD_LOCKED_SENTENCE;
		default:
			return input.refusal.message || AWARD_LOCKED_SENTENCE;
	}
}

/** What the award transport answers the panel. */
export type AwardAnswer = { ok: true; certificate_href: string } | { ok: false; message: string };

/**
 * Whether the award key may light: the prepare answered ok AND the caller is
 * not the student. Both halves are re-checked by the database; this only
 * decides what the key draws.
 */
export function awardKeyLit(input: { prepared: boolean; callerEmail: string | null; studentEmail: string | null }): boolean {
	if (!input.prepared) return false;
	const me = (input.callerEmail ?? '').trim().toLowerCase();
	const them = (input.studentEmail ?? '').trim().toLowerCase();
	if (me && them && me === them) return false;
	return true;
}

/* ------------------------------------------------------------------------ */
/* The engine                                                                */
/* ------------------------------------------------------------------------ */

export const linesToList = (text: string): string[] =>
	text
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean);
export const listToLines = (list: readonly string[] | null | undefined): string => (list ?? []).join('\n');

const num = (v: unknown, fallback: number): number => {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function trainingKey(item: TrainingItem): string {
	return item.kind === 'video' ? `yt:${item.youtube_id}` : `lesson:${item.slug}`;
}

/**
 * THE PACKAGE AS THE EDITOR HANDS IT TO `cert_admin_save`: every string
 * trimmed, every number a number, every list without blank lines, every
 * training item's key derived from its id or slug, a disabled part's spec kept
 * (a waived part is still edited), the format and version pinned. The database
 * runs `_cert_package_check` after this; this only keeps the form from sending
 * what a textarea leaves behind.
 */
export function normalizeEditorPackage(p: CertPackage): CertPackage {
	const items: TrainingItem[] = (p.training?.items ?? []).map((it) =>
		it.kind === 'lesson'
			? { kind: 'lesson', slug: str(it.slug).trim(), title: str(it.title).trim(), key: `lesson:${str(it.slug).trim()}` }
			: {
					kind: 'video',
					youtube_id: str(it.youtube_id).trim(),
					title: str(it.title).trim(),
					key: `yt:${str(it.youtube_id).trim()}`,
					...(num(it.start, 0) > 0 ? { start: Math.round(num(it.start, 0)) } : {})
				}
	);
	const project = (s: CertPackage['guided_project'], guided: boolean): CertPackage['guided_project'] =>
		s
			? {
					objective: str(s.objective).trim(),
					spec: str(s.spec),
					acceptance: (s.acceptance ?? []).map((a) => str(a).trim()).filter(Boolean),
					references: (s.references ?? [])
						.map((r) => ({ label: str(r.label).trim(), href: str(r.href).trim() }))
						.filter((r) => r.href),
					...(guided
						? {
								steps: (s.steps ?? []).map((st) => ({
									title: str(st.title).trim(),
									body: str(st.body),
									fade: st.fade === 'goal' || st.fade === 'hint' ? st.fade : 'full',
									...(str(st.hint).trim() ? { hint: str(st.hint).trim() } : {})
								}))
							}
						: {}),
					self_inspection: (s.self_inspection ?? []).map((a) => str(a).trim()).filter(Boolean),
					evidence: (s.evidence ?? [])
						.map((e) => ({ kind: e.kind, label: str(e.label).trim(), required: !!e.required }))
						.filter((e) => e.label)
				}
			: null;
	return {
		format: 'idea-certification',
		version: 1,
		code: str(p.code).trim().toUpperCase(),
		name: str(p.name).trim(),
		level: Math.max(1, Math.min(9, Math.round(num(p.level, 1)))),
		category: str(p.category).trim(),
		sort_order: Math.round(num(p.sort_order, 0)),
		renewal: p.renewal === 'school_year' ? 'school_year' : 'never',
		definition: str(p.definition).trim(),
		allows: str(p.allows).trim(),
		does_not_allow: str(p.does_not_allow).trim(),
		prerequisites: [...new Set((p.prerequisites ?? []).map((c) => str(c).trim().toUpperCase()).filter(Boolean))],
		parts: {
			guided: !!p.parts?.guided,
			exam: !!p.parts?.exam,
			autonomous: !!p.parts?.autonomous,
			checkout: !!p.parts?.checkout
		},
		training: {
			items,
			quick_checks: (p.training?.quick_checks ?? []).map((q, i) => ({
				id: str(q.id).trim() || `qc-${i + 1}`,
				after: str(q.after).trim(),
				prompt: str(q.prompt).trim(),
				options: (q.options ?? []).map((o) => str(o).trim()).filter(Boolean),
				answer: Math.max(0, Math.round(num(q.answer, 0))),
				...(str(q.explain).trim() ? { explain: str(q.explain).trim() } : {})
			}))
		},
		practice_quiz: (p.practice_quiz ?? []).map((q, i) => ({
			id: str(q.id).trim() || `pq-${i + 1}`,
			prompt: str(q.prompt).trim(),
			options: (q.options ?? []).map((o) => str(o).trim()).filter(Boolean),
			answer: Math.max(0, Math.round(num(q.answer, 0))),
			...(str(q.explain).trim() ? { explain: str(q.explain).trim() } : {})
		})),
		study_guide: str(p.study_guide),
		common_mistakes: (p.common_mistakes ?? [])
			.map((m) => ({ title: str(m.title).trim(), body: str(m.body).trim() }))
			.filter((m) => m.title || m.body),
		exam: p.exam
			? {
					time_limit_minutes: Math.max(1, Math.round(num(p.exam.time_limit_minutes, 30))),
					questions_per_exam: Math.max(1, Math.round(num(p.exam.questions_per_exam, 20))),
					topics: (p.exam.topics ?? [])
						.map((t) => ({
							id: str(t.id).trim().toLowerCase(),
							name: str(t.name).trim(),
							minimum: Math.max(0, Math.round(num(t.minimum, 1)))
						}))
						.filter((t) => t.id)
				}
			: null,
		guided_project: project(p.guided_project, true),
		autonomous_project: project(p.autonomous_project, false),
		checkout: p.checkout ? { card: str(p.checkout.card), filming_guide: str(p.checkout.filming_guide) } : null
	};
}

/** Publish is held while the current revision has any problem. */
export const publishBlocked = (problems: readonly string[] | null | undefined): boolean => (problems?.length ?? 0) > 0;

/** The pool rule in words: twice the exam length, every topic at its minimum. */
export function poolRuleWords(questionsPerExam: number): string {
	return `The pool needs at least ${questionsPerExam * 2} active questions in all (twice the ${questionsPerExam} an exam draws), and every topic needs at least its minimum.`;
}

export function poolSummaryOf(questions: readonly ExamQuestion[]): { total: number; by_topic: Record<string, number> } {
	const by_topic: Record<string, number> = {};
	let total = 0;
	for (const q of questions) {
		if (!q.active) continue;
		total += 1;
		by_topic[q.topic] = (by_topic[q.topic] ?? 0) + 1;
	}
	return { total, by_topic };
}

/** The answer key as the pool editor's one text field shows it, per type. */
export function answerToText(type: QuestionType, answer: ExamAnswerKey | null | undefined): string {
	if (answer == null) return '';
	switch (type) {
		case 'multiple_choice':
			return typeof answer === 'string' ? answer : '';
		case 'multiple_select':
			return Array.isArray(answer) ? answer.join(', ') : '';
		case 'numeric': {
			const a = answer as { value?: number; tolerance?: number; unit?: string };
			if (typeof a !== 'object' || Array.isArray(a)) return '';
			return [a.value ?? '', a.tolerance ?? '', a.unit ?? ''].join(' | ').replace(/\s\|\s$/, '');
		}
		case 'short': {
			const a = answer as { accept?: string[] };
			return typeof a === 'object' && !Array.isArray(a) && Array.isArray(a.accept) ? a.accept.join('\n') : '';
		}
	}
}

/** The text field back into the key the function stores, per type. */
export function textToAnswer(type: QuestionType, text: string): ExamAnswerKey {
	const t = text.trim();
	switch (type) {
		case 'multiple_choice':
			return t.toLowerCase();
		case 'multiple_select':
			return [...new Set(t.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
		case 'numeric': {
			const [v, tol, unit] = t.split('|').map((s) => s.trim());
			const out: { value: number; tolerance: number; unit?: string } = { value: num(v, 0), tolerance: num(tol, 0) };
			if (unit) out.unit = unit;
			return out;
		}
		case 'short':
			return { accept: linesToList(t) };
	}
}

export const QUESTION_TYPE_WORDS: Record<QuestionType, string> = {
	multiple_choice: 'Multiple choice',
	multiple_select: 'Multiple select',
	numeric: 'Numeric with tolerance',
	short: 'Short exact answer'
};

export const ANSWER_HELP: Record<QuestionType, string> = {
	multiple_choice: 'The key of the right option, for example a.',
	multiple_select: 'The keys of every right option, separated by commas, for example a, c.',
	numeric: 'Value | tolerance | unit, for example 2292 | 50 | rpm.',
	short: 'One accepted spelling per line.'
};

/** A fresh question row for the pool editor. */
export function emptyQuestion(topic: string): ExamQuestion {
	return {
		topic,
		type: 'multiple_choice',
		prompt: '',
		options: [
			{ key: 'a', text: '' },
			{ key: 'b', text: '' }
		],
		answer: 'a',
		explain: null,
		active: true
	};
}

/** The pool as `cert_exam_pool_replace` takes it: keys filtered, blank options dropped. */
export function normalizePool(questions: readonly ExamQuestion[]): ExamQuestion[] {
	return questions.map((q) => {
		const choice = q.type === 'multiple_choice' || q.type === 'multiple_select';
		const options = choice
			? (q.options ?? []).map((o) => ({ key: str(o.key).trim().toLowerCase(), text: str(o.text).trim() })).filter((o) => o.key)
			: null;
		return {
			...(q.id ? { id: q.id } : {}),
			topic: str(q.topic).trim().toLowerCase(),
			type: q.type,
			prompt: str(q.prompt).trim(),
			options,
			answer: q.answer,
			explain: str(q.explain).trim() || null,
			active: !!q.active
		};
	});
}

/** What `POST /api/certifications/package/import` answers, both steps. */
export interface ImportAnswer {
	ok: boolean;
	problems?: string[];
	diff?: { path: string; before: unknown; after: unknown }[];
	summary?: {
		code: string;
		name: string;
		existing: boolean;
		existing_id: string | null;
		current_revision: number | null;
		questions: number;
		lessons: number;
		training_items: number;
		changes: number;
	} | null;
	id?: string;
	revision?: number | null;
	message?: string;
	step?: string;
}

/** What the engine editor's injected save transport answers. */
export type EngineSaveAnswer =
	| { ok: true; revision: number | null; publish_problems: string[] }
	| { ok: false; message: string; problems?: string[]; retryable: boolean };

/* ------------------------------------------------------------------------ */
/* Lessons                                                                   */
/* ------------------------------------------------------------------------ */

export const LESSON_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const LESSON_READY_MESSAGE = 'idea:ready';
export const LESSON_READY_REFUSAL =
	'This lesson never sends idea:ready, so the portal cannot tell when it has loaded. Add the handshake from the HTML assignment spec and try again.';
export const LESSON_TOO_LARGE = (size: number) =>
	`This file is ${Math.round(size / 1024)} KB; a lesson holds at most ${LESSON_FILE_MAX_BYTES / 1024 / 1024} MiB.`;

/* ------------------------------------------------------------------------ */
/* Logs and exports                                                          */
/* ------------------------------------------------------------------------ */

export function exportQuery(kind: string, from: string, to: string): string {
	const params = new URLSearchParams({ kind });
	const f = from.trim();
	const t = to.trim();
	if (f) params.set('from', `${f}T00:00:00`);
	if (t) params.set('to', `${t}T23:59:59`);
	return `${CERT_API.exportLogs}?${params.toString()}`;
}

export const EXPORT_README_SENTENCE =
	'Every export is one ZIP holding the rows as JSON and as CSV plus a README that explains the fields, written so a Claude chat can read it without you reading it first.';

/** A YYYY-MM-DD day `days` before `today`, for a default export range. */
export function daysAgo(today: string, days: number): string {
	const d = new Date(`${today}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

/** The columns a flat export row carries, in a stable order with `at` first. */
export function rowColumns(rows: readonly Record<string, unknown>[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const row of rows) for (const k of Object.keys(row)) if (!seen.has(k)) (seen.add(k), out.push(k));
	return out.sort((a, b) => (a === 'at' ? -1 : b === 'at' ? 1 : a === 'id' ? -1 : b === 'id' ? 1 : 0));
}

export function cellWords(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return JSON.stringify(value);
}
