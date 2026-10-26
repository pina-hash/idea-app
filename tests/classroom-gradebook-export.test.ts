// tests/classroom-gradebook-export.test.ts
//
// THE GRADES TAB'S EXPORT (ledger 0438). One class's file carries this class's
// students and nobody else: an assignment posted to two classes hands a manager
// of both every row, so the roster filter is the whole privacy claim, and it is
// held in both directions here. An ungraded row is a blank, never a zero.

import { describe, expect, it } from 'vitest';
import { gradebookCsv, gradebookFor } from '../src/lib/classroom/gradebook-export';

const items = [
	{ id: 'a1', kind: 'assignment', title: 'Shop Fix', points: 20 },
	{ id: 'm1', kind: 'material', title: 'Reference', points: null },
	{ id: 'a2', kind: 'assignment', title: 'Tolerance Check', points: 10 }
];
const roster = [
	{ student_email: 'b.student@boscotech.net', display_name: 'Ortiz, Ben' },
	{ student_email: 'a.student@boscotech.net', display_name: 'Reyes, Ana' }
];
const rows = [
	{ item_id: 'a1', student_email: 'a.student@boscotech.net', score: 18, graded_at: '2026-10-20T00:00:00Z' },
	{ item_id: 'a2', student_email: 'a.student@boscotech.net', score: 7, graded_at: null },
	{ item_id: 'a1', student_email: 'b.student@boscotech.net', score: 15, graded_at: '2026-10-20T00:00:00Z' },
	// Another class's student on the same cross-posted assignment.
	{ item_id: 'a1', student_email: 'other.class@boscotech.net', score: 20, graded_at: '2026-10-20T00:00:00Z' }
];

describe('the Grades tab export', () => {
	const book = gradebookFor(items, roster, rows);
	const csv = gradebookCsv(book);

	it('carries this class only: 3 of the 4 rows, and the other class\'s address appears nowhere', () => {
		expect(book.scores).toHaveLength(3);
		expect(book.scores.map((s) => s.student_email)).not.toContain('other.class@boscotech.net');
		expect(csv).not.toContain('other.class');
		// The present half: both of this class's students are rows.
		expect(csv).toContain('a.student@boscotech.net');
		expect(csv).toContain('b.student@boscotech.net');
	});

	it('one column per assignment, graded scores only, last name first', () => {
		const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
		expect(lines[0]).toBe('Last name,First name,Email,Shop Fix (20),Tolerance Check (10),Points earned,Points possible');
		expect(lines[1]).toBe('Ortiz,Ben,b.student@boscotech.net,15,,15,20');
		// An ungraded 7 is a blank, not a score.
		expect(lines[2]).toBe('Reyes,Ana,a.student@boscotech.net,18,,18,20');
		expect(lines).toHaveLength(3);
	});
});
