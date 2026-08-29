/**
 * FRC quiz orchestration, SERVER-ONLY. Shared by the real unit endpoint (DB
 * store) and the dev harness mock (in-memory store) so both honor the exact
 * same contract: start enforces the cooldown then serves stems + shuffled
 * options with NO answer key; submit grades server-side and returns only the
 * result (and missed topic names on a fail).
 *
 * The storage backend is abstracted behind `QuizStore` — the answer key never
 * appears in a value returned toward the client on either path.
 */
import {
	cooldownState,
	getQuizBank,
	maxTestLength,
	missedTopics,
	pickAttempt,
	type AttemptRecord,
	type QuizQuestion,
	type SealedItem
} from '$lib/server/frc/quiz-engine';

export interface QuizStore {
	/** Finalized (passed/failed) attempts for cooldown, newest-anywhere order. */
	listFinalized(userId: string, unitId: string): Promise<AttemptRecord[]>;
	/** Persist a new in-flight attempt with its sealed key; returns its id. */
	createAttempt(
		userId: string,
		unitId: string,
		sealed: SealedItem[],
		passPercent: number
	): Promise<{ attemptId: string } | { error: string }>;
	/**
	 * Grade + finalize an attempt against its held key; returns only the result.
	 *
	 * `unitId` is the unit the ATTEMPT was for, read off the stored row. It is
	 * optional because a store need not be able to answer it (the dev harness
	 * mock keys its log by the unit it was handed, so the two can never differ
	 * there); where it IS answered it OUTRANKS the `unitId` argument
	 * `submitQuiz` was called with, which is whatever the URL said. See
	 * `submitQuiz` for why that matters.
	 */
	gradeAttempt(
		userId: string,
		attemptId: string,
		answers: number[]
	): Promise<
		{ passed: boolean; score: number; missed: string[]; unitId?: string } | { error: string }
	>;
}

export type StartResult =
	| { ok: true; attemptId: string; total: number; questions: QuizQuestion[] }
	| { ok: false; reason: 'cooldown'; remainingSec: number }
	| { ok: false; reason: 'unavailable' };

export type SubmitResult =
	| { ok: true; passed: boolean; score: number; missedTopics: string[]; cooldownRemainingSec: number }
	| { ok: false; reason: 'no_attempt' | 'unavailable' };

/**
 * Start an attempt: refuse while the cooldown is active, else select + shuffle
 * and hand the store the sealed key. `cooldownFn` supplies the tunable seconds
 * (track.ts). Returns only client-safe questions.
 */
export async function startQuiz(
	store: QuizStore,
	userId: string,
	unitId: string,
	cooldownFn: (failStreak: number) => number,
	nowMs: number
): Promise<StartResult> {
	const bank = getQuizBank(unitId);
	if (!bank) return { ok: false, reason: 'unavailable' };

	const finalized = await store.listFinalized(userId, unitId);
	const cd = cooldownState(finalized, nowMs, cooldownFn);
	if (cd.remainingSec > 0) return { ok: false, reason: 'cooldown', remainingSec: cd.remainingSec };

	const { questions, sealed } = pickAttempt(bank);
	const created = await store.createAttempt(userId, unitId, sealed, bank.passPercent);
	if ('error' in created) return { ok: false, reason: 'unavailable' };

	return { ok: true, attemptId: created.attemptId, total: questions.length, questions };
}

/**
 * An option index that no sealed key can ever hold, so it always grades wrong.
 * `sealed[i].c` is a position within an option list, hence never negative; SQL
 * `frc_quiz_grade` already coalesces a missing answer to exactly this value,
 * so the canonical grader and its SQL mirror agree on what "not answered"
 * looks like without either being told about the other.
 */
export const NO_ANSWER = -1;

/**
 * Normalize a client's `answers` payload into option indices the graders can
 * compare. THE ONE IMPLEMENTATION -- every caller of `submitQuiz` gets it,
 * because `submitQuiz` runs it rather than trusting what it was handed.
 *
 * WHAT THIS EXISTS TO REFUSE, and it is not exploitation. The endpoint used to
 * coerce with `Number(a)` at its own call site, and `Number(null)` is 0: a
 * question a student LEFT BLANK and a question where they chose the first
 * option arrived at the grader as the same value, so the server could not tell
 * them apart -- and a blank sheet scored 25 against a key containing a zero and
 * 0 against one that does not. Neither opens the gate (after the shuffle the
 * correct index is uniform, so guessing 0 everywhere is worth chance), but the
 * server was recording an answer nobody gave.
 *
 * NON-INTEGRALITY IS REFUSED FOR A SEPARATE REASON: MIRROR DRIFT. Postgres
 * `integer[]` ROUNDS a numeric it is handed (2.7 becomes 3, measured), while
 * the canonical TypeScript grader compares 2.7 against an integer and calls it
 * wrong. So an unchecked non-integer is the one input on which the two graders
 * return DIFFERENT verdicts for the same submission -- exactly the silent
 * divergence a hand-written SQL mirror exists to be protected from. Mapping it
 * to `NO_ANSWER` here makes both answer "wrong", by construction, before
 * either sees it.
 *
 * RANGE IS DELIBERATELY NOT CHECKED, and does not need to be: an index outside
 * the option list simply matches no sealed value and is already wrong on both
 * sides. What IS bounded is the LENGTH, at the largest `testLength` any bank
 * declares (derived, never a literal), so an unbounded array cannot be pushed
 * through into an `integer[]` bind. Grading is unaffected -- entries past the
 * last question were always ignored, since the graders walk `sealed`.
 *
 * A NUMERIC STRING IS A REAL CHOICE and still grades: `'0'` is what an older
 * client or a hand-rolled request may send for option 0, and refusing it would
 * be a narrowing dressed up as a fix.
 */
