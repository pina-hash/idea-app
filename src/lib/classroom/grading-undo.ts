// src/lib/classroom/grading-undo.ts
//
// TAKING A GRADE BACK (ledger 0392, migration 0265, report 6bedda49).
//
// Three acts and one read, all asked of the database, which owns every rule:
//
//   UNDO RETURN  `classroom_unreturn_grade`  the grade stays, the student stops
//                seeing it; handed-in work goes back to "to grade".
//   REVOKE       `classroom_revoke_grade`    the grade comes off entirely, at
//                any time; a snapshot is kept.
//   RESTORE      `classroom_restore_grade`   the last revoked grade back, exactly;
//                refused once a new grade has been saved since.
//   THE OFFER    `classroom_grade_revocation` is there a revoked grade to restore.
//
// ABSENCE IS THE MECHANISM, as for the typed score: the methods ride on the
// teacher transports object, and the console asks `gradeUndoOf` whether they are
// there. A deployment before 0265 answers PGRST202, which each method turns into
// `unavailable`, and the console then removes every control rather than offering
// a press whose only answer is a refusal.
//
// COINS ARE THE DATABASE'S AND NEVER GATE ANYTHING. A paid Perfect Score is
// reversed by the same state machine a lower regrade uses; the answer's `coins`
// word is only used to SAY so.

import type { TxResult } from '$lib/classroom/classroom';

export type GradeUndoReason =
	| 'not_returned'
	| 'nothing_to_revoke'
	| 'nothing_to_restore'
	| 'graded_since'
	| 'unavailable';

export interface GradeUndoResult {
	ok: boolean;
	reason?: GradeUndoReason | string;
	state?: string;
	score?: number | null;
	previous_score?: number | null;
	/** `_coin_perfect_score_sync`'s word: paid, reversed, cleared, unchanged, paused, failed. */
	coins?: string;
}

export interface GradeRevocation {
	revoked_at: string;
	revoked_by: string;
	score: number | null;
	state: string;
}

export interface GradeUndoTransports {
	unreturnGrade(itemId: string, studentEmail: string): Promise<TxResult<GradeUndoResult>>;
	revokeGrade(itemId: string, studentEmail: string): Promise<TxResult<GradeUndoResult>>;
	restoreGrade(itemId: string, studentEmail: string): Promise<TxResult<GradeUndoResult>>;
	/** Null for none, for a non-reviewer, and before 0265. */
	gradeRevocation(itemId: string, studentEmail: string): Promise<TxResult<GradeRevocation | null>>;
}

export function gradeUndoOf(t: unknown): GradeUndoTransports | null {
	const p = t as Partial<GradeUndoTransports> | null;
	if (
		p &&
		typeof p.unreturnGrade === 'function' &&
		typeof p.revokeGrade === 'function' &&
		typeof p.restoreGrade === 'function' &&
		typeof p.gradeRevocation === 'function'
	) {
		return p as GradeUndoTransports;
	}
	return null;
}

/** Normalize the jsonb answer. A number PostgREST hands back as a string becomes a number. */
export function normalizeUndoResult(raw: unknown): GradeUndoResult {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const num = (v: unknown): number | null => {
		if (v == null) return null;
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	};
	return {
		ok: r.ok === true,
		reason: typeof r.reason === 'string' ? r.reason : undefined,
		state: typeof r.state === 'string' ? r.state : undefined,
		score: num(r.score),
		previous_score: num(r.previous_score),
		coins: typeof r.coins === 'string' ? r.coins : undefined
	};
}

export function normalizeRevocation(raw: unknown): GradeRevocation | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.revoked_at !== 'string') return null;
	const score = r.score == null ? null : Number(r.score);
	return {
		revoked_at: r.revoked_at,
		revoked_by: typeof r.revoked_by === 'string' ? r.revoked_by : '',
		score: score != null && Number.isFinite(score) ? score : null,
		state: typeof r.state === 'string' ? r.state : ''
	};
}

/** What a coin outcome means to a teacher, or null when there is nothing to say. */
export function undoCoinSentence(coins: string | undefined): string | null {
	switch (coins) {
		case 'reversed':
			return 'The Perfect Score coins it paid were taken back.';
		case 'paid':
			return 'The Perfect Score coins were paid again.';
		case 'paused':
			return 'Automatic coin pay is paused, so any Perfect Score coins settle when it resumes.';
		case 'failed':
			return 'The coin check did not run; tonight’s automatic pay settles it.';
		default:
			return null;
	}
}

/** The refusal sentence for each structured reason. */
export function undoRefusalSentence(reason: string | undefined): string {
	switch (reason) {
		case 'not_returned':
			return 'This grade has not been returned, so there is no return to undo.';
		case 'nothing_to_revoke':
			return 'There is no grade on this student’s work to take back.';
		case 'nothing_to_restore':
			return 'There is no taken-back grade to restore for this student.';
		case 'graded_since':
			return 'A new grade was saved after the old one was taken back, so restoring would overwrite it. Take the new grade back first if you want the old one.';
		case 'unavailable':
			return 'Taking grades back is not available until the database is updated.';
		default:
			return 'That change was refused.';
	}
}

/**
 * The confirm sentence for a revoke, naming what it costs, from what is on the
 * row in front of the grader (never from a server guess).
 */
export function revokeCostSentence(input: {
	name: string;
	score: number | null;
	outOf: number;
	returned: boolean;
	criteria: number;
	hasComment: boolean;
}): string {
	const parts: string[] = [];
	if (input.score != null) parts.push(input.outOf > 0 ? `the score ${input.score} of ${input.outOf}` : `the score ${input.score}`);
	if (input.criteria > 0) parts.push(`${input.criteria} rubric ${input.criteria === 1 ? 'score' : 'scores'}`);
	if (input.hasComment) parts.push('your comment');
	const what = parts.length ? parts.join(', ') : 'the saved grade';
	const seen = input.returned ? ` ${input.name} stops seeing it at once.` : '';
	return `This takes ${what} off ${input.name}’s work.${seen} Any Perfect Score coins it paid are taken back. You can restore it afterwards.`;
}

/** When a grade was taken back, on the school clock, with no weekday. */
export function revocationWhen(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/Los_Angeles',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(d);
}
