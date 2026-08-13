import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * SITE-WIDE SHORT LINKS: /209h -> the IDEA209H digital syllabus.
 *
 * A single-segment catch-all, which SvelteKit resolves only AFTER every static
 * route -- /archive, /dashboard, /classroom and the rest all win, and files in
 * static/ are served before routing runs at all. So this catches what would
 * otherwise have been a 404 and nothing else. (0093's slug validation also
 * refuses the reserved names, so a slug that could never be reached cannot be
 * created in the first place.)
 *
 * PUBLIC, deliberately: the whole point is a parent scanning a QR code with no
 * account. The read is app_short_link_target (0093), which returns one active
 * slug's target and nothing else -- no label, no author, no way to enumerate.
 *
 * FRAGMENTS SURVIVE, which is the reason this is a redirect rather than a
 * render. A fragment is never sent to the server; a browser carries the
 * original URL's fragment onto a redirect target that has none of its own
 * (RFC 7231 7.1.2). So /209h#ai-policy lands on the syllabus with #ai-policy
 * intact, and 0093 refuses a target carrying its own fragment because that one
 * would win instead.
 *
 * 307, not 308: a slug is re-pointable by design, and a permanent redirect is
 * exactly the thing browsers and QR-code readers cache past the point where
 * re-pointing it would help.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const slug = params.shortlink.trim().toLowerCase();
	if (!slug || slug.length > 61 || !/^[a-z0-9][a-z0-9._-]*$/.test(slug)) {
		error(404, 'Not found');
	}

	const { data, error: rpcError } = await supabase.rpc('app_short_link_target', {
		p_slug: slug
	});

	// A pre-0093 deployment answers PGRST202. Nothing a visitor can do about
	// either that or an unknown slug, so both read as a plain 404.
	if (rpcError || !data || typeof data !== 'string') error(404, 'Not found');

	redirect(307, data);
};
