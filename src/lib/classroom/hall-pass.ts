/**
 * THE DIGITAL BATHROOM PASS -- the pure half.
 *
 * Types, arithmetic and the two predicates that decide what the surface offers.
 * No Svelte, no Supabase and NO CLOCK: every function that needs "now" takes it
 * as a parameter, so each one is assertable at a pinned instant and the surface
 * has exactly one idea of the time (the layout's, threaded down).
 *
 * WHAT THE DATABASE DECIDES AND WHAT THIS DECIDES. `0143` owns every rule that
 * matters -- who may open, who may close, one pass per section, and above all
 * WHAT EACH ROLE IS TOLD. Nothing in this module is a boundary: a student's
 * payload never contains another student's name, so there is nothing here to
 * remember to hide. That is the point of the projection being built in two
 * separate branches inside the RPC rather than filtered on the way out.
 *
 * SO THE TYPES BELOW ARE NOT TWO VIEWS OF ONE OBJECT, THEY ARE TWO OBJECTS.
 * `HallPassStudentState` has no field capable of naming anybody, which is a
 * property of the type as well as of the payload -- a component handed a
 * student state cannot render a name because there is no expression that would
 * produce one.
 */

/** One row of the instructor-only history. */
export interface HallPassEntry {
	pass_id: string;
	student_email: string;
	student_name: string;
	opened_at: string;
	/** Null means still out. This is the whole state model -- see 0143. */
	closed_at: string | null;
	closed_by: string | null;
	/**
	 * WHO OPENED IT (`0174`). NULL is the ordinary case and means the student
	 * themselves -- which is also every row written before that migration, so
	 * this needs no legacy branch. An email is the instructor who overrode the
	 * cooldown or the daily cap for them.
	 *
	 * OPTIONAL because a deployment sitting before `0174` answers without the
	 * field at all, and a surface must render that as "no override marker"
	 * rather than as a broken row.
	 */
	opened_by?: string | null;
}

/**
 * THE TWO NUMBERS THE LIMIT USES, PROJECTED RATHER THAN RESTATED (`0174`).
 *
 * `_classroom_hall_pass_limits()` is the ONE statement of them and the state
 * payload carries its answer, so no constant, component or stylesheet in this
 * repo writes 10 or 3 down. A client-side copy is exactly the thing that stops
 * agreeing with the refusal behind it -- the surface would draw a button the
 * server then declines, or grey one out the server would have allowed.
 *
 * OPTIONAL, because the migration is applied by hand: a deployment that has not
 * had it yet answers a payload with no `limits` in it, and the surface then says
 * nothing about a rule that is not being enforced.
 */
export interface HallPassLimits {
	cooldown_minutes: number;
	daily_limit: number;
}

/** One name the override control may pick (`0174`, manager branch only). */
export interface HallPassRosterEntry {
	student_email: string;
	student_name: string;
}

/**
 * WHAT AN ENROLLED STUDENT IS TOLD, WHICH IS ONE BIT PLUS THEIR OWN TIMESTAMP.
 *
 * There is deliberately no `student_name`, no `student_email`, no `pass_id` and
 * no `history` here, and none may be added: a permanent peer-visible record of
 * who left class is a much bigger thing than this feature is. `opened_at` is
 * non-null ONLY when `mine` is true, so it is the caller's own timestamp rather
 * than a fact about whoever is out.
 */
export interface HallPassStudentState {
	scope: 'student';
	section_id: string;
	taken: boolean;
	mine: boolean;
	opened_at: string | null;
	/** `0174`'s numbers. Absent before that migration is applied. */
	limits?: HallPassLimits;
	/**
	 * HOW MANY PASSES THIS CALLER HAS TAKEN IN THIS CLASS TODAY. Their own
	 * count, on the America/Los_Angeles calendar day -- a fact about themselves,
	 * exactly as `opened_at` is, and not a disclosure about anybody.
	 */
	used_today?: number;
	/**
	 * WHEN THIS CALLER MAY GO AGAIN, or null when they may go now.
	 *
	 * The DATABASE decides whether to send it: it is non-null only while the
	 * cooldown is genuinely still running at read time, so the client asks one
	 * question (is this null) instead of holding a second copy of the
	 * comparison. It can be up to one poll interval stale, and the server's own
	 * refusal is what settles that case.
	 */
	retry_at?: string | null;
}

