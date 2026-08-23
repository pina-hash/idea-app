import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * THE GROUP-WIDE GATE, STATED ONCE.
 *
 * `/foundry` is the signed-in tier: any Bosco Tech account may publish, and the
 * surfaces underneath it are all about the caller's OWN work. Hoisting the
 * check here means a route added under this prefix later cannot ship ungated by
 * forgetting to copy it.
 *
 * A REDIRECT IS CORRECT HERE, not a 404. `/foundry` is a surface that exists
 * for everyone who signs in, so bouncing an anonymous visitor to the front page
 * confirms nothing they could not already read off the launcher. The 404
 * treatment is for surfaces whose EXISTENCE is the secret, which is why
 * `/admin` and `/coin-desk` are deliberately not in `authedPrefixes` either.
 *
 * `hooks.server.ts` already turns anonymous visitors away at the prefix; this
 * is the second layer, and it is the one that runs for a direct load if that
 * list is ever edited.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.claims) redirect(303, '/');
	return {};
};
