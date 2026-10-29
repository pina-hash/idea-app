// tests/calendar-model.test.ts
//
// LEDGER 0439: the calendar's pure rules -- a viewer's choices read against the
// union, which events a viewer sees (both directions), the day arithmetic, an
// assignment's plan judged against the progress rail, and `schedule` on
// `idea:state` (present when there is one, absent otherwise).

import { describe, expect, it } from 'vitest';
import {
	eventHref,
	eventsOnDay,
	monthGrid,
	monthGridBounds,
	monthPlus,
	parseCalendarFeed,
	readCalendarPrefs,
	schoolWeek,
	storedCalendarPrefs,
	visibleEvents,
	type CalendarEvent
} from '../src/lib/calendar/model';
import { hxScheduleFor, parseItemPacing } from '../src/lib/calendar/item-schedule';
import { hxStateMessage } from '../src/lib/classroom/html-assignment/bridge';
import type { HxProgress } from '../src/lib/classroom/html-assignment/progress';
import { subscriptionUrls } from '../src/lib/calendar/transports';

const A = '0b5a1c2e-0000-4000-8000-00000000000a';
const B = '0b5a1c2e-0000-4000-8000-00000000000b';

const feed = parseCalendarFeed({
	ok: true,
	today: '2026-10-28',
	sections: [{ id: A, label: 'Block 2', course: 'IDEA209H', teaches: false }],
	prefs: { hidden: ['robotics', 'nonsense'], hiddenSections: [B, 'not-a-uuid'] },
	events: [
		{ id: 'due:1', layer: 'classes', kind: 'due', title: 'Launcher plan', day: '2026-11-02', section_ids: [A] },
		{ id: 'due:2', layer: 'classes', kind: 'due', title: 'Blade CAD 02', day: '2026-10-30', section_ids: [B] },
		{ id: 'event:1', layer: 'robotics', kind: 'event', title: 'Beach Blitz', day: '2026-10-30', end_day: '2026-11-01' },
		{ id: 'event:2', layer: 'idea', kind: 'event', title: 'Open lab', day: '2026-10-29', start_time: '15:30' },
		{ id: 'bad', layer: 'classes', title: 'No day' },
		{ id: 'pace:1', layer: 'pacing', kind: 'pacing', title: 'Sketch', day: '2026-10-28', section_ids: [A, B] }
	]
})!;

describe('the feed and the choices', () => {
	it('reads the feed, dropping an event it cannot draw, and the choices against the union', () => {
		expect(feed.events.map((e) => e.id)).toEqual(['due:1', 'due:2', 'event:1', 'event:2', 'pace:1']);
		expect(feed.prefs).toEqual({ hidden: ['robotics'], hiddenSections: [B] });
		expect(readCalendarPrefs(null)).toEqual({ hidden: [], hiddenSections: [] });
		expect(storedCalendarPrefs({ hidden: [], hiddenSections: [] })).toBeUndefined();
		expect(parseCalendarFeed({ ok: false })).toBeNull();
	});

	it('a hidden layer and a hidden class are gone; everything else is there', () => {
		const ids = visibleEvents(feed.events, feed.prefs).map((e) => e.id);
		expect(ids).toEqual(['due:1', 'event:2', 'pace:1']);
		// Positive control: with nothing hidden, all of them.
		expect(visibleEvents(feed.events, { hidden: [], hiddenSections: [] })).toHaveLength(5);
		// One class's calendar: only that class's class events, and everyone's program events.
		expect(visibleEvents(feed.events, { hidden: [], hiddenSections: [] }, B).map((e) => e.id)).toEqual(['due:2', 'event:1', 'event:2', 'pace:1']);
	});

	it("a shared post's link opens the class whose page it is on, not the post's first class", () => {
		const shared = { ...feed.events[0], itemId: 'item-1', sectionIds: [A, B] } as CalendarEvent;
		expect(eventHref(shared, '/classroom', B)).toBe(`/classroom/${B}/item/item-1`);
		expect(eventHref({ ...shared, kind: 'signoff' }, '/classroom', B)).toBe(`/classroom/${B}/plan`);
		// With no class page, or a class the post is not in, the first class as before.
		expect(eventHref(shared)).toBe(`/classroom/${A}/item/item-1`);
		expect(eventHref(shared, '/classroom', 'elsewhere')).toBe(`/classroom/${A}/item/item-1`);
	});

	it("a day's events put what is owed first, and a multi-day event is on every day it spans", () => {
		const day = eventsOnDay(
			[
				...feed.events,
				{ ...feed.events[2], id: 'school:x', layer: 'school', kind: 'external', title: 'A', day: '2026-10-31', endDay: null } as CalendarEvent
			],
			'2026-10-31'
		);
		expect(day.map((e) => e.id)).toEqual(['event:1', 'school:x']);
		expect(eventsOnDay(feed.events, '2026-10-30').map((e) => e.id)).toEqual(['due:2', 'event:1']);
	});
});

