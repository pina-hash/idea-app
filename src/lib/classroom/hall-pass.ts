import { coins } from '$lib/coin-format';

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
 * THE TWO NUMBERS THE RULE USES, PROJECTED RATHER THAN RESTATED (0237).
 *
 * `budget_minutes` is the pass time a student has each school day and
 * `auto_checkin_minutes` is how long a pass may stay open before it is checked
 * in for them. They are THIS SECTION's own numbers (an instructor sets them),
 * so no constant, component or stylesheet here writes 10 or 30 down.
 *
 * OPTIONAL, because the migration is applied by hand: a deployment that has not
 * had it answers a payload with no `limits`, or the old `cooldown_minutes` and
 * `daily_limit` pair, which this surface no longer reads and says nothing about.
 */
export interface HallPassLimits {
	budget_minutes: number;
	auto_checkin_minutes: number;
}

/**
 * ONE STUDENT'S DAY, as the database computed it at read time (0237): the
 * allowance after any debt carried from earlier this week, what is used,
 * what is left, whether they may go, and when they may next. All in seconds
 * and instants, so the surface does arithmetic on nothing.
 */
export interface HallPassBudget {
	daily_seconds: number;
	auto_checkin_seconds: number;
	allowance_seconds: number;
	used_seconds: number;
	remaining_seconds: number;
	debt_seconds: number;
	/** Minutes bought for today with coins (ledger 0402, 0278), in seconds. Absent before 0278. */
	bought_seconds?: number;
	blocked: boolean;
	/** The first moment the allowance is above zero again (the reset if nothing sooner). Null while they may go. */
	available_at: string | null;
	/** Monday 00:00 America/Los_Angeles, when debt clears. */
	resets_at: string;
}

/** One name the override control may pick (`0174`, manager branch only). */
export interface HallPassRosterEntry {
	student_email: string;
	student_name: string;
}

/**
 * WHAT AN ENROLLED STUDENT IS TOLD: WHETHER THE PASS IS TAKEN, WHO HAS IT, AND
 * THEIR OWN DAY.
 *
 * THIS REVERSES THE RULE 0143 AND 0174 RECORDED (a student learned one bit),
 * ON MR. PINA'S DECISION OF 2026-10-08, written down as decision 58: everyone
 * in the class sees who is checked out, at all times, so that somebody who
 * forgot to check back in is noticed by the room. What is told is a SHOWN NAME
 * and a time and nothing else: never an address, a pass id or a history, and
 * `out.name` is the enrollment's display name or "A classmate". The type still
 * has no field for an address and none may be added.
 */
