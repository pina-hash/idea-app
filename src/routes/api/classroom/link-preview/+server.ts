import { json } from '@sveltejs/kit';
import { fetchLinkPreview } from '$lib/server/link-preview';
import type { RequestHandler } from './$types';

/**
 * Link preview metadata for one URL.
 *
 * NEVER FETCHED FROM THE STUDENT'S BROWSER: CORS makes reading another origin's
 * <head> impossible client-side anyway, and routing it through this endpoint
 * means the outbound request comes from the app once and is cached for everyone
 * who looks at the same item.
 *
 * ALWAYS 200 for a signed-in caller. A dead host, a timeout, a page with no
 * metadata and a blocked address all come back as `{ ok: false }` and the card
 * degrades to a plain link -- a link preview failing is not an error condition
 * for the page it sits on. The only non-200s are "not signed in" and "you did
 * not send a URL".
 */

/** Previews are derived from a public page and change slowly. */
const CACHE_CONTROL = 'private, max-age=600';

export const GET: RequestHandler = async ({ url, locals: { claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	const target = url.searchParams.get('url')?.trim() ?? '';
	if (!target) {
		return json({ error: 'A url query parameter is required.' }, { status: 400 });
	}
	if (target.length > 2000) {
		return json({ url: target, ok: false }, { headers: { 'cache-control': CACHE_CONTROL } });
	}

	const preview = await fetchLinkPreview(target);
	return json(preview, { headers: { 'cache-control': CACHE_CONTROL } });
};
