/**
 * THE CLASSROOM SONG QUEUE (`0145`) -- the pure half.
 *
 * Types, the refusal vocabulary and the predicates that decide what the surface
 * offers. No Svelte, no Supabase and NO CLOCK: every function that needs "now"
 * takes it as a parameter, so each one is assertable at a pinned instant and the
 * surface has exactly one idea of the time (the layout's, threaded down).
 *
 * WHAT THIS FEATURE IS. A student submits an https LINK and an optional note; an
 * instructor of that section approves or rejects it; approval charges the
 * student two coins. There is no upload, no bucket, no bytes and NOTHING PLAYS
 * IN THE APP -- an instructor opens the approved list and plays from whatever
 * they already use. No streaming service is parsed or special-cased anywhere,
 * here or in the database: any https URL, and the instructor is the filter.
 *
 * WHAT THE DATABASE DECIDES AND WHAT THIS DECIDES. `0145` owns every rule that
 * matters -- who may request, who may decide, how many may be waiting, what an
 * approval costs, and above all WHAT EACH ROLE IS TOLD. Nothing in this module
 * is a boundary: a student's payload never contains another student's pending or
 * rejected request, so there is nothing here to remember to hide. That is the
 * point of the projection being built in two separate branches inside the RPC
 * rather than filtered on the way out.
 *
 * SO THE TYPES BELOW ARE NOT TWO VIEWS OF ONE OBJECT, THEY ARE TWO OBJECTS.
 * `SongQueueStudentState` has no field capable of naming a classmate -- its
 * approved rows carry a `mine` bit and no name at all -- which is a property of
 * the TYPE as well as of the payload: a component handed a student state cannot
 * render a peer's name, because there is no expression that would produce one.
 *
 * THERE IS NO URL VALIDATION IN THIS MODULE, DELIBERATELY. `_classroom_song_url_ok`
 * is the one implementation of "is this a usable link", and a mirror of it here
 * would be a second copy that can stop agreeing -- the round trip is one cheap
 * RPC and the refusal comes back as `bad_url` with a sentence already written
 * for it. Do not add one.
 */

/** Every state a request can be in. Derived in `0145`, never stored. */
export type SongRequestStatus = 'pending' | 'approved' | 'rejected';

/** A row of the instructor-only pending queue. Oldest first: a queue is a line. */
export interface SongQueuePendingRow {
	request_id: string;
	url: string;
	note: string | null;
	created_at: string;
	student_email: string;
	student_name: string;
	status: SongRequestStatus;
}

/** A row of the instructor-only decided list, newest decision first. */
export interface SongQueueDecidedRow extends SongQueuePendingRow {
	decided_at: string;
	decided_by: string;
	rejection_reason: string | null;
}

/**
 * ONE APPROVED SONG, AS EVERY MEMBER OF THE CLASS SEES IT.
 *
 * THERE IS NO `student_name` AND NO `student_email` HERE, AND NEITHER MAY BE
 * ADDED. An approved song is going to be played out loud in the room, so the
 * SONG is public within the class by construction; WHO ASKED FOR IT is not, and
 * attaching a student's taste in music to their name in a list thirty
 * classmates read buys this feature nothing it needs. `mine` is one bit and is
 * true only for the reader's own row -- see `0145`'s header.
 */
export interface SongApprovedRow {
	request_id: string;
	url: string;
	note: string | null;
	decided_at: string;
	mine: boolean;
}

/** One of the caller's OWN requests, in any state, with their own reason. */
export interface SongMineRow {
	request_id: string;
	url: string;
	note: string | null;
	created_at: string;
	decided_at: string | null;
	/** Addressed to this reader and reaching nobody else. Null unless rejected. */
	rejection_reason: string | null;
	status: SongRequestStatus;
}

/**
 * WHAT AN ENROLLED STUDENT IS TOLD.
 *
 * The approved list for their class, their own requests, their own pending
 * count and the cap. There is deliberately no `pending` and no `decided` here
 * -- a classmate's undecided or rejected request is not in this object in any
 * form, and none may be added.
 */
