import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin } from '$lib/server/admin';
import { ADMIN_OWNER_EMAIL } from '$lib/admin';

/**
 * The ONE server-side GAUNTLET authoring check (migration 0155).
 *
 * WHY THIS IS NOT `isAdmin`. 0067 redefined `is_teacher()` as `is_admin()` to
 * re-gate ~90 already-applied policies in a single function body, because
 * migrations here are an immutable record and there was no way to edit them one
 * at a time. GAUNTLET authoring was swept up in that: a Bosco Tech teacher who
 * is not in `app_admins` could author nothing and host nothing. 0155 gives that
 * capability its own explicit allowlist -- `gauntlet_authors`, mirroring
 * `app_admins` -- so it can be granted without granting admin.
 *
 * THIS GUARD IS CONVENIENCE, exactly as `isAdmin` is. The real boundary is
 * `gauntlet_can_author()` inside the RLS policies and the SECURITY DEFINER
 * RPCs, which a request cannot talk its way past. What the guard buys is that
 * somebody who cannot author never lands on a page whose every action would
 * fail -- and, since 0155, that somebody who IS refused is told so instead of
 * being bounced to a page that reads like a broken link.
 *
 * `role === 'teacher'` is still not a check of any kind: 0155 is deliberately
 * an allowlist and not an inference, so that the capability arrives because
 * somebody granted it and never as a side effect of a roster import.
 */

/**
 * PostgREST's code for "no such function" -- i.e. 0155 is not applied yet.
 * Matched on the CODE alone, never on the message: an error raised at runtime
 * from inside `gauntlet_can_author()` would also mention the name, and reading
 * that as "not migrated" would fail OPEN on exactly the case that most deserves
 * to fail closed.
 */
const UNDEFINED_FUNCTION = 'PGRST202';

/**
 * True when the CALLER (resolved from their own cookie session, never a passed
 * id) may author GAUNTLET challenges and host rooms.
 *
 * PRE-0155 FALLBACK. Migrations here are applied by hand and separately from
 * the deploy, so a deployment sitting between this code shipping and 0155 being
 * pasted is a REAL state, not a hypothetical. In that world the database has no
 * author tier at all and every gate still says `is_teacher()`, which is the
 * admin check -- so falling back to `isAdmin` is not a hole, it mirrors what
 * the backend will actually allow. The moment 0155 is applied the RPC answers
 * and governs. Any OTHER error denies.
 */
export async function canAuthorGauntlet(
	supabase: SupabaseClient,
	userId?: string | null
): Promise<boolean> {
	const { data, error } = await supabase.rpc('gauntlet_can_author');
	if (!error) return data === true;
	if (error.code !== UNDEFINED_FUNCTION) return false;
	return isAdmin(supabase, userId);
}

/**
 * The words a refused caller reads, in ONE place.
 *
 * Three author routes and the rooms landing all refuse for the same reason, and
 * three hand-written spellings of "you do not have this" is how they come to
 * disagree about who to ask. It lives here rather than in a component because
 * this is the module that knows what the capability IS; the surfaces render it.
 *
 * It says the three things a person in front of it actually needs: that they
 * are signed in and the page is not broken, what specifically they are missing,
 * and who can grant it. `ADMIN_OWNER_EMAIL` is DISPLAY only, never a check --
 * the same contract `src/lib/admin.ts` states for it.
 */
export const GAUNTLET_AUTHORING_REFUSAL = {
	title: 'You do not have GAUNTLET authoring',
	body: `You are signed in and this page loaded correctly. Authoring challenges and hosting rooms is a separate permission from being a teacher, and your account does not have it yet.`,
	ask: `Ask ${ADMIN_OWNER_EMAIL} to add you, and say it is GAUNTLET authoring you need.`
} as const;
