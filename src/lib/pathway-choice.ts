/**
 * "NO PATHWAY YET" IS AN ANSWER, AND THIS MODULE IS THE ONE RULE FOR WHEN A
 * STUDENT IS STILL ASKED (ledger 0360, report R18).
 *
 * Freshmen have not chosen a pathway, and until this round the only ways past
 * the first-sign-in sheet were "Choose later" (seven days, on one device) and
 * Escape -- so a freshman met the same sheet every week, on every computer,
 * and the profile menu showed a disabled "Choose one" with no way back to
 * unset. A real "No pathway yet" choice ends that.
 *
 * THE COLUMN STAYS NULL. `0038_profile_pathway.sql` already defines null as
 * "not chosen yet" and its CHECK admits it, so a sentinel value would be a
 * constraint edit (a migration) to say something null already says. What is
 * new is the ANSWER: `profiles.preferences.pathway` records that the student
 * said "not yet", and on which school day, through the one preferences write
 * path (`$lib/preferences/profile-io`). No migration, no policy, no grant.
 *
 * IT HOLDS FOR THE SCHOOL YEAR, AND THE YEAR STARTS ON 1 AUGUST, Los Angeles
 * time. This repository holds no school-year or bell data (the Foundry access
 * module says the same), so the start is a constant here rather than a guess
 * spread across call sites: a freshman who says "not yet" in September is
 * asked again the following August, which is when a sophomore picks.
 *
 * NEVER INFERRED FROM AN EMAIL. A class-of year in an address would let the
 * site guess who is a freshman; Mr. Pina declined that in the report itself,
 * and pathway is identity only, so nothing here reads one.
 *
 * Pure and client-safe: no Svelte, no clock. Every function takes `today`, a
 * YYYY-MM-DD school day the caller reads ONCE (`todaySchoolDay()`), so the
 * rule is assertable at a pinned date.
 */
import { laCalendarDay } from '$lib/classroom/school-calendar';

/** The words of the choice, on the first-sign-in sheet and in the profile menu. */
export const NO_PATHWAY_LABEL = 'No pathway yet';

/** What the choice means, said beside it. */
export const NO_PATHWAY_HINT = 'Freshman, or still deciding. Pick a pathway any time from your profile.';

/** The `profiles.preferences` namespace the answer is stored under. */
export const PATHWAY_PREFERENCES_NAMESPACE = 'pathway';

/** The stored answer: the shape version and the school day it was given. */
export interface PathwayNotYet {
	v: 1;
	day: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's school day (America/Los_Angeles), read from the clock once. */
export function todaySchoolDay(now: Date = new Date()): string {
	return laCalendarDay(now);
}

/**
 * The stored "not yet" answer, or null. An unknown shape version, a day that is
 * not a YYYY-MM-DD date, or anything that is not an object is DROPPED, never
 * coerced: an answer this build cannot read is not one it may guess at.
 */
export function readPathwayNotYet(preferences: unknown): PathwayNotYet | null {
	if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null;
	const raw = (preferences as Record<string, unknown>)[PATHWAY_PREFERENCES_NAMESPACE];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const { v, day } = raw as { v?: unknown; day?: unknown };
	if (v !== 1 || typeof day !== 'string') return null;
	const m = DAY.exec(day);
	if (!m) return null;
	const month = Number(m[2]);
	const date = Number(m[3]);
	if (month < 1 || month > 12 || date < 1 || date > 31) return null;
	return { v: 1, day };
}

/**
 * The first day of the school year `today` falls in: 1 August of this calendar
 * year from August on, of last year before it.
 */
export function schoolYearStartDay(today: string): string {
	const m = DAY.exec(today);
	if (!m) return '0000-08-01';
	const year = Number(m[1]);
	return Number(m[2]) >= 8 ? `${year}-08-01` : `${year - 1}-08-01`;
}

/** Whether a "not yet" answer was given in the school year `today` is in. */
export function pathwayNotYetHolds(preferences: unknown, today: string): boolean {
	const notYet = readPathwayNotYet(preferences);
	if (!notYet) return false;
	return notYet.day >= schoolYearStartDay(today);
}

/** The value to store when a student answers "not yet" today. */
export function notYetPreference(today: string): PathwayNotYet {
	return { v: 1, day: today };
}

/**
 * THE ONE SHOW RULE. Should this person be asked for a pathway? A STUDENT with
 * no pathway who has not answered "not yet" this school year. The deferral
 * ("Choose later", per device) is the picker's own module-level predicate and
 * is ANDed on by each caller, because it reads storage and this does not.
 * `PathwayPicker`, `HomeTour` and `HomeTourOffer` all call this, so a freshman
 * the sheet has stopped asking is a freshman the tour stops waiting for.
 */
export function pathwayPromptWanted(
	profile: { role?: string | null; pathway?: string | null; preferences?: unknown } | null | undefined,
	today: string
): boolean {
	if (!profile || profile.role !== 'student' || profile.pathway) return false;
	return !pathwayNotYetHolds(profile.preferences, today);
}
