/**
 * THE PRESENCE VOCABULARY: the four states, their words, their glyphs, their
 * tones, and the two labels a surface prints beside them.
 *
 * WHAT THIS IS FOR. Mr. Pina asked, on 2026-09-11, to see which students are
 * working, which have the assignment open but are elsewhere, which are not on
 * the site, when each last worked, and how much time each actually spent
 * working rather than merely having it open. `0200_classroom_presence.sql` is
 * the record and the boundary; this module is the one place the browser turns
 * that record into words.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A MIRROR OF `_classroom_presence_state_of`, NOT A SECOND DEFINITION.
 * ---------------------------------------------------------------------------
 *
 * `presenceState` reproduces that SQL function's four branches in their order,
 * including which comparison is strict. That is the `docText` arrangement --
 * CLAUDE.md sanctions a mirror precisely when the two are ASSERTED against each
 * other, and `tests/db/classroom-presence-state-mirror.test.ts` puts a corpus
 * of rows through the deployed SQL and through this function and compares case
 * for case, corners included.
 *
 * WHAT KEEPS THE NUMBERS FROM DRIFTING IS NOT THE TEST, THOUGH -- IT IS THAT
 * THEY TRAVEL. `classroom_presence_state` returns this deployment's own windows
 * in its `limits` object, and every caller here takes a `PresenceLimits`. So a
 * change to `_classroom_presence_input_window()` reaches the browser by being
 * read, not by somebody remembering to edit a constant twice.
 * `PRESENCE_LIMITS_FALLBACK` is what a client uses when it has not been told --
 * a deployment sitting before 0200, or a payload that could not be parsed --
 * and the mirror test pins it against the real functions so "not told" and
 * "told" agree wherever 0200 is applied.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STATE IS RE-DERIVED IN THE BROWSER AT ALL, given the server sends one
 * ---------------------------------------------------------------------------
 *
 * Because AWAY is a function of the CLOCK, not of a write. A student who closes
 * the tab writes nothing, so nothing arrives to make the console re-read, and
 * the state the last payload carried goes stale on its own. A console that
 * printed the server's word would keep saying "Working" for a whole poll
 * interval after the student left. So the payload's facts are the record and
 * `now` is threaded in from the caller, the way every other surface here does
 * it -- a component that reads its own clock silently disagrees with the thing
 * it is rendering.
 */

/** The four states, in the order `_classroom_presence_state_of` tests them. */
export type PresenceState = 'working' | 'viewing' | 'open-elsewhere' | 'away';

/**
 * EXHAUSTIVE OVER THE UNION EVERYWHERE BELOW, so a fifth state is a type error
 * rather than a blank chip. Adding one means a word, a glyph and a tone in the
 * same edit -- the `RANK_STATES` rule, and for the same reason.
 */
export const PRESENCE_STATES: readonly PresenceState[] = [
	'working',
	'viewing',
	'open-elsewhere',
	'away'
];

export interface PresenceLimits {
	inputWindowSeconds: number;
	awayWindowSeconds: number;
	heartbeatSeconds: number;
	minGapSeconds: number;
	retentionDays: number;
}

/**
 * WHAT A CLIENT USES WHEN IT HAS NOT BEEN TOLD. Every value is the literal its
 * `_classroom_presence_*` function returns, and the mirror test asserts that
 * rather than trusting this comment.
 */
export const PRESENCE_LIMITS_FALLBACK: PresenceLimits = {
	inputWindowSeconds: 60,
	awayWindowSeconds: 120,
	heartbeatSeconds: 30,
	minGapSeconds: 20,
	retentionDays: 90
};

/**
 * HOW OFTEN AN OPEN CONSOLE RE-ASKS. Not in `live.ts`: `GRADING_POLL_MS` is the
 * floor under a student's WORK arriving, which is minutes of effort, and this
 * is the floor under a student SITTING DOWN, which is seconds. One number
 * serving both would be wrong for one of them, and a presence poll pinned to
 * the grading poll would report a student as away for up to a minute after they
 * started typing.
 *
 * 30 seconds, which is the heartbeat: re-asking faster than the fastest thing
 * that can change the answer buys nothing and costs a round trip.
 */
export const PRESENCE_POLL_MS = 30_000;

