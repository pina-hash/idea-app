/**
 * FRC Training modeling-gate submissions: the client seam onto the
 * `frc_gate_submissions` table (0042). The five modeling units (MDM-4 through
 * MDM-8) are gated by a student-submitted model link that a teacher reviews;
 * on approval the teacher records completion through the EXISTING
 * `frc_mark_complete` RPC (via `markUnitComplete`), never through this table.
 *
 * Personal-data reads/writes go directly under RLS (own-row for students,
 * all-rows for teachers), mirroring `frc_user_progress`. Everything fails soft
 * if the migration is unapplied: reads report `ready: false` (so the Gate shows
 * an apply-migration note and the teacher completion override still works) and
 * writes surface the error.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { markUnitComplete } from '$lib/frc/progression';

export const FRC_GATE_TABLE = 'frc_gate_submissions';

export type GateStatus = 'submitted' | 'approved' | 'needs_revision';

/** A student's own submission for one unit. */
export interface GateSubmission {
	status: GateStatus;
	link: string;
	notes: string;
	feedback: string;
	submittedAt: string | null;
	reviewedAt: string | null;
}

/** A pending submission row for the teacher review queue. */
export interface PendingSubmission {
	userId: string;
	unitId: string;
	link: string;
	notes: string;
	submittedAt: string | null;
}

interface Row {
	user_id: string;
	unit_id: string;
	link: string;
	notes: string;
	status: GateStatus;
	reviewer_feedback: string;
	submitted_at: string | null;
	reviewed_at: string | null;
}

function toSubmission(r: Row): GateSubmission {
	return {
		status: r.status,
		link: r.link ?? '',
		notes: r.notes ?? '',
		feedback: r.reviewer_feedback ?? '',
		submittedAt: r.submitted_at,
		reviewedAt: r.reviewed_at
	};
}

/**
 * Load a user's own submission for a unit. `ready` is false when the read fails
 * (e.g. migration unapplied), so the caller can show an apply-migration note
 * instead of a broken panel; `submission` is null when there is none yet.
 */
export async function loadSubmission(
	supabase: SupabaseClient,
	userId: string,
	unitId: string
): Promise<{ ready: boolean; submission: GateSubmission | null }> {
	const { data, error } = await supabase
		.from(FRC_GATE_TABLE)
		.select('user_id, unit_id, link, notes, status, reviewer_feedback, submitted_at, reviewed_at')
		.eq('user_id', userId)
		.eq('unit_id', unitId)
		.maybeSingle();
	if (error) return { ready: false, submission: null };
	return { ready: true, submission: data ? toSubmission(data as Row) : null };
}

/**
 * Load the teacher review queue: every submission awaiting review (status
 * 'submitted'), oldest first. `ready` is false if the read fails (migration
 * unapplied), so the dashboard can show a note. Student display data is joined
 * by the caller from the roster it already has (no FK to profiles).
 */
export async function loadPendingSubmissions(
	supabase: SupabaseClient
): Promise<{ ready: boolean; rows: PendingSubmission[] }> {
	const { data, error } = await supabase
		.from(FRC_GATE_TABLE)
		.select('user_id, unit_id, link, notes, submitted_at')
		.eq('status', 'submitted')
		.order('submitted_at', { ascending: true });
	if (error) return { ready: false, rows: [] };
	const rows = (data ?? []).map((r) => ({
		userId: (r as Row).user_id,
		unitId: (r as Row).unit_id,
		link: (r as Row).link ?? '',
		notes: (r as Row).notes ?? '',
		submittedAt: (r as Row).submitted_at
	}));
	return { ready: true, rows };
}

/**
 * Student submit / resubmit: upsert the caller's own row as 'submitted'. RLS
 * requires `user_id = auth.uid()` and forbids resubmitting an already-approved
 * row, and only ever lets the student set status='submitted'. Resubmitting
 * clears the prior review (reviewed_at), so the row returns to the queue.
 */
export async function submitGate(
	supabase: SupabaseClient,
	userId: string,
	unitId: string,
	link: string,
	notes: string,
	nowIso: string
): Promise<{ error: string | null }> {
	const { error } = await supabase.from(FRC_GATE_TABLE).upsert(
		{
			user_id: userId,
			unit_id: unitId,
			link,
			notes,
			status: 'submitted',
			submitted_at: nowIso,
			reviewed_at: null
		},
		{ onConflict: 'user_id,unit_id' }
	);
	return { error: error ? error.message : null };
}

/**
 * Teacher: approve a submission. Records completion FIRST through the existing
 * `frc_mark_complete` RPC (the single completion-write path, teacher-only),
 * then marks the submission row approved. If completion fails, the row is not
 * touched and the error is surfaced.
 */
export async function approveSubmission(
	supabase: SupabaseClient,
	userId: string,
	unitId: string,
	nowIso: string,
	feedback = ''
): Promise<{ error: string | null }> {
	const marked = await markUnitComplete(supabase, userId, unitId);
	if (marked.error) return { error: marked.error };
	const { error } = await supabase
		.from(FRC_GATE_TABLE)
		.update({ status: 'approved', reviewer_feedback: feedback, reviewed_at: nowIso })
		.eq('user_id', userId)
		.eq('unit_id', unitId);
	return { error: error ? error.message : null };
}

/**
 * Teacher: send a submission back for revision with feedback. Does NOT touch
 * completion. The student sees the feedback and may resubmit.
 */
export async function requestRevision(
	supabase: SupabaseClient,
	userId: string,
	unitId: string,
	feedback: string,
	nowIso: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from(FRC_GATE_TABLE)
		.update({ status: 'needs_revision', reviewer_feedback: feedback, reviewed_at: nowIso })
		.eq('user_id', userId)
		.eq('unit_id', unitId);
	return { error: error ? error.message : null };
}
