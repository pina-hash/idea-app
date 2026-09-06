import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE FOUR WAYS A MAP PHOTO CAN RENDER. Dev-only: 404s in a production build,
 * needs no auth, no Supabase session and no bucket.
 *
 * It exists because three of the four are invisible on the surface they ship
 * on. `/maps` is a PUBLIC page: the person who sees a photo fail to arrive is
 * a visitor with a phone, who cannot tell a swept object from a refused one
 * from a bad upload, and who has no way to report any of them. Before this
 * bundle the last two rendered as the browser's own broken-image icon under a
 * caption, which reads as a bad upload.
 *
 * SERVER-RENDERED, unlike `/dev/maps-media` beside it. Nothing here has to be
 * BUILT by a browser -- the fixtures are three photo rows and a base URL -- and
 * the one thing that does need the browser, the `<img>`'s own `error` event,
 * fires after hydration either way.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
