import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

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
 */
export const prerender = false;

export const load = ({ url }: { url: URL }) => {
	if (!dev) error(404, 'Not found');
	return { state: url.searchParams.get('state') };
};
