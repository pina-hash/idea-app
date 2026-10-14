/**
 * THE FOUNDRY CLASS SCHEDULE, ON THE CLIENT SIDE OF IT (ledger 0380, report
 * 84e293d4; migration 0237 part C).
 *
 * An instructor gives a class a weekly pattern (days and times, in the
 * school's own clock) and the Foundry stands down for that class's students
 * while class is in session. Date exceptions replace the pattern for one date.
 * THE DATABASE DECIDES WHETHER A CLASS IS CLOSED (`_foundry_section_closed`,
 * read by `foundry_section_access`); this module shapes the editor's draft,
 * mirrors the database's validity rules so a press that could only be refused
 * says why before it is sent, and writes the sentences. None of it enforces.
 *
 * Pure and client-safe. Times are "HH:MM" strings in America/Los_Angeles and
 * weekdays are ISO (Monday is 1), exactly as the RPCs take them.
 */

export interface ScheduleWindow {
	weekday: number;
	starts: string;
	ends: string;
}

export interface ScheduleDayWindow {
	starts: string;
	ends: string;
}

/** One stored exception row as `foundry_class_schedule_get` returns it. */
export interface ScheduleDayRow {
	on_date: string;
	kind: 'no_class' | 'window';
	starts: string | null;
	ends: string | null;
	note: string | null;
}

/** The state of a class right now, as `_foundry_section_closed` answers. */
export interface ScheduleNow {
	closed: boolean;
	by?: 'hand' | 'schedule';
	closed_at?: string | null;
	note?: string | null;
	until?: string | null;
}

export interface ScheduleState {
	enabled: boolean;
	weekly: ScheduleWindow[];
	days: ScheduleDayRow[];
	now: ScheduleNow;
}

/** The weekdays an editor lists, Monday first, with ISO numbers. */
export const SCHEDULE_WEEKDAYS: readonly { n: number; name: string }[] = [
	{ n: 1, name: 'Monday' },
	{ n: 2, name: 'Tuesday' },
	{ n: 3, name: 'Wednesday' },
	{ n: 4, name: 'Thursday' },
	{ n: 5, name: 'Friday' },
	{ n: 6, name: 'Saturday' },
	{ n: 7, name: 'Sunday' }
];

/** The most windows the database takes in a week, and in one date's exception. */
export const SCHEDULE_MAX_WEEKLY = 28;
export const SCHEDULE_MAX_DAY_WINDOWS = 8;

export const SCHEDULE_NOT_READY =
	'Class schedules are not available yet. They arrive with the next database update.';

export const SCHEDULE_HAND_SENTENCE =
	'You can still close or open the Foundry by hand at any time. Opening it by hand during class holds until that class period ends, and then the schedule carries on. Closing it by hand stays closed until you open it.';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isClockTime = (value: string): boolean => HHMM.test(value);

/** Why one window cannot be saved, or null. Mirrors the database's refusals. */
export function windowProblem(starts: string, ends: string): string | null {
	if (!isClockTime(starts) || !isClockTime(ends)) return 'Give both a start and an end time.';
	if (starts >= ends) return 'The class has to end after it starts.';
	return null;
}

/** Windows in a stable order: by weekday, then start. */
export function sortWindows<T extends { starts: string }>(rows: readonly T[], key: (r: T) => number): T[] {
	return [...rows].sort((a, b) => key(a) - key(b) || a.starts.localeCompare(b.starts));
}

/** The weekly rows for one weekday, in time order. */
export function windowsOn(weekly: readonly ScheduleWindow[], weekday: number): ScheduleWindow[] {
	return weekly.filter((w) => w.weekday === weekday).sort((a, b) => a.starts.localeCompare(b.starts));
}

/** Whether two windows on the same day overlap (touching ends do not). */
export function overlaps(a: { starts: string; ends: string }, b: { starts: string; ends: string }): boolean {
	return a.starts < b.ends && b.starts < a.ends;
}

/** The first thing wrong with a whole weekly draft, or null. One sentence, in the teacher's words. */
export function weeklyProblem(weekly: readonly ScheduleWindow[]): string | null {
	if (weekly.length > SCHEDULE_MAX_WEEKLY) return `A week holds at most ${SCHEDULE_MAX_WEEKLY} class periods.`;
	for (const w of weekly) {
		const p = windowProblem(w.starts, w.ends);
		if (p) return `${weekdayName(w.weekday)}: ${p}`;
	}
	for (const d of SCHEDULE_WEEKDAYS) {
		const ws = windowsOn(weekly, d.n);
		for (let i = 1; i < ws.length; i++) {
			if (overlaps(ws[i - 1], ws[i])) return `${d.name}: two periods overlap.`;
		}
	}
	return null;
}

