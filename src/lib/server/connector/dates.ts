/**
 * SPOKEN DATES, IN SCHOOL TIME. A `due` argument accepts "Friday", "tomorrow
 * 3pm", "next Monday at 11:59", "Oct 24 11:59pm", "10/24", an ISO date or
 * instant, and "none". Every wall time is America/Los_Angeles, read through
 * `$lib/classroom/school-calendar`, the site's one conversion; a browser's or a
 * server's own zone never decides a day.
 *
 * A day with no time means 11:59 PM for a due date. A notice's end words
 * ("end of day", "next week", "until I take it down") go through the quick-post
 * presets the composer offers, so "end of day" means the same 3:00 PM it means
 * on the class page.
 */
import {
	laCalendarDay,
	schoolDayPlus,
	schoolWallInstant,
	schoolWeekday,
	SCHOOL_DAY_END_MINUTES
} from '$lib/classroom/school-calendar';
import { quickPostExpiry, type QuickPostPresetId } from '$lib/classroom/quick-posts';

export type ResolvedDate = { ok: true; iso: string | null; words: string } | { ok: false; refusal: string };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * ONE PATTERN FOR WHAT IS A TIME, so the day parser and the time parser never
 * disagree about which digits are which: "11:59", "3pm", "3:30 p.m.", "at 3",
 * "noon", "midnight". A bare number is a day ("Oct 24"), never a time.
 */
const TIME_RE =
	/(?:\bat\s+)?\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?|(?:\bat\s+)?\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(?![a-z])|\bat\s+(\d{1,2})\b|\b(noon|midnight)\b|\bend of (?:the )?(?:school )?day\b/;

/** Minutes after midnight for the time a phrase names, or null. */
export function parseTime(text: string): number | null {
	const t = text.trim().toLowerCase();
	const m = TIME_RE.exec(t);
	if (!m) return null;
	if (m[7] === 'noon') return 12 * 60;
	if (m[7] === 'midnight') return 23 * 60 + 59;
	if (/end of/.test(m[0])) return SCHOOL_DAY_END_MINUTES;
	let hour = Number(m[1] ?? m[4] ?? m[6]);
	const minute = m[2] ? Number(m[2]) : 0;
	const mer = (m[3] ?? m[5])?.replace(/\./g, '');
	if (minute > 59 || hour > 23) return null;
	if (mer === 'pm' && hour < 12) hour += 12;
	if (mer === 'am' && hour === 12) hour = 0;
	// "at 3" or "3:30" with no meridiem means the afternoon for 1 to 6, and
	// "11:59" with none is the deadline everyone means by it: 11:59 PM.
	if (!mer && hour >= 1 && hour <= 6) hour += 12;
	if (!mer && hour === 11 && minute === 59) hour = 23;
	return hour * 60 + minute;
}

function stripTime(text: string): string {
	return text.replace(TIME_RE, ' ').replace(/\s+/g, ' ').trim();
}

/** The calendar day a phrase names, relative to `today` (YYYY-MM-DD, school time). */
export function parseDay(text: string, today: string): string | null {
	const t = text.trim().toLowerCase();
	if (t === '' || /^(today|tonight|this evening)$/.test(t)) return today;
	if (/^tomorrow$/.test(t)) return schoolDayPlus(today, 1);
	const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
	if (iso) return t;
	const wd = /^(next |this |on )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/.exec(t);
	if (wd) {
		const target = WEEKDAYS.findIndex((w) => w.startsWith(wd[2].slice(0, 3)));
		const now = schoolWeekday(today) ?? 0;
		let ahead = (target - now + 7) % 7;
		if (wd[1]?.trim() === 'next' && ahead === 0) ahead = 7;
		return schoolDayPlus(today, ahead);
	}
	const md = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(t) ?? null;
	const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
	let month: number | null = null;
	let day: number | null = null;
	let year: number | null = null;
	if (md) {
		const mi = MONTHS.indexOf(md[1].slice(0, 3));
		if (mi < 0) return null;
		month = mi + 1;
		day = Number(md[2]);
		year = md[3] ? Number(md[3]) : null;
	} else if (slash) {
		month = Number(slash[1]);
		day = Number(slash[2]);
		year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : null;
	}
	if (month === null || day === null || month < 1 || month > 12 || day < 1 || day > 31) return null;
	const thisYear = Number(today.slice(0, 4));
	let y = year ?? thisYear;
	let candidate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	// A date with no year that has already passed this year means next year.
	if (year === null && candidate < today) {
		y += 1;
		candidate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}
	return candidate;
}

