import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE UPLOAD CEILING HARNESS. Dev-only: 404s in a production build, needs no
 * auth, no Supabase session and no bucket.
 *
 * WHAT IT EXISTS TO MAKE VISIBLE. Every ceiling in the portal, and the SENTENCE
 * each one produces when it is hit -- which on the shipping surfaces is the one
 * thing nobody can see without actually overflowing a bucket. Two students hit
 * one and could describe it only as "failed upload" and "file size limit at
 * 25 mb"; the table below is what makes the same refusals readable at a glance,
 * side by side, with the number each one names.
 *
 * SERVER-RENDERED, unlike `/dev/maps-media` beside it, and for the opposite
 * reason: nothing here needs a producer. Every value is a pure function of a
 * size and a path id, so it renders identically on the server and in the
 * browser, and a spec can read it without waiting for a decode.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
