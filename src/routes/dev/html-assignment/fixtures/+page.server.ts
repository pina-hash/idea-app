import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase, no network.
 *
 * This harness is the instrument for ledger 0128: it mounts the PORTED
 * `idea100-blade-01` in a real `sandbox="allow-scripts"` iframe and answers it
 * with a STUB bridge listener, because no frame host exists yet -- ledger 0126
 * owns `HtmlAssignmentFrame` and the `/hx/[docId]` route. The stub is the right
 * instrument precisely because it implements nothing: it logs every message the
 * document emits, verbatim, so the shapes can be compared against the contract
 * rather than against another lane's reading of it.
 *
 * THE FRAME SRC IS A `blob:` URL, NOT A ROUTE, and that is deliberate. A blob
 * document inside a `sandbox="allow-scripts"` frame lands in an OPAQUE ORIGIN,
 * which is the one property of production this harness has to reproduce: it is
 * where `localStorage` throws, where there is no parent DOM to reach, and where
 * a same-origin fetch is cross-origin. Serving the fixture from a route of our
 * own would put it on the dev server's origin and prove nothing about any of
 * that.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
