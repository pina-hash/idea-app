/**
 * The knowledge-mode clock, client side.
 *
 * WHY THIS IS A MODULE AND NOT TWO ONMOUNTS. Drawing Reading has its own page
 * and GD&T / Spot the Error share `KnowledgePlay.svelte`, so "start the clock
 * when the question renders" has two call sites and would otherwise have two
 * implementations of the degradation rule below. Two spellings of "is the
 * server clock available" is exactly the pair that stops agreeing, and the
 * direction it fails in is silent: a surface that quietly decided the clock was
 * absent goes on sending a browser number nothing checks.
 *
 * THE LADDER. `gauntlet_knowledge_start` arrives with 0148, which is applied by
 * hand and separately from this deploy, so a deployment sitting between the two
 * is a real state (CLAUDE.md, select ladders). The client therefore ships
 * FIRST and degrades past the missing function on `PGRST202` ALONE -- the
 * code, never the message, so a runtime error INSIDE the function fails closed
 * instead of falling through to the weaker path.
 *
 * AND THE SUCCESSFUL START IS WHAT LICENSES OMITTING `p_elapsed_ms`. That is
 * the tidiest form of the deploy-ordering rule: the RPC and the arithmetic
 * change that ignores the parameter land in the SAME migration, so a start that
 * came back PROVES the server is timing this submit and the browser's number is
 * not wanted. Where the start could not run, the caller keeps sending it and
 * the world behaves exactly as it did before 0148 -- which matters, because the
 * pre-0148 function scores a MISSING `p_elapsed_ms` as zero, and a client that
 * stopped sending one before the migration landed would fill every knowledge
 * board with 0.00 rows.
 */

/** The narrowest client shape this needs: one `rpc` call. */
export interface KnowledgeClockClient {
	rpc(
		fn: string,
		args: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type KnowledgeClockState =
	/** The call has not settled yet. Nothing should be submitted in this state. */
	| 'starting'
	/** The server stamped the clock. Do not send an elapsed time. */
	| 'server'
	/** 0148 is not applied here. Keep timing in the browser, as before. */
	| 'client'
	/** The start genuinely failed. The submit will refuse; say so first. */
	| 'failed';

export interface KnowledgeClock {
	state: KnowledgeClockState;
	/**
	 * Is a ranked time still available for this question. False once the student
	 * has answered it before: 0148 closes the clock on the first submit and never
	 * reopens it, so a further attempt is practice. True whenever the answer is
	 * not known (`client`, `failed`, `starting`), because claiming a run will not
	 * count when it will is the worse of the two mistakes.
	 */
	timed: boolean;
	/** Empty unless `state` is 'failed'. Rendered verbatim where the student is. */
	message: string;
}

export const CLOCK_STARTING: KnowledgeClock = { state: 'starting', timed: true, message: '' };

/**
 * A start whose function is missing is not a failure and must not read as one.
 * PostgREST answers this exact code, and only this one, for "no such function".
 */
const FUNCTION_MISSING = 'PGRST202';

const FAILED_MESSAGE =
	'The timer for this question could not be started, so an answer will not be accepted yet. Reload the page to try again.';

/** Stamp the server-side clock for one question. Never throws. */
export async function startKnowledgeClock(
	supabase: KnowledgeClockClient,
	challengeId: string
): Promise<KnowledgeClock> {
	let error: { code?: string; message?: string } | null = null;
	let data: unknown = null;
	try {
		const res = await supabase.rpc('gauntlet_knowledge_start', { p_challenge_id: challengeId });
		error = res.error;
		data = res.data;
	} catch {
		// A transport throw is not a considered refusal either way, and a thrown
		// exception inside a mount handler would take the page down over a timer.
		return { state: 'failed', timed: true, message: FAILED_MESSAGE };
	}

	if (error) {
		if (error.code === FUNCTION_MISSING) return { state: 'client', timed: true, message: '' };
		return { state: 'failed', timed: true, message: FAILED_MESSAGE };
	}

	const row = (data ?? {}) as { timed?: boolean };
	return { state: 'server', timed: row.timed !== false, message: '' };
}

/**
 * Should the caller put its own elapsed time on the form.
 *
 * ONE PREDICATE, read by the components AND by whatever decides the copy, so
 * "the server is timing this" cannot be answered two ways on one page.
 */
export const clockIsServerSide = (clock: KnowledgeClock): boolean => clock.state === 'server';

/** May an answer be sent yet. False only while the start is still in flight. */
export const clockAcceptsAnswers = (clock: KnowledgeClock): boolean => clock.state !== 'starting';

/**
 * The sentence shown once a review submit comes back, or null when this run was
 * the timed one. `timed_attempt` is absent on a pre-0148 server, and absence
 * must not read as "this did not count".
 */
export function reviewNote(timedAttempt: boolean | undefined): string | null {
	if (timedAttempt !== false) return null;
	return 'Answered again for practice. Your ranked time for this question was set the first time you answered it, so this run does not change it.';
}

/** The same fact, said BEFORE the student spends effort on a second attempt. */
export const AHEAD_NOTE =
	'You have answered this question before, so its ranked time is already set. Answering again is practice and does not change your place on the board.';
