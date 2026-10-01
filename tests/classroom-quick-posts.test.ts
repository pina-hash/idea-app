// tests/classroom-quick-posts.test.ts
//
// QUICK POSTS (ledger 0360, report R22): the pure layer, at pinned instants.
//
// What would regress SILENTLY, which is why it is a test:
//
//   1. A preset that resolves to the wrong instant posts a notice that comes
//      down at the wrong time on every student's page, and nothing on screen
//      says it was wrong until the class reads a stale schedule. Every preset
//      is asserted at instants where the obvious arithmetic disagrees with the
//      school's: 8pm Pacific (a different UTC day), a minute either side of
//      Friday's 3:00 PM, a Saturday, and the clock change on 2026-11-01.
//   2. "All my classes" filtering on management instead of on the viewer's own
//      classes is one press that posts to every class in the school for an
//      admin. Asserted both directions, with the admin who teaches none as the
//      fallback case.
//   3. A link that is not http(s) must stay text. Asserted with javascript:
//      and data: beside an https control.
//   4. A notice is hidden the moment its end passes, from the end the read
//      carried: asserted a millisecond either side.
//
// The expected instants are written out by hand from the calendar (2026-11-01
// is the first Sunday of November, when Pacific time falls back to UTC-8), not
// computed with the module under test.

import { describe, expect, it } from 'vitest';
import {
	QUICK_POSTS_POLL_MS,
	QUICK_POST_MAX_CHARS,
	QUICK_POST_PRESETS,
	parseQuickPostBoard,
	quickPostCustomInstant,
	quickPostExpiry,
	quickPostLinks,
	quickPostNextChange,
	quickPostPostedWords,
	quickPostPresetHint,
	quickPostRuns,
	quickPostSendCheck,
	quickPostSendLabel,
	quickPostShowing,
	quickPostSkewMs,
	quickPostTargets,
	quickPostUntilWords,
	type QuickPostPresetId
} from '../src/lib/classroom/quick-posts';
import {
	SCHOOL_DAY_END_MINUTES,
	schoolDayEnd,
	schoolDayPlus,
	schoolWallInstant,
	schoolWeekday
} from '../src/lib/classroom/school-calendar';
import type { ClassroomSection } from '../src/lib/classroom/classroom';
import { defaultPokeGapMs } from '../src/lib/classroom/poll';

const at = (iso: string) => Date.parse(iso);
const ends = (preset: QuickPostPresetId, now: string, custom?: string) => {
	const e = quickPostExpiry(preset, at(now), custom);
	return e.ok ? e.expiresAt : `refused: ${e.refusal}`;
};

describe('the school calendar helpers the presets stand on', () => {
	it('3:00 PM is the school day end, and there is no bell schedule behind it', () => {
		expect(SCHOOL_DAY_END_MINUTES).toBe(900);
	});

	it('a wall time converts with the zone of its own day, on both sides of the clock change', () => {
		// Pacific Daylight Time (UTC-7) on Saturday, Pacific Standard (UTC-8) the next day.
		expect(schoolWallInstant('2026-10-31', 900)).toBe('2026-10-31T22:00:00.000Z');
		expect(schoolWallInstant('2026-11-01', 900)).toBe('2026-11-01T23:00:00.000Z');
		expect(schoolWallInstant('2026-10-31', 900, 2)).toBe('2026-11-02T23:00:00.000Z');
		expect(schoolWallInstant('not a day', 900)).toBeNull();
		// schoolDayEnd shares the one conversion and still answers as before.
		expect(schoolDayEnd('2026-11-01')).toBe('2026-11-02T07:59:59.999Z');
		expect(schoolDayEnd('2026-08-27')).toBe('2026-08-28T06:59:59.999Z');
	});

	it('weekday numbers and day arithmetic', () => {
		expect(schoolWeekday('2026-11-01')).toBe(0); // a Sunday
		expect(schoolWeekday('2026-09-25')).toBe(5); // a Friday
		expect(schoolWeekday('2026-09-26')).toBe(6); // a Saturday
		expect(schoolDayPlus('2026-12-31', 1)).toBe('2027-01-01');
		expect(schoolDayPlus('2026-03-01', -1)).toBe('2026-02-28');
		expect(schoolDayPlus('nope', 1)).toBeNull();
	});
});

