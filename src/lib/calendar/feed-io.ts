/**
 * THE CALENDAR'S TWO TRANSLATIONS (ledger 0439): an outside feed's occurrences
 * into the model's events, and a person's events out to an iCalendar document
 * their phone subscribes to.
 *
 * Pure: no clock (the stamp is handed in) and no network.
 */
import type { IcsOccurrence } from './ical';
import { occurrenceInstant } from './ical';
import type { CalendarEvent, CalendarLayer } from './model';
import { schoolDayPlus } from '$lib/classroom/school-calendar';

/** An outside feed's occurrences as events on one layer. The id is the feed's uid plus the day, so a series is one event per day. */
export function occurrencesToEvents(layer: CalendarLayer, occurrences: readonly IcsOccurrence[]): CalendarEvent[] {
	return occurrences.map((o) => ({
		id: `${layer}:${o.uid}:${o.day}${o.startTime ? `T${o.startTime}` : ''}`,
		layer,
		kind: 'external',
		title: o.title,
		day: o.day,
		endDay: o.endDay,
		startTime: o.startTime,
		endTime: o.endTime,
		at: null,
		location: o.location,
		notes: null,
		sectionIds: [],
		itemId: null,
		itemTitle: null,
		scheduled: false,
		state: null,
		owner: null,
		mine: false,
		blocked: false,
		gate: null,
		eventId: null,
		stepId: null
	}));
}

// ---------------------------------------------------------------------------
// Writing a feed (RFC 5545).
// ---------------------------------------------------------------------------

/** 3.3.11: backslash, semicolon, comma and newline escaped in TEXT. */
export function escapeIcsText(v: string): string {
	return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** 3.1: lines folded at 75 octets, never inside a UTF-8 character. */
export function foldIcsLine(line: string): string {
	const enc = new TextEncoder();
	if (enc.encode(line).length <= 75) return line;
	const parts: string[] = [];
	let cur = '';
	let bytes = 0;
	for (const ch of line) {
		const b = enc.encode(ch).length;
		const limit = parts.length === 0 ? 75 : 74;
		if (bytes + b > limit) {
			parts.push(cur);
			cur = '';
			bytes = 0;
		}
		cur += ch;
		bytes += b;
	}
	parts.push(cur);
	return parts.join('\r\n ');
}

const basic = (day: string) => day.replace(/-/g, '');
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** What the phone shows as an event's title: a due date says so. */
function summaryOf(e: CalendarEvent): string {
	if (e.kind === 'due') return `Due: ${e.title}`;
	if (e.kind === 'pacing') return e.itemTitle ? `${e.itemTitle}: ${e.title}` : e.title;
	if (e.kind === 'signoff') return `Sign-off: ${e.title}`;
	if (e.kind === 'task') return `Team task: ${e.title}`;
	if (e.kind === 'no_school') return `No school: ${e.title}`;
	return e.title;
}

/**
 * ONE PERSON'S CALENDAR AS AN iCALENDAR DOCUMENT. Every event is all-day on its
 * day(s) except an event with a start time, which is written in UTC. `origin`
 * builds the link back to a post; `stamp` is the instant written as DTSTAMP.
 */
export function renderIcs(
	events: readonly CalendarEvent[],
	opts: { name: string; origin: string; stamp: string; href?: (e: CalendarEvent) => string | null }
): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//IDEA Bosco Tech//IDEA Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`NAME:${escapeIcsText(opts.name)}`,
		`X-WR-CALNAME:${escapeIcsText(opts.name)}`,
		'X-WR-TIMEZONE:America/Los_Angeles',
		'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
		'X-PUBLISHED-TTL:PT1H'
	];
	const stamp = utc(opts.stamp);
	for (const e of events) {
		lines.push('BEGIN:VEVENT');
		lines.push(`UID:${e.id.replace(/[^A-Za-z0-9:._-]/g, '-')}@ideabosco.com`);
		lines.push(`DTSTAMP:${stamp}`);
		const start = e.startTime ? occurrenceInstant(e.day, e.startTime) : null;
		if (start) {
			lines.push(`DTSTART:${utc(start)}`);
			const endDay = e.endDay ?? e.day;
			const end = e.endTime ? occurrenceInstant(endDay, e.endTime) : null;
			lines.push(`DTEND:${utc(end && end > start ? end : new Date(Date.parse(start) + 3_600_000).toISOString())}`);
		} else {
			lines.push(`DTSTART;VALUE=DATE:${basic(e.day)}`);
			lines.push(`DTEND;VALUE=DATE:${basic(schoolDayPlus(e.endDay ?? e.day, 1) ?? e.day)}`);
			lines.push('TRANSP:TRANSPARENT');
		}
		lines.push(`SUMMARY:${escapeIcsText(summaryOf(e))}`);
		if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
		const detail = [e.gate, e.notes].filter(Boolean).join('\n');
		if (detail) lines.push(`DESCRIPTION:${escapeIcsText(detail)}`);
		const link = opts.href?.(e);
		if (link) lines.push(`URL:${opts.origin}${link}`);
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
