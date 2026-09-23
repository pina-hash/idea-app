// tests/notebook-timeline.test.ts
//
// A NOTEBOOK THAT GIVES BACK (ledger 0297, package F4b): one class's timeline
// stitches entries, hand-ins and the photos put into assignments. The claim
// worth pinning is that assignment photos COUNT here without being copied --
// a student never photographs a page twice -- and that the streak is the
// student's own, with today not yet filed never breaking it.

import { describe, expect, it } from 'vitest';
import { buildTimeline, classDayStreak, timelineDayLabel } from '$lib/notebook/timeline';
import type { NotebookEntry } from '$lib/notebook';

function entry(id: string, at: string, over: Partial<NotebookEntry> = {}): NotebookEntry {
	return {
		id,
		session_id: null,
		section_id: 's-1',
		folder_id: null,
		pinned_at: null,
		custom_label: 'Gearbox',
		upload_timestamp: at,
		submitted_at: at,
		status: 'compliant',
		flag_reason: null,
		instructor_comment: null,
		session: null,
		photos: [],
		notes: [],
		...over
	};
}

describe('the timeline', () => {
	const days = buildTimeline({
		entries: [entry('e1', '2026-09-22T18:00:00Z'), entry('e2', '2026-09-23T17:00:00Z', { submitted_at: null })],
		items: [
			{ id: 'i1', title: 'Gearbox teardown', kind: 'assignment' },
			{ id: 'i2', title: 'Truss', kind: 'assignment' }
		],
		submissions: [
			{ id: 'sub1', item_id: 'i1', state: 'submitted', submitted_at: '2026-09-23T19:00:00Z', returned_at: null },
			{ id: 'sub2', item_id: 'i2', state: 'draft', submitted_at: null, returned_at: null },
			{ id: 'sub3', item_id: 'gone', state: 'submitted', submitted_at: '2026-09-23T19:00:00Z', returned_at: null }
		],
		files: [
			{ id: 'f1', submission_id: 'sub1', block_id: 'z1', filename: 'p1.jpg', created_at: '2026-09-23T18:00:00Z', image: true },
			{ id: 'f2', submission_id: 'sub1', block_id: 'z1', filename: 'p2.jpg', created_at: '2026-09-23T18:05:00Z', image: true },
			{ id: 'f3', submission_id: 'sub1', block_id: null, filename: 'model.sldprt', created_at: '2026-09-23T18:06:00Z', image: false },
			{ id: 'f4', submission_id: 'sub2', block_id: 'z1', filename: 'truss.jpg', created_at: '2026-09-22T20:00:00Z', image: true }
		]
	});

	it('groups by school day, newest first, and stitches all three kinds', () => {
		expect(days.map((d) => d.day)).toEqual(['2026-09-23', '2026-09-22']);
		expect(days[0].events.map((e) => e.kind)).toEqual(['hand-in', 'photos', 'entry']);
		expect(days[1].events.map((e) => e.kind)).toEqual(['photos', 'entry']);
	});

	it("an assignment's photos count, as one event per assignment per day, and never a non-picture", () => {
		const photos = days[0].events.find((e) => e.kind === 'photos');
		expect(photos && photos.kind === 'photos' ? photos.files.map((f) => f.id) : []).toEqual(['f1', 'f2']);
		// A photo in a draft hand-in still counts: it is on paper and in the assignment.
		expect(days[1].events.some((e) => e.kind === 'photos')).toBe(true);
	});

	it('a hand-in on an item not in this class is not listed, and an unsent one is not a hand-in', () => {
		const handIns = days.flatMap((d) => d.events).filter((e) => e.kind === 'hand-in');
		expect(handIns.map((e) => e.id)).toEqual(['hand-in:sub1']);
	});

	it('labels today in words and every other day without a weekday', () => {
		expect(timelineDayLabel('2026-09-23', '2026-09-23')).toBe('Today');
		expect(timelineDayLabel('2026-09-22', '2026-09-23')).toBe('Sep 22');
	});
});

describe('the streak', () => {
	const classDays = [
		{ session_id: 'a', session_date: '2026-09-18' },
		{ session_id: 'b', session_date: '2026-09-21' },
		{ session_id: 'c', session_date: '2026-09-22' },
		{ session_id: 'd', session_date: '2026-09-23' },
		{ session_id: 'e', session_date: '2026-09-25' }
	];

	it('counts class days in a row back from the latest, by check-in or by the day filed', () => {
		const entries = [
			entry('x', '2026-09-22T18:00:00Z'),
			entry('y', '2026-09-10T18:00:00Z', { session_id: 'b' }),
			entry('z', '2026-09-23T17:00:00Z')
		];
		expect(classDayStreak(entries, classDays, '2026-09-23')).toBe(3);
	});

	it('today with nothing filed yet does not break it; a missed day does', () => {
		const entries = [entry('x', '2026-09-22T18:00:00Z'), entry('y', '2026-09-21T18:00:00Z')];
		expect(classDayStreak(entries, classDays, '2026-09-23')).toBe(2);
		expect(classDayStreak([entry('x', '2026-09-22T18:00:00Z')], classDays, '2026-09-23')).toBe(1);
		expect(classDayStreak([entry('x', '2026-09-18T18:00:00Z')], classDays, '2026-09-23')).toBe(0);
	});

	it('a class day not reached yet never counts, and no check-ins is no streak', () => {
		expect(classDayStreak([entry('x', '2026-09-25T18:00:00Z')], classDays, '2026-09-23')).toBe(0);
		expect(classDayStreak([entry('x', '2026-09-23T18:00:00Z')], [], '2026-09-23')).toBe(0);
	});
});
