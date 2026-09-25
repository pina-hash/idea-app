import { handleLegacyFeedbackPost, handleLegacySessionProbe } from '$lib/server/legacy-feedback-post';
import type { RequestHandler } from './$types';

/**
 * THE SIGNED-IN REPORT PATH FOR A CARRIED-OVER ASSIGNMENT (report 20,
 * 2026-09-25), and the one question its panel asks first.
 *
 * `/assignments/<slug>` is carried-over legacy HTML served from a `+server.ts`
 * (`src/routes/assignments/[slug]/+server.ts`), so it renders no layout and
 * cannot mount the portal's report control the way every Svelte page does. The
 * control is injected into the served HTML -- the IDEA Coin Ledger's
 * arrangement, through the same shared handler, so the three cannot drift.
 *
 * WHAT DIFFERS FROM THE LEDGER IS THE GET. That page is a shared public cache
 * entry with no `Vary: Cookie`, so its bytes cannot say whether the reader is
 * signed in; the panel asks here when the box opens and learns one boolean.
 *
 * A SIGNED-OUT REPORT DOES NOT COME HERE. The injected panel posts to
 * `/api/feedback`, the anonymous route, which is the only thing that can
 * produce a reporter hash. The two paths stay apart on purpose; see
 * `$lib/server/legacy-feedback-post.ts` and `$lib/feedback/feedback.ts`.
 */

/** The `app` discriminator for every row this route writes. Not from the body:
 * this endpoint serves exactly one surface, and it is the same id
 * `appForRouteId` gives `/assignments/...`. */
const APP = 'assignments';

export const GET: RequestHandler = ({ locals: { claims } }) => handleLegacySessionProbe(claims);

export const POST: RequestHandler = ({ request, locals: { supabase, claims } }) =>
	handleLegacyFeedbackPost(request, supabase, claims, APP);
