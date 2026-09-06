// tests/classroom-grading-order.test.ts
//
// THE ORDER OF THE GRADES TAB.
//
// WHY THIS IS AUTOMATED. An order regresses SILENTLY. There is no error, no
// empty state and no missing control -- the same rows render, in a different
// sequence, and the only symptom is an instructor reporting a page as "kinda
// random" months later, which is exactly how this change came to be needed.
// Nothing else in the suite pins a sequence on this panel.
//
// THE EXPECTED VALUES DO NOT COME FROM THE IMPLEMENTATION. Every order below is
// written out by hand from the fixture's own dates, with the reasoning beside
// it, so the assertions are about the CONTRACT ("dated first, newest due
// first") rather than about what `orderStandings` currently returns. Running
// the function to learn the answer and then pinning that answer is a test that
// cannot fail.
//
// AND THE FIXTURE IS SUPPLIED IN AN ORDER THAT IS NEITHER ANSWER, so a
// comparator returning 0 for every pair -- the shape a broken sort most often
// takes -- leaves the input order and fails, rather than passing because the
// rows happened to be handed over correctly already.

import { describe, expect, test } from 'vitest';
import { render } from 'svelte/server';
import GradesPanel from '../src/lib/classroom/GradesPanel.svelte';
import {
	GRADING_ORDER_DEFAULT,
	GRADING_ORDER_OPTIONS,
	gradingOrderSays,
	hasDueDate,
	orderStandings,
	undatedBoundary
} from '../src/lib/classroom/grading-order';
import type {
	AssignmentStanding,
	ClassroomItem,
	ClassroomSection
} from '../src/lib/classroom/classroom';

const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'A',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

/**
 * TWO ROWS SHARE THIS `created_at` TO THE MILLISECOND. `now()` is TRANSACTION
 * time and a roster import (or a duplicate) writes several rows in one
 * transaction, so an exact tie is the ordinary case and not a contrivance. It
 * is the only thing in this file that exercises the id tiebreak.
 */
const TIED_CREATED = '2026-08-20T00:00:00.000Z';

function item(over: Partial<ClassroomItem> & { id: string }): ClassroomItem {
	return {
		kind: 'assignment',
		title: over.id,
		body: '',
		points: 20,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: null,
		edited_at: null,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		...over
	} as ClassroomItem;
}

function standing(
	over: Partial<ClassroomItem> & { id: string },
	awaiting: number
): AssignmentStanding {
	return { item: item(over), awaiting, returned: 0, inProgress: 0, roster: 24 };
}

// ---------------------------------------------------------------------------
// The fixture. Five rows, stated as facts rather than as an expected order.
//
//   later-due    due 2026-09-12, created 08-02, 2 waiting  -- the LATEST due date
//   mid-due      due 2026-09-05, created 08-01, 0 waiting
//   early-due    due 2026-08-15, created 07-01, 2 waiting  -- the EARLIEST due date
//   d-alpha      NO due date,    created 08-20, 0 waiting  -- tied created_at
//   z-omega      NO due date,    created 08-20, 5 waiting  -- tied created_at,
//                                                             the BIGGEST queue
//
// `z-omega` sorts before `d-alpha` by id and after it alphabetically, so the
// two are distinguishable; and it holds the biggest marking queue while
// carrying no due date at all, which is what makes the two keys disagree at the
// very top rather than somewhere in the middle where a partial sort could
// still look right.
// ---------------------------------------------------------------------------
const LATER_DUE = standing({ id: 'later-due', due_at: '2026-09-12T07:59:00.000Z', created_at: '2026-08-02T00:00:00.000Z' }, 2);
const MID_DUE = standing({ id: 'mid-due', due_at: '2026-09-05T07:59:00.000Z', created_at: '2026-08-01T00:00:00.000Z' }, 0);
const EARLY_DUE = standing({ id: 'early-due', due_at: '2026-08-15T07:59:00.000Z', created_at: '2026-07-01T00:00:00.000Z' }, 2);
const D_ALPHA = standing({ id: 'd-alpha', created_at: TIED_CREATED }, 0);
const Z_OMEGA = standing({ id: 'z-omega', created_at: TIED_CREATED }, 5);

/** Handed over in an order that is neither answer. */
const SHUFFLED: AssignmentStanding[] = [EARLY_DUE, Z_OMEGA, MID_DUE, D_ALPHA, LATER_DUE];