describe('each preset resolves to the school instant a teacher means', () => {
	it('at 8pm Pacific on a Thursday, which is already Friday in UTC', () => {
		const now = '2026-08-28T03:00:00.000Z'; // Thu Aug 27, 8:00 PM PDT
		expect(ends('school-day', now)).toBe('2026-08-28T22:00:00.000Z'); // Fri 3 PM: today's has passed
		expect(ends('next-school-day', now)).toBe('2026-08-31T22:00:00.000Z'); // Mon 3 PM
		expect(ends('week', now)).toBe('2026-08-28T22:00:00.000Z'); // this Fri 3 PM
		expect(ends('next-week', now)).toBe('2026-09-04T22:00:00.000Z');
		expect(ends('hour', now)).toBe('2026-08-28T04:00:00.000Z');
		expect(ends('forever', now)).toBeNull();
	});

	it('a minute before and a minute after Friday 3:00 PM', () => {
		const before = '2026-09-25T21:59:00.000Z'; // Fri 2:59 PM PDT
		expect(ends('school-day', before)).toBe('2026-09-25T22:00:00.000Z');
		expect(ends('week', before)).toBe('2026-09-25T22:00:00.000Z');
		expect(ends('next-school-day', before)).toBe('2026-09-28T22:00:00.000Z');
		expect(ends('next-week', before)).toBe('2026-10-02T22:00:00.000Z');

		const after = '2026-09-25T22:01:00.000Z'; // Fri 3:01 PM PDT
		expect(ends('school-day', after)).toBe('2026-09-28T22:00:00.000Z'); // Monday's
		expect(ends('week', after)).toBe('2026-10-02T22:00:00.000Z'); // next Friday
		expect(ends('next-school-day', after)).toBe('2026-09-29T22:00:00.000Z');
		expect(ends('next-week', after)).toBe('2026-10-09T22:00:00.000Z');
	});

	it('on a Saturday the school day and the week are next week', () => {
		const sat = '2026-09-26T17:00:00.000Z'; // Sat 10:00 AM PDT
		expect(ends('school-day', sat)).toBe('2026-09-28T22:00:00.000Z');
		expect(ends('week', sat)).toBe('2026-10-02T22:00:00.000Z');
		// Sunday looks ahead to the coming Friday, not the one after it.
		expect(ends('week', '2026-09-27T17:00:00.000Z')).toBe('2026-10-02T22:00:00.000Z');
	});

	it('across the clock change: posted Friday after school, the end is Monday 3 PM in standard time', () => {
		const fri = '2026-10-30T23:00:00.000Z'; // Fri Oct 30, 4:00 PM PDT
		expect(ends('school-day', fri)).toBe('2026-11-02T23:00:00.000Z'); // Mon 3 PM PST
		expect(ends('week', fri)).toBe('2026-11-06T23:00:00.000Z');
	});

	it('a picked date and time is SCHOOL time, and refuses the past and more than a year out', () => {
		const now = '2026-10-01T16:00:00.000Z'; // Thu Oct 1, 9:00 AM PDT
		expect(quickPostCustomInstant('2026-10-03T14:30')).toBe('2026-10-03T21:30:00.000Z');
		expect(quickPostCustomInstant('2026-12-03T14:30')).toBe('2026-12-03T22:30:00.000Z');
		expect(ends('custom', now, '2026-10-03T14:30')).toBe('2026-10-03T21:30:00.000Z');
		expect(ends('custom', now, '2026-10-01T08:00')).toBe('refused: That end time has already passed. Pick a later one.');
		expect(ends('custom', now, '2028-01-01T08:00')).toMatch(/^refused: A quick post can stay up for at most a year/);
		expect(ends('custom', now, '')).toBe('refused: Pick the date and time this notice should come down.');
		expect(ends('custom', now, '2026-10-03T25:30')).toMatch(/^refused:/);
	});

	it('the default preset is listed first and every preset has a hint', () => {
		expect(QUICK_POST_PRESETS[0].id).toBe('school-day');
		const now = at('2026-09-24T17:00:00.000Z'); // Thu 10 AM PDT
		const hints = QUICK_POST_PRESETS.map((p) => quickPostPresetHint(p.id, now));
		expect(hints).toEqual([
			'3:00 PM today',
			'11:00 AM today',
			'3:00 PM tomorrow',
			'3:00 PM tomorrow',
			'Oct 2, 3:00 PM',
			'No end',
			'Any date and time'
		]);
		// No weekday is ever named in this copy.
		expect(hints.join(' ')).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
	});
});

