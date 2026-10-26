// tests/calendar-ical.test.ts
//
// LEDGER 0439: READING THE BOSCO TECH CALENDAR AND THE TECHMEN FEED, AND
// WRITING A PERSON'S CALENDAR BACK OUT.
//
// The school fixture is the real public feed recorded on 2026-10-26 and trimmed
// to the 2026-27 school year (descriptions, organizers and attendees removed):
// tests/fixtures/calendar/bosco-2026-27.ics. The robotics fixture is shaped
// exactly as the Techmen app's calendar-feed function writes (UTC times,
// escaped text, CATEGORIES). Every expected value below was read off the
// fixture by hand.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expandIcs, parseIcs } from '../src/lib/calendar/ical';
import { escapeIcsText, foldIcsLine, occurrencesToEvents, renderIcs } from '../src/lib/calendar/feed-io';
import type { CalendarEvent } from '../src/lib/calendar/model';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/calendar/${name}`, import.meta.url)), 'utf8');
const school = parseIcs(fixture('bosco-2026-27.ics'));
const between = (from: string, to: string) => expandIcs(school, from, to);

describe('the Bosco Tech feed', () => {
	it('reads all-day closures, with a multi-day one ending on its last day', () => {
		const nov = between('2026-11-01', '2026-11-30');
		expect(nov.find((o) => o.day === '2026-11-11' && o.title === '(school closed)')).toMatchObject({ endDay: null, startTime: null });
		const closed = nov.filter((o) => /no school|closed/i.test(o.title)).map((o) => [o.day, o.endDay, o.title]);
		expect(closed).toContainEqual(['2026-11-23', '2026-11-24', '(no school) Office Hours 8-3 pm']);
	});

	it('turns a UTC time into the school clock', () => {
		const visit = between('2026-10-14', '2026-10-14').find((o) => o.title === 'University of San Francisco Visit');
		expect(visit).toMatchObject({ startTime: '11:05', endTime: '12:05', location: 'Library, 1st floor' });
	});

	it('expands a weekly series, skips its excluded days, and puts a moved one in its place', () => {
		const sep = between('2026-09-01', '2026-10-31').filter((o) => o.title === 'General Faculty/Staff Meeting');
		// Mondays 3:25 PM; Sep 7, Oct 5 and Oct 26 excluded; Sep 21 and Sep 28 moved and retitled.
		expect(sep.map((o) => o.day)).toEqual(['2026-09-14', '2026-10-12', '2026-10-19']);
		expect(sep.every((o) => o.startTime === '15:25' && o.endTime === '16:25')).toBe(true);
		expect(between('2026-09-21', '2026-09-21').filter((o) => o.title === 'Grade Level Meetings')).toHaveLength(1);
		expect(between('2026-09-28', '2026-09-28').filter((o) => o.title === 'Instruction Area Meetings')).toHaveLength(1);
	});

	it('a window years away holds only the series that never end (holidays, Bingo, Parent Council)', () => {
		const far = between('2031-01-01', '2031-01-31');
		expect(far.map((o) => o.title)).toContain("New Year's Day");
		expect(far.map((o) => [o.day, o.title])).toContainEqual(['2031-01-07', 'Parent Council Meeting']);
		const rule = (uid: string) => school.find((e) => e.uid === uid && e.rrule)?.rrule;
		expect(far.every((o) => rule(o.uid) && !rule(o.uid)!.UNTIL && !rule(o.uid)!.COUNT)).toBe(true);
		expect(school.length).toBeGreaterThan(400);
	});
});

describe('recurrence rules', () => {
	const one = (rrule: string, extra = '') =>
		parseIcs(
			['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x', 'DTSTART;TZID=America/Los_Angeles:20261006T183000', 'DTEND;TZID=America/Los_Angeles:20261006T200000', `RRULE:${rrule}`, extra, 'SUMMARY:Parent Council', 'END:VEVENT', 'END:VCALENDAR']
				.filter(Boolean)
				.join('\r\n')
		);

	it('an ordinal weekday each month (the first Tuesday), with a count', () => {
		const days = expandIcs(one('FREQ=MONTHLY;COUNT=4;BYDAY=1TU'), '2026-01-01', '2027-12-31').map((o) => o.day);
		expect(days).toEqual(['2026-10-06', '2026-11-03', '2026-12-01', '2027-01-05']);
	});

	it('the last Friday, every second week, daily with an interval, and yearly', () => {
		expect(expandIcs(one('FREQ=MONTHLY;UNTIL=20261231T235959Z;BYDAY=-1FR'), '2026-10-01', '2026-12-31').map((o) => o.day)).toEqual([
			'2026-10-30',
			'2026-11-27',
			'2026-12-25'
		]);
		expect(expandIcs(one('FREQ=WEEKLY;INTERVAL=2;COUNT=3;BYDAY=TU,TH'), '2026-10-01', '2026-12-31').map((o) => o.day)).toEqual([
			'2026-10-06',
			'2026-10-08',
			'2026-10-20'
		]);
		expect(expandIcs(one('FREQ=DAILY;INTERVAL=3;COUNT=3'), '2026-10-01', '2026-12-31').map((o) => o.day)).toEqual([
			'2026-10-06',
			'2026-10-09',
			'2026-10-12'
		]);
		expect(expandIcs(one('FREQ=YEARLY;COUNT=2'), '2026-01-01', '2028-12-31').map((o) => o.day)).toEqual(['2026-10-06', '2027-10-06']);
	});

	it('a cancelled occurrence is gone, and a rule part it does not know keeps only the first date', () => {
		const series = parseIcs(
			[
				'BEGIN:VEVENT', 'UID:y', 'DTSTART;VALUE=DATE:20261005', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Spirit week', 'END:VEVENT',
				'BEGIN:VEVENT', 'UID:y', 'RECURRENCE-ID;VALUE=DATE:20261006', 'DTSTART;VALUE=DATE:20261006', 'STATUS:CANCELLED', 'SUMMARY:Spirit week', 'END:VEVENT'
			].join('\r\n')
		);
		expect(expandIcs(series, '2026-10-01', '2026-10-31').map((o) => o.day)).toEqual(['2026-10-05', '2026-10-07']);
		expect(expandIcs(one('FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO,TU'), '2026-01-01', '2027-12-31').map((o) => o.day)).toEqual(['2026-10-06']);
	});
});

describe('the Techmen feed', () => {
	it('reads its UTC times, escaped text and a day that runs past midnight', () => {
		const occ = expandIcs(parseIcs(fixture('techmen-sample.ics')), '2026-10-01', '2026-11-30');
		expect(occ.map((o) => [o.day, o.startTime, o.endTime, o.title, o.endDay])).toEqual([
			['2026-10-28', '15:30', '18:30', 'Build session', null],
			['2026-10-31', '08:00', '18:00', 'Beach Blitz, day 2', null]
		]);
		const events = occurrencesToEvents('robotics', occ);
		expect(events[0]).toMatchObject({ layer: 'robotics', kind: 'external', location: 'IDEA building', sectionIds: [] });
		expect(new Set(events.map((e) => e.id)).size).toBe(2);
	});
});

describe('writing a feed', () => {
	const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
		id: 'due:abc',
		layer: 'classes',
		kind: 'due',
		title: 'Launcher plan',
		day: '2026-11-02',
		endDay: null,
		startTime: null,
		endTime: null,
		at: null,
		location: null,
		notes: null,
		sectionIds: ['s1'],
		itemId: 'abc',
		itemTitle: null,
		scheduled: false,
		state: null,
		owner: null,
		mine: false,
		blocked: false,
		gate: null,
		eventId: null,
		stepId: null,
		...over
	});

	it('escapes and folds by the RFC, never splitting a character', () => {
		expect(escapeIcsText('a; b, c\\d\ne')).toBe('a\\; b\\, c\\\\d\\ne');
		const long = 'SUMMARY:' + 'é'.repeat(60);
		const folded = foldIcsLine(long);
		for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		expect(folded.replace(/\r\n /g, '')).toBe(long);
	});

	it('writes a due date all day, a timed event in UTC, and links a post back to the site', () => {
		const text = renderIcs(
			[ev({}), ev({ id: 'event:1', layer: 'robotics', kind: 'event', title: 'Beach Blitz', day: '2026-10-30', endDay: '2026-11-01', startTime: '08:00', endTime: '17:00', sectionIds: [] })],
			{ name: 'IDEA calendar', origin: 'https://ideabosco.com', stamp: '2026-10-26T12:00:00Z', href: (e) => (e.itemId ? `/classroom/s1/item/${e.itemId}` : null) }
		);
		expect(text).toContain('SUMMARY:Due: Launcher plan');
		expect(text).toContain('DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103');
		expect(text).toContain('URL:https://ideabosco.com/classroom/s1/item/abc');
		// 8 AM in Los Angeles on Oct 30 (daylight time) is 15:00 UTC; 5 PM on Nov 1 (standard time) is 01:00 UTC on Nov 2.
		expect(text).toContain('DTSTART:20261030T150000Z\r\nDTEND:20261102T010000Z');
		expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
		// It reads back through the reader.
		const back = expandIcs(parseIcs(text), '2026-10-01', '2026-11-30').map((o) => [o.day, o.title]);
		expect(back).toEqual([
			['2026-10-30', 'Beach Blitz'],
			['2026-11-02', 'Due: Launcher plan']
		]);
	});
});
