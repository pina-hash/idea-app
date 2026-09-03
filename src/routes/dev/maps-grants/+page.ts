import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE GRANTED-EDITOR HARNESS (0172). Dev-only: 404s in a production build,
 * needs no auth, no Supabase and no session of any kind.
 *
 * It mounts the REAL MapsEditor TWICE over the SAME fixture -- once with an
 * admin scope and once with a granted-editor scope holding Machine Shop --
 * side by side, because the whole claim this bundle makes is a DIFFERENCE and
 * a difference is only measurable when both halves are on one page at one
 * width. A harness showing the grantee alone would need a remembered number
 * from another run to compare against, which is the shape of measurement that
 * silently drifts.
 *
 * The grant console is in the admin column and NOT in the grantee's, which is
 * the same claim in its third form: it is a separate injected transports
 * object, so a surface handed none renders no console at all.
 *
 * `?state=` opens a selection in both columns, so the same object can be read
 * in both roles at once: `granted` (Tool Chest A, inside the grant, draft
 * content allowed), `outside` (Mill Room, outside it), `published` (Drawer 1,
 * inside the grant but already public), `type` (an item type, which has no
 * node to scope to). Reading `url` here is fine -- this is a PAGE load, so a
 * state change re-runs it, which is what the harness wants.
 */
export const prerender = false;

export const load = ({ url }: { url: URL }) => {
	if (!dev) error(404, 'Not found');
	return { state: url.searchParams.get('state') };
};
