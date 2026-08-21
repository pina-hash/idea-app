/**
 * Shared in-app feedback: the data seam for the FeedbackBox component.
 *
 * Deliberately app-AGNOSTIC and outside any one game's lib folder. GREENLINE
 * is the first consumer; VANGUARD (and any future portal surface) wires the
 * same component and the same table by passing a different `app` id. Nothing
 * here knows what a race, a lap, or a wave is.
 *
 * Pure data layer (no Svelte, no game imports), the persistence.ts /
 * frc/gate-submissions.ts convention: each function takes a Supabase client,
 * does one thing, and fails soft if migration 0053 is unapplied.
 *
 * Trust model: a feedback row is a comment about YOURSELF, so there is nothing
 * to forge and no RPC is needed — the insert is a direct RLS-scoped write
 * whose WITH CHECK pins user_id to auth.uid() (the fsp_item_opens pattern).
 * `meta` is free-form context the calling surface attaches (build, track,
 * screen); treat it as a debugging aid, never as authoritative data.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const APP_FEEDBACK_TABLE = 'app_feedback';

/** What the player is telling us. Kept short on purpose: more categories
 * means more time spent choosing and less spent writing. */
export type FeedbackKind = 'bug' | 'idea' | 'praise' | 'other';

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
	{ id: 'bug', label: 'Bug', hint: 'something broke or looked wrong' },
	{ id: 'idea', label: 'Idea', hint: 'something you want added or changed' },
	{ id: 'praise', label: 'Liked it', hint: 'something that felt good' },
	{ id: 'other', label: 'Other', hint: 'anything else' }
];

/** Hard cap on a message, mirrored by the CHECK constraint in 0053. */
export const FEEDBACK_MAX_LEN = 2000;

export interface FeedbackEntry {
	/** Which app this came from ('greenline', 'vanguard', ...). */
	app: string;
	/** Where in that app ('race', 'garage', 'title', 'results', ...). */
	context?: string | null;
	kind: FeedbackKind;
	message: string;
	/** Free-form context the surface attaches (build, track, screen state). */
	meta?: Record<string, unknown>;
}

export function feedbackIssue(message: string): string | null {
	const trimmed = message.trim();
	if (!trimmed) return 'Write a little about what you noticed.';
	if (trimmed.length > FEEDBACK_MAX_LEN)
		return `That is longer than ${FEEDBACK_MAX_LEN} characters, trim it down a little.`;
	return null;
}

/**
 * What one attempt came back with.
 *
 * `retryable` IS THE WHOLE POINT OF THE SHAPE. The box drives the shared
 * SaveState, which retries a retryable failure with backoff and reports a
 * refusal once. Collapsing the two into a bare error string is what makes a
 * retry loop spend fifteen seconds arriving at the same answer while telling
 * the person their note is being re-sent.
 */
export interface FeedbackResult {
	error: string | null;
	retryable: boolean;
}

/**
 * A POSTGREST CODE MEANS THE DATABASE CONSIDERED THIS AND SAID NO.
 *
 * supabase-js surfaces a transport failure ("Failed to fetch", an aborted
 * request, a cold start that timed out) as an error with NO code, because
 * nothing on the far side ever answered. Anything carrying a code -- a CHECK
 * violation, an RLS denial, a missing column -- is a considered refusal, and
 * sending the identical payload again cannot change it.
 */
export function feedbackRetryable(code: string | null | undefined): boolean {
	return !(code ?? '').trim();
}

/**
 * Submit one piece of feedback. Never throws; a blocked write or an unapplied
 * migration comes back as an error string plus whether re-sending could help.
 */
export async function submitFeedback(
	supabase: SupabaseClient,
	userId: string,
	entry: FeedbackEntry
): Promise<FeedbackResult> {
	const issue = feedbackIssue(entry.message);
	// A local validation problem is a refusal: the same payload is refused
	// again, and the person is looking at the field that needs changing.
	if (issue) return { error: issue, retryable: false };
	const { error } = await supabase.from(APP_FEEDBACK_TABLE).insert({
		user_id: userId,
		app: entry.app,
		context: entry.context ?? null,
		kind: entry.kind,
		message: entry.message.trim(),
		meta: entry.meta ?? {}
	});
	if (!error) return { error: null, retryable: false };
	return { error: error.message, retryable: feedbackRetryable(error.code) };
}

/**
 * THE ONE BOUND WRITER. Null with no signed-in user, which is what REMOVES the
 * control wherever it is mounted: read-only is structural (there is no write to
 * execute) rather than a discipline.
 *
 * The signed-out path is deliberately absent. It needs an RLS change and a rate
 * limit and ships separately; until then a visitor sees no control rather than
 * one that fails when pressed.
 */
export function feedbackWriter(
	supabase: SupabaseClient,
	userId: string | null | undefined
): ((entry: FeedbackEntry) => Promise<FeedbackResult>) | null {
	if (!userId) return null;
	return (entry) => submitFeedback(supabase, userId, entry);
}

// ---------------------------------------------------------------------------
// The triage queue (0085's status columns and admin RPCs)
// ---------------------------------------------------------------------------

export type FeedbackStatus = 'new' | 'seen' | 'resolved';

/** One row as app_feedback_admin_list returns it. */
export interface FeedbackRow {
	id: string;
	app: string;
	context: string | null;
	kind: string;
	message: string;
	meta: Record<string, unknown> | null;
	status: FeedbackStatus;
	created_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
	submitter_name: string | null;
	submitter_email: string | null;
}