function words(iso: string): string {
	return new Date(iso).toLocaleString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'America/Los_Angeles'
	});
}

/**
 * A due date. "none" clears it. A bare day is 11:59 PM; a time with no day is
 * today, or tomorrow when that time has passed.
 */
export function resolveDue(text: string, now: Date): ResolvedDate {
	const raw = text.trim();
	const t = raw.toLowerCase();
	if (/^(none|no due date|no date|clear|remove( it)?)$/.test(t)) return { ok: true, iso: null, words: 'no due date' };
	// A full ISO instant is taken as given.
	if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/.test(t)) {
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return { ok: false, refusal: `"${raw}" is not a date.` };
		return { ok: true, iso: d.toISOString(), words: words(d.toISOString()) };
	}
	const today = laCalendarDay(now);
	const minutes = parseTime(t);
	const dayText = stripTime(t.replace(/\b(due|by|on)\b/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim());
	const day = parseDay(dayText, today);
	if (!day) return { ok: false, refusal: `"${raw}" is not a day I can read. Say a weekday, "tomorrow", or a date like Oct 24.` };
	let iso = schoolWallInstant(day, minutes ?? 23 * 60 + 59);
	if (!iso) return { ok: false, refusal: `"${raw}" is not a date.` };
	if (dayText === '' && minutes !== null && Date.parse(iso) <= now.getTime()) {
		iso = schoolWallInstant(day, minutes, 1);
		if (!iso) return { ok: false, refusal: `"${raw}" is not a date.` };
	}
	return { ok: true, iso, words: words(iso) };
}

/** When a notice comes down: the composer's presets first, then any due-style time. */
export function resolveNoticeEnd(text: string | undefined, now: Date): ResolvedDate {
	const t = (text ?? '').trim().toLowerCase();
	const preset: QuickPostPresetId | null =
		t === '' || /^(end of (the )?(school )?day|today|this afternoon)$/.test(t)
			? 'school-day'
			: /^(an hour|one hour|1 hour|for an hour)$/.test(t)
				? 'hour'
				: /^(end of )?(the )?next school day$|^tomorrow$/.test(t)
					? 'next-school-day'
					: /^(end of (the )?week|this week|friday)$/.test(t)
						? 'week'
						: /^(end of )?next week$/.test(t)
							? 'next-week'
							: /^(until (i|you) take it down|forever|no end|indefinitely)$/.test(t)
								? 'forever'
								: null;
	if (preset) {
		const r = quickPostExpiry(preset, now.getTime());
		if (!r.ok) return { ok: false, refusal: r.refusal };
		return { ok: true, iso: r.expiresAt, words: r.expiresAt ? words(r.expiresAt) : 'until you take it down' };
	}
	const inMatch = /^in (\d+) (minute|minutes|hour|hours|day|days)$/.exec(t);
	if (inMatch) {
		const n = Number(inMatch[1]);
		const unit = inMatch[2].startsWith('minute') ? 60_000 : inMatch[2].startsWith('hour') ? 3600_000 : 86_400_000;
		const iso = new Date(now.getTime() + n * unit).toISOString();
		return { ok: true, iso, words: words(iso) };
	}
	const due = resolveDue(t.replace(/^until /, ''), now);
	if (!due.ok) return due;
	if (due.iso && Date.parse(due.iso) <= now.getTime()) return { ok: false, refusal: 'That time has already passed.' };
	return due;
}
