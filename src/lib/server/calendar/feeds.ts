/**
 * THE TWO OUTSIDE CALENDARS, READ BY THE SERVER (ledger 0439).
 *
 *   school    the Bosco Tech calendar, Google Calendar
 *             pffgrom2fc9s8raatk5leccqe0@group.calendar.google.com. Its PUBLIC
 *             iCalendar address answered 200 with the whole calendar on
 *             2026-10-26, so it is the default; `BOSCO_CALENDAR_ICS_URL`
 *             replaces it (the calendar's "Secret address in iCal format", if
 *             the school ever makes the calendar private).
 *   robotics  the Techmen app's own subscription feed (its `calendar-feed`
 *             function: a member's link, `?token=...&scope=all` for every
 *             event). `ROBOTICS_CALENDAR_ICS_URL` holds that address; unset,
 *             the robotics layer is the events an admin adds on this site.
 *
 * Both are read ONLY here, through `$env/dynamic/private` (runtime, never in
 * the client bundle). Neither is a credential this site holds for itself: the
 * robotics address is a capability link the Techmen app minted, so it is never
 * sent to a browser, printed or logged.
 *
 * CACHED PER INSTANCE, REFRESHED WITHIN THE HALF HOUR. A parse is kept for
 * `FRESH_MS`; after that the next request fetches again, and a failed fetch
 * keeps serving the last good parse for up to `STALE_MS` and says so. A change
 * on the school calendar therefore shows within the half hour on any instance,
 * which is inside the hour the queue asked for. The school feed is about 3.8
 * MB; the parse drops every single event that ended more than 120 days ago.
 */
import { env } from '$env/dynamic/private';
import { expandIcs, parseIcs, type IcsEvent } from '$lib/calendar/ical';
import { occurrencesToEvents } from '$lib/calendar/feed-io';
import type { CalendarEvent } from '$lib/calendar/model';
import { laCalendarDay, schoolDayPlus } from '$lib/classroom/school-calendar';

export const BOSCO_CALENDAR_ID = 'pffgrom2fc9s8raatk5leccqe0@group.calendar.google.com';
export const BOSCO_CALENDAR_PUBLIC_ICS = `https://calendar.google.com/calendar/ical/${encodeURIComponent(BOSCO_CALENDAR_ID)}/public/basic.ics`;

export const FRESH_MS = 30 * 60_000;
export const STALE_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const KEEP_DAYS_BACK = 120;

export type FeedName = 'school' | 'robotics';
export type FeedStatus = 'ok' | 'stale' | 'off' | 'failed';

export interface FeedResult {
	events: CalendarEvent[];
	status: FeedStatus;
	/** When the parse in use was fetched, ISO; null when there is none. */
	fetchedAt: string | null;
}

interface Entry {
	url: string;
	parsed: IcsEvent[];
	fetchedAt: number;
}

const cache = new Map<FeedName, Entry>();
const inflight = new Map<FeedName, Promise<Entry | null>>();

/** The address a feed is read from, or null when it is switched off. */
export function feedUrl(name: FeedName, source: Record<string, string | undefined> = env): string | null {
	if (name === 'school') return source.BOSCO_CALENDAR_ICS_URL?.trim() || BOSCO_CALENDAR_PUBLIC_ICS;
	return source.ROBOTICS_CALENDAR_ICS_URL?.trim() || null;
}

async function fetchFeed(name: FeedName, url: string, fetcher: typeof fetch, now: number): Promise<Entry | null> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetcher(url, { signal: ctl.signal, headers: { accept: 'text/calendar' } });
		if (!res.ok) return null;
		const text = await res.text();
		if (!text.includes('BEGIN:VCALENDAR')) return null;
		const keepFrom = schoolDayPlus(laCalendarDay(new Date(now)), -KEEP_DAYS_BACK);
		const entry = { url, parsed: parseIcs(text, keepFrom), fetchedAt: now };
		cache.set(name, entry);
		return entry;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * ONE FEED'S EVENTS BETWEEN TWO DAYS, from the cache or a fresh read. Never
 * throws: an unreachable feed is `failed` with no events, and the page says so.
 */
export async function feedEvents(
	name: FeedName,
	from: string,
	to: string,
	opts: { fetcher?: typeof fetch; now?: number; source?: Record<string, string | undefined> } = {}
): Promise<FeedResult> {
	const url = feedUrl(name, opts.source);
	if (!url) return { events: [], status: 'off', fetchedAt: null };
	const now = opts.now ?? Date.now();
	let entry = cache.get(name) ?? null;
	if (entry && entry.url !== url) entry = null;
	let status: FeedStatus = 'ok';
	if (!entry || now - entry.fetchedAt > FRESH_MS) {
		let pending = inflight.get(name);
		if (!pending) {
			pending = fetchFeed(name, url, opts.fetcher ?? fetch, now);
			inflight.set(name, pending);
			pending.finally(() => inflight.delete(name));
		}
		const fresh = await pending;
		if (fresh) entry = fresh;
		else if (entry && now - entry.fetchedAt <= STALE_MS) status = 'stale';
		else return { events: [], status: 'failed', fetchedAt: null };
	}
	if (!entry) return { events: [], status: 'failed', fetchedAt: null };
	return {
		events: occurrencesToEvents(name, expandIcs(entry.parsed, from, to)),
		status,
		fetchedAt: new Date(entry.fetchedAt).toISOString()
	};
}

/** Both feeds at once, for a page or the subscription link. */
export async function outsideEvents(from: string, to: string, opts: Parameters<typeof feedEvents>[3] = {}) {
	const [school, robotics] = await Promise.all([feedEvents('school', from, to, opts), feedEvents('robotics', from, to, opts)]);
	return { school, robotics };
}

/** For tests: forget every cached parse. */
export function resetFeedCache(): void {
	cache.clear();
	inflight.clear();
}
