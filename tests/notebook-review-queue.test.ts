// tests/notebook-review-queue.test.ts
//
// REVIEW IN ONE PASS (ledger 0297, package F4b): the approve queue is an
// EXCLUSION FILTER, and an exclusion filter that is wrong is invisible -- an
// entry that silently drops out of "new since you last looked" is an entry a
// teacher never reads, and a flagged entry that silently drops IN is a flag
// withdrawn by "approve all" without anybody reading the resubmission. So each
// exclusion is asserted with its positive control beside it, and the
// preference that carries "last looked" is asserted to survive a stored value
// it did not write.

import { describe, expect, it } from 'vitest';
import {
	approveAction,
	cleanComments,
	queueDefaultSession,
	recordLook,
	reviewQueue
} from '$lib/notebook/review-queue';
import type { GridCell, SectionGrid } from '$lib/notebook-review';
import {
	LAST_LOOKED_MAX,
	NOTEBOOK_COMMENT_SEEDS,
	defaultClassroomPreferences,
	readClassroomPreferences
} from '$lib/preferences/classroom';

function cell(over: Partial<GridCell>): GridCell {
	return {
		student_key: 'k-a',
		student_id: 'u-a',
		session_id: 'day-2',
		status: 'on_time' as GridCell['status'],
		entry_id: 'e-a',
		entry_count: 1,
		upload_timestamp: '2026-09-23T17:00:00Z',
		on_time: true,
		excused: false,
		flag_reason: null,
		reviewed: false,
		...over
	} as GridCell;
}

function grid(cells: GridCell[]): SectionGrid {
	return {
		section: { id: 's-1' } as SectionGrid['section'],
		unit_number: null,
		generated_at: '2026-09-23T20:00:00Z',
		sessions: [
			{ id: 'day-1', unit_number: 1, session_date: '2026-09-22', session_label: 'Day 1' },
			{ id: 'day-2', unit_number: 1, session_date: '2026-09-23', session_label: 'Day 2' },
			{ id: 'day-3', unit_number: 1, session_date: '2026-09-25', session_label: 'Day 3' }
		],
		students: [
			{ student_key: 'k-b', name: 'Ben Ortiz' },
			{ student_key: 'k-a', name: 'Ana Reyes' },
			{ student_key: 'k-c', name: 'Chloe Nguyen' },
			{ student_key: 'k-d', name: 'Dev Patel' },
			{ student_key: 'k-e', name: 'Eli Stone' }
		] as SectionGrid['students'],
		cells
	};
}

const LOOKED = '2026-09-23T16:00:00Z';
const G = grid([
	cell({ student_key: 'k-a', entry_id: 'e-new', upload_timestamp: '2026-09-23T17:00:00Z' }),
	cell({ student_key: 'k-b', entry_id: 'e-old', upload_timestamp: '2026-09-23T15:00:00Z' }),
	cell({ student_key: 'k-c', entry_id: 'e-flag', status: 'flagged' as GridCell['status'], flag_reason: 'not_dated' }),
	cell({ student_key: 'k-d', entry_id: 'e-seen', reviewed: true }),
	cell({ student_key: 'k-e', entry_id: 'e-unknown', reviewed: undefined }),
	cell({ student_key: 'k-a', session_id: 'day-1', entry_id: 'e-otherday' }),
	cell({ student_key: 'k-b', session_id: 'day-2', entry_id: null, status: 'missing' as GridCell['status'] })
]);

describe('the approve queue for one class day', () => {
	it('"all" holds every unreviewed, unflagged entry of that day, in roster order', () => {
		const ids = reviewQueue(G, 'day-2', LOOKED, 'all').map((r) => r.entryId);
		// Positive controls: the two plain entries and the cannot-tell one are IN.
		expect(ids).toEqual(['e-old', 'e-new', 'e-unknown']);
	});

	it('leaves out a flagged entry, a reviewed one, an empty cell and another day', () => {
		const ids = reviewQueue(G, 'day-2', LOOKED, 'all').map((r) => r.entryId);
		for (const out of ['e-flag', 'e-seen', 'e-otherday']) expect(ids).not.toContain(out);
		expect(reviewQueue(G, 'day-2', LOOKED, 'all').length).toBe(3);
	});

	it('"new" keeps only what was uploaded after the last look, and says which rows are new', () => {
		const rows = reviewQueue(G, 'day-2', LOOKED, 'new');
		expect(rows.map((r) => r.entryId)).toEqual(['e-new', 'e-unknown']);
		// Positive control: the older entry is still there under "all", marked not new.
		const old = reviewQueue(G, 'day-2', LOOKED, 'all').find((r) => r.entryId === 'e-old');
		expect(old?.isNew).toBe(false);
	});

	it('with no last look, everything is new', () => {
		expect(reviewQueue(G, 'day-2', null, 'new').map((r) => r.entryId)).toEqual(['e-old', 'e-new', 'e-unknown']);
	});

	it("opens on today's check-in, else the latest past one", () => {
		expect(queueDefaultSession(G, '2026-09-23')).toBe('day-2');
		expect(queueDefaultSession(G, '2026-09-24')).toBe('day-2');
		expect(queueDefaultSession(G, '2026-09-01')).toBe('day-1');
		expect(queueDefaultSession(null, '2026-09-23')).toBeNull();
	});

	it('an approval with a next step is a resolve (it carries the comment); without one it is an acknowledgement', () => {
		expect(approveAction('Date every entry.')).toBe('resolve');
		expect(approveAction('   ')).toBe('accept');
		expect(approveAction(null)).toBe('accept');
	});
});

describe('the reviewer\'s own defaults', () => {
	it('last looked is per class, moves to now, and keeps the newest when capped', () => {
		const now = new Date('2026-09-23T20:00:00Z');
		const before: Record<string, string> = {};
		for (let i = 0; i < LAST_LOOKED_MAX; i++) before[`s-${i}`] = new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString();
		const after = recordLook(before, 's-new', now);
		expect(Object.keys(after).length).toBe(LAST_LOOKED_MAX);
		expect(after['s-new']).toBe(now.toISOString());
		expect(after['s-0']).toBeUndefined();
	});

	it('the chips start as the notebook-practice seeds, and an edited list is the reviewer\'s own', () => {
		expect(defaultClassroomPreferences().notebookReview.comments).toEqual([...NOTEBOOK_COMMENT_SEEDS]);
		expect(cleanComments(['  Label the sketch. ', '', 'Label the sketch.', 'State the next test.'])).toEqual([
			'Label the sketch.',
			'State the next test.'
		]);
		// An emptied list stays empty: the reviewer removed them on purpose.
		expect(readClassroomPreferences({ notebookReview: { comments: [] } }).notebookReview.comments).toEqual([]);
	});

	it('a stored value it did not write is dropped, never trusted', () => {
		const read = readClassroomPreferences({
			notebookReview: {
				lastLooked: { 's-1': '2026-09-23T16:00:00Z', 'bad key!': '2026-09-23T16:00:00Z', 's-2': 'yesterday' },
				comments: 'not a list'
			}
		});
		expect(read.notebookReview.lastLooked).toEqual({ 's-1': '2026-09-23T16:00:00Z' });
		expect(read.notebookReview.comments).toEqual([...NOTEBOOK_COMMENT_SEEDS]);
	});
});
