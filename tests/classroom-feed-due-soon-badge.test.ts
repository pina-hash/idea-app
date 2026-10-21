// A teacher's to-grade badge counts only work that is awaiting a grade; a deadline
// coming up is its own badge (report d76087b2).
import { describe, expect, it } from 'vitest';
import { actionSummary, buildFeed, dueSoonSummary, type FeedSubmission } from '$lib/classroom/feed';
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';

const NOW = new Date('2026-10-19T17:00:00Z');
const section = { id: 's1', course_id: 'c', label: '1', block: null, teacher_email: 'teach@boscotech.edu', course: null } as ClassroomSection;
const item = (id: string, due: string | null): ClassroomItem =>
	({
		id,
		kind: 'assignment',
		title: id,
		published: true,
		pinned: false,
		due_at: due,
		postings: [{ section_id: 's1' }]
	}) as unknown as ClassroomItem;

describe('teacher badges', () => {
	it('keeps due soon out of the to-grade count and names it separately', () => {
		const items = [item('graded', '2026-10-10T00:00:00Z'), item('toGrade', '2026-10-10T00:00:00Z'), item('soon', '2026-10-21T17:00:00Z')];
		const subs: FeedSubmission[] = [
			{ item_id: 'graded', student_email: 'a@boscotech.net', state: 'returned', submitted_at: '2026-10-09T00:00:00Z', graded_at: '2026-10-11T00:00:00Z' },
			{ item_id: 'toGrade', student_email: 'a@boscotech.net', state: 'submitted', submitted_at: '2026-10-09T00:00:00Z', graded_at: null }
		];
		const [feed] = buildFeed({ sections: [section], items, submissions: subs, myEmail: 'teach@boscotech.edu', now: NOW });
		expect(actionSummary(feed)).toBe('1 to grade');
		expect(feed.actionCount).toBe(1);
		expect(dueSoonSummary(feed)).toBe('1 due soon');
		expect(feed.dueSoon.map((e) => e.item.id)).toEqual(['soon']);
	});

	it('gives a student no due-soon badge and a teacher with nothing coming none either', () => {
		const [student] = buildFeed({ sections: [section], items: [item('soon', '2026-10-21T17:00:00Z')], submissions: [], myEmail: 'a@boscotech.net', now: NOW });
		expect(dueSoonSummary(student)).toBeNull();
		const [teacher] = buildFeed({ sections: [section], items: [item('later', '2027-01-01T00:00:00Z')], submissions: [], myEmail: 'teach@boscotech.edu', now: NOW });
		expect(dueSoonSummary(teacher)).toBeNull();
	});
});
