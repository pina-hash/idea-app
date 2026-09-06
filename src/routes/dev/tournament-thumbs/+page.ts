import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE TOURNAMENT THUMBNAIL HARNESS. Dev-only: 404s in a production build, needs
 * no auth, no Supabase session and no bucket.
 *
 * It drives the one decision 0076 adds to the render path, which is INVISIBLE
 * on the surface it ships on. Before this bundle a `thumbnail_url` that was not
 * a picture had exactly two outcomes on a live bracket -- the browser's own
 * broken-image glyph, or a silently empty box for a scheme it would not fetch
 * -- and both look, from across a gym, like the entry simply has no picture.
 * There are four states now and the harness exists so a person can see all four
 * side by side and tell them apart by PAINT rather than by reading the fixture
 * table beside them.
 *
 * It mounts the REAL `EntryChip` and `EntryBanner`, never a copy of their
 * markup: the whole claim under test is that a fault renders in the same box as
 * a picture and moves nothing on the row, and a hand-rolled div would be
 * asserting that about itself.
 *
 * Client-rendered, because two of the four states are only reachable through a
 * real element's own `error` event. A server render cannot produce `failed` at
 * all -- nothing has tried to load anything yet -- so an SSR'd harness would
 * paint three states and a fourth that is really `present` waiting to fail,
 * which is precisely the confusion this page exists to remove.
 */
export const prerender = false;
export const ssr = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
