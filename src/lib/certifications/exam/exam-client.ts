/**
 * THE EXAM RUNTIME'S PURE HALF (ledger 0391): the transport the runner is
 * handed, the readers that turn a function's jsonb into one of a few named
 * shapes, the clock arithmetic and the answer validators. No Svelte, no DOM:
 * `tests/cert-exam-client.test.ts` pins every rule.
 *
 * THE TRANSPORT IS INJECTED. `ExamRunner.svelte` fetches nothing itself: the
 * exam route builds `examTransportFrom(supabase.rpc)` and the harness answers
 * in memory, so the identical component is exercised with no network
 * (CLAUDE.md, "Server calls are INJECTED as a transports object"). Each method
 * answers the function's own jsonb (`cert_exam_open`, `_answer`, `_flag`,
 * `_submit`, 0262) or a `{ ok: false, reason, message }` the reader renders.
 *
 * THE BROWSER NEVER HOLDS AN ANSWER KEY, and nothing here could hold one: the
 * question shape (`ExamQuestionView`) has no answer field, the result shape
 * (`ExamStudentResult`) carries topics and counts, and a reader that met a key
 * would have nowhere to put it.
 */
import { isRefusal, type ExamAnswer, type ExamFlagKind, type ExamOpenJson, type ExamQuestionView, type ExamStudentResult, type QuestionType } from '../types';

export interface ExamTransport {
	open(examId: string): Promise<unknown>;
	answer(examId: string, index: number, answer: ExamAnswer): Promise<unknown>;
	flag(examId: string, kind: ExamFlagKind): Promise<unknown>;
	submit(examId: string): Promise<unknown>;
}

/** The functions, by name, so the route and a test name them once. */
export const EXAM_RPC = {
	open: 'cert_exam_open',
	answer: 'cert_exam_answer',
	flag: 'cert_exam_flag',
	submit: 'cert_exam_submit'
} as const;

export type RpcLike = (
	fn: string,
	args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string; code?: string | null } | null }>;

/** The production transport over `supabase.rpc`, with a PostgREST error folded into a refusal. */
export function examTransportFrom(rpc: RpcLike): ExamTransport {
	const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
		try {
			const { data, error } = await rpc(fn, args);
			if (error) return { ok: false, reason: error.code ?? 'error', message: error.message };
			return data;
		} catch (e) {
			return { ok: false, reason: 'network', message: (e as Error)?.message || EXAM_NETWORK_SENTENCE };
		}
	};
	return {
		open: (examId) => call(EXAM_RPC.open, { p_exam: examId }),
		answer: (examId, index, answer) => call(EXAM_RPC.answer, { p_exam: examId, p_index: index, p_answer: answer }),
		flag: (examId, kind) => call(EXAM_RPC.flag, { p_exam: examId, p_kind: kind }),
		submit: (examId) => call(EXAM_RPC.submit, { p_exam: examId })
	};
}

/* ------------------------------------------------------------------------ */
/* Readers                                                                   */
/* ------------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

const QUESTION_TYPES_SET = new Set<string>(['multiple_choice', 'multiple_select', 'numeric', 'short']);

/** A question the student may be shown, or null when the shape is not one. Never carries an answer. */
export function readQuestion(value: unknown): ExamQuestionView | null {
	const q = obj(value);
	if (!q) return null;
	if (typeof q.index !== 'number' || typeof q.total !== 'number') return null;
	if (typeof q.type !== 'string' || !QUESTION_TYPES_SET.has(q.type)) return null;
	if (typeof q.prompt !== 'string') return null;
	const options = Array.isArray(q.options)
		? q.options
				.map((o) => obj(o))
				.filter((o): o is Obj => !!o && typeof o.key === 'string' && typeof o.text === 'string')
				.map((o) => ({ key: o.key as string, text: o.text as string }))
		: null;
	return {
		index: q.index,
		total: q.total,
		type: q.type as QuestionType,
		prompt: q.prompt,
		options,
		unit: typeof q.unit === 'string' && q.unit ? q.unit : null,
		deadline: typeof q.deadline === 'string' ? q.deadline : ''
	};
}

