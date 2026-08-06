import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The ONE server-side admin check (migration 0067).
 *
 * Every privileged surface on the site gates on this: the dashboard, the coin
 * entry tool and its ledger API, GAUNTLET authoring / rooms / tools, the FSP
 * interest roster, GREENLINE moderation, tournament deletion and the admin
 * page itself. These guards are CONVENIENCE -- the real boundary is is_admin()
 * inside the RLS policies and SECURITY DEFINER RPCs, which a request cannot
 * talk its way past. What the guards buy is that a non-admin never lands on a
 * page whose every action would fail.
 *
 * `role === 'teacher'` is NOT an admin check any more and must not be used as
 * one: since 0067 every @boscotech.edu account still becomes a teacher
 * automatically, and that on its own grants nothing elevated.
 */

/**
 * PostgREST's code for "no such function" -- i.e. 0067 is not applied yet.
 * Matched on the CODE alone, never on the message: an error raised at runtime
 * from inside is_admin() would also mention the name, and treating that as
 * "not migrated" would fail OPEN on exactly the case that most deserves to
 * fail closed. Verified against the live project, which returns PGRST202 for
 * the missing function.
 */
const UNDEFINED_FUNCTION = 'PGRST202';

function isMissingFunction(error: { code?: string } | null): boolean {
	return error?.code === UNDEFINED_FUNCTION;
}

/**
 * True when the CALLER (resolved from their own cookie session, never a passed
 * id) is a site admin.
 *
 * Pre-0067 fallback: if the RPC does not exist yet, fall back to the old
 * `role = 'teacher'` rule. That is not a hole -- before 0067 the database
 * itself has no admin concept and every RLS policy still says teacher, so
 * mirroring it keeps the app honest about what the backend will actually
 * allow. The moment 0067 is applied the RPC answers and governs. Any OTHER
 * error denies.
 */
export async function isAdmin(supabase: SupabaseClient, userId?: string | null): Promise<boolean> {
	const { data, error } = await supabase.rpc('is_admin');
	if (!error) return data === true;
	if (!isMissingFunction(error) || !userId) return false;

	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', userId)
		.maybeSingle();
	return (profile as { role?: string } | null)?.role === 'teacher';
}

/** True only for the pinned owner account, who alone manages the admin list. */
export async function isOwner(supabase: SupabaseClient): Promise<boolean> {
	const { data, error } = await supabase.rpc('is_owner');
	return !error && data === true;
}