export interface SongQueueStudentState {
	scope: 'student';
	section_id: string;
	/** What an approval will cost the requester. Null means the category is retired. */
	price: number | null;
	pending_cap: number;
	/** The caller's OWN waiting count. A fact about them, not about the class. */
	my_pending: number;
	approved: SongApprovedRow[];
	mine: SongMineRow[];
}

/** What an instructor of the section is told: everything, with names. */
export interface SongQueueManagerState {
	scope: 'manager';
	section_id: string;
	price: number | null;
	pending_cap: number;
	pending: SongQueuePendingRow[];
	decided: SongQueueDecidedRow[];
}

export type SongQueueState = SongQueueStudentState | SongQueueManagerState;

/**
 * Every reason `0145` can refuse with.
 *
 * `debt`, `not_priced` and `already_decided` are INSTRUCTOR-facing: they can
 * only be reached from a decision. The rest are the student's. `debt` is the
 * same word the coin desk already answers purchases with -- see `0096`.
 */
export type SongRefusal =
	| 'not_a_student'
	| 'bad_url'
	| 'url_too_long'
	| 'note_too_long'
	| 'pending_cap'
	| 'already_decided'
	| 'debt'
	| 'not_priced'
	| 'reason_required'
	| 'reason_too_long';

/**
 * The numbers and names a refusal carries, so its sentence can state them.
 *
 * A REFUSAL THAT SAYS ONLY "no" LEAVES SOMEBODY GUESSING AT A RULE NOTHING
 * STATES. The cap refusal carries the cap; the debt refusal carries the student,
 * because the instructor is the person who has to act on it.
 */
export interface SongRefusalDetail {
	cap?: number;
	pending?: number;
	max?: number;
	student_name?: string;
	balance?: number;
	price?: number;
	status?: SongRequestStatus;
}

export interface SongRequested {
	request_id: string;
	pending: number;
	cap: number;
}

export interface SongDecided {
	request_id: string;
	status: SongRequestStatus;
	student_name: string;
	/** The coins actually taken. Zero on a rejection, stated rather than implied. */
	charged: number;
}

export type SongResult<T> =
	| { ok: true; data: T }
	| { ok: false; refusal: SongRefusal; detail: SongRefusalDetail }
	| { ok: false; message: string };

/**
 * APPROVE AND REJECT ARE TWO METHODS, NOT ONE TAKING A BOOLEAN.
 *
 * The `ENDPOINTS` argument from `$lib/classroom/file-upload.ts` and the reason
 * `0144` split the hall pass close in two: a flag is a value that can be
 * computed wrongly, where two names cannot be, and grepping for either RPC
 * finds its one caller. It buys something specific here -- the REASON is a
 * required parameter of `reject`, so "a rejection carries a reason" is a
 * property of the signature rather than a check inside a branch.
 *
 * EACH DECISION NAMES THE REQUEST. A manager's own payload already hands them
 * every request id, so a handle costs no disclosure -- and naming it is what
 * carries the instructor's intent across the gap between reading the queue and
 * pressing. A section-keyed approve would re-resolve "the oldest pending one"
 * at the instant the request landed, which is `0144`'s whole lesson.
 */
export interface SongQueueTransports {
	load(sectionId: string): Promise<SongQueueState | null>;
	/** A student asking. Passes no identifier: the person is the session. */
	submit(sectionId: string, url: string, note: string | null): Promise<SongResult<SongRequested>>;
	approve(requestId: string): Promise<SongResult<SongDecided>>;
	reject(requestId: string, reason: string): Promise<SongResult<SongDecided>>;
}

/**
 * HOW OFTEN THE SURFACE RE-ASKS.
 *
 * SLOWER THAN THE HALL PASS (45s) ON PURPOSE, because the two are not the same
 * kind of shared resource. A hall pass is ONE slot whose staleness sends a
 * second student to the door; a song queue is a list that grows, where a
 * request arriving ninety seconds late costs nothing and a decision the
 * instructor just made is already on their own screen from the response. So the
 * poll is for the OTHER person's changes only, and it is paused while the tab is
 * hidden and re-asked the moment it is visible again -- which is the transition
 * that actually matters for a surface that spends its life in a pocket.
 */
