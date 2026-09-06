import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * A STAND-IN FOR THE STORAGE OBJECT ENDPOINT, ON LOOPBACK.
 *
 * `/dev/maps-media/photos` mounts the REAL `MapsItemCard`, which builds every
 * photo src with the REAL `mapsPhotoUrl`. That function appends
 * `/storage/v1/object/public/maps-media/<key>` to whatever base it is handed,
 * so the harness hands it `/dev/maps-media/o` and this catch-all answers the
 * result.
 *
 * WHY NOT A `data:` URI, WHICH IS WHAT THE FOUNDRY COVER HARNESS USES. That
 * harness substitutes at the last step, because `foundryCoverUrl` is a pure
 * function it can wrap. `mapsPhotoUrl` is called INSIDE `MapsItemCard`, so
 * substituting would mean giving the component a prop it does not ship with --
 * a harness that mounts a component the real page does not. Answering the URL
 * the real function built keeps the whole path real and costs one route.
 *
 * IT MUST BE LOOPBACK. `npm run verify:browser` blocks every non-loopback
 * request, so a real Supabase URL would hang and then fail, which is a
 * measurement of the proxy rather than of the page.
 *
 * WHAT IT DECIDES, and it is the only decision it makes: a key naming
 * `present` gets bytes that decode; everything else gets the same bodyless 404
 * the object endpoint gives for an object that is not there. That is the
 * `failed` case, and it is a REAL network turn producing a REAL `error` event
 * rather than a flag set by the fixture.
 */

/** A 4x3 PNG. Small enough to inline, real enough that `naturalWidth` is 4. */
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAHElEQVQI12P8z8Dwn4EIwESMolGFowpHFRJSCACgvgQCVpJFTgAAAABJRU5ErkJggg==',
	'base64'
);

export const GET: RequestHandler = ({ params }) => {
	if (!dev) error(404, 'Not found');
	const path = params.path ?? '';
	if (!path.includes('present')) return new Response(null, { status: 404 });
	return new Response(PNG, {
		headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }
	});
};
