import { handleLegacyFeedbackPost } from '$lib/server/legacy-feedback-post';
import type { RequestHandler } from './$types';

/**
 * THE SIGNED-IN REPORT PATH FOR THE IDEA COIN LEDGER.
 *
 * The Ledger at `/coins/index.html` is carried-over legacy HTML served from a
 * `+server.ts` (see `src/routes/coins/[...path]/+server.ts`), so it renders no
 * layout and cannot mount the portal's own report control the way every Svelte
 * page does. The control is injected into the served HTML instead, and this is
 * where its signed-in reports land -- exactly the arrangement `/vanguard` has
 * had, through the same shared handler, so the two cannot drift.
 *
 * A SIGNED-OUT REPORT DOES NOT COME HERE. The injected panel posts to
 * `/api/feedback`, the anonymous route, which is the only thing that can
 * produce a reporter hash. The two paths stay apart on purpose; see
 * `$lib/server/legacy-feedback-post.ts` and `$lib/feedback/feedback.ts`.
 */

/** The `app` discriminator for every row this route writes. Not from the body:
 * this endpoint serves exactly one surface, and it is the same id
 * `src/lib/site-manifest.ts` already calls the coin ledger. */
const APP = 'coins';

export const POST: RequestHandler = ({ request, locals: { supabase, claims } }) =>
	handleLegacyFeedbackPost(request, supabase, claims, APP);
