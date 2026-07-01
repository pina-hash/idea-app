import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import macroTemplate from '$lib/gauntlet/idea-gauntlet-speedrun.bas?raw';
import type { RequestHandler } from './$types';

/**
 * Serves the SolidWorks capture macro with its two config constants already
 * filled in, matching the raw-import serve pattern used for legacy assignments
 * (`/assignments/[slug]`): the source file lives OUTSIDE `static/` and is pulled
 * in at build time via a `?raw` import, so this endpoint is the only way to reach
 * it and it substitutes project values at serve time.
 *
 * The template in the repo keeps its placeholder constants (the source of truth
 * for version control). Here we replace them with the SAME public values the app
 * already ships to every browser (`PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`,
 * see `hooks.server.ts` / `+layout.ts`), so a macro downloaded through the site
 * works with no manual edits. The macro's own "not configured" guard stays as a
 * safety net but never fires for a download served here.
 *
 * No new secret is exposed: the anon key is public and already in the client
 * bundle; the endpoint URL is the same one the Tools page prints for setup.
 */

// The exact placeholder literals in the template's two `Private Const` lines.
const ENDPOINT_PLACEHOLDER = 'https://YOUR-PROJECT-REF.supabase.co/rest/v1/rpc/gauntlet_macro_submit';
const ANON_KEY_PLACEHOLDER = 'PASTE-YOUR-PUBLIC-ANON-KEY-HERE';

export const GET: RequestHandler = async () => {
	const endpoint = `${PUBLIC_SUPABASE_URL}/rest/v1/rpc/gauntlet_macro_submit`;

	const configured = macroTemplate
		.replaceAll(ENDPOINT_PLACEHOLDER, endpoint)
		.replaceAll(ANON_KEY_PLACEHOLDER, PUBLIC_SUPABASE_ANON_KEY);

	return new Response(configured, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': 'attachment; filename="idea-gauntlet-speedrun.bas"'
		}
	});
};
