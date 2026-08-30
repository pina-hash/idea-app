import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin } from '$lib/server/admin';

/**
 * The ONE server-side FRC review check (migration 0167).
 *
 * WHY THIS IS NOT `isAdmin`. 0067 redefined `is_teacher()` as `is_admin()` to
 * re-gate ~90 already-applied policies in a single function body, and every
 * FRC teacher-facing gate (0039-0042) was written against `is_teacher()`
 * before that -- so a Bosco Tech teacher with no `app_admins` row could read
 * no student's FRC progress and approve no modeling-gate submission, leaving
 * five of the ten content-backed CAD units approvable only by an admin. 0167
 * gives that capability its own explicit allowlist -- `frc_reviewers`,
 * mirroring `app_admins`/`gauntlet_authors` -- so it can be granted without
 * granting admin. The decided population mixes @boscotech.edu and
 * @boscotech.net addresses, so it is an allowlist and can never be a domain
 * or role inference.
 *
 * THIS GUARD IS CONVENIENCE, exactly as `isAdmin` is. The real boundary is
 * `frc_can_review()` inside the RLS policies and the SECURITY DEFINER RPCs,
 * which a request cannot talk its way past. What the guard buys is that the
 * review controls render only for somebody whose actions would succeed.
 *
 * `role === 'teacher'` is still not a check of any kind.
 */

/**
 * PostgREST's code for "no such function" -- i.e. 0167 is not applied yet.
 * Matched on the CODE alone, never on the message: an error raised at runtime
 * from inside `frc_can_review()` would also mention the name, and reading
 * that as "not migrated" would fail OPEN on exactly the case that most
 * deserves to fail closed.
 */
const UNDEFINED_FUNCTION = 'PGRST202';

/**
 * True when the CALLER (resolved from their own cookie session, never a
 * passed id) may review FRC Training: read any student's progress and quiz
 * log, review modeling-gate submissions, and mark/unmark completion.
 *
 * PRE-0167 FALLBACK. Migrations are applied by hand and separately from the
 * deploy, so a deployment sitting between this code shipping and 0167 being
 * pasted is a real state. In that world the database has no reviewer tier and
 * every FRC gate still says `is_teacher()`, which is the admin check -- so
 * falling back to `isAdmin` is not a hole, it mirrors what the backend will
 * actually allow. The moment 0167 is applied the RPC answers and governs.
 * Any OTHER error denies.
 */
export async function canReviewFrc(
	supabase: SupabaseClient,
	userId?: string | null
): Promise<boolean> {
	const { data, error } = await supabase.rpc('frc_can_review');
	if (!error) return data === true;
	if (error.code !== UNDEFINED_FUNCTION) return false;
	return isAdmin(supabase, userId);
}
