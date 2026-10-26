/**
 * READING AN iCALENDAR FEED (RFC 5545) INTO CALENDAR EVENTS (ledger 0439).
 *
 * Two feeds come in this way: the Bosco Tech school calendar (Google Calendar's
 * public `basic.ics`, about 3.8 MB and eleven thousand events back to 2020 on
 * 2026-10-26) and the Techmen app's own subscription feed for robotics.
 *
 * WHAT IS SUPPORTED IS WHAT THOSE FEEDS USE, measured on the school feed that
 * day: all-day events (`VALUE=DATE`), UTC times (`Z`), Los Angeles wall times
 * (`TZID=America/Los_Angeles`), and 335 `RRULE`s of four frequencies (DAILY,
 * WEEKLY with BYDAY, MONTHLY with an ordinal BYDAY like `1TU`, YEARLY) with
 * INTERVAL, COUNT, UNTIL and WKST, plus 835 `EXDATE`s and 714 moved or
 * cancelled occurrences (`RECURRENCE-ID`). A rule part this reader does not
 * know (BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR...) makes it keep the first
 * occurrence only rather than invent dates. A TZID other than Los Angeles is
 * read as Los Angeles wall time, which is the only zone either feed names.
 *
 * Pure: no clock and no network. `parseIcs` reads the text once; `expandIcs`
 * turns the parsed events into the days of a window, and is what runs per
 * request, so the server caches the parse and not the expansion.
 */
import { dayIndex, laCalendarDay, schoolDayPlus, schoolWallInstant, schoolClockParts } from '$lib/classroom/school-calendar';

const DAY_MS = 86_400_000;

/** One VEVENT, its times turned into the school's wall clock. */
export interface IcsEvent {
	uid: string;
	title: string;
	location: string | null;
	description: string | null;
	/** All-day: the first day. Timed: the day of the start in Los Angeles. */
	day: string;
	/** Start minutes after midnight in Los Angeles; null for all-day. */
	startMin: number | null;
	/** Length in whole days (all-day, at least 1) or minutes (timed). */
	lengthDays: number;
	lengthMin: number;
	rrule: Record<string, string> | null;
	/** Excluded occurrences, keyed as `occurrenceKey` keys them. */
	exdates: Set<string>;
	/** Present on an override: the occurrence of its series it replaces. */
	recurrenceId: string | null;
	cancelled: boolean;
}

/** An occurrence on the calendar, the shape the model's events are made from. */
export interface IcsOccurrence {
	uid: string;
	title: string;
	location: string | null;
	day: string;
	/** Last day inclusive, null for one day. */
	endDay: string | null;
	startTime: string | null;
	endTime: string | null;
}

