import { error } from '@sveltejs/kit';
import { foundryClosureBlocks } from '$lib/foundry/access';
import { foundryPlayCountMap, type FoundryPlayCountRow } from '$lib/foundry/telemetry';
import type { FoundryAppSummary, FoundryAuthorCard } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * A PUBLISHER'S PAGE (report 31), AT `/foundry/author/<owner uuid>`.
 *
 * THREE READS, ALL AS THE CALLER through `locals.supabase`, and none of them
 * adds an identity filter of its own -- the population predicate inside each
 * definer is the boundary, exactly as it is on the gallery.
 *
 *   foundry_author_profile(owner)   who they are. NULL unless this caller can
 *                                   already see at least one of their apps.
 *   foundry_list_apps(p_owner)      their shelf, through the SAME function the
 *                                   gallery calls with no owner. The filter has
 *                                   been on that signature since 0130; this is
 *                                   its first caller.
 *   foundry_play_counts()           the per-app figures the cards already show.
 *
 * THE UUID IN THE URL IS NOT A DISCLOSURE AND THE 404 IS WHY. A uuid is opaque
 * -- it names nobody to anybody who does not already hold it -- and the card
 * read answers NULL for any owner whose work this caller cannot see, which
 * includes every uuid that names no person at all. So a probe cannot tell a
 * student who has published nothing from a string somebody made up, which is
 * the same rule `foundry_get_app` and `foundry_app_play_stats` follow.
 *
 * `error(404)` AND NOT A REDIRECT, for the reason CLAUDE.md gives: a redirect
 * off a page that may or may not exist confirms which. "Not found" and "not for
 * you" answer identically here.
 *
 * THE CLASS CLOSURE REACHES THIS PAGE, and that is a judgement worth stating
 * rather than inheriting. `FOUNDRY_CLOSURE_BLOCKS` exists so a section manager
 * can close the Foundry during class, and the gallery is in it because the
 * gallery is where a bundle RUNS. This page runs nothing -- it has no stage and
 * mounts no frame -- but every card on it is a link straight into the gallery
 * with an app selected, which is one tap from a running game. A door into a
 * closed room is not less closed for being a side door. `foundryClosureBlocks`
 * is READ rather than restated, so this cannot end up lit while the gallery is
 * dark.
 */
export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { foundryAccess } = await parent();
	if (foundryAccess && foundryAccess.open === false && foundryClosureBlocks('gallery')) {
		error(404, 'Not found');
	}

	const { data: card, error: cardErr } = await locals.supabase.rpc('foundry_author_profile', {
		p_owner: params.ownerId
	});
	/**
	 * A MALFORMED UUID IS A 404 AND NOT A 500. Postgres raises `22P02` for a
	 * string that is not a uuid, and that arrives here as an ordinary RPC error
	 * -- so a typed URL would otherwise render the error boundary with a
	 * correlation id for something that is simply not an address. Anything else
	 * is a real failure and still 500s.
	 */
	if (cardErr) {
		if (cardErr.code === '22P02') error(404, 'Not found');
		error(500, cardErr.message);
	}
	if (!card) error(404, 'Not found');

	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps', {
		p_owner: params.ownerId
	});
	if (listErr) error(500, listErr.message);

	/**
	 * A MISSING RPC IS NOT A BROKEN PAGE, the ladder rule the gallery's own load
	 * already follows: migrations here are applied by hand, so a deployment
	 * without 0221's widened counts is a real state and this read simply
	 * degrades to no figures. The cards lose their play chips and the page
	 * renders.
	 */
	const { data: countRows } = await locals.supabase.rpc('foundry_play_counts');

	return {
		card: card as FoundryAuthorCard,
		apps: (apps ?? []) as FoundryAppSummary[],
		playCounts: foundryPlayCountMap((countRows ?? null) as FoundryPlayCountRow[] | null)
	};
};
