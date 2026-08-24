import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Dev-only, and 404 in production. It needs no auth and no Supabase: the whole
 * point is that the submit surface's five-step orchestration can be driven with
 * nothing running behind it.
 */
/*
 * THE REAL FIXTURE FILE, UNMODIFIED.
 *
 * `tests/fixtures/foundry/approved-react-app.html` is the actual bundle a
 * student submitted -- the one that was approved and rendered blank because its
 * four unpkg script tags were never going to load. It is the file the whole
 * lane exists for, so the acceptance drive uses THAT file rather than a
 * reconstruction of it, byte for byte, read in at build time.
 *
 * `?raw` and not a `fs` read: this has to work the same way in the browser
 * build as everywhere else, and a runtime `fs` read is not available to a
 * SvelteKit route on any adapter. The route 404s in production regardless.
 */
import reactAppFixture from '../../../../tests/fixtures/foundry/approved-react-app.html?raw';

export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return { reactAppFixture };
};