/** The student's result, or null. Topics only; a question or a key has no field here. */
export function readResult(value: unknown): ExamStudentResult | null {
	const r = obj(value);
	if (!r || r.ok !== true || typeof r.passed !== 'boolean') return null;
	const topics = Array.isArray(r.missed_topics) ? r.missed_topics.filter((t): t is string => typeof t === 'string') : [];
	return {
		ok: true,
		passed: r.passed,
		total: typeof r.total === 'number' ? r.total : 0,
		correct: typeof r.correct === 'number' ? r.correct : 0,
		missed_topics: topics,
		cooldown_until: typeof r.cooldown_until === 'string' ? r.cooldown_until : null
	};
}

export type Refused = { kind: 'refused'; reason: string; message: string };
const refused = (reason: string, message: string): Refused => ({ kind: 'refused', reason, message });

function readRefusal(value: unknown): Refused | null {
	if (isRefusal(value)) return refused(value.reason || 'refused', value.message || EXAM_REFUSED_SENTENCE);
	return null;
}

export type OpenReading =
	| { kind: 'question'; exam: ExamOpenJson['exam']; question: ExamQuestionView }
	| { kind: 'done'; exam: ExamOpenJson['exam'] }
	| { kind: 'result'; result: ExamStudentResult }
	| { kind: 'expired'; message: string }
	| Refused;

/** What `cert_exam_open` answered. */
export function readOpen(value: unknown): OpenReading {
	const r = readRefusal(value);
	if (r) return r.reason === 'release_expired' ? { kind: 'expired', message: r.message } : r;
	const result = readResult(value);
	if (result) return { kind: 'result', result };
	const v = obj(value);
	const exam = v && v.ok === true ? obj(v.exam) : null;
	if (!exam || typeof exam.id !== 'string') return refused('unexpected', EXAM_UNEXPECTED_SENTENCE);
	const shaped: ExamOpenJson['exam'] = {
		id: exam.id,
		state: (typeof exam.state === 'string' ? exam.state : 'in_progress') as ExamOpenJson['exam']['state'],
		total: typeof exam.total === 'number' ? exam.total : 0,
		current_index: typeof exam.current_index === 'number' ? exam.current_index : 0,
		deadline: typeof exam.deadline === 'string' ? exam.deadline : ''
	};
	if (shaped.state === 'expired') return { kind: 'expired', message: EXAM_EXPIRED_SENTENCE };
	const question = readQuestion(v!.question);
	if (question) return { kind: 'question', exam: shaped, question };
	return { kind: 'done', exam: shaped };
}

export type AnswerReading =
	| { kind: 'question'; question: ExamQuestionView }
	| { kind: 'done' }
	| { kind: 'result'; result: ExamStudentResult }
	| Refused;

/** What `cert_exam_answer` answered. */
export function readAnswer(value: unknown): AnswerReading {
	const r = readRefusal(value);
	if (r) return r;
	const result = readResult(value);
	if (result) return { kind: 'result', result };
	const v = obj(value);
	if (!v || v.ok !== true) return refused('unexpected', EXAM_UNEXPECTED_SENTENCE);
	if (v.done === true) return { kind: 'done' };
	const question = readQuestion(v.question);
	if (question) return { kind: 'question', question };
	return refused('unexpected', EXAM_UNEXPECTED_SENTENCE);
}

export type SubmitReading = { kind: 'result'; result: ExamStudentResult } | Refused;

/** What `cert_exam_submit` answered. */
export function readSubmit(value: unknown): SubmitReading {
	const r = readRefusal(value);
	if (r) return r;
	const result = readResult(value);
	if (result) return { kind: 'result', result };
	return refused('unexpected', EXAM_UNEXPECTED_SENTENCE);
}

/* ------------------------------------------------------------------------ */
/* The clock                                                                 */
/* ------------------------------------------------------------------------ */

/** Milliseconds until `deadline`, never negative; 0 for no or an unreadable deadline. */
export function remainingMs(deadline: string | Date | null | undefined, now: Date): number {
	if (!deadline) return 0;
	const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
	const ms = d.getTime() - now.getTime();
	if (!Number.isFinite(ms)) return 0;
	return Math.max(0, ms);
}

