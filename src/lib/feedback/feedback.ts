/**
 * Shared in-app feedback: the data seam for the FeedbackBox component.
 *
 * Deliberately app-AGNOSTIC and outside any one game's lib folder. GREENLINE
 * is the first consumer; VANGUARD (and any future portal surface) wires the
 * same component and the same table by passing a different `app` id. Nothing
 * here knows what a race, a lap, or a wave is.
 *
 * Pure data layer (no Svelte, no game imports), the persistence.ts /
 * frc/gate-submissions.ts convention: each function takes a Supabase client,
 * does one thing, and fails soft if migration 0053 is unapplied.
 *
 * Trust model: a feedback row is a comment about YOURSELF, so there is nothing
 * to forge and no RPC is needed — the insert is a direct RLS-scoped write
 * whose WITH CHECK pins user_id to auth.uid() (the fsp_item_opens pattern).
 * `meta` is free-form context the calling surface attaches (build, track,
 * screen); treat it as a debugging aid, never as authoritative data.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const APP_FEEDBACK_TABLE = 'app_feedback';

/** What the player is telling us. Kept short on purpose: more categories
 * means more time spent choosing and less spent writing. */
export type FeedbackKind = 'bug' | 'idea' | 'praise' | 'other';

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
	{ id: 'bug', label: 'Bug', hint: 'something broke or looked wrong' },
	{ id: 'idea', label: 'Idea', hint: 'something you want added or changed' },
	{ id: 'praise', label: 'Liked it', hint: 'something that felt good' },
	{ id: 'other', label: 'Other', hint: 'anything else' }
];

/** Hard cap on a message, mirrored by the CHECK constraint in 0053. */
export const FEEDBACK_MAX_LEN = 2000;

/**
 * Hard cap on the optional contact string, mirrored by 0126's column CHECK and
 * by `_app_feedback_contact_max()` beside it. Three copies of one number, and
 * the database is the boundary: these two exist so a person is told before the
 * request rather than by a constraint violation afterwards.
 */
export const FEEDBACK_CONTACT_MAX = 200;

export interface FeedbackEntry {
	/** Which app this came from ('greenline', 'vanguard', ...). */
	app: string;
	/** Where in that app ('race', 'garage', 'title', 'results', ...). */
	context?: string | null;
	kind: FeedbackKind;
	message: string;
	/** Free-form context the surface attaches (build, track, screen state). */
	meta?: Record<string, unknown>;
	/**
	 * A WAY TO BE REACHED, OFFERED ONLY WHERE THERE IS NO ACCOUNT, and optional
	 * there. A signed-in report is already attributable, so the signed-in write
	 * never sends this and 0126's function ignores it beside an author anyway.
	 * Free-form on purpose (an email, a first name, "ask me in 4th"): a
	 * validator here would only reject the spellings a person actually used.
	 */
	contact?: string | null;
}

export function feedbackIssue(message: string): string | null {
	const trimmed = message.trim();
	if (!trimmed) return 'Write a little about what you noticed.';
	if (trimmed.length > FEEDBACK_MAX_LEN)
		return `That is longer than ${FEEDBACK_MAX_LEN} characters, trim it down a little.`;
	return null;
}

/**
 * The contact field's only rule is its length, and EMPTY IS ALWAYS FINE. A
 * report with no way to be reached is the ordinary case, not a lesser one.
 */
export function feedbackContactIssue(contact: string | null | undefined): string | null {
	const trimmed = (contact ?? '').trim();
	if (trimmed.length > FEEDBACK_CONTACT_MAX)
		return `That is longer than ${FEEDBACK_CONTACT_MAX} characters, shorten it a little.`;
	return null;
}

/**
 * What one attempt came back with.
 *
 * `retryable` IS THE WHOLE POINT OF THE SHAPE. The box drives the shared
 * SaveState, which retries a retryable failure with backoff and reports a
 * refusal once. Collapsing the two into a bare error string is what makes a
 * retry loop spend fifteen seconds arriving at the same answer while telling
 * the person their note is being re-sent.
 */