/** What an instructor of the section is told. */
export interface HallPassManagerState {
	scope: 'manager';
	section_id: string;
	taken: boolean;
	mine: false;
	open: {
		pass_id: string;
		student_email: string;
		student_name: string;
		opened_at: string;
	} | null;
	history: HallPassEntry[];
	/** `0174`'s numbers, so the instructor surface can state the rule it is about to override. */
	limits?: HallPassLimits;
	/**
	 * THE ACTIVE ROSTER, AND IT IS HERE FOR EXACTLY ONE CONTROL.
	 * `classroom_hall_pass_open_for` names a student, so the surface offering it
	 * has to be able to name one; an override that made an instructor type an
	 * email address at the classroom door is a control nobody uses correctly.
	 * These are rows this caller already reads on the People tab, and the
	 * STUDENT TYPE HAS NO SUCH FIELD -- the database never evaluates the
	 * expression on that branch.
	 */
	roster?: HallPassRosterEntry[];
}

export type HallPassState = HallPassStudentState | HallPassManagerState;

/**
 * Every refusal the pass RPCs can answer with.
 *
 * `already_closed` is `0144`'s and is reachable ONLY on the manager path: a
 * named pass that had already been signed back in before the instructor
 * pressed. It is a refusal rather than a silent success because "the student
 * came back and signed themselves in" and "I signed them in" are different
 * things that happened, and the instructor is the person who needs to know
 * which. Reporting the second when the first occurred is how somebody concludes
 * their press worked on the one occasion it did nothing.
 */
export type HallPassRefusal =
	| 'taken'
	| 'already_out'
	| 'not_a_student'
	| 'not_open'
	| 'not_yours'
	| 'already_closed'
	| 'cooldown'
	| 'limit_reached'
	| 'not_enrolled';

/**
 * WHAT A `0174` REFUSAL CARRIES BESIDES ITS WORD.
 *
 * A REFUSAL WITH NO TIME IN IT GETS ASKED AGAIN IMMEDIATELY, IN PERSON, which
 * is the thing the limit exists to stop. So the database answers `cooldown`
 * with the instant the student may go again and `limit_reached` with the count
 * and the cap, and the sentence is built from those rather than from numbers
 * written down here.
 */
export interface HallPassRefusalDetail {
	/** ISO instant, `cooldown` only. */
	retryAt?: string | null;
	used?: number | null;
	limit?: number | null;
}

export interface HallPassOpened {
	pass_id: string;
	opened_at: string;
}

export interface HallPassClosed {
	pass_id: string;
	opened_at: string;
	closed_at: string;
	closed_by_manager: boolean;
	/** Manager-only, null for a student closing their own. */
	student_name: string | null;
}

export type HallPassResult<T> =
	| { ok: true; data: T }
	| ({ ok: false; refusal: HallPassRefusal } & HallPassRefusalDetail)
	| { ok: false; message: string };

/** What the instructor override answers on success (`0174`). */
export interface HallPassOpenedFor extends HallPassOpened {
	student_email: string;
	student_name: string;
	opened_by: string;
}

