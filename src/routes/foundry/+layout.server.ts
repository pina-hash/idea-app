import { redirect } from '@sveltejs/kit';
import { queueOrder } from '$lib/foundry/review';
import type { FoundryAppSummary } from '$lib/foundry/transports';
import type { LayoutServerLoad } from './$types';

/**
 * THE GROUP-WIDE GATE, STATED ONCE.
 *
 * `/foundry` is the signed-in tier: any Bosco Tech account may publish, and the
 * surfaces underneath it are all about the caller's OWN work. Hoisting the
 * check here means a route added under this prefix later cannot ship ungated by
 * forgetting to copy it.
 *
 * A REDIRECT IS CORRECT HERE, not a 404. `/foundry` is a surface that exists
 * for everyone who signs in, so bouncing an anonymous visitor to the front page
 * confirms nothing they could not already read off the launcher. The 404
 * treatment is for surfaces whose EXISTENCE is the secret, which is why
 * `/admin` and `/coin-desk` are deliberately not in `authedPrefixes` either.
 *
 * `hooks.server.ts` already turns anonymous visitors away at the prefix; this
 * is the second layer, and it is the one that runs for a direct load if that
 * list is ever edited.
 */
export const load: LayoutServerLoad = async ({ locals, parent }) => {
	if (!locals.claims) redirect(303, '/');

	/**
	 * THE PENDING-REVIEW COUNT, ASKED ONLY FOR ADMINS. A queue nobody is
	 * reminded of goes stale, so the shell's Review tab carries how many apps
	 * are waiting -- the same `queueOrder` arithmetic the queue itself renders,
	 * over the same admin-widened read /foundry/review makes, so the number on
	 * the tab and the number on the page cannot disagree.
	 *
	 * `isAdmin` comes from the ROOT layout's load rather than being resolved a
	 * second time here. For everyone else the answer is null -- not zero --
	 * because "not asked" and "nothing waiting" are different answers, and a
	 * student's payload should not carry the queue's state at all. (The
	 * markup gate in the shell is convenience; the review route's 404 and
	 * `is_admin()` inside the RPCs stay the boundary.)
	 */
	const { isAdmin } = await parent();
	if (!isAdmin) return { reviewPending: null };

	const { data } = await locals.supabase.rpc('foundry_list_apps', {
		p_include_unpublished: true
	});
	// A failed read degrades to null rather than erroring the whole room: the
	// count is a reminder, and the queue page still answers for itself.
	if (!data) return { reviewPending: null };
	return { reviewPending: queueOrder(data as FoundryAppSummary[]).length };
};
