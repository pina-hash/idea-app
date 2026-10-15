// src/lib/classroom/grading-direct.ts
//
// "SCORE OUT OF N", TYPED, AND THE PERFECT SCORE AWARD (0242, IDEA Coin V2).
//
// Two grading capabilities 0242 added, and the vocabulary for both, kept out of
// `GradingConsole.svelte` so the single-student path, the batch path and the
// harness read ONE spelling of each rule.
//
// THE DIRECT SCORE. A grader may type the score of record, with or without a
// rubric. `classroom_grade_direct` stores it as `direct_score` and then runs the
// ONE grading rule (`classroom_grade_submission`), which honours it: the score
// is the direct score plus any extra credit, and the rubric sum is not used.
// An empty field sends null, which clears the direct score and puts the rubric
// sum back as the score.
//
// THE PERFECT SCORE AWARD. One switch per class posting. A returned score that
// is full (extra credit not counted) pays round(points / 25), at least 1, coins
// automatically. The database settles it on every grade write and on every
// switch; this module only names the numbers and the words.
//
// ABSENCE IS THE MECHANISM FOR BOTH. The methods ride on the teacher transports
// object `createTeacherEngineTransports` builds (so every route that already
// hands the console its transports gains them with no route edit), and the
// console asks `directGradingOf` / `perfectScoreOf` whether they are there. A
// surface that does not hand them in renders neither control.

import type { StudentWork, SubmissionRow, GradingData } from '$lib/classroom/assignment-spec';
import type { TxResult } from '$lib/classroom/classroom';
import { COIN_SYMBOL, coinNumber } from '$lib/coin-format';

// ---------------------------------------------------------------------------
// 1. The direct score.
// ---------------------------------------------------------------------------

/** What `classroom_grade_direct` answers: `classroom_grade_submission`'s result plus `out_of`. */
export interface DirectGradeResult {
	ok: boolean;
	/** `no_total`, `out_of_range`, `override_needs_comment`, `incomplete_scores`. */
	reason?: string;
	out_of?: number | null;
	score?: number;
	state?: string;
	extra_credit?: number | null;
	direct_score?: number | null;
	missing?: string[];
}

export interface DirectGradingTransports {
	/**
	 * `classroom_grade_direct`. `score` null clears the direct score. `extraCredit`
	 * null leaves whatever is stored alone (0171's contract); 0 takes it back.
	 */
	gradeDirect(
		itemId: string,
		studentEmail: string,
		score: number | null,
		comment: string | null,
		release: boolean,
		extraCredit: number | null
	): Promise<TxResult<DirectGradeResult>>;
}

/** A submission row as the 0242 rung delivers it. `undefined` = the column was not selected. */
export type SubmissionWithDirect = SubmissionRow & { direct_score?: number | null };

/** The grading payload as the 0242 rung delivers it. */
export type GradingDataWithDirect = GradingData & {
	/**
	 * Did the submissions come back WITH 0242's `direct_score`. FALSE MEANS
	 * "CANNOT TELL", exactly as `extraCreditReady` does, and it is what licenses
	 * the RPC: 0242 adds the column and `classroom_grade_direct` in one file.
	 */
	directScoreReady?: boolean;
};

