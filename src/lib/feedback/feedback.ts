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

/**
 * WHEN A REPORT IS FOR: something to fold in within a week or so, or a big
 * idea for later (Mr. Pina, 2026-09-30; the presentation engine is his
 * example of the second). Its OWN FIELD, never a fifth kind: a long-term
 * idea is still a bug, an idea or an "other", and folding the two questions
 * into one picker would make every existing `kind` filter lie about it.
 *
 * STORED AS `app_feedback.horizon` (0230), default `now`. `now` IS NEVER SENT
 * BY THIS CLIENT, on either write path: it is the column's default, so an
 * ordinary report stays byte-identical to the row it always was, and a
 * deployment sitting before 0230 is never asked for a column it does not
 * have unless somebody actually chose "long-term".
 */
export type FeedbackHorizon = 'now' | 'long_term';

/** The two choices, in the order the box lists them, with the words a person reads. */
export const FEEDBACK_HORIZONS: { id: FeedbackHorizon; label: string; hint: string }[] = [
	{ id: 'now', label: 'Fix soon', hint: 'something to change in the next week or so' },
	{ id: 'long_term', label: 'Long-term idea', hint: 'a big idea for later, not a fix for this week' }
];

export function isFeedbackHorizon(value: unknown): value is FeedbackHorizon {
	return value === 'now' || value === 'long_term';
}

/** Hard cap on a message, mirrored by the CHECK constraint in 0053. */
export const FEEDBACK_MAX_LEN = 2000;

/**
 * Hard cap on the optional contact string, mirrored by 0126's column CHECK and
 * by `_app_feedback_contact_max()` beside it. Three copies of one number, and
 * the database is the boundary: these two exist so a person is told before the
 * request rather than by a constraint violation afterwards.
 */
export const FEEDBACK_CONTACT_MAX = 200;

/**
 * Hard cap on the optional "What did you try?" field, mirrored by 0170's
 * `app_feedback_tried_len` CHECK and by `_app_feedback_tried_max()` beside it.
 * The database is the boundary; this exists so a person is told before the
 * request rather than by a constraint violation afterwards.
 *
 * HALF THE MESSAGE CAP, deliberately. An account of what somebody TRIED is
 * shorter than an account of what happened -- it is a list of attempts, not a
 * description -- and a field sized like the message invites a second copy of
 * the report in it.
 */
export const FEEDBACK_TRIED_MAX = 1000;

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
	/**
	 * WHAT THEY TRIED BEFORE WRITING IN. Optional, and optional means optional:
	 * the field is offered on every report and a report without one is the
	 * ordinary case.
	 *
	 * IT TRAVELS EITHER WAY, AND WHERE IT LANDS IS THE DEPLOYMENT'S ANSWER, NOT
	 * THE PERSON'S. On a backend carrying 0170 it goes in the `tried` COLUMN,
	 * where a CHECK is the boundary. Everywhere else -- a deployment sitting
	 * before that migration, and the anonymous route, which forwards `meta`
	 * verbatim and names no `p_tried` -- it rides in `meta.tried`, which the
	 * console reads as a fallback and which 0170's own function lifts into the
	 * column and strips from the blob. So the field is never removed from the
	 * form and the answer is never dropped on the floor.
	 */
	tried?: string | null;
	/**
	 * The key of ONE object in the private `feedback-media` bucket, already
	 * uploaded, or null. NEVER a URL and never bytes: the row carries a pointer
	 * and 0170's CHECK pins its shape and its owner.
	 *
	 * The upload happens BEFORE this entry exists (see
	 * `uploadFeedbackScreenshot`), so a refusal is reported beside the control
	 * that caused it rather than as a failure of the report.
	 */
	screenshotPath?: string | null;
	/**
	 * WHEN THIS IS FOR. Absent means `now`, and only `long_term` is ever
	 * written anywhere (see {@link FeedbackHorizon}). On the signed-in path it
	 * goes in 0230's column when the backend has it and in `meta.horizon` when
	 * it does not; on the anonymous path it always rides in `meta`, which
	 * 0230's function lifts into the column, exactly as 0170 lifts `tried`.
	 */
	horizon?: FeedbackHorizon;
}