export interface FeedbackResult {
	error: string | null;
	retryable: boolean;
}

/**
 * A POSTGREST CODE MEANS THE DATABASE CONSIDERED THIS AND SAID NO.
 *
 * supabase-js surfaces a transport failure ("Failed to fetch", an aborted
 * request, a cold start that timed out) as an error with NO code, because
 * nothing on the far side ever answered. Anything carrying a code -- a CHECK
 * violation, an RLS denial, a missing column -- is a considered refusal, and
 * sending the identical payload again cannot change it.
 */
export function feedbackRetryable(code: string | null | undefined): boolean {
	return !(code ?? '').trim();
}

/**
 * Submit one piece of feedback. Never throws; a blocked write or an unapplied
 * migration comes back as an error string plus whether re-sending could help.
 */
export async function submitFeedback(
	supabase: SupabaseClient,
	userId: string,
	entry: FeedbackEntry
): Promise<FeedbackResult> {
	const issue = feedbackIssue(entry.message);
	// A local validation problem is a refusal: the same payload is refused
	// again, and the person is looking at the field that needs changing.
	if (issue) return { error: issue, retryable: false };
	const { error } = await supabase.from(APP_FEEDBACK_TABLE).insert({
		user_id: userId,
		app: entry.app,
		context: entry.context ?? null,
		kind: entry.kind,
		message: entry.message.trim(),
		meta: entry.meta ?? {}
	});
	if (!error) return { error: null, retryable: false };
	return { error: error.message, retryable: feedbackRetryable(error.code) };
}

// ---------------------------------------------------------------------------
// The anonymous path (0126's function, behind the server route that holds the
// service key)
// ---------------------------------------------------------------------------

/** Where the signed-out report goes. One endpoint, named once. */
export const ANONYMOUS_FEEDBACK_ENDPOINT = '/api/feedback';

/**
 * The whole anonymous request body, capped BEFORE it is parsed, because a
 * public endpoint is a public endpoint.
 *
 * Sized from what a legitimate report can be: a 2000-character message, a
 * 200-character contact, and a captured meta blob whose largest field is a user
 * agent string. Sixteen kilobytes is several times the worst honest case and
 * still far below the ~4.5 MB a serverless request body may reach, which is the
 * ceiling this exists to sit under rather than discover.
 *
 * ENFORCED SERVER-SIDE ONLY, and that is not the usual rule here. The
 * platform-limit rule says refuse a payload before the request is made -- but
 * that rule is about a file somebody CHOSE, where the alternative is a person
 * watching a doomed upload. Nothing a person types can reach this number: the
 * box caps the message at FEEDBACK_MAX_LEN and the contact at
 * FEEDBACK_CONTACT_MAX, and the rest of the body is context this app assembled.
 * A body over this size is therefore not a mistake to warn somebody about, it
 * is a caller that did not come from the box -- so the check lives where such a
 * caller cannot skip it. It is declared HERE rather than in the route because a
 * `+server.ts` may only export handlers, and because a cap belongs beside the
 * other two.
 */
export const FEEDBACK_MAX_BODY_BYTES = 16_384;