const ids = (rows: AssignmentStanding[]) => rows.map((s) => s.item.id);

// Hand-computed. DATED first, most recently due first: 09-12, 09-05, 08-15.
// Then UNDATED, most recently posted first -- and those two were posted at the
// same instant, so the id breaks it ascending: 'd-alpha' before 'z-omega'.
const EXPECTED_DUE = ['later-due', 'mid-due', 'early-due', 'd-alpha', 'z-omega'];

// Hand-computed. Anything waiting first, MOST waiting first: z-omega (5), then
// later-due and early-due tie at 2 and break on due date descending, so
// later-due (09-12) then early-due (08-15). Then the nothing-waiting rows:
// mid-due carries a due date and d-alpha does not, so mid-due leads.
const EXPECTED_QUEUE = ['z-omega', 'later-due', 'early-due', 'mid-due', 'd-alpha'];

describe('the default is the date, which is the half that matters', () => {
	test('GRADING_ORDER_DEFAULT is the due-date key', () => {
		expect(GRADING_ORDER_DEFAULT).toBe('due');
	});

	test('calling with no key at all is the same as calling with the default', () => {
		expect(ids(orderStandings(SHUFFLED))).toEqual(ids(orderStandings(SHUFFLED, GRADING_ORDER_DEFAULT)));
	});

	test('every option carries a WORD for the control and a SENTENCE for the page', () => {
		expect(GRADING_ORDER_OPTIONS.length).toBeGreaterThan(1);
		for (const o of GRADING_ORDER_OPTIONS) {
			expect(o.label.trim().length).toBeGreaterThan(0);
			expect(o.says.trim().length).toBeGreaterThan(0);
			expect(gradingOrderSays(o.key)).toBe(o.says);
		}
	});
});

describe('the due order: dated first, newest due first, undated after', () => {
	test('it is the hand-computed order', () => {
		expect(ids(orderStandings(SHUFFLED, 'due'))).toEqual(EXPECTED_DUE);
	});

	test('THE NO-OP CONTROL: it is not the order it was handed', () => {
		// A comparator that returned 0 for every pair would leave SHUFFLED alone
		// and satisfy any assertion written loosely enough to allow it.
		expect(ids(orderStandings(SHUFFLED, 'due'))).not.toEqual(ids(SHUFFLED));
	});

	test('every dated row precedes every undated one', () => {
		const out = orderStandings(SHUFFLED, 'due');
		const lastDated = out.map(hasDueDate).lastIndexOf(true);
		const firstUndated = out.map(hasDueDate).indexOf(false);
		expect(lastDated).toBe(2);
		expect(firstUndated).toBe(3);
		expect(lastDated).toBeLessThan(firstUndated);
	});

	test('A NULL DUE DATE IS NOT A DATE, and is never coerced into one', () => {
		// `Date.parse('0')` is 2000-01-01 in V8, not NaN and not zero, which is
		// what the sort this replaced used as its stand-in. A row due BEFORE that
		// instant would have sorted below every undated row under the old
		// expression; here it is still a dated row and still leads them.
		const ancient = standing({ id: 'ancient', due_at: '1998-05-01T00:00:00.000Z' }, 0);
		const out = ids(orderStandings([D_ALPHA, ancient, Z_OMEGA], 'due'));
		expect(out[0]).toBe('ancient');
	});

	test('the answer does not depend on the order it was handed', () => {
		const other = [LATER_DUE, MID_DUE, EARLY_DUE, D_ALPHA, Z_OMEGA];
		const reversed = [...SHUFFLED].reverse();
		expect(ids(orderStandings(other, 'due'))).toEqual(EXPECTED_DUE);
		expect(ids(orderStandings(reversed, 'due'))).toEqual(EXPECTED_DUE);
	});

	test('it never mutates what it was given', () => {
		const before = ids(SHUFFLED);
		orderStandings(SHUFFLED, 'due');
		orderStandings(SHUFFLED, 'queue');
		expect(ids(SHUFFLED)).toEqual(before);
	});
});