/** RFC 5545 3.1: a line starting with a space or a tab continues the one before. */
function unfold(text: string): string[] {
	return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

/** RFC 5545 3.3.11, the other way. */
export function unescapeText(v: string): string {
	return v.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

interface Prop {
	name: string;
	params: Record<string, string>;
	value: string;
}

function parseLine(line: string): Prop | null {
	// The value starts after the first colon that is not inside a quoted parameter.
	let quoted = false;
	let colon = -1;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') quoted = !quoted;
		else if (c === ':' && !quoted) {
			colon = i;
			break;
		}
	}
	if (colon < 0) return null;
	const head = line.slice(0, colon).split(';');
	const params: Record<string, string> = {};
	for (const p of head.slice(1)) {
		const eq = p.indexOf('=');
		if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
	}
	return { name: head[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

/** A DATE or DATE-TIME value as the school's day and minutes; null when it does not parse. */
function readWhen(value: string, params: Record<string, string>): { day: string; min: number | null } | null {
	const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
	if (date || params.VALUE === 'DATE') {
		const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
		if (!m) return null;
		const day = `${m[1]}-${m[2]}-${m[3]}`;
		return dayIndex(day) === null ? null : { day, min: null };
	}
	const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
	if (!dt) return null;
	const day = `${dt[1]}-${dt[2]}-${dt[3]}`;
	if (dayIndex(day) === null) return null;
	const min = Number(dt[4]) * 60 + Number(dt[5]);
	if (dt[7] === 'Z') {
		const instant = Date.UTC(Number(dt[1]), Number(dt[2]) - 1, Number(dt[3]), Number(dt[4]), Number(dt[5]), Number(dt[6]));
		const wall = schoolClockParts(instant);
		return { day: laCalendarDay(new Date(instant)), min: wall.hour * 60 + wall.minute };
	}
	// A floating time or a TZID: the school's wall clock (see the header).
	return { day, min };
}

/** The key an EXDATE and a RECURRENCE-ID are matched on: the day, plus the minute for a timed series. */
function occurrenceKey(day: string, min: number | null): string {
	return min === null ? day : `${day}T${min}`;
}

/**
 * PARSE A FEED. `keepFrom` drops a single event that ended before that day,
 * which is most of a feed that goes back six years; a series is always kept.
 */
export function parseIcs(text: string, keepFrom: string | null = null): IcsEvent[] {
	const out: IcsEvent[] = [];
	let cur: Prop[] | null = null;
	let depth = 0;
	for (const line of unfold(text)) {
		if (line === 'BEGIN:VEVENT') {
			cur = [];
			depth = 0;
			continue;
		}
		if (!cur) continue;
		if (line.startsWith('BEGIN:')) {
			depth++;
			continue;
		}
		if (line.startsWith('END:') && line !== 'END:VEVENT') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (line === 'END:VEVENT') {
			const ev = buildEvent(cur);
			cur = null;
			if (!ev) continue;
			if (keepFrom && !ev.rrule && !ev.recurrenceId) {
				const last = ev.startMin === null ? schoolDayPlus(ev.day, ev.lengthDays - 1) : ev.day;
				if (last && last < keepFrom) continue;
			}
			out.push(ev);
			continue;
		}
		if (depth > 0) continue; // a VALARM inside the event
		const p = parseLine(line);
		if (p) cur.push(p);
	}
	return out;
}

function buildEvent(props: Prop[]): IcsEvent | null {
	const get = (n: string) => props.find((p) => p.name === n);
	const start = get('DTSTART');
	const uid = get('UID')?.value ?? '';
	if (!start) return null;
	const s = readWhen(start.value, start.params);
	if (!s) return null;
	const endProp = get('DTEND');
	const e = endProp ? readWhen(endProp.value, endProp.params) : null;
	let lengthDays = 1;
	let lengthMin = 0;
	if (s.min === null) {
		const a = dayIndex(s.day);
		const b = e ? dayIndex(e.day) : null;
		lengthDays = a !== null && b !== null && b > a ? b - a : 1;
	} else if (e && e.min !== null) {
		const a = (dayIndex(s.day) ?? 0) * 1440 + s.min;
		const b = (dayIndex(e.day) ?? 0) * 1440 + e.min;
		lengthMin = Math.max(0, b - a);
	}
	const rruleProp = get('RRULE');
	const rrule = rruleProp
		? Object.fromEntries(
				rruleProp.value.split(';').map((kv) => {
					const i = kv.indexOf('=');
					return [kv.slice(0, i).toUpperCase(), kv.slice(i + 1)];
				})
			)
		: null;
	const exdates = new Set<string>();
	for (const p of props.filter((x) => x.name === 'EXDATE')) {
		for (const v of p.value.split(',')) {
			const w = readWhen(v.trim(), p.params);
			if (w) exdates.add(occurrenceKey(w.day, s.min === null ? null : w.min));
		}
	}
	const rid = get('RECURRENCE-ID');
	const r = rid ? readWhen(rid.value, rid.params) : null;
	return {
		uid,
		title: unescapeText(get('SUMMARY')?.value ?? '').trim(),
		location: get('LOCATION') ? unescapeText(get('LOCATION')!.value).trim() || null : null,
		description: get('DESCRIPTION') ? unescapeText(get('DESCRIPTION')!.value) : null,
		day: s.day,
		startMin: s.min,
		lengthDays,
		lengthMin,
		rrule,
		exdates,
		recurrenceId: r ? occurrenceKey(r.day, s.min === null ? null : r.min) : null,
		cancelled: (get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED'
	};
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const KNOWN_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST', 'BYMONTHDAY', 'BYMONTH']);

/** 0 for Sunday. */
function weekdayOf(index: number): number {
	return (((index + 4) % 7) + 7) % 7;
}

function ymd(index: number): { y: number; m: number; d: number } {
	const t = new Date(index * DAY_MS);
	return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function indexOfYmd(y: number, m: number, d: number): number | null {
	const t = Date.UTC(y, m - 1, d);
	const back = new Date(t);
	if (back.getUTCMonth() !== m - 1) return null; // Feb 30 and the like
	return Math.round(t / DAY_MS);
}

/** The day indexes of a series in order, from its first, up to `lastIndex`, honouring COUNT and UNTIL. */
function seriesDays(ev: IcsEvent, lastIndex: number): number[] {
	const start = dayIndex(ev.day);
	if (start === null) return [];
	const r = ev.rrule!;
	if (Object.keys(r).some((k) => !KNOWN_PARTS.has(k))) return [start];
	const freq = r.FREQ;
	const interval = Math.max(1, Number(r.INTERVAL) || 1);
	const count = r.COUNT ? Math.max(0, Number(r.COUNT) || 0) : null;
	let untilIndex: number | null = null;
	if (r.UNTIL) {
		const u = readWhen(r.UNTIL, r.UNTIL.length === 8 ? { VALUE: 'DATE' } : {});
		untilIndex = u ? dayIndex(u.day) : null;
	}
	const stop = Math.min(lastIndex, untilIndex ?? Number.POSITIVE_INFINITY);
	const out: number[] = [];
	const push = (i: number) => {
		if (i < start) return true;
		if (i > stop) return false;
		if (count !== null && out.length >= count) return false;
		out.push(i);
		return true;
	};
	const byday = r.BYDAY ? r.BYDAY.split(',').map((s) => s.trim().toUpperCase()) : null;
	const SAFETY = 4000;

	if (freq === 'DAILY') {
		for (let k = 0, i = start; k < SAFETY; k++, i += interval) {
			if (byday && !byday.includes(WEEKDAY_CODES[weekdayOf(i)])) continue;
			if (!push(i)) break;
		}
	} else if (freq === 'WEEKLY') {
		const wkst = WEEKDAY_CODES.indexOf((r.WKST ?? 'MO').toUpperCase());
		const days = (byday ?? [WEEKDAY_CODES[weekdayOf(start)]])
			.map((c) => WEEKDAY_CODES.indexOf(c.slice(-2)))
			.filter((d) => d >= 0);
		const weekStart = (i: number) => i - ((weekdayOf(i) - (wkst < 0 ? 1 : wkst) + 7) % 7);
		let ws = weekStart(start);
		outer: for (let k = 0; k < SAFETY; k++, ws += 7 * interval) {
			const inWeek = days
				.map((d) => ws + ((d - (wkst < 0 ? 1 : wkst) + 7) % 7))
				.sort((a, b) => a - b);
			for (const i of inWeek) {
				if (i < start) continue;
				if (!push(i)) break outer;
			}
		}
	} else if (freq === 'MONTHLY') {
		const s = ymd(start);
		for (let k = 0; k < SAFETY / 4; k++) {
			const total = s.y * 12 + (s.m - 1) + k * interval;
			const y = Math.floor(total / 12);
			const m = (total % 12) + 1;
			const candidates: number[] = [];
			if (byday) {
				for (const code of byday) {
					const mm = /^([+-]?\d+)?([A-Z]{2})$/.exec(code);
					if (!mm) continue;
					const wd = WEEKDAY_CODES.indexOf(mm[2]);
					const nth = mm[1] ? Number(mm[1]) : 0;
					const first = indexOfYmd(y, m, 1)!;
					const lastDay = indexOfYmd(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1)! - 1;
					const all: number[] = [];
					for (let i = first; i <= lastDay; i++) if (weekdayOf(i) === wd) all.push(i);
					if (nth === 0) candidates.push(...all);
					else {
						const pick = nth > 0 ? all[nth - 1] : all[all.length + nth];
						if (pick !== undefined) candidates.push(pick);
					}
				}
			} else {
				const md = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : [s.d];
				for (const d of md) {
					const i = indexOfYmd(y, m, d);
					if (i !== null) candidates.push(i);
				}
			}
			candidates.sort((a, b) => a - b);
			let stopped = false;
			for (const i of candidates) {
				if (!push(i)) {
					stopped = true;
					break;
				}
			}
			if (stopped) break;
			if ((indexOfYmd(y, m, 1) ?? 0) > stop) break;
		}
	} else if (freq === 'YEARLY') {
		const s = ymd(start);
		for (let k = 0; k < 200; k++) {
			const i = indexOfYmd(s.y + k * interval, s.m, s.d);
			if (i === null) continue;
			if (!push(i)) break;
		}
	} else {
		return [start];
	}
	return out;
}

function minutesToTime(min: number): string {
	const m = ((min % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function occurrence(ev: IcsEvent, dayI: number): IcsOccurrence {
	const day = schoolDayPlus('1970-01-01', dayI) ?? ev.day;
	if (ev.startMin === null) {
		return {
			uid: ev.uid,
			title: ev.title,
			location: ev.location,
			day,
			endDay: ev.lengthDays > 1 ? schoolDayPlus(day, ev.lengthDays - 1) : null,
			startTime: null,
			endTime: null
		};
	}
	const endAbs = ev.startMin + ev.lengthMin;
	const endDayOffset = Math.floor((endAbs - 1) / 1440);
	return {
		uid: ev.uid,
		title: ev.title,
		location: ev.location,
		day,
		endDay: ev.lengthMin > 0 && endDayOffset > 0 ? schoolDayPlus(day, endDayOffset) : null,
		startTime: minutesToTime(ev.startMin),
		endTime: ev.lengthMin > 0 ? minutesToTime(endAbs) : null
	};
}

/**
 * EVERY OCCURRENCE BETWEEN TWO DAYS (inclusive), with exclusions and moved
 * occurrences applied, sorted by day and time. A cancelled event, and an
 * event with no title, is left out.
 */
export function expandIcs(events: readonly IcsEvent[], from: string, to: string): IcsOccurrence[] {
	const fromI = dayIndex(from);
	const toI = dayIndex(to);
	if (fromI === null || toI === null) return [];
	const overrides = new Map<string, Set<string>>();
	for (const ev of events) {
		if (!ev.recurrenceId) continue;
		if (!overrides.has(ev.uid)) overrides.set(ev.uid, new Set());
		overrides.get(ev.uid)!.add(ev.recurrenceId);
	}
	const out: IcsOccurrence[] = [];
	const overlaps = (o: IcsOccurrence) => o.day <= to && (o.endDay ?? o.day) >= from;
	for (const ev of events) {
		if (!ev.title) continue;
		if (ev.recurrenceId || !ev.rrule) {
			if (ev.cancelled) continue;
			const i = dayIndex(ev.day);
			if (i === null) continue;
			const o = occurrence(ev, i);
			if (overlaps(o)) out.push(o);
			continue;
		}
		if (ev.cancelled) continue;
		const moved = overrides.get(ev.uid);
		const span = ev.startMin === null ? ev.lengthDays : Math.ceil((ev.startMin + ev.lengthMin) / 1440);
		for (const i of seriesDays(ev, toI)) {
			if (i + span < fromI) continue;
			const key = occurrenceKey(schoolDayPlus('1970-01-01', i) ?? '', ev.startMin);
			if (ev.exdates.has(key) || moved?.has(key)) continue;
			const o = occurrence(ev, i);
			if (overlaps(o)) out.push(o);
		}
	}
	return out.sort((a, b) => a.day.localeCompare(b.day) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title));
}

/** The instant a wall-clock start falls on, for writing a feed back out. */
export function occurrenceInstant(day: string, time: string | null): string | null {
	if (!time) return null;
	const [h, m] = time.split(':').map(Number);
	return schoolWallInstant(day, h * 60 + m);
}