/**
 * WHY THE TWO PATHS DO NOT CONVERGE, recorded here because this is where the
 * fork is written and because it reverses a plan stated three times.
 *
 * A signed-in report keeps going DIRECTLY to the table, through 0053's insert
 * policy, whose WITH CHECK pins user_id to auth.uid(). Nothing about that is
 * revoked and nothing about it should be:
 *
 *   * The database is what makes it attributable. The row cannot claim an
 *     author the caller is not, because the policy compares against the JWT the
 *     request arrived with. Moving that write behind this route would mean
 *     either forwarding the caller's JWT into a function granted to
 *     service_role (the role that bypasses RLS -- the check would then be ours
 *     to remember rather than the database's to enforce), or letting a server
 *     route assert who wrote a row. Both replace a database-enforced gate with
 *     a server-side one, where a database-enforced one already works.
 *   * A signed-in row CANNOT carry an address hash anyway. 0126's XOR check
 *     makes "an author and a hash" an unrepresentable state, on purpose: the
 *     hash would link an account to an address and thereby to every anonymous
 *     report sharing it. So there is no single row shape the two paths could
 *     even produce.
 *
 * The cost is that two write paths exist. It is a real cost and it is the
 * smaller one: they write the same columns through the same caps (0126's
 * function applies 0053's), and each is enforced where it can be enforced
 * rather than where it would be tidy.
 */

/**
 * The refusals this path can come back with, and the words for each.
 *
 * A REASON IS PASSED THROUGH FROM THE DATABASE, NOT REWRITTEN ON THE WAY. The
 * route returns 0126's structured `{ok:false, reason}` exactly as the function
 * produced it; the mapping from a reason to a sentence happens HERE, once,
 * because a person cannot read `rate_limited` and a server should not be
 * inventing prose. An unknown reason is NAMED rather than blurred into "a
 * problem occurred": a refusal this table does not know about is one the
 * database grew after this file was written, and hiding the word is how that
 * goes unnoticed.
 */
export const FEEDBACK_REFUSALS: Record<string, string> = {
	message_empty: 'Write a little about what you noticed.',
	message_too_long: `That is longer than ${FEEDBACK_MAX_LEN} characters, trim it down a little.`,
	contact_too_long: `That way of reaching you is longer than ${FEEDBACK_CONTACT_MAX} characters, shorten it a little.`,
	// NO COUNTS, NO WINDOW, NO RESET TIME. 0126 refuses without saying anything
	// about the address, and a friendlier sentence here would be the place that
	// gave it away.
	rate_limited: 'That is as many reports as this connection can send right now. Try again later.',
	body_too_large: 'That report is too big to send. Shorten it and try again.',
	invalid_body: 'That report could not be read. Reload the page and try again.',
	not_configured: 'Anonymous reports are not switched on for this deployment.',
	server_refused: 'The server would not take that report.'
};

export function feedbackRefusalWords(reason: string): string {
	return FEEDBACK_REFUSALS[reason] ?? `The server refused that report (${reason}).`;
}

/** What the route answers with. `reason` present means it was CONSIDERED. */
interface AnonymousFeedbackResponse {
	ok?: unknown;
	reason?: unknown;
}

/**
 * Submit one anonymous report. Never throws.
 *
 * A STRUCTURED `reason` IS THIS PATH'S POSTGREST CODE. The signed-in path
 * treats an error carrying a code as a considered refusal and a codeless one as
 * a transport failure worth retrying (see `feedbackRetryable`); the same
 * distinction has to survive the extra hop, so the route answers a considered
 * refusal with a body carrying `reason`, and answers nothing of the sort when
 * the far side never got that far. Retryability is therefore read off the
 * BODY, never off the HTTP status: a 413 for an oversized body is a cap, and a
 * cap does not change on its own, so backing off and re-sending the identical
 * payload five times would spend fifteen seconds arriving at the same answer.
 *
 * THE ADDRESS THE RATE LIMIT IS KEYED ON IS NOT SENT FROM HERE, and there is no
 * field for it. See src/routes/api/feedback/+server.ts.
 */