export function dayWindowsProblem(windows: readonly ScheduleDayWindow[]): string | null {
	if (windows.length === 0) return 'Add at least one time.';
	if (windows.length > SCHEDULE_MAX_DAY_WINDOWS) return `One date holds at most ${SCHEDULE_MAX_DAY_WINDOWS} times.`;
	const sorted = [...windows].sort((a, b) => a.starts.localeCompare(b.starts));
	for (const w of sorted) {
		const p = windowProblem(w.starts, w.ends);
		if (p) return p;
	}
	for (let i = 1; i < sorted.length; i++) if (overlaps(sorted[i - 1], sorted[i])) return 'Two of those times overlap.';
	return null;
}

export function weekdayName(n: number): string {
	return SCHEDULE_WEEKDAYS.find((d) => d.n === n)?.name ?? '';
}

/** "9:05 AM" from "09:05". */
export function clockWords(hhmm: string): string {
	if (!isClockTime(hhmm)) return '';
	const h = Number(hhmm.slice(0, 2));
	const m = hhmm.slice(3);
	const suffix = h >= 12 ? 'PM' : 'AM';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${h12}:${m} ${suffix}`;
}

/** "8:55 AM to 9:50 AM". */
export function windowWords(w: { starts: string; ends: string }): string {
	return `${clockWords(w.starts)} to ${clockWords(w.ends)}`;
}

/** "Wednesday, October 14" for a stored date (a calendar date, no zone). */
export function dayWords(isoDate: string): string {
	const d = new Date(`${isoDate}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return isoDate;
	return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
}

/** A stored instant as school-time clock words. */
export function instantClock(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
}

/** What the Foundry is doing for this class right now, in a sentence. */
export function scheduleNowWords(now: ScheduleNow, enabled: boolean): string {
	if (!now.closed) {
		return enabled
			? 'Open right now. The schedule will close it when the next class period starts.'
			: 'Open right now. No schedule is switched on, so it stays open until you close it.';
	}
	if (now.by === 'schedule') {
		const until = instantClock(now.until);
		return until ? `Closed by the schedule until ${until}.` : 'Closed by the schedule.';
	}
	return now.note ? `Closed by hand. Your note: ${now.note}` : 'Closed by hand.';
}

/** The editor's state from `foundry_class_schedule_get`, or null for anything that is not an answer. */
export function scheduleFromRpc(value: unknown): ScheduleState | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (v.ok !== true) return null;
	const weekly: ScheduleWindow[] = [];
	if (Array.isArray(v.weekly)) {
		for (const r of v.weekly) {
			const row = r as Record<string, unknown>;
			const weekday = Number(row.weekday);
			if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;
			if (typeof row.starts !== 'string' || typeof row.ends !== 'string') continue;
			weekly.push({ weekday, starts: row.starts, ends: row.ends });
		}
	}
	const days: ScheduleDayRow[] = [];
	if (Array.isArray(v.days)) {
		for (const r of v.days) {
			const row = r as Record<string, unknown>;
			if (typeof row.on_date !== 'string') continue;
			if (row.kind !== 'no_class' && row.kind !== 'window') continue;
			days.push({
				on_date: row.on_date,
				kind: row.kind,
				starts: typeof row.starts === 'string' ? row.starts : null,
				ends: typeof row.ends === 'string' ? row.ends : null,
				note: typeof row.note === 'string' ? row.note : null
			});
		}
	}
	const now = (v.now && typeof v.now === 'object' ? v.now : { closed: false }) as ScheduleNow;
	return { enabled: v.enabled === true, weekly, days, now };
}

/** The sentence for a refused schedule write, by the database's reason. */
export function scheduleRefusalSentence(reason: unknown): string {
	switch (reason) {
		case 'window_order':
			return 'A class period has to end after it starts.';
		case 'window_shape':
			return 'One of those times is not a time. Check each start and end.';
		case 'weekly_shape':
			return 'That schedule could not be read. Reload the page and try again.';
		case 'too_many':
			return `A week holds at most ${SCHEDULE_MAX_WEEKLY} class periods.`;
		case 'date_range':
			return 'Pick a date from yesterday to about a year from now.';
		case 'kind':
			return 'Choose whether that day has no class or its own times.';
		case 'note_length':
			return 'That note is too long (120 characters at most).';
		default:
			return 'That did not go through. Try again.';
	}
}