export interface HallPassStudentState {
	scope: 'student';
	section_id: string;
	taken: boolean;
	mine: boolean;
	opened_at: string | null;
	/** Whoever is out, when anyone is (including the caller), by shown name. Absent before 0237. */
	out?: { name: string; opened_at: string } | null;
	/** This section's numbers. Absent before 0237. */
	limits?: HallPassLimits;
	/** Passes this caller has taken in this class today: a fact about themselves. */
	used_today?: number;
	/** This caller's own day. Absent before 0237. */
	budget?: HallPassBudget;
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
	/** Each active student's day, by address, so the instructor sees who is over (0237). */
	budgets?: Record<string, HallPassBudget>;
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
	| 'over_budget'
	| 'not_enrolled';

/**
 * WHAT AN `over_budget` REFUSAL CARRIES BESIDES ITS WORD (0237).
 *
 * A REFUSAL WITH NO WAY FORWARD IN IT GETS ASKED AGAIN IMMEDIATELY, IN PERSON,
 * so the database answers with the instant the student may go again, the reset,
 * and the day's number, and the sentence is built from those.
 */
export interface HallPassRefusalDetail {
	availableAt?: string | null;
	resetsAt?: string | null;
	dailySeconds?: number | null;
	debtSeconds?: number | null;
	/** The caller's one clock. Nothing here reads its own; a refusal built without it uses the wall clock. */
	nowMs?: number;
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
	/**
	 * WHETHER THIS CLOSE WAS WARNED OR FINED (0243), when the transport carries
	 * them. Absent is "cannot tell", never "no": the surface then reads the
	 * events instead.
	 */
	warned?: boolean;
	fined?: boolean;
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
	/**
	 * THIS CLASS'S TWO NUMBERS (`0237`), whole minutes, null for the default.
	 * OPTIONAL like `openFor`: absent removes the control, which is also the
	 * honest state of a deployment before the migration.
	 */
	setLimits?(
		sectionId: string,
		budgetMinutes: number | null,
		autoCheckinMinutes: number | null
	): Promise<{ ok: true } | { ok: false; message: string }>;
	/**
	 * BUYING HALL PASS TIME WITH COINS (ledger 0402, 0278): today's quote for
	 * this class, and a purchase of whole blocks. A student's. OPTIONAL like the
	 * rest: absent removes the control, which is also the honest state of a
	 * deployment before 0278 (the quote then answers null).
	 */
	minutesQuote?(sectionId: string): Promise<HallPassMinutesQuote | null>;
	buyMinutes?(sectionId: string, blocks: number): Promise<{ ok: true; minutes: number; cost: number } | { ok: false; message: string }>;
}

/** What the buy control shows (0278's `coin_hall_pass_minutes_quote`). */
export interface HallPassMinutesQuote {
	available: boolean;
	block_minutes: number;
	price_per_block: number | null;
	cap_minutes: number;
	bought_today_minutes: number;
	bought_here_minutes: number;
	room_minutes: number;
	room_blocks: number;
	balance: number;
}

/** A quote answer, or null when it is not one (signed out, or before 0278). */
export function parseMinutesQuote(raw: unknown): HallPassMinutesQuote | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	if (typeof o.block_minutes !== 'number' && typeof o.block_minutes !== 'string') return null;
	const n = (v: unknown, d = 0) => {
		const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
		return Number.isFinite(x) ? x : d;
	};
	return {
		available: o.available === true,
		block_minutes: n(o.block_minutes, 5),
		price_per_block: o.price_per_block === null || o.price_per_block === undefined ? null : n(o.price_per_block),
		cap_minutes: n(o.cap_minutes, 15),
		bought_today_minutes: n(o.bought_today_minutes),
		bought_here_minutes: n(o.bought_here_minutes),
		room_minutes: n(o.room_minutes),
		room_blocks: n(o.room_blocks),
		balance: n(o.balance)
	};
}

/** A refused purchase, in words. */
export function hallPassMinutesRefusal(reason: unknown, extra: Record<string, unknown> = {}): string {
	switch (reason) {
		case 'cap':
			return `That is over today's limit for extra time. You can buy ${Number(extra.room_minutes ?? 0)} more minutes today.`;
		case 'insufficient':
			return 'Your balance does not cover that. A purchase has to leave you at zero or more.';
		case 'not_your_class':
			return 'This class is not using IDEA Coins.';
		case 'not_available':
			return 'Extra pass time is not for sale right now.';
		case 'not_in_economy':
			return 'None of your classes is using IDEA Coins right now.';
		case 'rate_limited':
			return 'That is a lot in one minute. Wait a minute, then try again.';
		default:
			return 'That did not go through. Try again.';
	}
}

/** The sentence for a refused limits save: the ranges are the database's, said back in words. */
export function hallPassLimitsRefusal(reason: unknown): string {
	if (reason === 'daily_out_of_range') return 'Pass time a day has to be between 1 and 120 minutes.';
	if (reason === 'auto_out_of_range') return 'Automatic check in has to be between 5 and 240 minutes.';
	return 'Those numbers were not accepted.';
}

/**
 * HOW OFTEN THE SURFACE RE-ASKS, and it is a shared resource so it does have to
 * ask. A student looking at "available" needs that to be true a moment later;
 * an instructor needs to see somebody leave without reloading.
 *
 * PAUSED WHILE THE TAB IS HIDDEN, and re-asked on becoming visible -- which is
 * the case that actually matters, since a phone in a pocket is the normal state
 * of this surface between uses. Polling every few seconds to make the button
 * "never" wrong would be paying continuously for a case the refusal already
 * handles correctly and instantly.
 *
 * 120 SECONDS, RAISED FROM 45 IN LEDGER 0357, BECAUSE THE POLL IS THE FLOOR AND
 * NOT THE MECHANISM. A pass opened or closed through this app announces itself
 * on the class's live channel (`$lib/classroom/live`) and every open page
 * re-asks at once; the poll exists for a write made outside the app and a
 * notice that went missing, and a stale "Free" in that case is answered by the
 * open RPC's own refusal. At 45 seconds a class of 21 was 28 reads a minute of
 * the database that stalled at 8:00 on 2026-09-29 and 2026-09-30; at 120 it is
 * about 10, jittered so they do not land together (`$lib/classroom/poll`).
 */
