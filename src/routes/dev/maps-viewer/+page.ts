import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { MapsSearchRow } from '$lib/maps/transports';
import { mapsViewerFixture, memoryMapsViewerTransports } from './fixture';

/**
 * THE PUBLIC MAPS VIEWER HARNESS. Dev-only: 404s in a production build, needs
 * no auth and no Supabase. It mounts the REAL `MapsViewer` over fixture data
 * with an in-memory search transport, which is the whole point -- the surface
 * driven here is the surface `/maps` ships.
 *
 * IT READS `url` AND THAT IS CORRECT HERE, twice over: this is a PAGE load, so
 * a state change re-runs it, and the viewer's own position IS the query string
 * -- so the harness passes the real `page.url.searchParams` down exactly as
 * the route does, rather than synthesising one. Driving `?at=` and `?to=` here
 * exercises the same code path a shared link does.
 *
 * The `state` parameter names a starting position; everything after that is
 * ordinary navigation inside the component.
 *
 * AND IT ANSWERS `q` THE WAY THE ROUTE DOES. `/maps`'s server load runs the
 * search for `?q=` and hands the rows in as `initialResults`, which is the
 * no-JavaScript path; a harness that skipped that step rendered "nothing
 * matches caliper" on every staged-route state while the caliper sat in the
 * fixture, which is a harness measuring a page the route never shows. The
 * same in-memory transport the page mounts answers it here.
 */
export const prerender = false;

/** The named states' query strings live in the page; only `q` is needed here. */
const STATE_QUERY: Record<string, string> = {
	search: 'caliper',
	'stage-start': 'caliper',
	'stage-room': 'caliper',
	'stage-unit': 'caliper',
	'stage-elevation': 'caliper',
	'stage-end': 'caliper'
};

export const load = async ({ url }: { url: URL }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state');
	const q = (state ? STATE_QUERY[state] : url.searchParams.get('q')) ?? '';
	let initialResults: MapsSearchRow[] = [];
	if (q.trim()) {
		const outcome = await memoryMapsViewerTransports(mapsViewerFixture()).search(q.trim());
		if (outcome.ok) initialResults = outcome.data;
	}
	return { state, initialResults };
};
