import { json } from '@sveltejs/kit';
import {
	FEEDBACK_MAX_BODY_BYTES,
	FEEDBACK_MAX_LEN,
	feedbackIssue,
	submitFeedback,
	type FeedbackKind
} from '$lib/feedback/feedback';
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
 */

const KINDS: FeedbackKind[] = ['bug', 'idea', 'praise', 'other'];

/** The `app` discriminator for every row this route writes. Not from the body:
 * this endpoint serves exactly one surface, and `appForRouteId('/vanguard')`
 * answers 'vanguard' for it on every other path. */
const APP = 'vanguard';

function refuse(reason: string, status: number): Response {
	return json({ ok: false, reason }, { status });
}

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	// A SIGNED-OUT CALLER IS NOT REDIRECTED HERE AND IS NOT QUIETLY DOWNGRADED.
	// The page decides which path to use before it posts; arriving here without
	// a session means the session ended mid-report, and the honest answer is to
	// say so rather than to file the report anonymously on somebody's behalf.
	if (!claims) return refuse('unauthorized', 401);

	// The same cap the anonymous route applies, for the same reason: nothing a
	// person can type approaches it, so a body over it did not come from the box.
	const declared = Number(request.headers.get('content-length') ?? '');
	if (Number.isFinite(declared) && declared > FEEDBACK_MAX_BODY_BYTES) {
		return refuse('body_too_large', 413);
	}
	const raw = await request.arrayBuffer();
	if (raw.byteLength > FEEDBACK_MAX_BODY_BYTES) return refuse('body_too_large', 413);

	let body: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return refuse('invalid_body', 400);
		}
		body = parsed as Record<string, unknown>;
	} catch {
		return refuse('invalid_body', 400);
	}

	const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
	const kind = str(body.kind).toLowerCase() as FeedbackKind;
	const message = str(body.message);
	const context = str(body.context);
	const meta =
		body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
			? (body.meta as Record<string, unknown>)
			: {};

	if (!KINDS.includes(kind)) return refuse('invalid_body', 400);
	// `feedbackIssue` is the client's rule; applied again here because a caller
	// that did not come from the box would otherwise reach a CHECK constraint and
	// be told about it in Postgres's words.
	if (!message) return refuse('message_empty', 200);
	if (message.length > FEEDBACK_MAX_LEN) return refuse('message_too_long', 200);

	const result = await submitFeedback(supabase, claims.sub, {
		app: APP,
		context: context || null,
		kind,
		message,
		meta
	});

	if (!result.error) return json({ ok: true });
	// `retryable` is the distinction the whole shape exists for: a codeless error
	// is a transport failure that never reached the database, and only that
	// answer comes back without a `reason` for the client to retry on.
	if (result.retryable) return json({ ok: false }, { status: 502 });
	// Local validation refusals reach a person in their own words already
	// (`feedbackIssue`); anything else was refused BY the database.
	if (feedbackIssue(message)) return refuse('message_empty', 200);
	return refuse('server_refused', 502);
};