/**
 * THE CLOSE IS TWO TRANSPORTS BECAUSE IT IS TWO DECISIONS (`0144`).
 *
 * A SINGLE SECTION-KEYED CLOSE IS THE DEFECT, not a simplification of one. It
 * re-resolves "whatever is open in this section" at the moment the request
 * lands, so an instructor clearing a pass in the same instant one student
 * returns and another leaves closes the SECOND student's pass -- marking them
 * back in the room while they are in a corridor, and freeing the pass for a
 * third. Nothing on screen reports it.
 *
 * SO THE MANAGER NAMES THE PASS AND THE STUDENT NAMES NOTHING, and neither half
 * is arbitrary:
 *
 *   * `closeById` carries the instructor's INTENT across the gap between
 *     reading the card and pressing the control. It costs no disclosure -- a
 *     manager's own payload already hands them the pass id, the name, the email
 *     and the history, so a handle tells them nothing they did not have.
 *   * `closeMine` takes the SECTION and resolves the person in the database
 *     from the session. There is no argument through which to name anybody, so
 *     `HallPassStudentState` still has no field capable of identifying a person
 *     and never needs one. That property is the load-bearing one and is swept
 *     for in `tests/classroom-hall-pass.test.ts`.
 *
 * AND THE STUDENT PATH CANNOT HAVE THE RACE AT ALL, structurally: the database
 * requires the open pass's holder to BE the caller, so if their pass closed and
 * somebody else's opened underneath, the answer is `not_yours`. A wrong close
 * is not expressible on it.
 *
 * TWO METHODS RATHER THAN ONE TAKING A ROLE FLAG, for the reason `ENDPOINTS` in
 * `$lib/classroom/file-upload.ts` is a literal map: a flag is a value that can
 * be computed wrongly, where two names cannot be, and grepping for either RPC
 * finds its one caller.
 */
export interface HallPassTransports {
	load(sectionId: string): Promise<HallPassState | null>;
	open(sectionId: string): Promise<HallPassResult<HallPassOpened>>;
	/** A student signing THEMSELVES back in. Passes no identifier of any kind. */
	closeMine(sectionId: string): Promise<HallPassResult<HallPassClosed>>;
	/** An instructor signing ONE NAMED pass back in, from their own payload. */
	closeById(passId: string): Promise<HallPassResult<HallPassClosed>>;
	/**
	 * THE OVERRIDE (`0174`): an instructor of the section sends a NAMED student
	 * out past the cooldown and the daily cap.
	 *
	 * OPTIONAL, AND THE ABSENCE IS THE MECHANISM, exactly as an omitted
	 * transport is everywhere else in this module. A caller that does not wire
	 * it gets no override control at all rather than one that would answer
	 * PGRST202 -- which is also the honest state of a deployment sitting before
	 * `0174`.
	 *
	 * IT NAMES THE STUDENT, which is the opposite of `open` and correct for the
	 * same reason `closeById` names the pass: the person acting is deciding
	 * ABOUT somebody, and saying who is the only way that intent survives the
	 * gap between reading the roster and pressing the control.
	 */
	openFor?(sectionId: string, studentEmail: string): Promise<HallPassResult<HallPassOpenedFor>>;
}

/**
 * HOW OFTEN THE SURFACE RE-ASKS, and it is a shared resource so it does have to
 * ask. A student looking at "available" needs that to be true a moment later;
 * an instructor needs to see somebody leave without reloading.
 *
 * PAUSED WHILE THE TAB IS HIDDEN, and re-asked immediately on becoming visible
 * -- which is the case that actually matters, since a phone in a pocket is the
 * normal state of this surface between uses. A class of 25 with the page open
 * is ~33 reads a minute against one cheap RPC; polling every few seconds to
 * make the button "never" wrong would be paying continuously for a case the
 * refusal already handles correctly and instantly.
 */
export const HALL_PASS_POLL_MS = 45_000;

/** The clock this school's calendar is adjudicated in (the `0140` rule). */
const SCHOOL_TIME_ZONE = 'America/Los_Angeles';

/**
 * Wall-clock time of day, in the school's own zone.
 *
 * NOT the viewer's local zone: an instructor reading "out since 10:42" is
 * matching it against a bell schedule, and a browser whose clock is set to
 * somewhere else would quietly print a time no period ever started at.
 */