export function normalizeAnswers(raw: unknown): number[] {
	if (!Array.isArray(raw)) return [];
	const n = Math.min(raw.length, maxTestLength());
	// `Array.from` with a length, NOT `raw.slice().map()`: map SKIPS a hole in a
	// sparse array and leaves it a hole, so `[0, , 2]` came back as `[0, <hole>,
	// 2]` -- an array typed `number[]` with an `undefined` in it. It graded
	// correctly by luck on both sides (undefined matches no index, and JSON
	// writes a hole as null, which SQL coalesces to -1), but a function whose
	// whole job is to make "not answered" representable must not hand back the
	// one value it exists to replace.
	return Array.from({ length: n }, (_, i) => coerceAnswer(raw[i]));
}

function coerceAnswer(a: unknown): number {
	if (typeof a !== 'number' && typeof a !== 'string') return NO_ANSWER;
	// An empty or blank string is Number()-coerced to 0; it is not a choice.
	if (typeof a === 'string' && a.trim() === '') return NO_ANSWER;
	const n = Number(a);
	return Number.isInteger(n) ? n : NO_ANSWER;
}

/**
 * Submit an attempt: grade server-side, run `onPass` on a pass, and on a fail
 * return the missed TOPIC NAMES plus the fresh cooldown. Never returns correct
 * answers. `onPass` is a caller-supplied hook only; the real (DB-backed) store
 * already records completion inline inside its `gradeAttempt` (the
 * `frc_quiz_grade` RPC, see 0041_frc_progress_lockdown.sql), so the real
 * endpoint's `onPass` is a no-op — the hook exists for the dev mock and any
 * future non-DB store.
 *
 * `answers` is taken RAW and normalized here (see `normalizeAnswers`), so a
 * caller cannot hand the graders a value they cannot tell apart from a choice.
 *
 * THE FAIL RESPONSE FOLLOWS THE ATTEMPT'S UNIT, NEVER THE CALLER'S. `unitId`
 * is whatever the URL said, and the two can differ: the grade is done against
 * the sealed key on the attempt row, so an MDM-9 attempt submitted through the
 * MDM-1 URL is graded and recorded as MDM-9 -- correctly -- while everything
 * this function then REPORTS used to be looked up under MDM-1. Measured: a
 * student who fails that way is told `cooldownRemainingSec: 0` on a unit they
 * just failed, while a `start` on the real unit is still refused, and the
 * missed topics are named out of the wrong bank. The store's own `unitId`
 * outranks the argument wherever it answers one.
 */
export async function submitQuiz(
	store: QuizStore,
	userId: string,
	unitId: string,
	attemptId: string,
	answers: unknown,
	cooldownFn: (failStreak: number) => number,
	nowMs: number,
	onPass: () => Promise<void>
): Promise<SubmitResult> {
	const graded = await store.gradeAttempt(userId, attemptId, normalizeAnswers(answers));
	if ('error' in graded) {
		return { ok: false, reason: graded.error === 'no_attempt' ? 'no_attempt' : 'unavailable' };
	}

	// The unit that was actually graded, which is the attempt's own wherever the
	// store can say so. Everything below reports on THAT unit.
	const gradedUnitId = graded.unitId ?? unitId;

	if (graded.passed) await onPass();

	let cooldownRemainingSec = 0;
	if (!graded.passed) {
		const finalized = await store.listFinalized(userId, gradedUnitId);
		cooldownRemainingSec = cooldownState(finalized, nowMs, cooldownFn).remainingSec;
	}

	return {
		ok: true,
		passed: graded.passed,
		score: graded.score,
		// Name the missed objectives from the GRADED unit's bank (fallback inside).
		missedTopics: graded.passed
			? []
			: missedTopics(graded.missed, getQuizBank(gradedUnitId)?.objectives),
		cooldownRemainingSec
	};
}