export const SONG_QUEUE_POLL_MS = 90_000;

/** The clock this school's calendar is adjudicated in (the `0140` rule). */
const SCHOOL_TIME_ZONE = 'America/Los_Angeles';

/**
 * Wall-clock time of day, in the school's own zone.
 *
 * NOT the viewer's local zone: an instructor reading "asked at 10:42" is
 * matching it against a bell schedule, and a browser whose clock is set to
 * somewhere else would quietly print a time no period ever started at.
 */
export function songClockLabel(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return '';
	return at.toLocaleTimeString('en-US', {
		timeZone: SCHOOL_TIME_ZONE,
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * "just now" / "6 min" / "1 hr 12 min" since a request was made.
 *
 * NO CLOCK IS READ HERE. `nowMs` comes from the layout, which owns the one clock
 * on this surface, so two figures rendered in one paint cannot disagree.
 * FLOORED rather than rounded, so a figure never claims more time has passed
 * than has.
 */
export function songWaitingLabel(fromIso: string, nowMs: number): string {
	const from = new Date(fromIso).getTime();
	if (Number.isNaN(from)) return '';
	const mins = Math.max(0, Math.floor((nowMs - from) / 60_000));
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins} min`;
	const hrs = Math.floor(mins / 60);
	const rest = mins % 60;
	return rest === 0 ? `${hrs} hr` : `${hrs} hr ${rest} min`;
}

/**
 * WHAT A LINK SAYS ON SCREEN, which is its host and nothing else.
 *
 * A raw share URL is 90 characters of tracking parameters and blows out the
 * layout at 375px; the host is the part a reader actually uses to decide what
 * they are about to open. THIS IS PRESENTATION AND NEVER A GATE: the full url is
 * the link target, `0145` accepts any https host, and nothing here or anywhere
 * else may start treating a particular host differently.
 *
 * Falls back to the whole string on anything `URL` cannot parse -- which the
 * database has already refused, so it is a display safeguard rather than a case
 * that reaches a real payload.
 */
export function songLinkLabel(url: string): string {
	try {
		return new URL(url).host || url;
	} catch {
		return url;
	}
}

/** The word for a status. Colour is never the only signal, so this always shows. */
export function songStatusLabel(status: SongRequestStatus): string {
	switch (status) {
		case 'pending':
			return 'Waiting';
		case 'approved':
			return 'Approved';
		case 'rejected':
			return 'Not this one';
	}
}

/**
 * THE SENTENCE FOR EVERY REFUSAL, IN THE READER'S OWN TERMS.
 *
 * NAMES NO DATABASE OBJECT, which is a requirement rather than a preference:
 * every refusal `0145` answers with is a `reason` string precisely so that a
 * constraint name, a table name and a SQLSTATE never reach a person.
 *
 * AND THE STUDENT-FACING ONES NAME NOBODY. `debt` and `not_priced` are the two
 * that carry a name, and both are reachable only from a decision, which only an
 * instructor of the section can make.
 */
export function songRefusalMessage(refusal: SongRefusal, detail: SongRefusalDetail = {}): string {
	switch (refusal) {
		case 'not_a_student':
			return 'Song requests are for students in this class.';
		case 'bad_url':
			return 'That does not look like a link. Paste the full web address, starting with https://.';
		case 'url_too_long':
			return `That link is longer than ${detail.max ?? 2000} characters. Try the short share link instead.`;
		case 'note_too_long':
			return `Keep the note under ${detail.max ?? 300} characters.`;
		case 'pending_cap':
			// NAMES THE CAP. A student who hits it must not be left guessing at a
			// rule nothing states, and "wait for one to be reviewed" is the actual
			// way out rather than a scolding.
			return `You already have ${detail.cap ?? 3} requests waiting in this class. Wait for one to be reviewed, then ask again.`;
		case 'already_decided':
			// SAYS THAT THE PRESS DID NOTHING, and which way it went. Reporting an
			// approval for a request a colleague just rejected is how somebody
			// concludes their press worked.
			return detail.status === 'approved'
				? 'That request was already approved, so nothing was changed.'
				: 'That request was already reviewed, so nothing was changed.';
		case 'debt':
			// FOR THE INSTRUCTOR, AND IT NAMES THE STUDENT, because they are the
			// person who has to do something about it. It also says the request is
			// still waiting, which is the part that decides whether they act now.
			return `${detail.student_name ?? 'That student'} is at ${detail.balance ?? 0}i¢ and cannot cover the ${detail.price ?? 2}i¢ yet. The request is still waiting, so you can approve it once they are back in the black.`;
		case 'not_priced':
			return 'Song requests have no price set right now, so nothing can be approved. An admin needs to reactivate the category.';
		case 'reason_required':
			return 'Say why, so the student knows what to change.';
		case 'reason_too_long':
			return `Keep the reason under ${detail.max ?? 500} characters.`;
	}
}

/**
 * ONE PREDICATE PER CONTROL, DRIVING BOTH THE CONTROL AND ITS HANDLER.
 *
 * The Foundry review console's `reviewCanSend` rule: two spellings of "is this
 * ready" is what produces a click that does nothing, or worse a click that does
 * something the button was drawn as unable to do. The component calls each of
 * these in exactly two places -- the `aria-disabled` attribute and the first
 * line of the handler.
 *
 * AN INSTRUCTOR CAN NEVER REQUEST. Not a UI convenience: `0145` refuses a
 * manager with `not_a_student` even when they hold an enrollment row, which
 * instructors routinely do (`0138`). Offering the form and letting the RPC say
 * no would be a control whose only possible answer is a refusal.
 */
export function songCanRequest(state: SongQueueState | null): boolean {
	if (!state || state.scope !== 'student') return false;
	return state.my_pending < state.pending_cap;
}

/**
 * WHY A STUDENT CANNOT ASK RIGHT NOW, for the `aria-disabled` control to explain
 * itself with. Null means there is nothing to explain.
 *
 * A GENUINELY `disabled` CONTROL SWALLOWS POINTER EVENTS, so it can never say
 * why -- which on the one control this feature gives a student would leave them
 * tapping a dead button with no account of it anywhere.
 */
export function songBlockedReason(state: SongQueueState | null): string | null {
	if (!state || state.scope !== 'student') return null;
	if (state.my_pending >= state.pending_cap) {
		return songRefusalMessage('pending_cap', { cap: state.pending_cap });
	}
	return null;
}

/**
 * "2 of 3 waiting" -- said BEFORE the cap is hit rather than only afterwards.
 *
 * A limit a person only learns by colliding with it reads as the software
 * breaking. This is the same two numbers the refusal carries, from the same
 * payload, so the sentence and the rule cannot drift.
 */
export function songPendingLabel(state: SongQueueStudentState): string {
	return `${state.my_pending} of ${state.pending_cap} waiting`;
}

/**
 * WHAT AN APPROVAL WILL COST, said where the person deciding can see it.
 *
 * Null price is the retired category, which `0145` refuses on -- so the surface
 * says so before anybody presses rather than after.
 */
export function songPriceLabel(price: number | null): string {
	if (price === null) return 'No price set';
	return `${price}i¢ on approval`;
}

/**
 * A REJECTION CARRIES A REASON, AND THIS IS THE AFFORDANCE'S HALF OF THAT RULE.
 *
 * `0145` makes the reason a REQUIRED PARAMETER and refuses a blank one with
 * `reason_required`; this is what stops the control being offered when pressing
 * it could only produce that refusal. The two are allowed to agree, and this one
 * is not trusted -- the database is the boundary.
 *
 * WHITESPACE IS JUDGED THE WAY THE DATABASE JUDGES IT. `0145` normalizes with
 * `regexp_replace(x, '^\s+|\s+$', '', 'g')` rather than `btrim`, precisely
 * because `btrim` strips SPACES ONLY and would accept a reason of newlines and
 * tabs; JavaScript's `trim()` strips the same set the regexp does, so these two
 * agree on every value.
 */
export function songCanReject(reason: string): boolean {
	return reason.trim().length > 0 && reason.trim().length <= 500;
}