/**
 * The tried field's only rule is its length, and EMPTY IS ALWAYS FINE -- the
 * `feedbackContactIssue` shape, for the same reason: a report that does not say
 * what was tried is a report, not a lesser one.
 */
export function feedbackTriedIssue(tried: string | null | undefined): string | null {
	const trimmed = (tried ?? '').trim();
	if (trimmed.length > FEEDBACK_TRIED_MAX)
		return `That is longer than ${FEEDBACK_TRIED_MAX} characters, trim it down a little.`;
	return null;
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
	const issue = feedbackIssue(entry.message) ?? feedbackTriedIssue(entry.tried);
	// A local validation problem is a refusal: the same payload is refused
	// again, and the person is looking at the field that needs changing.
	if (issue) return { error: issue, retryable: false };

	const tried = (entry.tried ?? '').trim();
	// `meta` is SPREAD rather than mutated: the caller's object is captured
	// context and is not this function's to edit.
	const meta = { ...(entry.meta ?? {}) };
	const base: Record<string, unknown> = {
		user_id: userId,
		app: entry.app,
		context: entry.context ?? null,
		kind: entry.kind,
		message: entry.message.trim(),
		meta
	};

	// ---------------------------------------------------------------------
	// THE LADDER. Migrations here are applied BY HAND and separately, so a
	// deployment sitting before 0170 is a real state, and naming a column
	// PostgREST does not know about fails the WHOLE insert. Widest rung first,
	// exactly one capability narrower on failure, ending on the insert 0053
	// has always taken.
	// ---------------------------------------------------------------------
	//
	// THE WIDEST RUNG IS ONLY TAKEN WHEN THERE IS SOMETHING TO PUT ON IT. A
	// report with no tried text and no screenshot has nothing 0170 added to
	// carry, so it takes the insert 0053 has always taken -- byte for byte the
	// row this function has always written, in one round trip. Climbing a ladder
	// to send two nulls would cost every report on the site a wasted attempt for
	// the whole window between a push and a hand-applied migration, to no end.
	//
	// THE SAME HOLDS FOR 0230's `horizon`: only `long_term` is ever named, so a
	// report somebody left on "fix soon" is the same base insert it always was.
	const longTerm = entry.horizon === 'long_term';
	const needs0170 = !!tried || !!entry.screenshotPath;
	if (!needs0170 && !longTerm) {
		const { error } = await supabase.from(APP_FEEDBACK_TABLE).insert(base);
		if (!error) return { error: null, retryable: false };
		return { error: error.message, retryable: feedbackRetryable(error.code) };
	}

	// 0170's two columns, on every rung that has them. The KEY of an object that
	// already landed, never bytes: it can only be set where the attach control
	// was offered, which is where the probe below said the column exists -- so
	// the narrow rung never has one to drop.
	const with0170 = (row: Record<string, unknown>): Record<string, unknown> => {
		if (!needs0170) return row;
		const out: Record<string, unknown> = { ...row, tried: tried || null };
		if (entry.screenshotPath) out.screenshot_path = entry.screenshotPath;
		return out;
	};
	/** `base` with a meta blob of its own, so no rung edits another's. */
	const withMeta = (extra: Record<string, unknown>): Record<string, unknown> => ({
		...base,
		meta: { ...meta, ...extra }
	});

	// ONE CAPABILITY PER RUNG, widest first (0230, then 0170, then 0053). Each
	// degrades on a missing column ALONE (`feedbackColumnMissing`); any other
	// refusal is reported as it is, because re-sending a narrower row cannot
	// change a CHECK or an RLS answer. A rung that would be byte-identical to
	// the one below it is not tried twice.
	const rungs: Record<string, unknown>[] = [];
	if (longTerm) rungs.push(with0170({ ...base, horizon: 'long_term' }));
	// Without 0230: the choice rides in the blob, where 0230's apply-time
	// backfill lifts it into the column and the console reads it meanwhile.
	if (needs0170) rungs.push(with0170(longTerm ? withMeta({ horizon: 'long_term' }) : base));
	// The narrow rung: no 0170 columns at all, and the answers ride in the
	// free-form blob the console already reads generically. The FIELDS are
	// never removed from the form -- what changes is only where they land.
	rungs.push(
		withMeta({ ...(tried ? { tried } : {}), ...(longTerm ? { horizon: 'long_term' } : {}) })
	);

	let last: { message: string; code?: string | null } | null = null;
	for (const row of rungs) {
		const { error } = await supabase.from(APP_FEEDBACK_TABLE).insert(row);
		if (!error) return { error: null, retryable: false };
		last = error;
		if (!feedbackColumnMissing(error.code)) break;
	}
	return { error: last!.message, retryable: feedbackRetryable(last!.code) };
}

