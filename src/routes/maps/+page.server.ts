import {
	loadMapsPublicData,
	mapsViewerTransports,
	type MapsPublicClient,
	type MapsSearchRow
} from '$lib/maps/transports';
import { EMPTY_VIEWER_DATA } from '$lib/maps/viewer/viewer';
import type { MapsReadClient } from '$lib/maps/selects';
import type { PageServerLoad } from './$types';

/**
 * THE PUBLIC MAP'S READ (spec 6). Anonymous, published only, and there is no
 * gate of any kind above it -- `/maps` is deliberately NOT in `authedPrefixes`
 * and this load asks nothing about who is calling. `/maps/edit` carries the
 * admin gate in its own `+layout.server.ts`, which is why that gate sits on
 * `edit/` and not here.
 *
 * THE BOUNDARY IS RLS AND IS NOT RESTATED. The read runs on the CALLER'S OWN
 * client (`locals.supabase`), so 0161's and 0163's `status = 'published'`
 * policies decide what comes back, for a signed-out visitor and a signed-in
 * admin alike. There is no service role here and no status filter -- see
 * `loadMapsPublicData` for why adding one would hide a leak rather than
 * prevent it.
 *
 * THE WHOLE MAP IN ONE PASS, AND `url` IS READ FOR ONE THING ONLY. The
 * published tree is small (spec 8's P1 acceptance artefact is one room end to
 * end), so loading it once means every level of the descent afterwards is
 * local -- no round trip per level on school wifi with a phone in one hand.
 * The only thing `url` decides is the SEARCH: `?q=` is answered server-side so
 * the surface works with no JavaScript at all, which is the one page in this
 * app where that is worth paying for. That does mean this load re-runs when
 * the query string changes; it is a single small read and the alternative is a
 * search that only works once the bundle has arrived.
 *
 * A FAILED SEARCH IS NOT A FAILED PAGE. The map renders and the results say
 * they did not run. A search that took the whole map down with it would be a
 * map nobody could browse because one RPC was slow.
 */
export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);

	let maps = EMPTY_VIEWER_DATA;
	let mapsError: string | null = null;
	try {
		maps = await loadMapsPublicData(locals.supabase as unknown as MapsReadClient);
	} catch (cause) {
		// The page still renders, with the reason on it. A public map that
		// answers 500 is a map nobody can reach; one that says "the map could
		// not be loaded" is one somebody can report.
		mapsError = cause instanceof Error ? cause.message : 'The map could not be loaded.';
	}

	let results: MapsSearchRow[] = [];
	if (q) {
		const outcome = await mapsViewerTransports(
			locals.supabase as unknown as MapsPublicClient
		).search(q);
		if (outcome.ok) results = outcome.data;
	}

	// The map is public and identical for every caller, so it is cacheable --
	// but it changes the moment somebody publishes, and a student standing at
	// a toolbox must not be shown yesterday's drawer. A short shared window is
	// the compromise: a class arriving at once pays for one read between them.
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });

	return { maps, mapsError, mapsSearchResults: results, mapsQuery: q };
};
