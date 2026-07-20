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
 * Submit one piece of feedback. Never throws; a blocked write or an unapplied
 * migration comes back as an error string the caller shows in place.
 */
export async function submitFeedback(
	supabase: SupabaseClient,
	userId: string,
	entry: FeedbackEntry
): Promise<{ error: string | null }> {
	const issue = feedbackIssue(entry.message);
	if (issue) return { error: issue };
	const { error } = await supabase.from(APP_FEEDBACK_TABLE).insert({
		user_id: userId,
		app: entry.app,
		context: entry.context ?? null,
		kind: entry.kind,
		message: entry.message.trim(),
		meta: entry.meta ?? {}
	});
	return { error: error ? error.message : null };
}