describe('the queue order is the panel behaviour that was there before', () => {
	test('it is the hand-computed order', () => {
		expect(ids(orderStandings(SHUFFLED, 'queue'))).toEqual(EXPECTED_QUEUE);
	});

	test('THE KEYS GENUINELY DISAGREE, and at the top', () => {
		// A single comparator behind both keys would pass every assertion above
		// that names only one of them. They must differ on the first row.
		expect(EXPECTED_DUE[0]).not.toBe(EXPECTED_QUEUE[0]);
		expect(ids(orderStandings(SHUFFLED, 'due'))).not.toEqual(
			ids(orderStandings(SHUFFLED, 'queue'))
		);
	});
});

describe('the undated boundary is drawn only where there is one', () => {
	test('it is the index of the first undated row', () => {
		expect(undatedBoundary(orderStandings(SHUFFLED, 'due'))).toBe(3);
	});

	test('every row dated: no boundary', () => {
		expect(undatedBoundary(orderStandings([LATER_DUE, MID_DUE, EARLY_DUE], 'due'))).toBe(-1);
	});

	test('every row undated: no boundary, because a heading over everything labels nothing', () => {
		expect(undatedBoundary(orderStandings([D_ALPHA, Z_OMEGA], 'due'))).toBe(-1);
	});

	test('no rows at all: no boundary', () => {
		expect(undatedBoundary([])).toBe(-1);
	});
});

// ---------------------------------------------------------------------------
// THE PANEL ITSELF. The module being right is not the claim -- the claim is
// that the rendered list is in that order, which is what an instructor sees.
// ---------------------------------------------------------------------------

function renderPanel(standings: AssignmentStanding[]): string {
	// No cast. `as never` type-checks the CALL and then makes the props object
	// unassignable, which is two errors rather than none -- and `svelte-check`
	// covers `tests/` too, so it is a baseline move and not a local
	// inconvenience.
	return render(GradesPanel, { props: { section: SECTION, standings } }).body;
}

/** Rendered order, read off the titles in the order they appear in the markup. */
function renderedIds(html: string): string[] {
	const out: string[] = [];
	for (const s of [LATER_DUE, MID_DUE, EARLY_DUE, D_ALPHA, Z_OMEGA]) {
		const at = html.indexOf(`>${s.item.id}`);
		if (at >= 0) out.push(`${at}:${s.item.id}`);
	}
	return out.sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0])).map((v) => v.split(':')[1]);
}

describe('the rendered panel', () => {
	const html = renderPanel(SHUFFLED);

	test('the sweep found a real render, not an empty string', () => {
		expect(html.length).toBeGreaterThan(500);
		expect(html).toContain('data-testid="grade-row"');
	});

	test('it renders in the DUE order without being asked', () => {
		expect(renderedIds(html)).toEqual(EXPECTED_DUE);
	});

	test('IT SAYS WHAT IT IS SORTED BY, which is half the fix', () => {
		expect(html).toContain('data-testid="grades-order-says"');
		expect(html).toContain(gradingOrderSays('due'));
	});

	test('both keys are offered, each with a visible word', () => {
		for (const o of GRADING_ORDER_OPTIONS) {
			expect(html).toContain(`data-testid="grades-order-${o.key}"`);
			expect(html).toContain(o.label);
		}
	});

	test('the control is on the 44px floor, declared the one way the app declares it', () => {
		// This panel carries no named density class, so IDEA_INTERFACE_STANDARDS
		// 10 makes it student-facing for the purpose of the floor whatever the
		// audience is. The GEOMETRY is `npm run verify:browser`'s to measure;
		// what is assertable here is that the mechanism is on the element.
		expect(html).toMatch(/class="[^"]*order-btn[^"]*tap-44/);
	});

	test('the undated heading renders, once, at the boundary', () => {
		const marks = html.split('data-testid="grades-undated-head"').length - 1;
		expect(marks).toBe(1);
		expect(html).toContain('No due date');
		// AND IT IS IN THE RIGHT PLACE: after the last dated row, before the
		// first undated one. A heading rendered at index 0 would satisfy a bare
		// presence check while labelling the whole list.
		expect(html.indexOf('>early-due')).toBeLessThan(html.indexOf('grades-undated-head'));
		expect(html.indexOf('grades-undated-head')).toBeLessThan(html.indexOf('>d-alpha'));
	});

	test('THE POSITIVE CONTROL: no heading when every row carries a due date', () => {
		const dated = renderPanel([LATER_DUE, MID_DUE, EARLY_DUE]);
		expect(dated).toContain('data-testid="grade-row"');
		expect(dated).not.toContain('grades-undated-head');
	});
});