/** One student's stored facts, exactly as `classroom_presence_state` sends them. */
export interface PresenceRow {
	student_email: string;
	/**
	 * THE SERVER'S OWN ANSWER AT THE MOMENT IT READ. Kept, and never the thing
	 * rendered: `presenceState` re-derives from the facts beside it so the chip
	 * ages between polls. It is here so a payload can be compared against what
	 * the mirror makes of it, which is what the mirror test does.
	 */
	state?: PresenceState | null;
	last_seen_at: string | null;
	last_input_at: string | null;
	/**
	 * WHAT THE LAST BEAT SAID ABOUT `document.visibilityState`. It is the third
	 * argument `_classroom_presence_state_of` takes, so carrying it is what makes
	 * `presenceState` a MIRROR of that function rather than a different function
	 * that mostly agrees -- and it is strictly less about a student than the
	 * `state` beside it, which is derived from it.
	 */
	page_visible: boolean;
	active_seconds: number;
	first_seen_at?: string | null;
}

export interface PresencePayload {
	item_id: string;
	section_id: string | null;
	at: string;
	limits: PresenceLimits;
	students: PresenceRow[];
}

const MS = 1000;

function stamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
}

/**
 * THE MIRROR. Four branches, in `_classroom_presence_state_of`'s order and with
 * its comparisons: strict `>` for away, `<=` for working.
 *
 * IT TAKES THE SAME THREE FACTS THE SQL TAKES, which is what makes it a mirror
 * rather than a different function that mostly agrees -- a corpus of triples
 * can be put through both and compared case for case, which
 * `tests/db/classroom-presence-state-mirror.test.ts` does.
 *
 * AND IT IS RE-DERIVED RATHER THAN READ because AWAY is a function of the
 * clock. A student closing the tab writes nothing, so the payload's own `state`
 * ages without anything arriving to correct it, and a console printing the
 * server's word would keep saying "Working" for a whole poll interval after the
 * student left.
 */
export function presenceState(
	row: Pick<PresenceRow, 'last_seen_at' | 'last_input_at' | 'page_visible'>,
	at: number,
	limits: PresenceLimits = PRESENCE_LIMITS_FALLBACK
): PresenceState {
	const lastSeen = stamp(row.last_seen_at);
	if (lastSeen === null || !Number.isFinite(at)) return 'away';
	// AWAY FIRST, and strictly greater, exactly as the SQL tests it. Every other
	// state is a claim made at `last_seen_at` and must not outlive its evidence.
	if (at - lastSeen > limits.awayWindowSeconds * MS) return 'away';
	if (row.page_visible !== true) return 'open-elsewhere';
	const lastInput = stamp(row.last_input_at);
	if (lastInput !== null && at - lastInput <= limits.inputWindowSeconds * MS) return 'working';
	return 'viewing';
}

/**
 * THE WORD, THE GLYPH AND THE TONE, keyed on the state and read through ONE
 * map. Colour is never the only signal: every renderer prints the word, and the
 * glyph is `aria-hidden` precisely because the word is always beside it.
 *
 * The glyphs are the notebook grid's alphabet rather than emoji: a filled dot
 * for at-work, a hollow one for present-not-working, a guillemet for elsewhere
 * (the same "somewhere else" sense 0140 gave it), a dash for absent.
 */
export const PRESENCE_DISPLAY: Record<
	PresenceState,
	{ label: string; glyph: string; tone: 'working' | 'viewing' | 'elsewhere' | 'away'; hint: string }
> = {
	working: {
		label: 'Working',
		glyph: '●',
		tone: 'working',
		hint: 'Typed in the last minute.'
	},
	viewing: {
		label: 'Viewing',
		glyph: '○',
		tone: 'viewing',
		hint: 'On the page, not typing.'
	},
	'open-elsewhere': {
		label: 'Open elsewhere',
		glyph: '»',
		tone: 'elsewhere',
		hint: 'The assignment is open in a tab they are not looking at.'
	},
	away: {
		label: 'Away',
		glyph: '—',
		tone: 'away',
		hint: 'No sign of them for a couple of minutes.'
	}
};

/**
 * THE SENTENCE THAT QUALIFIES EVERY FIGURE ON THIS SURFACE, and it is rendered
 * beside them unconditionally, zero included -- the `FOUNDRY_PLAY_COVERAGE_NOTE`
 * argument, which applies here for a stronger reason: a zero is exactly when
 * somebody reads a count as "this student did nothing".
 *
 * Both clauses are true and both matter. Time is only counted while the page is
 * open and being typed in, so a student who plans on paper, reads the handout,
 * or talks to a partner accrues nothing; and nothing is counted at all until
 * the assignment is open in a browser.
 */
