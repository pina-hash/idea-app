import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE MAPS EDITOR HARNESS. Dev-only: 404s in a production build, needs no
 * auth and no Supabase. It mounts the REAL MapsEditor over fixture data whose
 * states no live account can show on demand at once -- a published tree,
 * drafts at two depths, and a PENDING edit on a node and an item type -- with
 * in-memory transports that mirror 0161's refusals. This is the page
 * tools/browser-verify drives at 375px and 1440px.
 *
 * `?state=` opens a selection: `node-pending`, `compartment`, `unit`,
 * `type-pending`, `new-root`. Reading `url` here is fine -- this is a PAGE
 * load, so a state change re-runs it, which is exactly what the harness wants.
 */
export const prerender = false;

export const load = ({ url }: { url: URL }) => {
	if (!dev) error(404, 'Not found');
	return { state: url.searchParams.get('state') };
};
