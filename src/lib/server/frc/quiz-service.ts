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
	/** Grade + finalize an attempt against its held key; returns only the result. */
	gradeAttempt(
		userId: string,
		attemptId: string,
		answers: number[]
	): Promise<{ passed: boolean; score: number; missed: string[] } | { error: string }>;
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
 * Submit an attempt: grade server-side, run `onPass` on a pass, and on a fail
 * return the missed TOPIC NAMES plus the fresh cooldown. Never returns correct
 * answers. `onPass` is a caller-supplied hook only; the real (DB-backed) store
 * already records completion inline inside its `gradeAttempt` (the
 * `frc_quiz_grade` RPC, see 0041_frc_progress_lockdown.sql), so the real
 * endpoint's `onPass` is a no-op — the hook exists for the dev mock and any
 * future non-DB store.
 */
export async function submitQuiz(
	store: QuizStore,
	userId: string,
	unitId: string,
	attemptId: string,
	answers: number[],
	cooldownFn: (failStreak: number) => number,
	nowMs: number,
	onPass: () => Promise<void>
): Promise<SubmitResult> {
	const graded = await store.gradeAttempt(userId, attemptId, answers);
	if ('error' in graded) {
		return { ok: false, reason: graded.error === 'no_attempt' ? 'no_attempt' : 'unavailable' };
	}

	if (graded.passed) await onPass();

	let cooldownRemainingSec = 0;
	if (!graded.passed) {
		const finalized = await store.listFinalized(userId, unitId);
		cooldownRemainingSec = cooldownState(finalized, nowMs, cooldownFn).remainingSec;
	}

	return {
		ok: true,
		passed: graded.passed,
		score: graded.score,
		missedTopics: graded.passed ? [] : missedTopics(graded.missed),
		cooldownRemainingSec
	};
}