describe('the words a student reads', () => {
	const now = at('2026-08-28T03:00:00.000Z'); // Thu Aug 27, 8 PM PDT
	it('today, tomorrow, a date, and taken down', () => {
		expect(quickPostUntilWords('2026-08-28T04:00:00.000Z', now)).toBe('Until 9:00 PM today');
		expect(quickPostUntilWords('2026-08-28T22:00:00.000Z', now)).toBe('Until 3:00 PM tomorrow');
		expect(quickPostUntilWords('2026-09-04T22:00:00.000Z', now)).toBe('Until Sep 4, 3:00 PM');
		expect(quickPostUntilWords(null, now)).toBe('Until taken down');
	});

	it('the acknowledgement keeps its capitals after "until"', () => {
		expect(quickPostPostedWords(5, '2026-09-04T22:00:00.000Z', now)).toBe('Posted to 5 classes, until Sep 4, 3:00 PM.');
		expect(quickPostPostedWords(1, null, now)).toBe('Posted to 1 class, until taken down.');
		expect(quickPostSendLabel(1)).toBe('Post to 1 class');
		expect(quickPostSendLabel(4)).toBe('Post to 4 classes');
	});
});

describe('a notice disappears on its own at its end', () => {
	const post = { expires_at: '2026-09-25T22:00:00.000Z' };
	it('showing a millisecond before, gone a millisecond after, forever never goes', () => {
		expect(quickPostShowing(post, at(post.expires_at) - 1)).toBe(true);
		expect(quickPostShowing(post, at(post.expires_at))).toBe(false);
		expect(quickPostShowing(post, at(post.expires_at) + 1)).toBe(false);
		expect(quickPostShowing({ expires_at: null }, at('2030-01-01T00:00:00Z'))).toBe(true);
	});

	it('the next change is the soonest end ahead, or the next school midnight', () => {
		const now = at('2026-09-25T17:00:00.000Z'); // Fri 10 AM PDT
		expect(quickPostNextChange([post, { expires_at: null }], now)).toBe(at(post.expires_at));
		// Nothing ends today: the words change at midnight at school (07:00Z in PDT).
		expect(quickPostNextChange([{ expires_at: null }], now)).toBe(at('2026-09-26T07:00:00.000Z'));
		expect(quickPostNextChange([], now)).toBeNull();
	});

	it('a server clock a few minutes off corrects the device; an old read does not', () => {
		const device = at('2026-09-25T17:00:00.000Z');
		expect(quickPostSkewMs('2026-09-25T17:03:00.000Z', device)).toBe(180_000);
		expect(quickPostSkewMs('2026-09-25T14:00:00.000Z', device)).toBe(0);
		expect(quickPostSkewMs('garbage', device)).toBe(0);
	});
});

describe('links are http(s) only, through safeHref, and never the whole notice', () => {
	it('finds the link, trims the sentence around it, and leaves other schemes as text', () => {
		const runs = quickPostRuns('Schedule: https://docs.google.com/d/abc). Or javascript:alert(1) or data:text/html,x');
		expect(runs.filter((r) => r.href).map((r) => r.href)).toEqual(['https://docs.google.com/d/abc']);
		expect(runs.map((r) => r.text).join('')).toBe(
			'Schedule: https://docs.google.com/d/abc). Or javascript:alert(1) or data:text/html,x'
		);
		// Positive control for the trim: a balanced bracket stays in the link.
		expect(quickPostRuns('see https://en.wikipedia.org/wiki/Truss_(engineering).')[1].href).toBe(
			'https://en.wikipedia.org/wiki/Truss_(engineering)'
		);
	});

	it('one Open key per link up to three, and none past three', () => {
		expect(quickPostLinks('a https://www.canva.com/x b https://canva.com/x c https://docs.google.com/y')).toEqual([
			{ href: 'https://www.canva.com/x', host: 'canva.com' },
			{ href: 'https://canva.com/x', host: 'canva.com' },
			{ href: 'https://docs.google.com/y', host: 'docs.google.com' }
		]);
		expect(quickPostLinks('https://a.com https://b.com https://c.com https://d.com')).toEqual([]);
		expect(quickPostLinks('no links here')).toEqual([]);
	});
});

