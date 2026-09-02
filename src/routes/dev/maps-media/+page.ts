import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE MAPS MEDIA HARNESS. Dev-only: 404s in a production build, needs no auth,
 * no Supabase session and no bucket.
 *
 * It drives the two decisions this bundle is about, both of which are
 * INVISIBLE on the surface they ship on:
 *
 *   1. `prepareMapsPhoto` -- pass through, re-encode, or refuse. On the real
 *      shelf surface all three look the same until somebody else opens the map
 *      on a different phone, weeks later.
 *   2. `mapsTransports`' classification of a unique-constraint refusal. A
 *      wrongly-retryable refusal renders identically to a correctly retryable
 *      one; nothing anywhere puts `retryable` on screen.
 *
 * Client-rendered, because every fixture it uses has to be BUILT by a real
 * producer in a real browser: the PNG bytes come out of `canvas.toBlob`, which
 * is the same call the transcode itself makes, so the harness cannot hand the
 * code under test a shape a browser could not emit.
 */
export const prerender = false;
export const ssr = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