describe('days', () => {
	it('a month grid runs Sunday to Saturday and only as many weeks as the month needs', () => {
		expect(monthGrid('2026-10').length).toBe(5);
		expect(monthGrid('2026-10')[0][0]).toBe('2026-09-27');
		expect(monthGrid('2026-08').length).toBe(6);
		expect(monthGridBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-12' });
		expect(monthPlus('2026-12', 1)).toBe('2027-01');
		expect(monthPlus('2027-01', -1)).toBe('2026-12');
	});

	it('the school week is this one on a weekday and the next one on a weekend', () => {
		expect(schoolWeek('2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
		expect(schoolWeek('2026-10-31')[0]).toBe('2026-11-02');
		expect(schoolWeek('2026-11-01')[0]).toBe('2026-11-02');
	});
});

describe('an assignment\'s plan, judged for one student', () => {
	const pacing = parseItemPacing({
		ok: true,
		today: '2026-10-28',
		due_at: '2026-11-03T07:59:59Z',
		pacing: [
			{ id: 'd1', title: 'Brief', day: '2026-10-23', modules: ['brief'] },
			{ id: 'd2', title: 'Roles', day: '2026-10-26', modules: ['roles'] },
			{ id: 'd3', title: 'Sketch', day: '2026-10-28', modules: ['sketch'] },
			{ id: 'd4', title: 'Energy', day: '2026-10-29', modules: ['energy'] },
			{ id: 'd5', title: 'Review', day: '2026-11-02', modules: [] },
			{ id: 'bad', title: 'No day' }
		]
	})!;
	const rail = (done: string[]) =>
		({ modules: ['brief', 'roles', 'sketch', 'energy'].map((id) => ({ id, weight: 1, done: done.includes(id) })) }) as unknown as HxProgress;

	it('done follows the rail, behind is past and not done, then today, next and later', () => {
		const s = hxScheduleFor(pacing, rail(['brief', 'energy']));
		expect(s.pacing.map((p) => [p.id, p.state])).toEqual([
			['d1', 'done'],
			['d2', 'behind'],
			['d3', 'today'],
			['d4', 'done'],
			['d5', 'later']
		]);
		expect(s.due).toEqual({ at: '2026-11-03T07:59:59Z', day: '2026-11-02' });
		// No rail (a manager's read): dates alone; a step with no modules is never done.
		expect(hxScheduleFor(pacing, null).pacing.map((p) => p.state)).toEqual(['behind', 'behind', 'today', 'later', 'later']);
	});

	it('`schedule` rides on idea:state when there is one and is absent otherwise', () => {
		const s = hxScheduleFor(pacing, null);
		expect(hxStateMessage({}, {}, false, s)).toEqual({ type: 'idea:state', values: {}, images: {}, readOnly: false, schedule: s });
		expect(hxStateMessage({}, {}, false)).toEqual({ type: 'idea:state', values: {}, images: {}, readOnly: false });
		expect('schedule' in hxStateMessage({}, {}, false, null)).toBe(false);
	});
});

describe('the subscription address', () => {
	it('is the feed route on this site, and its webcal twin', () => {
		expect(subscriptionUrls('https://ideabosco.com', 'f'.repeat(64))).toEqual({
			https: `https://ideabosco.com/api/calendar/feed/${'f'.repeat(64)}.ics`,
			webcal: `webcal://ideabosco.com/api/calendar/feed/${'f'.repeat(64)}.ics`
		});
	});
});