export const HALL_PASS_POLL_MS = 120_000;

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
 * "Oct 14": the school's own calendar day, with no weekday name. For a list
 * that spans days (the warnings and fines), where a clock time alone is not
 * enough to tell this morning from last week.
 */
export function hallPassDateLabel(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return '';
	return at.toLocaleDateString('en-US', { timeZone: SCHOOL_TIME_ZONE, month: 'short', day: 'numeric' });
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
 * NO WARNING TONE ON THIS LABEL, AND THE WARNING AND THE FINE ARE THE
 * DATABASE'S (decision 67, 0243, which overrides what this comment and 0143's
 * header used to say: that a pass had no coin link and showed no warning at
 * any duration). A pass is judged ONCE, when it is closed: at or over the
 * warning threshold it is logged as a warning, and at or over the fine
 * threshold it is fined (`hall_pass_warn_minutes` and `hall_pass_fine_minutes`
 * in the coin settings, 10 and 20 by default), never twice and never for a
 * pass an instructor opened or closed. Both numbers reach the surface on the
 * events payload (`HallPassEvents`), never as a literal here. This label only
 * says how long; a surface that coloured minutes red as they passed would be a
 * second opinion about a rule that has one owner.
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
		case 'over_budget':
			// THE WAY FORWARD IS THE WHOLE POINT (0237). "No" with no day in it is
			// asked again in person, so this says when the time comes back: the
			// next school day, a named day when there is debt to pay down, or the
			// Monday reset when it cannot clear sooner. The day is named in the
			// school's own zone.
			return `You have used your hall pass time. ${hallPassAvailableWords(detail.availableAt ?? null, detail.resetsAt ?? null, detail.nowMs ?? Date.now())} Ask your teacher if you still need to go.`;
		case 'not_enrolled':
			// Reachable only on the instructor override, where it means the name
			// picked is not on the live roster.
			return 'That student is not on this class list right now.';
	}
}

/**
 * "You can go again tomorrow." / "on Thursday." / "on Monday, when the week
 * resets.", from the two instants the database sent. The weekday is the
 * school's own (America/Los_Angeles), and nothing here holds a number of
 * minutes or days: the instants decide, this only names them.
 */