/** The stored direct score of a row: a number, null for none, undefined off a pre-0242 payload. */
export function directScoreOf(sub: SubmissionRow | null | undefined): number | null | undefined {
	if (!sub) return null;
	const raw = (sub as SubmissionWithDirect).direct_score;
	if (raw === undefined) return undefined;
	if (raw === null) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

/** The same, off a `StudentWork` row. */
export function studentDirectScore(s: StudentWork | null | undefined): number | null | undefined {
	return directScoreOf(s?.submission ?? null);
}

/** Normalize a raw `direct_score` column value onto a row (PostgREST may answer a numeric as a string). */
export function withDirectScore<T extends SubmissionRow>(row: T, raw: unknown): T & { direct_score?: number | null } {
	if (raw === undefined) return row;
	const n = raw === null ? null : Number(raw);
	return { ...row, direct_score: n === null || !Number.isFinite(n) ? null : n };
}

/**
 * Does this transports object carry the direct-score write. A type guard rather
 * than a cast, so a harness or a route that hands in the plain teacher
 * transports gets no field at all.
 */
export function directGradingOf(t: unknown): DirectGradingTransports | null {
	if (t && typeof (t as Partial<DirectGradingTransports>).gradeDirect === 'function') {
		return t as DirectGradingTransports;
	}
	return null;
}

/**
 * What the grader typed, judged against the total. A string because `bind:value`
 * on a number input COERCES, and `.trim()` on a number throws (the trap this
 * repo has hit three times).
 *
 *   blank           -> value null, no error: clear the direct score.
 *   not a number    -> error.
 *   outside 0..N    -> error, the same refusal the database makes.
 */
export function parseDirectScore(
	typed: string | number | null | undefined,
	outOf: number
): { value: number | null; error: string | null } {
	const raw = String(typed ?? '').trim();
	if (!raw) return { value: null, error: null };
	const n = Number(raw);
	if (!Number.isFinite(n)) return { value: null, error: `The score must be a number from 0 to ${outOf}.` };
	if (!(outOf > 0)) return { value: n, error: DIRECT_NO_TOTAL };
	if (n < 0 || n > outOf) return { value: n, error: `The score must be from 0 to ${outOf}. Use extra credit for points beyond ${outOf}.` };
	return { value: n, error: null };
}

/** The `no_total` refusal, in words. */
export const DIRECT_NO_TOTAL =
	'This assignment has no points and no rubric, so there is nothing to score out of. Give it points on the assignment page first.';

/**
 * A refusal from `classroom_grade_direct` in the grader's words. The two reasons
 * 0242 added and the two `classroom_grade_submission` can still answer through it.
 */
export function directRefusalSentence(res: DirectGradeResult): string {
	switch (res.reason) {
		case 'no_total':
			return DIRECT_NO_TOTAL;
		case 'out_of_range':
			return res.out_of != null
				? `The score must be from 0 to ${res.out_of}. Use extra credit for points beyond ${res.out_of}.`
				: 'The score is outside what this assignment is out of.';
		case 'override_needs_comment': {
			const n = res.missing?.length ?? 0;
			return n === 1
				? 'Say why you scored between levels (1 criterion still needs a comment).'
				: `Say why you scored between levels (${n} criteria still need a comment).`;
		}
		case 'incomplete_scores':
			return `Score every criterion, or type a score out of the total, before returning (${res.missing?.length ?? 0} criteria left).`;
		default:
			return 'The grade was refused.';
	}
}

// ---------------------------------------------------------------------------
// 2. The Perfect Score award.
// ---------------------------------------------------------------------------

/** One row of `classroom_posting_perfect_scores`: one class this assignment is posted to. */
export interface PerfectScoreToggle {
	section_id: string;
	label: string;
	on: boolean;
	/** Is the coin economy on for this class at all. Off, nothing is paid either way. */
	economy_on: boolean;
	out_of: number | null;
}

export interface PerfectScoreTransports {
	/**
	 * The switches for one item, for the classes the caller manages. NULL MEANS
	 * THE DATABASE HAS NO SUCH FUNCTION (pre-0242), and removes the panel; an
	 * empty list is a real answer (no class of the caller's has it posted).
	 */
	perfectScores(itemId: string): Promise<TxResult<PerfectScoreToggle[] | null>>;
	setPerfectScore(
		itemId: string,
		sectionId: string,
		on: boolean
	): Promise<TxResult<{ ok: boolean; reason?: string }>>;
}

export function perfectScoreOf(t: unknown): PerfectScoreTransports | null {
	const p = t as Partial<PerfectScoreTransports> | null;
	if (p && typeof p.perfectScores === 'function' && typeof p.setPerfectScore === 'function') {
		return p as PerfectScoreTransports;
	}
	return null;
}

/** Normalize the RPC's jsonb array. Anything unrecognisable is dropped, never coerced. */
export function normalizePerfectScores(raw: unknown): PerfectScoreToggle[] {
	if (!Array.isArray(raw)) return [];
	const out: PerfectScoreToggle[] = [];
	for (const r of raw as Record<string, unknown>[]) {
		if (!r || typeof r.section_id !== 'string') continue;
		const outOf = r.out_of == null ? null : Number(r.out_of);
		out.push({
			section_id: r.section_id,
			label: typeof r.label === 'string' && r.label.trim() ? r.label : 'This class',
			on: r.on === true,
			economy_on: r.economy_on !== false,
			out_of: outOf != null && Number.isFinite(outOf) ? outOf : null
		});
	}
	return out;
}

/**
 * THE AWARD, as 0242's `_coin_perfect_score_sync` computes it:
 * greatest(1, round(out_of / 25)). Postgres `round()` is half-up and agrees with
 * `Math.round` at ties for positive inputs (CLAUDE.md, SQL traps). Null when the
 * assignment has nothing to score out of, which is also when nothing is paid.
 */
export function perfectScoreCoins(outOf: number | null | undefined): number | null {
	if (outOf == null || !Number.isFinite(outOf) || outOf <= 0) return null;
	return Math.max(1, Math.round(outOf / 25));
}

/** The one line that explains the switch, with the real figure for this assignment. */
export function perfectScoreNote(outOf: number | null | undefined): string {
	const pay = perfectScoreCoins(outOf);
	if (pay == null) {
		return 'A full score pays coins automatically when it is returned, but this assignment has no points to score out of, so nothing is paid.';
	}
	return `A full score on this assignment (extra credit not counted) pays ${coinNumber(pay)}${COIN_SYMBOL} automatically when it is returned: the points divided by 25, at least 1.`;
}

/** A refusal from `classroom_set_posting_perfect_score`, in words. */
export function perfectScoreRefusal(reason: string | undefined): string {
	if (reason === 'not_posted') return 'This assignment is not posted to that class any more.';
	return 'The change was refused.';
}