/**
 * DOES THIS ERROR MEAN THE COLUMN IS NOT THERE YET -- read off the CODE ALONE,
 * never the message.
 *
 * `PGRST204` is what PostgREST answers a WRITE naming a column its schema cache
 * does not hold ("Could not find the 'tried' column"); `42703` is Postgres's
 * own `undefined_column`, which is what a caller talking straight to the
 * database sees. Both mean the same thing and only that thing.
 *
 * MATCHED ON THE CODE, because a message match would also catch a runtime error
 * that happened to mention a column name, and degrading on THAT would send a
 * report down a path nobody chose. Anything else is a considered refusal and is
 * reported as one.
 */
export function feedbackColumnMissing(code: string | null | undefined): boolean {
	const value = (code ?? '').trim();
	return value === 'PGRST204' || value === '42703';
}

// ---------------------------------------------------------------------------
// What this deployment's backend can actually take (0170)
// ---------------------------------------------------------------------------

/**
 * WHICH OF 0170's TWO FIELDS THE BACKEND IN FRONT OF US HAS.
 *
 * Migrations here are applied BY HAND and separately, so a deployment sitting
 * between two of them is a real state and every select naming a new column is
 * written as a ladder. This is the ladder for the feedback box, in its
 * narrowest possible form.
 */
export interface FeedbackCapabilities {
	/** `app_feedback.tried` exists, so the answer can go in the column. */
	tried: boolean;
	/** `app_feedback.screenshot_path` exists, so an attach can be offered. */
	screenshot: boolean;
}

/**
 * THE HONEST STARTING VALUE, and the one every caller that has not asked gets.
 * "Cannot tell" must never read as "yes": with both false the box still sends,
 * `tried` still travels (in `meta`), and no attach control is offered.
 */
export const NO_FEEDBACK_CAPABILITIES: FeedbackCapabilities = { tried: false, screenshot: false };

/**
 * ONE RUNG, BECAUSE THE TWO COLUMNS ARRIVE IN ONE MIGRATION, AND IT ANSWERS A
 * QUESTION THE SEND PATH DOES NOT NEED TO ASK.
 *
 * `submitFeedback` degrades by itself (the ladder above), so nothing about
 * writing a report depends on this. What DOES depend on it is whether an ATTACH
 * CONTROL may be offered at all: uploading 8 MB of bytes and then discovering
 * the column that would have pointed at them does not exist is the report lost
 * on the one surface that exists to catch lost things. So this is asked BEFORE
 * the control is drawn, never before a send.
 *
 * The rule is that a new capability gets its OWN rung so degrading cannot cost
 * an unrelated one -- and these two are not unrelated, they are one migration
 * (0170) and one apply. A rung that came back PROVES both columns exist, which
 * is the `coalescingReady` shape: better than a failed round trip per field to
 * learn the same fact.
 *
 * THE NARROWEST POSSIBLE PROBE: two scalar columns, no embedded resource, one
 * row at most, and the caller's own RLS. A student with no reports of their own
 * gets an empty array and no error, which is a PASS -- what is being asked is
 * whether PostgREST knows the columns, not whether there are rows.
 *
 * ANY ERROR IS A NO. An unapplied migration answers 42703 / PGRST204, and a
 * transport failure answers nothing at all; both mean the attach control must
 * not be offered, so this fails closed rather than partitioning error codes it
 * would then have to keep in step with the server.
 */
