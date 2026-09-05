import { error } from '@sveltejs/kit';
import { foundryClosureBlocks } from '$lib/foundry/access';
import { foundryPlayCountMap, type FoundryPlayCountRow } from '$lib/foundry/telemetry';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE GALLERY: every published, non-hidden app.
 *
 * Both reads run as the CALLER through `locals.supabase` and neither adds an
 * identity filter of its own. `foundry_list_apps` is a SECURITY DEFINER whose
 * population predicate is `_foundry_app_in_population` (0130), and calling it
 * with NO arguments is what makes this the gallery rather than somebody's own
 * shelf: `p_owner` null means everyone's, and both widening flags default false
 * so an unpublished or hidden app is not in the answer.
 *
 * THE TWO WIDENING FLAGS ARE NOT PASSED, DELIBERATELY. They are gated on
 * `is_admin()` INSIDE the predicate, so passing them would be harmless for a
 * student and would quietly put hidden apps on an admin's gallery -- and hiding
 * is a staff act that takes an app off the site FOR STAFF TOO. An admin who
 * wants to see a hidden app looks at the review surface, not here.
 *
 * SELECTION COMES OFF THE URL so an app is linkable and a reload lands where
 * the viewer was. That is why this is a `+page.server.ts` and not a layout
 * load: a layout load must never read `url`.
 */
/**
 * THE CLASS GATE'S SERVER HALF (0173, decision 01), AND THIS IS THE ONE
 * SURFACE A CLOSURE STILL REACHES.
 *
 * The gallery is everybody's published apps and it is the one place in the
 * portal where a student's bundle actually RUNS: `FoundryDetail` is what
 * mounts `AppStage`. That is the "somebody is playing a game in my class"
 * behaviour the control exists for, so this load keeps refusing to build the
 * payload. Absence is the mechanism, exactly as it is for every omitted
 * transport in this feature: a closed student is not sent the data and then
 * asked politely not to look at it.
 *
 * THE PREDICATE IS READ, NOT RESTATED. `foundryClosureBlocks('gallery')` is
 * the same answer the layout uses to decide whether to render the refusal in
 * place of this page, so a route that is dark on the server cannot be lit in
 * the markup. The argument for the SET is on `FOUNDRY_CLOSURE_BLOCKS`;
 * `/foundry/mine`, `/foundry/submit`, `/foundry/contract` and
 * `/foundry/classes` are deliberately not in it and carry on.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const { foundryAccess } = await parent();
	if (foundryAccess && foundryAccess.open === false && foundryClosureBlocks('gallery')) {
		return { apps: [] as FoundryAppSummary[], selected: null, playCounts: {} };
	}

	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps');
	if (listErr) error(500, listErr.message);

	/**
	 * THE PLAY COUNTS, AS A SECOND READ RATHER THAN A WIDER FIRST ONE.
	 *
	 * `foundry_list_apps` is untouched deliberately: its shape, its order and
	 * its population are what every Foundry surface already reads, and joining
	 * two counts into it would have been a signature change on a function four
	 * other loads call. `foundry_play_counts` declares the SAME population
	 * through the SAME predicate, so the two answers cover the same apps and the
	 * client joins them on the app id.
	 *
	 * A MISSING RPC IS NOT A BROKEN GALLERY. Migrations here are applied by hand
	 * and separately, so a deployment sitting between 0138 and 0139 is a real
	 * state -- and on it this read fails while everything else on the page is
	 * fine. So the failure degrades to NO COUNTS: the cards lose their play
	 * chips, the popularity tabs order on ties, and the gallery renders. Erroring
	 * would take a working page down for a figure nobody came for.
	 */
	const { data: countRows } = await locals.supabase.rpc('foundry_play_counts');

	const slug = url.searchParams.get('app');
	let selected: FoundryApp | null = null;

	if (slug) {
		const { data, error: getErr } = await locals.supabase.rpc('foundry_get_app', {
			p_slug: slug
		});
		if (getErr) error(500, getErr.message);
		// "Not found" and "not published" answer identically: the population
		// predicate returned nothing and there is nothing to tell apart.
		if (!data) error(404, 'Not found');
		selected = data as FoundryApp;
	}

	return {
		apps: (apps ?? []) as FoundryAppSummary[],
		selected,
		playCounts: foundryPlayCountMap((countRows ?? null) as FoundryPlayCountRow[] | null)
	};
};
