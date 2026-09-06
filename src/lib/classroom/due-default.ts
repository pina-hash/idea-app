/**
 * THE DUE-DATE FIELD'S TWO HALVES, AND THE 11:59PM DEFAULT.
 *
 * Pure, no clock, no Svelte: every function here takes what it needs, so the
 * composer's field arithmetic is assertable without mounting anything.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FIELD IS TWO INPUTS AND NOT ONE
 * ---------------------------------------------------------------------------
 *
 * The request was that an assignment's due TIME default to 11:59pm. On a single
 * `<input type="datetime-local">` there is nowhere for that default to live,
 * and the reason is measured rather than argued -- driven in Chromium
 * 141.0.7390.37, with only the date segments filled:
 *
 *   * `input.value` is the EMPTY STRING;
 *   * `input.validity.badInput` is `true`;
 *   * NO `input` and NO `change` event has fired;
 *   * and assigning a date-only string (`el.value = '2026-09-10'`) leaves the
 *     value empty, because a date is not a valid datetime-local.
 *
 * So a partially filled control reports nothing at all to the page. There is no
 * event to hang "now fill the time in as 23:59" on, and no state to read it
 * from. The only place a default could sit on one input is its INITIAL value --
 * which would mean seeding every new assignment with a due DATE nobody chose,
 * inventing a deadline instead of defaulting a time.
 *
 * A date input plus a time input has neither problem: the date starts empty, so
 * no deadline is invented, and the time starts at 23:59, so an instructor who
 * picks a day and stops has the deadline they meant. This also fixes the
 * quieter half of the same defect -- today an instructor who fills the date and
 * tabs away gets NO DUE DATE AT ALL, silently, because the value never became
 * valid.
 *
 * ---------------------------------------------------------------------------
 * WHAT TIME ZONE 11:59PM IS IN
 * ---------------------------------------------------------------------------
 *
 * THE BROWSER'S, and that is deliberate rather than overlooked. The composer
 * converts with `localInputToIso`, which is `new Date('<yyyy-mm-dd>T<hh:mm>')`
 * -- a wall-clock string parsed in the RUNNING BROWSER's zone. This module does
 * not touch that conversion, so a defaulted 23:59 resolves exactly as a typed
 * 23:59 always has.
 *
 * PINNING IT TO America/Los_Angeles WAS CONSIDERED AND REFUSED. The school's
 * day IS that calendar -- it is what `laCalendarDay` adjudicates a check-in
 * against -- but a default forced into Pacific would put a number in the box
 * that is not the number being stored for any instructor whose machine is set
 * to anything else, and the field they are reading would be lying to them. A
 * time zone is a property of the whole due-date FIELD, not of its default; the
 * fix for one is a change to `localInputToIso` and to `publish_at` beside it,
 * which is a different bundle with its own answer for every stored stamp. On a
 * school machine, which is what this is for, the two are the same instant.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT TOUCHED
 * ---------------------------------------------------------------------------
 *
 * NOTHING ALREADY STORED. `due_at` is read, never rewritten: `splitDueInput`
 * takes the exact `datetime-local` string the composer already seeded from the
 * item and cuts it in two, and `joinDueInput` puts the same two halves back
 * into the identical string. So an assignment opened and saved without touching
 * the due field re-encodes byte for byte, which is what keeps the composer's
 * untouched-field rule (and therefore the "Updated" badge) working.
 */

/** The default time, as a `<input type="time">` value. 11:59pm. */
export const DEFAULT_DUE_TIME = '23:59';

/**
 * Split a `datetime-local` value into its date and time halves.
 *
 * AN EMPTY VALUE GIVES AN EMPTY DATE AND THE DEFAULT TIME, which is the whole
 * feature: a fresh composer has no deadline and a time already set to 11:59pm,
 * so picking a day is the only thing left to do.
 *
 * ANYTHING IT CANNOT READ IS TREATED AS EMPTY rather than passed through. The
 * only producer of this string is `isoToLocalInput`, whose output is always
 * `YYYY-MM-DDTHH:MM`; a value in any other shape came from somewhere that has
 * already gone wrong, and putting it in a `type="date"` box would leave the
 * browser to blank it silently on the next render.
 */
export function splitDueInput(value: string): { date: string; time: string } {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
	if (!m) return { date: '', time: DEFAULT_DUE_TIME };
	return { date: m[1], time: m[2] };
}

/**
 * Put the two halves back together as the `datetime-local` value the rest of
 * the composer already speaks.
 *
 * NO DATE MEANS NO DUE DATE, whatever the time says. That is the direction that
 * matters: the time box is never empty (it is seeded, and a browser's time
 * control will not produce a partial value any more than a datetime-local
 * will), so the DATE is the field that decides whether this assignment has a
 * deadline at all -- and clearing it must clear the deadline rather than
 * leaving a bare 23:59 to be parsed into something.
 *
 * A DATE WITH NO TIME FALLS BACK TO THE DEFAULT rather than to midnight. A time
 * input can be emptied by hand, and the honest reading of "due on the 10th,
 * time cleared" is the end of the 10th, not the start of it -- midnight would
 * silently move the deadline a whole day earlier than the day named beside it.
 */
export function joinDueInput(date: string, time: string): string {
	const d = date.trim();
	if (!d) return '';
	const t = /^\d{2}:\d{2}/.exec(time.trim())?.[0] ?? DEFAULT_DUE_TIME;
	return `${d}T${t}`;
}