/** "12:34", or "1:02:03" past an hour; "0:00" at and after the deadline. */
export function formatRemaining(deadline: string | Date | null | undefined, now: Date): string {
	const total = Math.floor(remainingMs(deadline, now) / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Has the deadline passed? A missing deadline never has. */
export function deadlinePassed(deadline: string | Date | null | undefined, now: Date): boolean {
	if (!deadline) return false;
	return remainingMs(deadline, now) <= 0;
}

/* ------------------------------------------------------------------------ */
/* Answers                                                                   */
/* ------------------------------------------------------------------------ */

/** A typed number from a text box: "1,234.5" and " 12 " read; "" and "abc" do not. */
export function parseNumericInput(text: string): number | null {
	const t = (text ?? '').replace(/,/g, '').trim();
	if (t === '') return null;
	if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

/** A short answer: trimmed, non-empty, or null. */
export function parseShortInput(text: string): string | null {
	const t = (text ?? '').trim();
	return t === '' ? null : t;
}

/** Is this answer complete enough to send? Next stays `aria-disabled` until it is. */
export function answerIsComplete(type: QuestionType, value: ExamAnswer | undefined): boolean {
	switch (type) {
		case 'multiple_choice':
			return typeof value === 'string' && value !== '';
		case 'multiple_select':
			return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v !== '');
		case 'numeric':
			return typeof value === 'number' && Number.isFinite(value);
		case 'short':
			return typeof value === 'string' && value.trim() !== '';
		default:
			return false;
	}
}

/** "Question 3 of 20" from a zero-based index. */
export function questionCounter(index: number, total: number): string {
	return `Question ${Math.max(0, index) + 1} of ${Math.max(total, index + 1)}`;
}

/* ------------------------------------------------------------------------ */
/* Words                                                                     */
/* ------------------------------------------------------------------------ */

export const EXAM_BEGIN_WORD = 'Begin exam';
export const EXAM_NEXT_WORD = 'Next question';
export const EXAM_SUBMIT_WORD = 'Submit exam';
export const EXAM_PASSED_WORD = 'Passed';
export const EXAM_FAILED_WORD = 'Not this time';
export const EXAM_EXPIRED_SENTENCE = 'This release has expired. Ask your proctor to release the exam again.';
export const EXAM_ANSWER_TO_GO_ON = 'Answer to go on. There is no going back.';
export const EXAM_NO_BACK_SENTENCE = 'One question at a time, with no going back.';
export const EXAM_PASSED_SENTENCE = 'You answered every question correctly. The exam is checked off on your certification.';
export const EXAM_FAILED_SENTENCE = (correct: number, total: number) =>
	`You answered ${correct} of ${total} correctly, and the exam needs every one. Here are the topics to review.`;
export const EXAM_TIME_UP_SENTENCE = 'Time is up. Your answers so far were submitted.';
export const EXAM_REFUSED_SENTENCE = 'The exam could not continue.';
export const EXAM_UNEXPECTED_SENTENCE = 'The exam answered in a shape this page does not know. Reload and try again.';
export const EXAM_NETWORK_SENTENCE = 'The exam could not reach the server. Check the connection and try again.';
export const EXAM_SUBMITTING_LABEL = 'Checking your answers';
export const EXAM_OPENING_LABEL = 'Opening your exam';
/** The reason `cert_exam_end` records when the proctor presses End exam on the live view. */
export const EXAM_END_REASON = 'Ended by the proctor from the live view';

/** The word a proctor reads for each flag kind. */
export const FLAG_WORDS: Record<ExamFlagKind, string> = {
	blur: 'Lost focus',
	hidden: 'Left the tab',
	fullscreen_exit: 'Left full screen',
	resize: 'Window shrank',
	copy: 'Tried to copy',
	paste: 'Tried to paste',
	contextmenu: 'Right clicked'
};

/** The word a proctor reads for each exam state, with the tone beside it. */
export const EXAM_STATE_WORDS: Record<string, { word: string; tone: 'ok' | 'warn' | 'bad' | 'info' }> = {
	released: { word: 'Released, waiting to open', tone: 'info' },
	in_progress: { word: 'In progress', tone: 'ok' },
	submitted: { word: 'Submitted', tone: 'info' },
	expired: { word: 'Release expired', tone: 'warn' }
};