export async function probeFeedbackCapabilities(
	supabase: SupabaseClient | null | undefined
): Promise<FeedbackCapabilities> {
	if (!supabase) return NO_FEEDBACK_CAPABILITIES;
	try {
		const { error } = await supabase
			.from(APP_FEEDBACK_TABLE)
			.select('tried,screenshot_path')
			.limit(1);
		if (error) return NO_FEEDBACK_CAPABILITIES;
		return { tried: true, screenshot: true };
	} catch {
		return NO_FEEDBACK_CAPABILITIES;
	}
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
	const issue =
		feedbackIssue(entry.message) ??
		feedbackContactIssue(entry.contact) ??
		feedbackTriedIssue(entry.tried);
	if (issue) return { error: issue, retryable: false };

	// `tried` RIDES IN `meta` ON THIS PATH, ALWAYS, AND THAT IS THE ROUTE'S
	// SHAPE RATHER THAN A DEGRADE. /api/feedback forwards `meta` verbatim into
	// 0126's function and names no `p_tried`; 0170's function lifts the key into
	// the column and strips it from the blob, so a row written here reads
	// identically to one written by the signed-in path. On a backend before
	// 0170 it stays in `meta`, where the console's generic pass prints it.
	const tried = (entry.tried ?? '').trim();
	const meta = { ...(entry.meta ?? {}) };
	if (tried) meta.tried = tried;
	// THE SAME SHAPE FOR THE HORIZON, AND FOR THE SAME REASON: the route forwards
	// `meta` and names no `p_horizon`, and 0230's function lifts the key into the
	// column and strips it from the blob. Only `long_term` is ever sent; an
	// ordinary report's body is byte-identical to what it always was.
	if (entry.horizon === 'long_term') meta.horizon = 'long_term';

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
				meta,
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

/**
 * THE FOUR TRIAGE STATES. `spam` is `0188`'s and is A STATUS, NOT A DELETE.
 *
 * `app_feedback` has no delete grant and no delete policy for anyone, and its
 * rows are the record: a report removed is one no export, no count and no
 * rate-limit forensic can ever see again, on a table whose per-address digest
 * (`0126`'s, deliberately not named here: `tests/feedback-untrusted-render.test.ts`
 * sweeps this file for that identifier, and a privacy sweep must not be loosened
 * to admit prose) exists precisely to be counted. So a false or spam report is
 * MARKED, by the
 * same `app_feedback_set_status` every other state moves through, and moving it
 * back to `new` is that same call with a different argument.
 *
 * IT HIDES NOTHING BY ITSELF, which is what keeps the export honest. The
 * console's `all` filter still means every status and the export header still
 * prints the filter verbatim; what makes the feature work is only that the
 * console opens on `new`, which it already did.
 */
export type FeedbackStatus = 'new' | 'seen' | 'resolved' | 'spam';

/**
 * THE ONE LIST OF STATUSES, with the words a console shows, and every status
 * control on every feedback console is derived from it -- the per-row buttons,
 * the bulk bar and the filter tabs of the site queue, and the same three on the
 * Armory app's two tabs (decision D5 of the 2026-10-07 round: one vocabulary
 * across the three, so there is one list in code and no new words to learn).
 * Adding `spam` (0188) touched exactly this array, which is the point of it
 * being one; it moved here from FeedbackConsole when a second console needed it.
 */
export const FEEDBACK_STATUSES: { id: FeedbackStatus; label: string }[] = [
	{ id: 'new', label: 'New' },
	{ id: 'seen', label: 'Seen' },
	{ id: 'resolved', label: 'Resolved' },
	{ id: 'spam', label: 'Spam' }
];

/**
 * AN ADMIN'S CORRECTION OF A FILED REPORT (0233, report d362bfb3): the latest
 * numbered revision of its kind, message and "what you tried", as the console
 * read projects it beside the reporter's own words. The reporter's row never
 * changes; `rowEdit` in console.ts is the one reader that validates this
 * shape, and `rowMessage` / `rowKind` / `rowTried` are what every surface reads.
 */
export interface FeedbackEdit {
	revision: number;
	kind: string;
	message: string;
	tried: string | null;
	edited_by: string | null;
	edited_at: string;
}

/**
 * The words for each refusal `app_feedback_edit` answers with, shown verbatim
 * beside the edit form. An admin reads these, so they say what to do next.
 */
export const FEEDBACK_EDIT_REFUSALS: Record<string, string> = {
	kind: 'Pick one of the four kinds.',
	empty: 'The message cannot be empty. A report has to say something.',
	too_long: `The message is longer than ${FEEDBACK_MAX_LEN} characters. Shorten it and save again.`,
	tried_too_long: `"What they tried" is longer than ${FEEDBACK_TRIED_MAX} characters. Shorten it and save again.`,
	stale:
		'Another admin changed this report while you were editing it. Reload to see their version, then edit again.'
};

/** What the edit form sends: the words it wants, and the revision it opened on. */
export interface FeedbackEditInput {
	kind: string;
	message: string;
	tried: string | null;
	/** The revision the form was opened on; 0 for a report never edited. */
	baseRevision: number;
}

/**
 * AN OPEN EDIT'S UNSAVED WORDS, kept by the console rather than by the form.
 * The form is mounted inside its report's card, and a card moves between the
 * list and the console's "Being edited" section when a filter or a bulk move
 * hides it, which remounts the form; the console hands these back so the new
 * mount opens on what was typed, against the revision it was typed against.
 */
export interface FeedbackEditDraft {
	kind: string;
	message: string;
	tried: string;
	/** The revision the edit was opened on, so a save after a remount is still checked against it. */
	baseRevision: number;
}

/**
 * What `app_feedback_edit` answered, as the edit transport hands it back.
 * `reason` is the database's own structured refusal (FEEDBACK_EDIT_REFUSALS);
 * `message` is a transport failure, with whether sending again could help.
 */
export type FeedbackEditResult =
	| { ok: true; changed: boolean; revision: number }
	| { ok: false; reason?: string; message?: string; retryable?: boolean };

/** The console's optional edit transport. Absent removes every Edit control. */
export type FeedbackEditTransport = (
	id: string,
	input: FeedbackEditInput
) => Promise<FeedbackEditResult>;

/** A refusal's words, or the reason itself named, so a new one is never blurred. */
export function feedbackEditRefusalWords(reason: string): string {
	return FEEDBACK_EDIT_REFUSALS[reason] ?? `The database refused that edit (${reason}).`;
}

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
	/**
	 * WHAT THE REPORTER TRIED, from 0170's column. Absent on a payload from a
	 * backend still on 0127, which is why `rowTried` in console.ts falls back to
	 * `meta.tried` rather than reading this directly -- both write paths put the
	 * answer there before 0170 lifts it.
	 */
	tried?: string | null;
	/**
	 * The KEY of one object in the private `feedback-media` bucket, never a URL.
	 * A key is useless on its own: the console mints a short-lived signed URL for
	 * it server-side, as the admin, so the storage policy stays the boundary.
	 */
	screenshot_path?: string | null;
	/**
	 * `now` or `long_term`, from 0230's column. Absent on a payload from a
	 * backend before 0230 and typed as a plain string because the payload is
	 * not trusted to hold one of the two: `rowHorizon` in console.ts is the one
	 * reader, and it falls back to `meta.horizon` the way `rowTried` falls back
	 * to `meta.tried`.
	 */
	horizon?: string | null;
	/**
	 * AN ADMIN'S LATEST CORRECTION, or null when the report was never edited
	 * (0233). ABSENT on a payload from a backend before 0233, and the absence
	 * is the signal: the console offers the Edit control only when the load
	 * saw this key on a row, so a client deployed before the apply offers
	 * nothing it cannot write. `kind`, `message` and `tried` above stay the
	 * reporter's own words whatever this holds.
	 */
	edit?: FeedbackEdit | null;
}
