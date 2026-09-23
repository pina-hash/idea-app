import type { PageLoad } from './$types';

/**
 * Which surface the harness page shows: the real assignment engine (default)
 * or the real deck viewer (`?case=deck`). A PAGE load may read `url`; the
 * layout's gate already 404s this route in production.
 */
export const load: PageLoad = async ({ url }) => {
	return { dsCase: url.searchParams.get('case') ?? '' };
};
