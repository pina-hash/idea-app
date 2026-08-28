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
	| 'already_closed';

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
	| { ok: false; refusal: HallPassRefusal }
	| { ok: false; message: string };

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
export function hallPassRefusalMessage(refusal: HallPassRefusal): string {
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
	}
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
export function hallPassCanOpen(state: HallPassState | null): boolean {
	return !!state && state.scope === 'student' && !state.taken;
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
export function hallPassBlockedReason(state: HallPassState | null): string | null {
	if (!state || state.scope !== 'student') return null;
	if (state.taken && !state.mine) return hallPassRefusalMessage('taken');
	return null;
}
