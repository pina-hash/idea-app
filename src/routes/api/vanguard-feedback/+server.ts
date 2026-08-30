import { handleLegacyFeedbackPost } from '$lib/server/legacy-feedback-post';
import type { RequestHandler } from './$types';

/**
 * THE SIGNED-IN REPORT PATH FOR VANGUARD, and the reason it is a route at all.
 *
 * Every other surface in the portal files a signed-in report from the BROWSER,
 * through `feedbackWriter` -> `submitFeedback` -> the direct RLS-scoped insert,
 * because every other surface is a Svelte page holding the app's browser
 * client. VANGUARD is legacy HTML served from a `+server.ts` and renders no
 * layout, so there is no component tree, no browser Supabase client, and
 * nothing in the page that could perform that insert. What the page DOES have
 * is same-origin `fetch` and the session cookie, so the insert happens one hop
 * away, on the server, through the caller's OWN client.
 *
 * IT IS STILL THE SAME WRITE. `locals.supabase` is the cookie-based server
 * client for THIS request, carrying THIS caller's JWT, so 0053's insert policy
 * (`with check (user_id = auth.uid())`) is what decides whether the row is
 * allowed and whose it is. This route asserts nothing about identity; it hands
 * the database a client and the database answers.
 *
 * THE USER ID IS NEVER READ FROM THE BODY, and there is no field for one. It is
 * `claims.sub`, resolved by the auth hook from the session, and it is passed to
 * `submitFeedback` -- the one bound writer -- rather than assembled here. A
 * caller who could name the author would make the policy decorative.
 *
 * NO SERVICE-ROLE CLIENT IS CONSTRUCTED HERE AND NONE MAY BE. The anonymous
 * path (`/api/feedback`) files under the service key with no JWT, on purpose:
 * it is the only thing that can produce a reporter hash and it takes its
 * anonymous branch by construction. A signed-in student must never travel that
 * path -- their row would carry no account and be attributable to an address
 * instead. The two paths stay apart; see the note in $lib/feedback/feedback.ts
 * for why, at length.
 *
 * THE ANSWER SHAPE IS THE ANONYMOUS ROUTE'S. `{ok:true}` or `{ok:false,
 * reason}`, where a `reason` means the request was CONSIDERED and re-sending it
 * cannot change the answer. The injected bootstrap reads one contract for both
 * paths, so a signed-in refusal and a signed-out one are told to a person the
 * same way.
 *
 * THE BODY OF ALL OF THAT NOW LIVES IN `$lib/server/legacy-feedback-post.ts`,
 * unchanged, because the IDEA Coin Ledger needed the identical route and the
 * two would have differed by one string. The paragraphs above still describe
 * what happens; that module is where it happens.
 */

/** The `app` discriminator for every row this route writes. Not from the body:
 * this endpoint serves exactly one surface, and `appForRouteId('/vanguard')`
 * answers 'vanguard' for it on every other path. */
const APP = 'vanguard';

export const POST: RequestHandler = ({ request, locals: { supabase, claims } }) =>
	handleLegacyFeedbackPost(request, supabase, claims, APP);