export async function submitAnonymousFeedback(
	entry: FeedbackEntry,
	fetchImpl: typeof fetch = fetch
): Promise<FeedbackResult> {
	const issue = feedbackIssue(entry.message) ?? feedbackContactIssue(entry.contact);
	if (issue) return { error: issue, retryable: false };

	let res: Response;
	try {
		res = await fetchImpl(ANONYMOUS_FEEDBACK_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				app: entry.app,
				context: entry.context ?? null,
				kind: entry.kind,
				message: entry.message.trim(),
				meta: entry.meta ?? {},
				contact: (entry.contact ?? '').trim() || null
			})
		});
	} catch {
		// Nothing on the far side ever answered.
		return { error: 'That did not send. Check your connection.', retryable: true };
	}

	let body: AnonymousFeedbackResponse | null = null;
	try {
		body = (await res.json()) as AnonymousFeedbackResponse;
	} catch {
		body = null;
	}

	if (res.ok && body?.ok === true) return { error: null, retryable: false };
	const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
	if (reason) return { error: feedbackRefusalWords(reason), retryable: false };
	return { error: 'That did not send. It can be re-sent.', retryable: true };
}

/**
 * THE ONE BOUND WRITER, and it now answers for both kinds of reporter.
 *
 * Signed in: the direct RLS-scoped insert, unchanged, attributable by the
 * database. Signed out: the server route above, which is the only thing holding
 * the service key and the only thing that can produce a valid reporter hash.
 *
 * NULL IS STILL A LEGAL ANSWER AND STILL REMOVES THE CONTROL. `allowAnonymous:
 * false` is what a surface passes when it has no anonymous path to offer, and a
 * harness passes `submit={null}` outright. Absence remains the mechanism; what
 * changed is that being signed out is no longer one of the reasons for it.
 */
export function feedbackWriter(
	supabase: SupabaseClient | null | undefined,
	userId: string | null | undefined,
	options: { allowAnonymous?: boolean; fetchImpl?: typeof fetch } = {}
): ((entry: FeedbackEntry) => Promise<FeedbackResult>) | null {
	if (supabase && userId) return (entry) => submitFeedback(supabase, userId, entry);
	if (options.allowAnonymous === false) return null;
	const fetchImpl = options.fetchImpl;
	return (entry) => submitAnonymousFeedback(entry, fetchImpl ?? fetch);
}

/**
 * WILL THIS REPORT ARRIVE WITH NO ACCOUNT BEHIND IT.
 *
 * THE SAME PREDICATE `feedbackWriter` BRANCHES ON, exported so the two callers
 * that must tell a person which kind of report they are filing read the answer
 * rather than re-deriving it. Two spellings of "are they signed in" is two
 * answers, and the day they disagree is the day a box says a name is attached
 * to a row that carries none.
 *
 * The supabase client is part of the question, not a technicality: the error
 * boundary renders when a LAYOUT load failed, and the client is one of the
 * things that may not have survived. A signed-in claim with no client to write
 * through is a report that goes out anonymously, and the box has to say so.
 */
export function feedbackIsAnonymous(
	supabase: SupabaseClient | null | undefined,
	userId: string | null | undefined
): boolean {
	return !(supabase && userId);
}

// ---------------------------------------------------------------------------
// The triage queue (0085's status columns and admin RPCs)
// ---------------------------------------------------------------------------

export type FeedbackStatus = 'new' | 'seen' | 'resolved';

/** One row as app_feedback_admin_list returns it. */
export interface FeedbackRow {
	id: string;
	app: string;
	context: string | null;
	kind: string;
	message: string;
	meta: Record<string, unknown> | null;
	status: FeedbackStatus;
	created_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
	submitter_name: string | null;
	submitter_email: string | null;
	/**
	 * STATED BY 0127, NOT INFERRED HERE. Absent on a payload from a backend
	 * still on 0085, which is why `rowIsAnonymous` in console.ts falls back to
	 * the two identity fields rather than reading this directly.
	 */
	anonymous?: boolean;
	/**
	 * What an anonymous reporter typed as a way to be reached, or null. NOT AN
	 * IDENTITY: nothing verified it and nobody signed in to type it. Every
	 * surface that shows it says so, and the export's identity toggle withholds
	 * it alongside the name and the address.
	 */
	contact?: string | null;
}