export function hallPassAvailableWords(
	availableIso: string | null,
	resetsIso: string | null,
	nowMs: number
): string {
	if (!availableIso) return 'You can go again soon.';
	const at = new Date(availableIso).getTime();
	if (Number.isNaN(at)) return 'You can go again soon.';
	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-CA', { timeZone: SCHOOL_TIME_ZONE });
	const weekday = (ms: number) =>
		new Date(ms).toLocaleDateString('en-US', { timeZone: SCHOOL_TIME_ZONE, weekday: 'long' });
	// TOMORROW IS THE NEXT CALENDAR DAY IN LOS ANGELES, not "within 36 hours".
	const next = new Date(`${day(nowMs)}T12:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	if (day(at) === next.toISOString().slice(0, 10)) return 'You can go again tomorrow.';
	const resetMs = resetsIso ? new Date(resetsIso).getTime() : NaN;
	if (!Number.isNaN(resetMs) && resetMs === at) {
		return `You can go again on ${weekday(at)}, when the week resets.`;
	}
	return `You can go again on ${weekday(at)}.`;
}

/**
 * IS THIS STUDENT OUT OF TIME FOR TODAY. FALSE WHENEVER THE PAYLOAD CANNOT SAY,
 * the fail-open direction and deliberate: a deployment before 0237 carries no
 * budget, and a surface that greyed the button out on a missing number would be
 * enforcing a rule the database is not enforcing. The server is the rule; this
 * is the explanation.
 */
export function hallPassOverBudget(state: HallPassState | null): boolean {
	if (!state || state.scope !== 'student') return false;
	return state.budget?.blocked === true;
}

/** Whole minutes, rounded UP for what is left (a student is never told they have less than they do) and DOWN for what is used. */
const minutesLeft = (seconds: number) => Math.max(0, Math.ceil(seconds / 60));
const minutesUsed = (seconds: number) => Math.max(0, Math.floor(seconds / 60));
const minWord = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;

/**
 * THE STATUS LINE, which is the only thing on this surface a student reads
 * before deciding whether to tap.
 *
 * A PEER'S PASS NAMES THEM AND SAYS SINCE WHEN (0237, decision 58, reversing
 * the one-bit rule of 0143): Mr. Pina wants the room to be able to hold
 * somebody accountable for a pass they forgot to check in. The name is the
 * enrollment's shown name, never an address.
 */
export function hallPassStatusLine(state: HallPassState, nowMs: number): string {
	if (state.scope === 'manager') {
		if (!state.open) return 'Nobody is out.';
		return `${state.open.student_name} is out, ${hallPassElapsedLabel(state.open.opened_at, nowMs)} (since ${hallPassClockLabel(state.open.opened_at)}).`;
	}
	if (state.mine && state.opened_at) {
		return `You are signed out, ${hallPassElapsedLabel(state.opened_at, nowMs)}.`;
	}
	// EVERYONE SEES WHO IS OUT (0237, decision 58): the shown name and since
	// when, so a pass nobody checked in is noticed by the room. Before 0237 the
	// payload has no name and the line says what it always said.
	if (state.out) {
		return `${state.out.name} is out, ${hallPassElapsedLabel(state.out.opened_at, nowMs)} (since ${hallPassClockLabel(state.out.opened_at)}).`;
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
export function hallPassCanOpen(state: HallPassState | null, _nowMs: number): boolean {
	if (!state || state.scope !== 'student' || state.taken) return false;
	// THE CONTROL MIRRORS THE BUDGET, IT DOES NOT IMPLEMENT IT: the answer comes
	// off the payload and the database refuses the call regardless of what this
	// returns. Offering a control whose only possible answer is a refusal is
	// the thing being avoided.
	return !hallPassOverBudget(state);
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
	if (state.taken && !state.mine) {
		return state.out ? `${state.out.name} has the pass right now.` : hallPassRefusalMessage('taken');
	}
	// SAME SENTENCE THE SERVER WOULD HAVE ANSWERED, from the same builder, so a
	// student who taps anyway reads the identical words.
	if (hallPassOverBudget(state)) {
		return `You have used your hall pass time. ${hallPassAvailableWords(state.budget?.available_at ?? null, state.budget?.resets_at ?? null, nowMs)} Ask your teacher if you still need to go.`;
	}
	return null;
}

/**
 * "4 of 10 minutes left today", plus the debt in words when there is some, or
 * null when the deployment cannot say.
 *
 * SHOWN BEFORE ANYBODY TAPS: a student who can see the time coming does not
 * spend it finding out. Every number comes off the payload, so this sentence
 * cannot disagree with the rule behind it.
 */
export function hallPassUsageLine(state: HallPassState | null): string | null {
	if (!state || state.scope !== 'student') return null;
	const b = state.budget;
	if (!b) return null;
	const left = minutesLeft(b.remaining_seconds);
	const day = minutesLeft(b.daily_seconds);
	const owed = minutesLeft(b.debt_seconds);
	const base = b.blocked
		? `No pass time left today (${minutesUsed(b.used_seconds)} of ${day} minutes used).`
		: `${minWord(left)} of pass time left today.`;
	const bought = minutesLeft(b.bought_seconds ?? 0);
	const withBought = bought > 0 ? `${base} Includes ${minWord(bought)} you bought today.` : base;
	return owed > 0 ? `${withBought} ${minWord(owed)} carried over from earlier this week.` : withBought;
}

/**
 * WHAT AN INSTRUCTOR IS TOLD THE OVERRIDE IGNORES, in their own terms.
 *
 * Null when the payload carries no limits, which is a deployment before `0174`:
 * there is no rule to describe and no override control offered either.
 */
export function hallPassLimitSummary(state: HallPassState | null): string | null {
	const limits = state?.limits;
	if (!limits || typeof limits.budget_minutes !== 'number') return null;
	return `Students get ${minWord(limits.budget_minutes)} of pass time a day in this class. Time over a day comes off the next day and clears each Monday, and a pass left open for ${minWord(limits.auto_checkin_minutes)} is checked in for the student. Sending someone out ignores their budget.`;
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

/*
 * ----------------------------------------------------------------------------
 * THE TOOL SHAPE (prompt 0118, items SIX and TEN): the card folded into a
 * trigger and a dialog, and the live notice that keeps the trigger's chip
 * honest while the dialog is shut.
 *
 * TWO OF THE HELPERS BELOW ARE NOT ABOUT THE HALL PASS AT ALL, and they are
 * here anyway: `CLASSROOM_LIVE_DEBOUNCE_MS` and `classroomLivePausedLine` are
 * read by `SongQueue.svelte` as well. They belong in `$lib/classroom/live.ts`
 * beside the bus they describe, but that module is shared and owned outside
 * this bundle, and `song-queue.ts` is read-only for it -- so the choice was one
 * copy here, imported by both components, or two literals that would stop
 * agreeing (a 250 in one file and a 300 in the other is how one tool answers a
 * notice a beat after its neighbour). One copy wins; moving it is a rename.
 * ----------------------------------------------------------------------------
 */

/**
 * HOW LONG A LIVE NOTICE WAITS BEFORE RE-ASKING THE SERVER.
 *
 * A burst of writes (an instructor approving three songs in a row) is three
 * notices inside a second, and three re-reads would answer with the same rows
 * three times. A quarter second folds the burst into one read and is still far
 * inside the "feels immediate" band; the poll (45s / 90s) stays as the floor
 * underneath, exactly as before any notice existed.
 */
export const CLASSROOM_LIVE_DEBOUNCE_MS = 250;

/**
 * THE ONE QUIET SENTENCE A STALLED CHANNEL EARNS. Nothing is said for
 * `connecting` (every page starts there) or `live` (the ordinary case needs no
 * announcement). It names the poll interval, in seconds, because "paused" with
 * no number in it reads as "broken" -- the point of the sentence is that the
 * card is still going to be right, just later.
 */
export function classroomLivePausedLine(pollMs: number): string {
	const seconds = Math.max(1, Math.round(pollMs / 1000));
	// Unreachable with the two real polls (120s, 300s), but it is a sentence a
	// person reads, so it agrees with itself at one second too.
	return `Live updates paused, still checking every ${seconds} second${seconds === 1 ? '' : 's'}.`;
}

/** What the trigger's chip paints: a tone for the hue and a word for everything else. */
export interface HallPassToolChip {
	tone: 'free' | 'taken' | 'mine' | 'out' | 'idle';
	word: string;
}

/**
 * THE STATUS CHIP ON THE TRIGGER, which is all a student reads before deciding
 * whether to open the dialog at all.
 *
 * A PEER'S PASS IS "Taken", NEVER A NAME AND NEVER A DURATION -- the same rule
 * `hallPassStatusLine` follows, one word shorter. The caller's own pass carries
 * its own elapsed time ("Yours · 6 min"), which is a fact about themselves. An
 * instructor's chip names who is out, because their payload already does and a
 * chip reading "1 out" on a door an instructor is standing at is a chip they
 * have to open to use.
 *
 * NO CLOCK IS READ HERE: `nowMs` is the layout's, threaded down, so the chip
 * and the status line inside the dialog cannot disagree in one paint.
 */
export function hallPassToolChip(state: HallPassState, nowMs: number): HallPassToolChip {
	if (state.scope === 'manager') {
		if (!state.open) return { tone: 'idle', word: 'Nobody out' };
		return { tone: 'out', word: `1 out · ${state.open.student_name}` };
	}
	if (state.taken && state.mine && state.opened_at) {
		return { tone: 'mine', word: `Yours · ${hallPassElapsedLabel(state.opened_at, nowMs)}` };
	}
	if (state.taken) return { tone: 'taken', word: state.out ? `Out · ${state.out.name}` : 'Taken' };
	return { tone: 'free', word: 'Free' };
}

/* ------------------------------------------------------------------------
 * WARNINGS AND FINES (decision 67, 0243).
 * ------------------------------------------------------------------------ */

/** One warning or fine on one pass (`classroom_hall_pass_events`). */
export interface HallPassEvent {
	pass_id: string;
	kind: 'warning' | 'fine';
	/** How long the pass counted for, in minutes (capped at the auto check-in). */
	minutes: number | string;
	created_at: string;
	opened_at: string;
	/** Manager scope only. A student's own rows carry no name and no address. */
	student_name?: string | null;
	student_email?: string | null;
	/** The coins the fine took, positive; null for a warning or a fine nobody was charged for. */
	fine_amount?: number | string | null;
}

export interface HallPassEvents {
	scope: 'manager' | 'student';
	warn_minutes: number | string;
	fine_minutes: number | string;
	events: HallPassEvent[];
}

/**
 * THE READ, INJECTED. Null is a failed read (the list keeps what it had);
 * `'missing'` is a database without 0243, and the list then leaves itself out.
 */
export type HallPassEventsTransport = (sectionId: string) => Promise<HallPassEvents | null | 'missing'>;

const wholeMinutes = (v: number | string): number => {
	const n = typeof v === 'string' ? Number(v) : v;
	return Number.isFinite(n) ? Math.floor(n) : 0;
};

/**
 * ONE ROW IN WORDS: a glyph AND a word, never colour alone.
 * "Warning: 12 min" / "Fined 2i¢: 24 min".
 */
export function hallPassEventWords(event: HallPassEvent): {
	tone: 'warning' | 'fine';
	glyph: string;
	word: string;
} {
	const mins = `${wholeMinutes(event.minutes)} min`;
	if (event.kind === 'fine') {
		const amount = event.fine_amount == null ? null : Number(event.fine_amount);
		return {
			tone: 'fine',
			glyph: '\u2296',
			word: amount != null && Number.isFinite(amount) ? `Fined ${coins(amount)}: ${mins}` : `Over the fine time: ${mins}`
		};
	}
	return { tone: 'warning', glyph: '!', word: `Warning: ${mins}` };
}

/**
 * THE ROWS A LIST SHOWS: a pass that was fined was also warned (the fine
 * threshold is past the warning one), and two rows for one pass read as two
 * passes. So a warning whose pass also has a fine is folded into the fine row.
 */
export function hallPassEventsShown(events: readonly HallPassEvent[]): HallPassEvent[] {
	const fined = new Set(events.filter((e) => e.kind === 'fine').map((e) => e.pass_id));
	return events.filter((e) => e.kind === 'fine' || !fined.has(e.pass_id));
}

/** The rule, said from the payload's own two numbers. */
export function hallPassEventRule(payload: Pick<HallPassEvents, 'warn_minutes' | 'fine_minutes'>): string {
	const warn = wholeMinutes(payload.warn_minutes);
	const fine = wholeMinutes(payload.fine_minutes);
	return `A pass of ${warn} minutes or more is logged as a warning, and ${fine} minutes or more is fined. It is checked once, when the pass ends.`;
}

/**
 * WHAT A STUDENT IS TOLD RIGHT AFTER SIGNING BACK IN, from the close's own
 * flags when the transport carried them, otherwise from the events for that
 * pass. Null when nothing happened, or nothing can be told.
 */
export function hallPassCloseVerdict(
	closed: Pick<HallPassClosed, 'pass_id' | 'warned' | 'fined'>,
	events: HallPassEvents | null
): string | null {
	const mine = events?.events.filter((e) => e.pass_id === closed.pass_id) ?? [];
	const fine = mine.find((e) => e.kind === 'fine');
	const warning = mine.find((e) => e.kind === 'warning');
	if (fine || closed.fined) {
		const amount = fine?.fine_amount == null ? null : Number(fine.fine_amount);
		const mins = fine ? ` That pass counted as ${wholeMinutes(fine.minutes)} minutes.` : '';
		return amount != null && Number.isFinite(amount)
			? `Signed back in. This pass went over the time limit, so it cost ${coins(amount)}.${mins}`
			: `Signed back in. This pass went over the time limit, so it was fined.${mins}`;
	}
	if (warning || closed.warned) {
		const mins = warning ? ` It counted as ${wholeMinutes(warning.minutes)} minutes.` : '';
		return `Signed back in. This pass was long, so a warning was logged.${mins} A longer pass costs coins.`;
	}
	return null;
}