export const PRESENCE_COVERAGE_NOTE =
	'Counted only while this assignment is open and being typed in. Thinking, reading and working on paper do not add to it.';

/** What a student who has never opened the assignment reads as. */
export const PRESENCE_NEVER_OPENED = 'Not opened';

/**
 * ACTIVE TIME, IN THE COARSEST UNIT THAT IS STILL TRUE. Seconds below a minute,
 * whole minutes below an hour, hours and minutes above it. No decimals: a
 * figure like "1.4h" invites arithmetic nobody should be doing on this number.
 */
export function presenceActiveLabel(seconds: number): string {
	const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
	if (s < 60) return `${s}s`;
	const minutes = Math.floor(s / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * WHEN THEY LAST WORKED, relative to a `now` the CALLER threads in.
 *
 * A NULL `last_input_at` IS A REAL ANSWER AND THE COMMON ONE: opened, never
 * typed. It says so rather than printing a fallback time, because the fallback
 * that suggests itself -- `first_seen_at` -- would report work that did not
 * happen.
 */
export function presenceLastWorkedLabel(lastInputAt: string | null, at: number): string {
	const ms = stamp(lastInputAt);
	if (ms === null) return 'No typing yet';
	const ago = Math.max(0, at - ms);
	const seconds = Math.floor(ago / MS);
	if (seconds < 60) return 'Just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function positiveInt(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: fallback;
}

/**
 * THE WINDOWS OFF THE PAYLOAD, VALIDATED AGAINST THEIR OWN SHAPE AND FALLING
 * BACK PER FIELD. A stored value that is not a number cannot put the UI in a
 * state no branch renders -- the preferences-read rule, applied to a wire
 * payload for the same reason: the alternative is a `NaN` window, which makes
 * every comparison false and reports every student as viewing.
 */
export function parsePresenceLimits(value: unknown): PresenceLimits {
	const v = (value ?? {}) as Record<string, unknown>;
	return {
		inputWindowSeconds: positiveInt(
			v.input_window_seconds,
			PRESENCE_LIMITS_FALLBACK.inputWindowSeconds
		),
		awayWindowSeconds: positiveInt(
			v.away_window_seconds,
			PRESENCE_LIMITS_FALLBACK.awayWindowSeconds
		),
		heartbeatSeconds: positiveInt(
			v.heartbeat_seconds,
			PRESENCE_LIMITS_FALLBACK.heartbeatSeconds
		),
		minGapSeconds: positiveInt(v.min_gap_seconds, PRESENCE_LIMITS_FALLBACK.minGapSeconds),
		retentionDays: positiveInt(v.retention_days, PRESENCE_LIMITS_FALLBACK.retentionDays)
	};
}

/** Is this a `classroom_presence_state` payload at all? Null is a normal answer. */
export function parsePresencePayload(value: unknown): PresencePayload | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (typeof v.item_id !== 'string' || !Array.isArray(v.students)) return null;
	const students: PresenceRow[] = [];
	for (const raw of v.students) {
		if (!raw || typeof raw !== 'object') continue;
		const r = raw as Record<string, unknown>;
		if (typeof r.student_email !== 'string') continue;
		students.push({
			student_email: r.student_email,
			state: PRESENCE_STATES.includes(r.state as PresenceState)
				? (r.state as PresenceState)
				: null,
			last_seen_at: typeof r.last_seen_at === 'string' ? r.last_seen_at : null,
			last_input_at: typeof r.last_input_at === 'string' ? r.last_input_at : null,
			// FALLS BACK TO FALSE, NOT TRUE. A payload that could not say whether
			// the page was visible must not be rendered as if it had said yes:
			// "open elsewhere" understates, "viewing" overstates, and only one of
			// those misleads an instructor about a student.
			page_visible: r.page_visible === true,
			active_seconds: positiveInt(r.active_seconds, 0),
			first_seen_at: typeof r.first_seen_at === 'string' ? r.first_seen_at : null
		});
	}
	return {
		item_id: v.item_id,
		section_id: typeof v.section_id === 'string' ? v.section_id : null,
		at: typeof v.at === 'string' ? v.at : new Date().toISOString(),
		limits: parsePresenceLimits(v.limits),
		students
	};
}

/** The payload's rows by email, which is the key a roster row already carries. */
export function presenceByEmail(payload: PresencePayload | null): Map<string, PresenceRow> {
	return new Map((payload?.students ?? []).map((r) => [r.student_email, r]));
}
