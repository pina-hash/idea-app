import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE SHELF-ENTRY HARNESS. Dev-only: 404s in a production build, needs no auth
 * and no Supabase. It mounts the REAL `ShelfEntry` over the editor harness's
 * own fixture with in-memory transports, which is what makes the whole flow --
 * camera, refusal, save, container persistence, publish confirm -- drivable at
 * 375px with no network and no account.
 *
 * `?state=` opens a variant: `no-container` (nothing picked, the container
 * picker is the whole surface), `no-photos` (the photo transports withheld, so
 * the camera and picker are absent -- absence is the mechanism), `fail-photo`
 * (the next upload refuses, which is how the row-saved-photo-did-not branch is
 * reached). Reading `url` here is fine: this is a PAGE load, so a state change
 * re-runs it, which is what the harness wants.
 */
export const prerender = false;

export const load = ({ url }: { url: URL }) => {
	if (!dev) error(404, 'Not found');
	return { state: url.searchParams.get('state') };
};