describe('All my classes is the viewer’s own classes, never everything they manage', () => {
	const course = { id: 'c', code: 'IDEA100', title: 'Intro to IDEA', active: true };
	const s = (id: string, teacher: string, active = true): ClassroomSection => ({
		id,
		course_id: 'c',
		label: `Section ${id}`,
		block: id,
		teacher_email: teacher,
		active,
		course
	});
	const SECTIONS = [s('1', 'APina@boscotech.edu'), s('2', 'apina@boscotech.edu'), s('3', 'other@boscotech.edu'), s('4', 'apina@boscotech.edu', false)];

	it('keeps only the viewer’s active classes, case-insensitively', () => {
		const t = quickPostTargets(SECTIONS, 'apina@boscotech.edu', '1');
		expect(t.mine.map((x) => x.id)).toEqual(['1', '2']);
		expect(t.choices.map((x) => x.id)).toEqual(['1', '2']);
		// Positive control: the other teacher's class and the archived one were there to drop.
		expect(SECTIONS.map((x) => x.id)).toContain('3');
		expect(t.current?.id).toBe('1');
	});

	it('an admin who teaches none is offered no All my classes, and chooses from what they manage', () => {
		const t = quickPostTargets(SECTIONS, 'admin@boscotech.edu', '3');
		expect(t.mine).toEqual([]);
		expect(t.choices.map((x) => x.id)).toEqual(['1', '2', '3']);
	});

	it('the class on screen is always a choice, even when it is not the viewer’s', () => {
		const t = quickPostTargets(SECTIONS, 'apina@boscotech.edu', '3');
		expect(t.choices.map((x) => x.id)).toEqual(['3', '1', '2']);
	});
});

describe('one predicate decides whether Post can send', () => {
	const now = at('2026-09-24T17:00:00.000Z');
	const draft = { body: '  Special schedule today  \n', preset: 'school-day' as const, custom: '', sectionIds: ['b', 'a', 'a'] };
	it('trims like the database, dedupes and sorts the classes, and resolves the end', () => {
		expect(quickPostSendCheck(draft, now)).toEqual({
			ok: true,
			body: 'Special schedule today',
			expiresAt: '2026-09-24T22:00:00.000Z',
			sectionIds: ['a', 'b']
		});
	});
	it('refuses blank, too long, no class, and a passed custom end, each in words', () => {
		expect(quickPostSendCheck({ ...draft, body: ' \n\t ' }, now)).toEqual({ ok: false, reason: 'Write something to post first.' });
		expect(quickPostSendCheck({ ...draft, body: 'x'.repeat(QUICK_POST_MAX_CHARS + 1) }, now).ok).toBe(false);
		expect(quickPostSendCheck({ ...draft, body: 'x'.repeat(QUICK_POST_MAX_CHARS) }, now).ok).toBe(true);
		expect(quickPostSendCheck({ ...draft, sectionIds: [] }, now)).toEqual({ ok: false, reason: 'Choose at least one class to post to.' });
		expect(quickPostSendCheck({ ...draft, preset: 'custom', custom: '2026-09-01T08:00' }, now).ok).toBe(false);
	});
});

describe('the payload is parsed, and a malformed row is dropped rather than coerced', () => {
	it('keeps the good rows and drops the rest', () => {
		const board = parseQuickPostBoard({
			ok: true,
			manages: true,
			now: '2026-09-24T17:00:00.000Z',
			posts: [
				{ id: 'p1', body: 'Hello', created_at: '2026-09-24T16:00:00Z', expires_at: null, section_ids: ['s1'], can_take_down: true },
				{ id: 'p2', body: 'Bad end', created_at: '2026-09-24T16:00:00Z', expires_at: 'soon', section_ids: null, can_take_down: false },
				{ id: '', body: 'No id', created_at: '2026-09-24T16:00:00Z', expires_at: null },
				{ id: 'p4', body: '   ', created_at: '2026-09-24T16:00:00Z', expires_at: null },
				'not a row'
			]
		});
		expect(board?.posts.map((p) => p.id)).toEqual(['p1']);
		expect(board?.manages).toBe(true);
		expect(parseQuickPostBoard({ ok: false })).toBeNull();
		expect(parseQuickPostBoard(null)).toBeNull();
	});
});

describe('the poll is a budget', () => {
	it('ten minutes, so a tab return re-reads at most once every two and a half', () => {
		expect(QUICK_POSTS_POLL_MS).toBe(600_000);
		expect(60_000 / QUICK_POSTS_POLL_MS).toBeCloseTo(0.1, 10);
		expect(defaultPokeGapMs(QUICK_POSTS_POLL_MS)).toBe(150_000);
	});
});
