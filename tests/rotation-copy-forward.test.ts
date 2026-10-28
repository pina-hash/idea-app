// tests/rotation-copy-forward.test.ts
//
// Ledger 0455: the class page's reading of 0318's copy-forward answer. Pure:
// the plan is read, worded and summarized without recomputing any date (the
// date rule is the database's, proven in tests/db/rotation-copy-forward-0318.test.ts).

import { describe, expect, it } from 'vitest';
import { actionWords, dayWords, dueWords, parseCopyPlan, parseCopyResult, planSummary, type CopyPlan } from '../src/lib/classroom/copy-forward';

const RAW = {
	ok: true,
	from: { id: 's2', label: 'Section 2', first_day: '2026-09-28' },
	to: { id: 's3', label: 'Section 3', first_day: '2026-10-29' },
	counts: { copy: 2, share: 1, skip: 1 },
	posts: [
		{ id: 'a', title: 'IDEA-Blade 02', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-06T06:59:00+00:00', new_due: '2026-11-05T07:59:00+00:00', pacing_steps: 2, checkpoints: 1 },
		{ id: 'b', title: 'Unfinished', kind: 'assignment', action: 'copy', draft: true, live: false, classes: ['Section 2'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 },
		{ id: 'c', title: 'Mascot Pack', kind: 'material', action: 'share', draft: false, live: true, classes: ['Section 2', 'Block 2'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 },
		{ id: 'd', title: 'Syllabus', kind: 'material', action: 'already_there', draft: false, live: true, classes: ['Section 2', 'Section 3'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 },
		{ title: 'no id, dropped' }
	]
};

describe('the copy plan', () => {
	it('reads every post and drops one with no id', () => {
		const plan = parseCopyPlan(RAW) as CopyPlan;
		expect(plan.ok).toBe(true);
		expect(plan.posts.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(plan.posts[0]).toMatchObject({ pacingSteps: 2, checkpoints: 1, oldDue: '2026-10-06T06:59:00+00:00' });
	});

	it('dates read in school time, never the browser zone', () => {
		expect(dueWords('2026-11-05T07:59:00+00:00')).toBe('Wed, Nov 4, 11:59 PM');
		expect(dueWords(null)).toBe('No due date');
		expect(dayWords('2026-10-29')).toBe('Thu, Oct 29');
	});

	it('each post says what happens to it, and a draft says it stays one', () => {
		const plan = parseCopyPlan(RAW) as CopyPlan;
		expect(plan.posts.map(actionWords)).toEqual([
			'Copied as a draft',
			'Copied, stays a draft',
			'Shared, one post in both',
			'Already in the new class'
		]);
	});

	it('the summary counts drafts, or scheduled posts when publishing is ticked', () => {
		const plan = parseCopyPlan(RAW) as CopyPlan;
		expect(planSummary(plan, false)).toBe('2 posts copied as drafts, 1 shared, 1 already there.');
		expect(planSummary(plan, true)).toBe('2 posts copied, 1 scheduled to open on their new days, 1 shared, 1 already there.');
	});

	it('a refusal is worded for the teacher', () => {
		expect(parseCopyPlan({ ok: false, reason: 'same_class' })).toEqual({ ok: false, reason: 'same_class', message: 'Pick a different class to copy into.' });
		expect(parseCopyResult({ ok: true, copied: 3, shared: 1, skipped: 0 })).toEqual({ ok: true, copied: 3, shared: 1, skipped: 0 });
		expect(parseCopyResult('junk')).toMatchObject({ ok: false });
	});
});