export function hallPassClockLabel(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return '';
	return at.toLocaleTimeString('en-US', {
		timeZone: SCHOOL_TIME_ZONE,
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * Whole minutes between two instants, floored, never negative.
 *
 * FLOORED RATHER THAN ROUNDED so a figure on screen never claims more time has
 * passed than has: "4 min" appearing at 3m31s would make a pass look longer
 * than it is to the person deciding whether it is long.
 */
export function hallPassMinutes(fromIso: string, toMs: number): number {
	const from = new Date(fromIso).getTime();
	if (Number.isNaN(from)) return 0;
	return Math.max(0, Math.floor((toMs - from) / 60_000));
}

/**
 * "just now" / "6 min" / "1 hr 12 min".
 *
 * NO CLOCK IS READ HERE. `nowMs` comes from the layout, which owns the one
 * clock on this surface -- so this is assertable at a pinned instant and two
 * figures rendered in one paint cannot disagree with each other.
 *
 * THERE IS NO CEILING AND NO WARNING TONE AT ANY DURATION. Nothing auto-closes
 * a pass and nothing here decides that a number has become too big: a long
 * absence is a conversation an instructor has, and a surface that started
 * colouring minutes red would be enforcing a limit the feature deliberately
 * does not have.
 */
export function hallPassElapsedLabel(fromIso: string, nowMs: number): string {
	const mins = hallPassMinutes(fromIso, nowMs);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins} min`;
	const hrs = Math.floor(mins / 60);
	const rest = mins % 60;
	return rest === 0 ? `${hrs} hr` : `${hrs} hr ${rest} min`;
}

/** How long a finished pass lasted. The same arithmetic, both ends given. */
export function hallPassDurationLabel(entry: HallPassEntry): string {
	if (!entry.closed_at) return '';
	return hallPassElapsedLabel(entry.opened_at, new Date(entry.closed_at).getTime());
}

/**
 * THE SENTENCE FOR EVERY REFUSAL, IN THE STUDENT'S OWN TERMS.
 *
 * NAMES NO DATABASE OBJECT, which is a requirement rather than a preference:
 * the capacity check is a partial unique index, and its raw violation carries
 * the constraint name, the table and the column list. `0143` already turns that
 * into a `reason`; this turns the reason into a sentence. Neither ever shows a
 * SQLSTATE.
 *
 * AND IT NAMES NOBODY. "Someone else has the pass" is the whole of what a
 * student may learn -- see `HallPassStudentState`.
 */
export function hallPassRefusalMessage(
	refusal: HallPassRefusal,
	detail: HallPassRefusalDetail = {}
): string {
	switch (refusal) {
		case 'taken':
			return 'Someone else has the pass right now. Try again when they are back.';
		case 'already_out':
			return 'You are already signed out.';
		case 'not_a_student':
			return 'The hall pass is for students in this class.';
		case 'not_open':
			return 'Nobody is signed out right now.';
		case 'not_yours':
			return 'That pass is not yours to sign back in.';
		case 'already_closed':
			// SAYS THAT THE PRESS DID NOTHING, which is the whole reason `0144`
			// makes this a refusal instead of reporting a close. An instructor
			// whose click landed a moment after the student signed themselves in
			// is entitled to know that is what happened -- and the card behind
			// this sentence has already been re-read, so whoever is out NOW is on
			// screen beside it.
			return 'That pass was already signed back in, so nothing was changed.';
		case 'cooldown':
			// THE TIME IS THE WHOLE POINT (`0174`). "Not yet" with no instant in
			// it is asked again thirty seconds later, out loud, which is exactly
			// the behaviour the limit exists to stop. The clock label is the
			// school's own zone, so it matches the bell schedule on the wall.
			return detail.retryAt
				? `You just came back. You can take the pass again at ${hallPassClockLabel(detail.retryAt)}.`
				: 'You just came back. Wait a few minutes before taking the pass again.';
		case 'limit_reached':
			// NAMES THE COUNT AND POINTS AT THE OVERRIDE. "No" with no way
			// forward is what makes a student ask a person instead -- so this
			// sentence says who to ask, because that person really can say yes.
			return detail.limit
				? `You have used all ${detail.limit} passes for this class today. Ask your teacher if you still need to go.`
				: 'You have used all your passes for this class today. Ask your teacher if you still need to go.';
		case 'not_enrolled':
			// Reachable only on the instructor override, where it means the name
			// picked is not on the live roster.
			return 'That student is not on this class list right now.';
	}
}

/**
 * IS THIS STUDENT STILL INSIDE THE COOLDOWN, and until when.
 *
 * NOT A BOUNDARY, AND THE COMMENT ON `hallPassCanClose` IS THE PRECEDENT: the
 * database refuses the open, and this decides what the control looks like
 * beforehand. They are allowed to agree and this one is not trusted.
 *
 * IT HOLDS NO NUMBER. `retry_at` is an absolute instant the database computed
 * from its own single statement of the cooldown, so the only arithmetic here is
 * a comparison against the clock the surface already threads down. A minutes
 * figure written in this file would be the second copy.
 */
export function hallPassCooldownUntil(state: HallPassState | null, nowMs: number): string | null {
	if (!state || state.scope !== 'student') return null;
	const at = state.retry_at;
	if (!at) return null;
	const ms = new Date(at).getTime();
	if (Number.isNaN(ms) || ms <= nowMs) return null;
	return at;
}

/**
 * HAS THIS STUDENT USED THE DAY'S PASSES IN THIS CLASS.
 *
 * FALSE WHENEVER THE PAYLOAD CANNOT SAY, which is the fail-open direction and
 * is deliberate: a deployment before `0174` carries neither field, and a
 * surface that greyed the button out on a missing number would be enforcing a
 * limit the database is not enforcing -- a student refused by nothing at all.
 * The server is the limit; this is the explanation.
 */
export function hallPassAtDailyLimit(state: HallPassState | null): boolean {
	if (!state || state.scope !== 'student') return false;
	const cap = state.limits?.daily_limit;
	if (typeof cap !== 'number' || typeof state.used_today !== 'number') return false;
	return state.used_today >= cap;
}

/**
 * THE STATUS LINE, which is the only thing on this surface a student reads
 * before deciding whether to tap.
 *
 * A PEER'S PASS IS "Someone is out", NEVER A NAME AND NEVER A DURATION. There
 * is no name in the payload to print, and the duration is withheld for the same
 * reason: "out 23 min" beside an empty chair identifies the person just as well
 * as the name does, to everybody in the room.
 */
export function hallPassStatusLine(state: HallPassState, nowMs: number): string {
	if (state.scope === 'manager') {
		if (!state.open) return 'Nobody is out.';
		return `${state.open.student_name} is out, ${hallPassElapsedLabel(state.open.opened_at, nowMs)} (since ${hallPassClockLabel(state.open.opened_at)}).`;
	}
	if (state.mine && state.opened_at) {
		return `You are signed out, ${hallPassElapsedLabel(state.opened_at, nowMs)}.`;
	}
	if (state.taken) return 'Someone is out. The pass is taken.';
	return 'The pass is free.';
}

/**
 * ONE PREDICATE PER CONTROL, DRIVING BOTH THE CONTROL AND ITS HANDLER.
 *
 * The Foundry review console's `reviewCanSend` rule: two spellings of "is this
 * ready" is what produces a click that does nothing, or worse a click that does
 * something the button was drawn as unable to do. The component calls these in
 * exactly two places each -- the `aria-disabled` attribute and the first line
 * of the handler.
 *
 * AN INSTRUCTOR CAN NEVER OPEN. Not a UI convenience: `0143` refuses a manager
 * with `not_a_student` even when they hold an enrollment row, which instructors
 * routinely do (`0138`). Offering the control and letting the RPC say no would
 * be a control whose only possible answer is a refusal.
 */
export function hallPassCanOpen(state: HallPassState | null, nowMs: number): boolean {
	if (!state || state.scope !== 'student' || state.taken) return false;
	// `0174`. THE CONTROL MIRRORS THE LIMIT, IT DOES NOT IMPLEMENT IT: both
	// answers come from the payload, and the database refuses the call
	// regardless of what this returns. Offering a control whose only possible
	// answer is a refusal is the thing being avoided.
	if (hallPassCooldownUntil(state, nowMs)) return false;
	return !hallPassAtDailyLimit(state);
}

/**
 * A STUDENT MAY CLOSE ONLY THEIR OWN; AN INSTRUCTOR MAY CLOSE WHATEVER IS OPEN.
 * The same rule `0143`'s close gate applies, and the reason it is stated twice
 * is that one of the two statements is the boundary and the other is the
 * affordance -- they are allowed to agree, and this one is not trusted.
 */
export function hallPassCanClose(state: HallPassState | null): boolean {
	if (!state) return false;
	if (state.scope === 'manager') return !!state.open;
	return state.taken && state.mine;
}

/**
 * WHY A STUDENT CANNOT TAP RIGHT NOW, for the `aria-disabled` control to
 * explain itself with. Null means there is nothing to explain.
 *
 * A GENUINELY `disabled` CONTROL SWALLOWS POINTER EVENTS, so it can never say
 * why -- which on the one control this feature has would leave a student
 * tapping a dead button with no account of it anywhere.
 */
export function hallPassBlockedReason(
	state: HallPassState | null,
	nowMs: number
): string | null {
	if (!state || state.scope !== 'student') return null;
	if (state.taken && !state.mine) return hallPassRefusalMessage('taken');
	// SAME SENTENCE THE SERVER WOULD HAVE ANSWERED, from the same builder --
	// so a student who taps anyway reads the identical words, and there is one
	// place where the wording of a refusal lives.
	if (hallPassAtDailyLimit(state)) {
		return hallPassRefusalMessage('limit_reached', { limit: state.limits?.daily_limit ?? null });
	}
	const until = hallPassCooldownUntil(state, nowMs);
	if (until) return hallPassRefusalMessage('cooldown', { retryAt: until });
	return null;
}

/**
 * "2 of 3 passes used today", or null when the deployment cannot say.
 *
 * SHOWN BEFORE ANYBODY TAPS, which is the half of this feature that is not a
 * refusal: a student who can see the count coming does not spend one finding
 * out. Both numbers come off the payload, so this sentence cannot disagree
 * with the rule behind it.
 */
export function hallPassUsageLine(state: HallPassState | null): string | null {
	if (!state || state.scope !== 'student') return null;
	const cap = state.limits?.daily_limit;
	if (typeof cap !== 'number' || typeof state.used_today !== 'number') return null;
	return `${state.used_today} of ${cap} pass${cap === 1 ? '' : 'es'} used today.`;
}

/**
 * WHAT AN INSTRUCTOR IS TOLD THE OVERRIDE IGNORES, in their own terms.
 *
 * Null when the payload carries no limits, which is a deployment before `0174`:
 * there is no rule to describe and no override control offered either.
 */
export function hallPassLimitSummary(state: HallPassState | null): string | null {
	const limits = state?.limits;
	if (!limits) return null;
	return `Students get ${limits.daily_limit} pass${limits.daily_limit === 1 ? '' : 'es'} a day in this class and wait ${limits.cooldown_minutes} minutes between them. Sending someone out ignores both.`;
}

/**
 * THE HISTORY ROW'S OVERRIDE MARKER, for a manager only.
 *
 * A pass an instructor authorized must be readable AS one, or the history
 * cannot tell "this student went four times" from "this student went once and
 * I sent them three times" -- and a limit whose overrides leave no trace is a
 * limit nobody can check.
 */
export function hallPassOverrideLabel(entry: HallPassEntry): string | null {
	return entry.opened_by ? `sent out by ${entry.opened_by}` : null;
}
