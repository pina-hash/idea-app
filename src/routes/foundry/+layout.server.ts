import { redirect } from '@sveltejs/kit';
import { foundryAccessFromRpc } from '$lib/foundry/access';
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

	/**
	 * THE CLASS GATE (0173, decision 01), ASKED ON THE SERVER AND ASKED HERE.
	 *
	 * Here, because it is a group-wide gate and this is the one place a gate
	 * for this area is stated -- a route added under /foundry later cannot
	 * ship past it by somebody forgetting to copy a check, which is the same
	 * argument the redirect above is here for.
	 *
	 * THE PAYLOAD IS THE ENFORCEMENT, NOT A FLAG THE MARKUP READS. A closed
	 * student's page loads return nothing to render (see each +page.server.ts
	 * short-circuiting on this), so "closed" is the absence of data rather
	 * than a boolean a component could get wrong. The layout renders the
	 * stated reason in place of the area, which is what makes it a refusal
	 * somebody can act on rather than a blank page or a 404.
	 *
	 * THE DEGRADATION LADDER IS `foundryAccessFromRpc`'S AND IS NOT RESTATED
	 * HERE. It used to be spelled out inline, which was correct while this was
	 * the function's ONE caller; 0045 gave it three more (the serve routes,
	 * which are `+server.ts` and get no layout data to inherit an answer
	 * from), and four inline copies of "what does an error from this RPC mean"
	 * is four things that can stop agreeing about whether a failure is open or
	 * closed. `PGRST202` alone degrades to open and every other error closes;
	 * the argument for both is beside the function.
	 */
	const { data: accessRow, error: accessErr } = await locals.supabase.rpc(
		'foundry_section_access'
	);
	const access = foundryAccessFromRpc(accessRow, accessErr);

	/**
	 * WHETHER TO OFFER THE CLASSES TAB. `manages`, never `role === 'teacher'`:
	 * the email domain hands `teacher` to every member of staff, including
	 * those who teach no section, and an admin manages every section without
	 * carrying the role at all. It is one cheap read of the function that is
	 * also the boundary, so the tab and the page cannot disagree about who
	 * manages what.
	 *
	 * A FAILED OR ABSENT READ IS FALSE. "Cannot tell" must never render as
	 * "yes" -- the same rule `loadSectionRoster`'s ladder states for `manages`.
	 */
	const { data: managed } = await locals.supabase.rpc('foundry_manageable_sections');
	const managesSection = Array.isArray(managed) && managed.length > 0;

	if (!isAdmin) return { foundryAccess: access, managesSection, reviewPending: null };

	const { data } = await locals.supabase.rpc('foundry_list_apps', {
		p_include_unpublished: true
	});
	// A failed read degrades to null rather than erroring the whole room: the
	// count is a reminder, and the queue page still answers for itself.
	if (!data) return { foundryAccess: access, managesSection, reviewPending: null };
	return {
		foundryAccess: access,
		managesSection,
		reviewPending: queueOrder(data as FoundryAppSummary[]).length
	};
};
