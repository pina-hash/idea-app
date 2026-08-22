import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import {
	FEEDBACK_CONTACT_MAX,
	FEEDBACK_MAX_BODY_BYTES,
	FEEDBACK_MAX_LEN
} from '$lib/feedback/feedback';
import type { RequestHandler } from './$types';

/**
 * THE ANONYMOUS REPORT PATH. One endpoint, one caller of 0126's
 * `app_feedback_submit`, and the only holder of the service key that can reach
 * it.
 *
 * WHY A ROUTE AND NOT AN RPC THE BROWSER CALLS. The rate limit is keyed on
 * where the report came from, and PostgREST has no notion of a client address:
 * whatever stands in for "this reporter" has to be handed IN. A parameter a
 * caller supplies is a parameter a caller can lie about, so 0126 grants its
 * function to `service_role` and to nobody else -- not public, not anon, not
 * authenticated. This file is the reason that grant is safe: it is the one
 * place the address is determined, and it determines it from the request rather
 * than from anything in it.
 *
 * THE ADDRESS COMES FROM `getClientAddress()`, NEVER FROM A HEADER AND NEVER
 * FROM THE BODY.
 *
 *   * Not from the body: a rate limit keyed on a value the rate-limited party
 *     chooses is theatre. The body is READ for a message, a kind, a context, a
 *     meta blob and a contact string, and there is no field in the shape below
 *     through which an address or a hash could arrive -- `p_address_hash` is
 *     filled from the request, full stop.
 *   * Not from a header either, which is the subtler half. `x-forwarded-for`
 *     and its neighbours are strings any caller can set; reading one directly
 *     would mean a script could rotate its own key on every request and the cap
 *     would count to five over an unbounded set of buckets. `getClientAddress()`
 *     is the platform's answer, derived from the adapter's own trusted view of
 *     the connection, which is exactly the value a caller cannot choose.
 *
 * THE ROUTE NEVER COMPUTES THE STORED VALUE. It hands over an address; the salt
 * lives in `app_feedback_reporter_secret`, is readable by nothing, and the
 * digest is taken inside the definer function. What lands in `reporter_hash` is
 * therefore not something this file could produce even if it tried to.
 *
 * IT FILES ANONYMOUSLY BY CONSTRUCTION, and it does not read the session. The
 * admin client carries no JWT, so `auth.uid()` inside the function is null and
 * 0126 takes its anonymous branch no matter who is holding the page. A
 * signed-in reporter never arrives here: `feedbackWriter` hands that caller the
 * direct RLS-scoped insert instead, which is what makes their row attributable
 * to an account rather than to an address (see the note in
 * src/lib/feedback/feedback.ts for why the two paths stay apart).
 *
 * NOT IN `authedPrefixes`, deliberately: it answers its own responses and there
 * is nothing here to sign in to.
 */

/**
 * A considered answer. The body carries the reason; see below.
 *
 * A `+server.ts` MAY ONLY EXPORT HANDLERS -- SvelteKit validates the module's
 * exports and answers 500 for anything else, which is how the body cap came to
 * live in $lib/feedback/feedback.ts beside the other two caps rather than here.
 */
function refuse(reason: string, status: number): Response {
	return json({ ok: false, reason }, { status });
}

/**
 * THE STATUS DESCRIBES THE TRANSPORT; THE BODY DESCRIBES THE ANSWER.
 *
 * Every outcome this route CONSIDERED comes back with a `reason` string, and
 * the client treats the presence of one as a refusal to report once rather than
 * retry -- the same rule `feedbackRetryable` applies to a PostgREST code on the
 * signed-in path. The only response with no `reason` is the one where the far
 * side never answered at all, which is the only outcome re-sending can fix.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// CAP FIRST. `arrayBuffer()` gives the true byte length rather than a UTF-16
	// code-unit count, which is what the cap is denominated in; the declared
	// Content-Length is checked first so an honest oversized request is refused
	// without being read, and re-checked afterwards because a caller can lie
	// about it.
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
	const app = str(body.app);
	const kind = str(body.kind).toLowerCase();
	const message = str(body.message);
	const context = str(body.context);
	const contact = str(body.contact);
	const meta =
		body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
			? (body.meta as Record<string, unknown>)
			: {};

	// A BAD APP OR KIND IS A BUG IN OUR OWN CLIENT, and 0126 RAISES on both
	// rather than answering structurally. Caught here so a hand-rolled POST gets
	// a refusal instead of a 500 that reads as an outage.
	if (!app) return refuse('invalid_body', 400);
	if (!['bug', 'idea', 'praise', 'other'].includes(kind)) return refuse('invalid_body', 400);
	// The two length caps are the database's -- mirrored here only so an
	// oversized field is answered without a round trip. The function applies
	// them again, and it is the one that decides.
	if (!message) return refuse('message_empty', 200);
	if (message.length > FEEDBACK_MAX_LEN) return refuse('message_too_long', 200);
	if (contact.length > FEEDBACK_CONTACT_MAX) return refuse('contact_too_long', 200);

	const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceKey) {
		// Considered, and re-sending cannot fix it: a missing env var is not a
		// transport failure and must not be retried with backoff.
		return refuse('not_configured', 503);
	}

	const admin = createClient(PUBLIC_SUPABASE_URL, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data, error } = await admin.rpc('app_feedback_submit', {
		p_app: app,
		p_kind: kind,
		p_message: message,
		p_context: context || null,
		p_meta: meta,
		p_contact: contact || null,
		// THE ONE VALUE THAT DOES NOT COME FROM THE REQUEST BODY.
		p_address_hash: getClientAddress()
	});

	if (error) {
		// The signed-in path's rule, one hop further out: a PostgREST code means
		// the database considered this and said no, and a codeless error means
		// nothing on the far side ever answered.
		if ((error.code ?? '').trim()) return refuse('server_refused', 502);
		return json({ ok: false }, { status: 502 });
	}

	const result = (data ?? null) as { ok?: unknown; reason?: unknown } | null;
	if (result?.ok === true) return json({ ok: true });
	// 0126'S OWN REFUSAL, PASSED THROUGH AS IT STANDS. Not translated, not
	// widened, not softened: `rate_limited` reaches the client as
	// `rate_limited`, and the words for it are chosen in one place on the
	// client rather than invented per response here.
	const reason = typeof result?.reason === 'string' ? result.reason : 'server_refused';
	return json({ ok: false, reason }, { status: 200 });
};
