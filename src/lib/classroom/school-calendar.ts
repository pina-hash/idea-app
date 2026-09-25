/**
 * THE SCHOOL'S CALENDAR: which day it is, which week, and how far apart two
 * days are, always in America/Los_Angeles.
 *
 * Pure and dependency-free (it imports nothing, so every classroom module can
 * import it without a cycle), and it READS NO CLOCK. Every function takes the
 * instant or the day it answers about. The one clock read on a surface is the
 * loader's: it reads `new Date()` once, converts it with `laCalendarDay`, and
 * hands the pair down (the notebook grid rule in CLAUDE.md, applied to due
 * dates as well as check-ins).
 *
 * WHY A ZONE HAS TO BE NAMED AT ALL. The server renders in UTC on Vercel and
 * the browser renders in whatever zone the student's device is in, so a date
 * formatted "in the local zone" is two different strings on the two sides of
 * hydration: `Due Thu, Aug 20, 12:00 AM` in the server's HTML became
 * `Due Wed, Aug 19, 5:00 PM` once the page woke up (FRICTION.md, class
 * stream). And a calendar-day count in UTC runs seven or eight hours ahead of
 * the school, so every evening a deadline at 9am tomorrow already read as
 * "today". Naming the zone makes both sides give the school's answer.
 */

/** The zone every classroom date is adjudicated and printed in. */
export const SCHOOL_TIME_ZONE = 'America/Los_Angeles';

/** The locale every classroom date is printed in, pinned so the server and the browser print the same string. */
export const SCHOOL_LOCALE = 'en-US';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TODAY, ON THE CALENDAR `session_date` IS WRITTEN IN.
 *
 * `notebook_sessions.session_date` is a bare DATE, and every rule that
 * adjudicates one compares it in America/Los_Angeles:
 * `notebook_get_section_grid`'s `on_time` is
 * `(upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date`
 * (0094/0098), and `0140`'s `scheduled` arm is `se.session_date > v_today`
 * where `v_today` is that same conversion. A server reading UTC instead would
 * run seven or eight hours ahead, so every evening between 5pm Pacific and
 * midnight UTC the next day's check-in would already read as due -- a smaller
 * copy of the exact defect the `scheduled` state exists to remove, arriving in
 * the hours a teacher actually lays the next day out.
 *
 * IT TAKES `now` RATHER THAN READING A CLOCK, and that is the whole point of
 * it being here. A pure function that reaches for `new Date()` is the defect no
 * probe catches; a pure function handed an instant is assertable at a pinned
 * one, including the instants where the two calendars disagree. THE LOADER
 * READS THE CLOCK, ONCE, and hands the day down -- there is exactly one idea of
 * "today" on this surface and it is the loader's.
 *
 * `en-CA` is the YYYY-MM-DD spelling, which is the string the column holds, so
 * every comparison against it is a plain lexical one with no parsing in it.
 *
 * (It lived in class-check-ins.ts, which still re-exports it, until due dates
 * needed the same calendar: one conversion, one module.)
 */
export function laCalendarDay(now: Date): string {
	return now.toLocaleDateString('en-CA', { timeZone: SCHOOL_TIME_ZONE });
}

/** The school day an ISO instant falls on, or null when it does not parse. */
export function schoolDayOf(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	return Number.isNaN(t) ? null : laCalendarDay(new Date(t));
}

/**
 * A YYYY-MM-DD day as a whole number of days since 1970-01-01, or null when it
 * does not parse. A DAY, not an instant: it is read in UTC on purpose, because
 * the string already names the school's day and no zone may move it again.
 */
export function dayIndex(day: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!m) return null;
	const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return Number.isNaN(t) ? null : Math.round(t / DAY_MS);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number | null {
	const a = dayIndex(from);
	const b = dayIndex(to);
	return a === null || b === null ? null : b - a;
}

/**
 * THE WEEK A DAY SITS IN, relative to today's: 0 this week, 1 next week, -1
 * last week. Null when either day does not parse.
 *
 * WEEKS START ON SUNDAY, the United States calendar a student's own phone
 * shows. A school week is Monday to Friday either way; what the choice decides
 * is the weekend, and Sunday-first is the one that makes "this week" on a
 * Sunday night mean the school week about to start -- which is the evening a
 * student is most likely to open the list and ask what is due.
 */
export function weekOffset(day: string, today: string): number | null {
	const d = dayIndex(day);
	const t = dayIndex(today);
	if (d === null || t === null) return null;
	// 1970-01-01 was a Thursday, so (index + 4) mod 7 is 0 on a Sunday.
	const startOf = (n: number) => n - (((n + 4) % 7) + 7) % 7;
	return Math.round((startOf(d) - startOf(t)) / 7);
}

/**
 * THE LAST INSTANT OF A SCHOOL DAY, as an ISO string: 23:59:59.999 in
 * America/Los_Angeles on the day `addDays` after `day` (YYYY-MM-DD). Null when
 * the day does not parse.
 *
 * The other direction from `laCalendarDay`, and it lives here for the same
 * reason: one module converts between the school's days and instants. It
 * reads no clock. A caller that wants "the end of today" reads its clock once,
 * turns it into a day with `laCalendarDay`, and hands the day here.
 *
 * THE OFFSET IS ASKED OF THE ZONE, NEVER ASSUMED. The school sits at UTC-7 for
 * most of the year and UTC-8 from November to March, so the answer is found
 * with the zone's own rules at a first guess and then asked again at the
 * answer, which settles a day that crosses a clock change.
 */
export function schoolDayEnd(day: string, addDays = 0): string | null {
	const index = dayIndex(day);
	if (index === null || !Number.isFinite(addDays)) return null;
	// The target day's 23:59:59.999 as though the wall clock were UTC.
	const wall = (index + Math.trunc(addDays) + 1) * DAY_MS - 1;
	const first = wall - schoolZoneOffsetMs(wall);
	return new Date(wall - schoolZoneOffsetMs(first)).toISOString();
}

/** How far the school's wall clock sits from UTC at an instant, in ms (negative in California). */
function schoolZoneOffsetMs(instant: number): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: SCHOOL_TIME_ZONE,
		hourCycle: 'h23',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric'
	}).formatToParts(new Date(instant));
	const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
	return asUtc - Math.floor(instant / 1000) * 1000;
}
