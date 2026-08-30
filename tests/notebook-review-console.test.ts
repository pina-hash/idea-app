// tests/notebook-review-console.test.ts
//
// THE REVIEW CONSOLE, rebuilt as a grid you walk with the keyboard and a
// screen that updates itself. What is worth a test here, per this repo's rule
// that automated tests are for guarantees whose regression is SILENT:
//
//   1. THE CURSOR ARITHMETIC AND ITS EDGES. "The arrows move between students
//      and check-ins" is easy to see working and easy to see broken. What is
//      NOT visible is the edge: an off-by-one that wraps from the last student
//      to the first turns "hold the arrow to the end of the class" into a loop
//      with no end, and the instructor's own sense of having finished is the
//      only completion signal this screen has. All of it is pure, so all of it
//      is asserted directly.
//
//   2. THE KEY GATE. A single-letter accept over a screen with a comment box
//      is how "insufficient detail" becomes an accept halfway through the word
//      "flag" -- and nothing about that failure looks like a failure. Both
//      halves (which keys are ours, and which targets are not) are pure.
//
//   3. THE LEGEND AND THE HANDLER ARE ONE LIST. "Discoverable in the
//      interface, not just documented" is only true while the printed keys and
//      the dispatched ones are the same array. A key that stops working while
//      the bar still advertises it is worse than no legend.
//
//   4. THE NOT-APPLIED READ. 0121 is applied BY HAND, so a deployment between
//      0120 and 0121 is a real state, and a missing `reviewed` key read as
//      `false` would put a to-do mark on every cell of every class.
//
//   5. THE LOCKED CONTRACT. The six glyphs, the 1.9rem cell, the density and
//      Share Tech Mono are pinned by CLAUDE.md and this rebuild touched the
//      component they live in.
//
//   6. THE LIVE PATH'S SHAPE. A channel that is never torn down, or one that
//      patches rows instead of re-reading, fails as a slow leak rather than as
//      an error.
//
// What is NOT here, deliberately: whether the layout fits, what the panel
// renders, whether a key press moves focus. Those are visible the moment
// anybody looks, and /dev/notebook-review is where they were driven.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	CELL_STATES,
	REVIEW_KEYS,
	cellReviewed,
	cellUnreviewedCount,
	clampCursor,
	cursorAxes,
	cursorCell,
	firstCursor,
	gridReviewReady,
	isTypingTarget,
	moveCursor,
	nextUnreviewed,
	reviewAction,
	type GridCell,
	type GridCursor,
	type GridSession,
	type GridStudent,
	type ReviewAction,
	type SectionGrid
} from '../src/lib/notebook-review';

/** Normalized, so an assertion about structure never turns on a line ending. */
function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// A fixture with a KNOWN shape: three students by three check-ins, and a
// reviewed dimension that differs per cell so "skip what is done" is a real
// question rather than a degenerate one.
//
//            s1              s2                s3
//   ada      filed, done     filed, NOT done   missing
//   ben      missing         filed, NOT done   filed, NOT done
//   cara     filed, NOT done missing           filed, done
// ---------------------------------------------------------------------------

const SESSIONS: GridSession[] = [
	{ id: 's1', unit_number: 1, session_date: '2026-09-01', session_label: 'One' },
	{ id: 's2', unit_number: 1, session_date: '2026-09-02', session_label: 'Two' },
	{ id: 's3', unit_number: 1, session_date: '2026-09-03', session_label: 'Three' }
];

const STUDENTS: GridStudent[] = [
	{ student_key: 'ada', id: 'u-ada', name: 'Ada', email: 'ada@x', enrolled: true, free_entries: 0 },
	{ student_key: 'ben', id: 'u-ben', name: 'Ben', email: 'ben@x', enrolled: true, free_entries: 0 },
	{ student_key: 'cara', id: 'u-cara', name: 'Cara', email: 'cara@x', enrolled: true, free_entries: 0 }
];

function cell(
	studentKey: string,
	sessionId: string,
	filed: boolean,
	reviewed: boolean | null = null,
	over: Partial<GridCell> = {}
): GridCell {
	return {
		student_key: studentKey,
		student_id: `u-${studentKey}`,
		session_id: sessionId,
		status: filed ? 'compliant' : 'missing',
		entry_id: filed ? `e-${studentKey}-${sessionId}` : null,
		entry_count: filed ? 1 : 0,
		upload_timestamp: filed ? '2026-09-01T12:00:00Z' : null,
		on_time: filed ? true : null,
		excused: false,
		flag_reason: null,
		reviewed: filed ? reviewed : null,
		reviewed_at: filed && reviewed ? '2026-09-04T12:00:00Z' : null,
		unreviewed_count: filed && reviewed === false ? 1 : 0,
		...over
	};
}

const GRID: SectionGrid = {
	section: {
		id: 'sec',
		course_code: 'ENG1H',
		course_title: 'Engineering',
		label: 'Period 2',
		block: 'B',
		teacher_email: 't@boscotech.edu'
	},
	unit_number: 1,
	generated_at: '2026-09-05T00:00:00Z',
	sessions: SESSIONS,
	students: STUDENTS,
	cells: [
		cell('ada', 's1', true, true),
		cell('ada', 's2', true, false),
		cell('ada', 's3', false),
		cell('ben', 's1', false),
		cell('ben', 's2', true, false),
		cell('ben', 's3', true, false),
		cell('cara', 's1', true, false),
		cell('cara', 's2', false),
		cell('cara', 's3', true, true)
	]
};

const at = (studentKey: string, sessionId: string): GridCursor => ({ studentKey, sessionId });

// ---------------------------------------------------------------------------
// 1. The cursor, and where it stops.
// ---------------------------------------------------------------------------

describe('the review cursor', () => {
	it('walks the axes IN THE ORDER THE TABLE RENDERS THEM', () => {
		// Not re-sorted here: rows come from the RPC's own roster order and
		// columns from `sessionsInOrder`, which is the function the header row
		// uses. A cursor that walked a different order would be a cursor moving
		// somewhere the eye is not.
		expect(cursorAxes(GRID)).toEqual({
			students: ['ada', 'ben', 'cara'],
			sessions: ['s1', 's2', 's3']
		});
		expect(firstCursor(GRID)).toEqual(at('ada', 's1'));
	});

	it('moves one step in each direction', () => {
		expect(moveCursor(GRID, at('ben', 's2'), 'up')).toEqual(at('ada', 's2'));
		expect(moveCursor(GRID, at('ben', 's2'), 'down')).toEqual(at('cara', 's2'));
		expect(moveCursor(GRID, at('ben', 's2'), 'left')).toEqual(at('ben', 's1'));
		expect(moveCursor(GRID, at('ben', 's2'), 'right')).toEqual(at('ben', 's3'));
	});

	it('STOPS at all four edges rather than wrapping', () => {
		// The headline. Wrapping makes "hold the arrow down the class" endless,
		// and there is no other signal that the class is finished.
		expect(moveCursor(GRID, at('ada', 's1'), 'up')).toBeNull();
		expect(moveCursor(GRID, at('ada', 's1'), 'left')).toBeNull();
		expect(moveCursor(GRID, at('cara', 's3'), 'down')).toBeNull();
		expect(moveCursor(GRID, at('cara', 's3'), 'right')).toBeNull();
		// THE POSITIVE CONTROL, at the same two corners: the other two
		// directions from each still move, so the nulls above are the EDGE and
		// not a cursor that has stopped working.
		expect(moveCursor(GRID, at('ada', 's1'), 'down')).toEqual(at('ben', 's1'));
		expect(moveCursor(GRID, at('ada', 's1'), 'right')).toEqual(at('ada', 's2'));
		expect(moveCursor(GRID, at('cara', 's3'), 'up')).toEqual(at('ben', 's3'));
		expect(moveCursor(GRID, at('cara', 's3'), 'left')).toEqual(at('cara', 's2'));
	});

	it('survives a refetch, keeping the axis that survived', () => {
		// The case realtime makes ordinary. Losing a COLUMN must keep the
		// student: the row an instructor is working down is the thing they would
		// otherwise have to find again in a class of thirty.
		const withoutS2: SectionGrid = {
			...GRID,
			sessions: SESSIONS.filter((s) => s.id !== 's2'),
			cells: GRID.cells.filter((c) => c.session_id !== 's2')
		};
		expect(clampCursor(withoutS2, at('cara', 's2'))).toEqual(at('cara', 's1'));

		const withoutBen: SectionGrid = {
			...GRID,
			students: STUDENTS.filter((s) => s.student_key !== 'ben'),
			cells: GRID.cells.filter((c) => c.student_key !== 'ben')
		};
		expect(clampCursor(withoutBen, at('ben', 's3'))).toEqual(at('ada', 's3'));

		// A cursor that is still valid is returned UNCHANGED -- the ordinary
		// case, and the one a live update must not disturb.
		expect(clampCursor(GRID, at('ben', 's2'))).toEqual(at('ben', 's2'));
		// Nothing on the grid at all: no cursor, rather than one pointing at air.
		expect(clampCursor({ ...GRID, students: [], cells: [] }, at('ben', 's2'))).toBeNull();
		expect(clampCursor(GRID, null)).toEqual(at('ada', 's1'));
	});

	it('resolves the cell under it, and answers nothing for a pair that names none', () => {
		expect(cursorCell(GRID, at('ada', 's1'))?.entry_id).toBe('e-ada-s1');
		expect(cursorCell(GRID, at('nobody', 's1'))).toBeUndefined();
		expect(cursorCell(GRID, null)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// 2. Where accepting sends you next.
// ---------------------------------------------------------------------------

describe('advancing after an accept', () => {
	it('goes DOWN the column to the next student nobody has looked at', () => {
		// From Ada on s2 (unreviewed) the next unreviewed below is Ben on s2;
		// Cara has nothing filed there and is skipped rather than stopped on.
		expect(nextUnreviewed(GRID, at('ada', 's2'))).toEqual(at('ben', 's2'));
	});

	it('SKIPS what has already been reviewed', () => {
		// Down s3: Ben is unreviewed, Cara is done. From Ada, Ben is the answer;
		// from Ben, there is nothing left, because Cara's is already looked at.
		expect(nextUnreviewed(GRID, at('ada', 's3'))).toEqual(at('ben', 's3'));
		expect(nextUnreviewed(GRID, at('ben', 's3'))).toBeNull();
	});

	it('stops at the bottom rather than wrapping to the top', () => {
		// Cara on s1 is unreviewed and is ABOVE nothing -- a wrap would find her
		// from the bottom of the column and loop the instructor round the class
		// forever.
		expect(nextUnreviewed(GRID, at('cara', 's1'))).toBeNull();
		// THE POSITIVE CONTROL: she IS the answer from above her.
		expect(nextUnreviewed(GRID, at('ada', 's1'))).toEqual(at('cara', 's1'));
	});

	it('answers nothing on a grid whose reviewed dimension is missing', () => {
		// A pre-0121 payload: every cell reads `null`, never `false`, so "the
		// next one nobody has looked at" is honestly unanswerable rather than
		// "all of them".
		const pre: SectionGrid = {
			...GRID,
			cells: GRID.cells.map((c) => {
				const { reviewed: _r, reviewed_at: _a, unreviewed_count: _u, ...rest } = c;
				return rest as GridCell;
			})
		};
		expect(nextUnreviewed(pre, at('ada', 's1'))).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3. The keys.
// ---------------------------------------------------------------------------

describe('the keyboard', () => {
	it('maps every key the legend prints', () => {
		expect(reviewAction({ key: 'ArrowUp' })).toBe('up');
		expect(reviewAction({ key: 'ArrowDown' })).toBe('down');
		expect(reviewAction({ key: 'ArrowLeft' })).toBe('left');
		expect(reviewAction({ key: 'ArrowRight' })).toBe('right');
		expect(reviewAction({ key: 'a' })).toBe('accept');
		expect(reviewAction({ key: 'A' })).toBe('accept');
		expect(reviewAction({ key: 'f' })).toBe('flag');
		expect(reviewAction({ key: 'F' })).toBe('flag');
		expect(reviewAction({ key: 'Enter' })).toBe('pages');
		expect(reviewAction({ key: 'Escape' })).toBe('close');
	});

	it('never takes a MODIFIED press, which belongs to the browser', () => {
		// Swallowing Cmd+A ("select all") to mean "accept" is the kind of theft
		// that makes a keyboard surface unusable rather than fast.
		for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
			expect(reviewAction({ key: 'a', [mod]: true }), mod).toBeNull();
			expect(reviewAction({ key: 'ArrowDown', [mod]: true }), mod).toBeNull();
		}
		// SHIFT IS OURS: a capital A is the same request, and the assertions
		// above already show it resolves.
		expect(reviewAction({ key: 'A', ctrlKey: false })).toBe('accept');
		// And an ordinary letter that means nothing here is left alone, so the
		// nulls above are about the MODIFIER and not about everything.
		expect(reviewAction({ key: 'k' })).toBeNull();
		expect(reviewAction({ key: 'Tab' })).toBeNull();
	});

	it('leaves a press alone when somebody is TYPING', () => {
		expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
		expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
		expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
		expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
		// THE CONTROL: the things a cursor actually sits on are not typing
		// targets, or the keyboard would never work at all.
		expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
		expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
		expect(isTypingTarget({})).toBe(false);
	});

	it('THE LEGEND AND THE HANDLER ARE ONE LIST', () => {
		// "Discoverable in the interface, not just documented" is only true
		// while every action the handler can produce is printed somewhere. A key
		// that stops working while the bar still advertises it is worse than no
		// legend at all.
		const dispatchable = new Set<ReviewAction>();
		const keys = [
			'ArrowUp',
			'ArrowDown',
			'ArrowLeft',
			'ArrowRight',
			'a',
			'f',
			'Enter',
			'Escape'
		];
		for (const key of keys) {
			const action = reviewAction({ key });
			if (action) dispatchable.add(action);
		}
		expect(dispatchable.size).toBe(8); // the sweep is not empty

		// Every dispatchable action is REPRESENTED in the legend. The two axes
		// are printed as one row each ("↑ ↓ Student"), so the legend names one
		// direction of each pair; asserting the PAIR is what stops that from
		// being a hole a whole missing row could hide in.
		const advertised = new Set(REVIEW_KEYS.map((k) => k.action));
		const pairs: Record<string, string> = { up: 'down', left: 'right' };
		for (const action of dispatchable) {
			const ok = advertised.has(action) || advertised.has((pairs[action] ?? '') as ReviewAction);
			expect(ok, `${action} is dispatched but not printed in the legend`).toBe(true);
		}
		// ...and nothing is advertised that cannot be dispatched. A NATIVE row
		// (one the browser handles, e.g. Tab over a roving tabindex) is exempt by
		// construction rather than by omission: it advertises a key this module
		// deliberately does not swallow. The notebook has none today, so the
		// count below is what stops that exemption from quietly covering
		// everything.
		expect(REVIEW_KEYS.filter((k) => k.native).length).toBe(0);
		for (const hint of REVIEW_KEYS) {
			if (hint.native) continue;
			expect(hint.action, `${hint.keys} advertises no action`).toBeDefined();
			expect(
				dispatchable.has(hint.action as ReviewAction),
				`${hint.keys} is printed but never dispatched`
			).toBe(true);
			expect(hint.keys.length).toBeGreaterThan(0);
			expect(hint.label.length).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// 4. Reading the acknowledgement dimension, including where it is not there.
// ---------------------------------------------------------------------------

describe('the reviewed dimension', () => {
	it('is THREE-STATE, and "not applied" is not "not reviewed"', () => {
		// The silent one. Migrations here are pasted in by hand, so a deployment
		// between 0120 and 0121 is a real state -- and a missing key read as
		// `false` would mark every cell in every class as outstanding.
		expect(cellReviewed(cell('ada', 's1', true, true))).toBe(true);
		expect(cellReviewed(cell('ada', 's1', true, false))).toBe(false);
		// No entry: nothing to have looked at.
		expect(cellReviewed(cell('ada', 's1', false))).toBeNull();
		// Pre-0121: the key is absent entirely.
		const { reviewed: _dropped, ...pre } = cell('ada', 's1', true, false);
		expect(cellReviewed(pre as GridCell)).toBeNull();
	});

	it('lets the payload report its own capability', () => {
		expect(gridReviewReady(GRID)).toBe(true);
		expect(gridReviewReady(null)).toBe(false);
		const pre: SectionGrid = {
			...GRID,
			cells: GRID.cells.map((c) => {
				const { reviewed: _r, ...rest } = c;
				return rest as GridCell;
			})
		};
		expect(gridReviewReady(pre)).toBe(false);
		// A cell with NO ENTRY still carries the key, so a class where nobody has
		// filed anything still reports the capability rather than hiding it.
		expect(gridReviewReady({ ...GRID, cells: [cell('ada', 's1', false)] })).toBe(true);
	});

	it('reads the outstanding count from the cell, defaulting to none', () => {
		expect(cellUnreviewedCount(cell('ada', 's1', true, false))).toBe(1);
		expect(cellUnreviewedCount(cell('ada', 's1', true, true))).toBe(0);
		const { unreviewed_count: _dropped, ...pre } = cell('ada', 's1', true, false);
		expect(cellUnreviewedCount(pre as GridCell)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 5. THE LOCKED CONTRACT (CLAUDE.md), re-checked after a rebuild of the
//    component that holds it.
// ---------------------------------------------------------------------------

describe('the grid is still the grid', () => {
	const gridSrc = () => read('src/lib/notebook/SectionGrid.svelte');

	/**
	 * THE ORIGINAL SIX ARE THE LOCKED PART, AND THIS USED TO SAY "AND ADDS NO
	 * SEVENTH".
	 *
	 * It pinned the whole array and its length, which made it the assertion a
	 * legitimate change necessarily breaks -- 0140 adds `scheduled`, which is a
	 * state of the CELL that had no way to be said before, and the choice a test
	 * like that offers is "delete me or don't ship it". So it is generalized to
	 * the RULE the contract is actually about, in three parts:
	 *
	 *   1. THE SIX DO NOT MOVE. Their glyphs, their keys and their ORDER are
	 *      pinned exactly as before, as the PREFIX of the array -- an instructor
	 *      reads this grid by glyph, and a ✓ that became something else, or a
	 *      legend that reordered itself, is the regression this line exists for.
	 *   2. ANYTHING NEW IS APPENDED, never interleaved.
	 *   3. NO TWO STATES SHARE A GLYPH OR A KEY, and every state carries a word
	 *      as well as a mark -- which is the property that makes the grid
	 *      readable without colour, and the one a seventh state is most likely
	 *      to break by accident.
	 *
	 * The seventh is then named explicitly, so adding an EIGHTH is still a
	 * deliberate edit to this file rather than something that slips through.
	 */
	it('keeps the original six glyphs, in order, as the head of the list', () => {
		const SIX = ['✓', '⤴', '○', '!', 'E', '–'];
		const SIX_KEYS = ['on_time', 'late', 'pending_review', 'flagged', 'excused', 'missing'];
		expect(CELL_STATES.slice(0, 6).map((s) => s.glyph)).toEqual(SIX);
		expect(CELL_STATES.slice(0, 6).map((s) => s.key)).toEqual(SIX_KEYS);
	});

	it('appends the seventh (0140) and nothing else', () => {
		expect(CELL_STATES).toHaveLength(7);
		expect(CELL_STATES[6].key).toBe('scheduled');
		expect(CELL_STATES[6].glyph).toBe('»');
	});

	it('gives every state a unique glyph, a unique key and a word of its own', () => {
		expect(new Set(CELL_STATES.map((s) => s.glyph)).size).toBe(CELL_STATES.length);
		expect(new Set(CELL_STATES.map((s) => s.key)).size).toBe(CELL_STATES.length);
		for (const state of CELL_STATES) {
			expect(state.label.trim(), `${state.key} has no label`).not.toBe('');
			expect(state.hint.trim(), `${state.key} has no hint`).not.toBe('');
		}
	});

	it('paints every state per plate, through a --nb-cell-* token', () => {
		// THE OTHER HALF OF THE CONTRACT, and the half a seventh state is most
		// likely to miss: a state with a class but no rule renders as an unstyled
		// box on all three plates and nothing reports it. Asserted against the
		// component's own rules and against the token file, so a state added to
		// the registry without a colour reddens here rather than on screen.
		const src = gridSrc();
		const colors = read('src/lib/design-system/colors.css');
		for (const state of CELL_STATES) {
			expect(src, `${state.key} has no cell rule`).toContain(`.cell.${state.key} {`);
			const rule = src.slice(src.indexOf(`.cell.${state.key} {`));
			const body = rule.slice(0, rule.indexOf('}'));
			const token = (body.match(/var\((--nb-cell-[a-z-]+)\)/) ?? [])[1];
			expect(token, `${state.key} paints with no --nb-cell-* token`).toBeTruthy();
			// Declared on the light plate (:root) and on BOTH dark plates.
			expect(
				colors.split(`${token}:`).length - 1,
				`${token} is not declared on all three plates`
			).toBe(3);
		}
	});

	it('keeps the cell box, the density and Share Tech Mono', () => {
		const src = gridSrc();
		const cellRule = src.slice(src.indexOf('\t.cell {'), src.indexOf('\t.cell.empty-cell'));
		expect(cellRule).toMatch(/width:\s*1\.9rem/);
		expect(cellRule).toMatch(/height:\s*1\.9rem/);
		expect(cellRule).toMatch(/font-family:\s*var\(--font-mono\)/);
		// The table density, unchanged.
		expect(src).toMatch(/padding:\s*0\.35rem 0\.4rem/);
		// A face is named through its TOKEN, never as a literal -- asserted on
		// the DECLARATIONS, because the name appears in this file's comments
		// (explaining why the chips keep it) and an assertion a comment can
		// break is not measuring anything.
		const faces = [...src.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
		expect(faces.length).toBeGreaterThan(0);
		for (const face of faces) {
			expect(face, 'a face named as a literal').toMatch(/^(var\(--font-[a-z]+\)|inherit)$/);
		}
	});

	it('marks the unreviewed cells with a SHAPE and says the word as well', () => {
		const src = gridSrc();
		// Colour is never the only signal: the dot has a title and a
		// screen-reader line carrying the words.
		expect(src).toContain('not reviewed yet');
		expect(src).toMatch(/not reviewed/);
		expect(src).toMatch(/\.todo-dot \{[\s\S]*?border-radius: 999px/);
		// ...and it is not a seventh entry in the locked vocabulary.
		expect(read('src/lib/notebook-review.ts')).not.toMatch(
			/CELL_STATES[\s\S]{0,900}?key:\s*'reviewed'/
		);
	});
});

// ---------------------------------------------------------------------------
// 6. The live path, as a SHAPE. What it does is driven in the harness; what it
//    must never do is what an eye cannot catch.
// ---------------------------------------------------------------------------

describe('live updates', () => {
	const console_ = () => read('src/lib/notebook/ReviewConsole.svelte');
	const route = () => read('src/routes/notebook/review/+page.svelte');

	it('keeps the load-time fetch, so a dead socket degrades to what shipped', () => {
		// Realtime is an UPDATE path. A console that only ever painted from
		// events would come up blank wherever the socket does not connect --
		// which is a school network, a proxy, or a project with no publication.
		const src = console_();
		expect(src).toMatch(/untrack\(\(\) => void refresh\(id, unitNumber\)\)/);
		// ...and every write still refetches on its own.
		expect(src).toMatch(/if \(result\.ok\) await afterReview\(entryId\)/);
		expect(src).toMatch(/async function afterReview[\s\S]{0,200}?await refresh\(\)/);
	});

	it('re-reads rather than patching, so two instructors converge', () => {
		// The transport takes a change handler with NO PAYLOAD, which is what
		// makes "apply this row" unrepresentable rather than merely discouraged:
		// there is no row to apply. Events can arrive out of order or not at all;
		// the RPC cannot.
		//
		// ASSERTED AS THE HANDLER, NOT AS THE WHOLE SIGNATURE. This used to pin
		// `(sectionId: string, onChange: () => void) => () => void` verbatim, so
		// adding the `onStatus` callback the Live pill needs broke a check whose
		// subject is the payload -- the spelled-out form could only be deleted
		// where the rule it meant can be generalised.
		expect(read('src/lib/notebook-review.ts')).toMatch(/onChange: \(\) => void/);
		expect(read('src/lib/notebook-review.ts')).not.toMatch(/onChange: \([a-zA-Z]/);
		expect(console_()).toMatch(/refresh\(id, untrack\(\(\) => unit\), \{ quiet: true \}\)/);
	});

	it('the Live pill reports the CHANNEL, never the existence of a transport', () => {
		// The defect this replaced: `live = true` set the moment `subscribe`
		// RETURNED, over a `.subscribe()` with no status callback -- so a
		// publication that does not carry the notebook tables, a failed join and
		// a dead socket all painted a green Live pill over a console that would
		// silently never update again. Nothing else on the screen says otherwise,
		// which is exactly why this cannot be left to an eye.
		const src = console_();
		expect(src).not.toMatch(/\blive = true\b/);
		expect(src).toMatch(/let channel = \$state<NotebookLiveStatus>\('connecting'\)/);
		/*
		 * THE WHOLE OF IT: 'live' is never written by this component, only ever
		 * RELAYED from the transport. Asserting the declaration alone is not
		 * enough and was measured not to be -- putting `channel = 'live'` back in
		 * the subscribe effect and dropping the status callback passed a version
		 * of this check that only looked for `live = true`. So every assignment
		 * is enumerated: 'connecting' (the reset, on subscribe and on teardown)
		 * and `status` (the relay), and nothing else.
		 */
		const assignments = [...new Set(src.match(/(?<!let )\bchannel = [^;\n]+/g) ?? [])].sort();
		expect(assignments).toEqual(["channel = 'connecting'", 'channel = status']);
		// Only the reported 'live' may show the pill...
		expect(src).toMatch(/\{#if channel === 'live'\}/);
		// ...and 'connecting' shows NOTHING: a pill that flickers on every
		// section change is noise, and a transport that reports no status must
		// not be able to claim Live.
		expect(src).not.toMatch(/channel === 'connecting'[\s\S]{0,120}?data-testid="live-pill"/);
		// The route hands the status over, mapped from supabase-js's own words.
		expect(route()).toMatch(/subscribe\(sectionId, onChange, onStatus\)/);
		expect(route()).toMatch(/status === 'SUBSCRIBED' \? 'live' : 'stalled'/);
	});

	it('is ONE channel per section, filtered, and torn down', () => {
		const src = route();
		expect(src).toMatch(/\.channel\(`notebook-review-\$\{sectionId\}`\)/);
		expect(src).toMatch(/filter: `section_id=eq\.\$\{sectionId\}`/);
		expect(src).toMatch(/removeChannel\(channel\)/);
		// All three tables 0121 published, and no fourth: notebook_entry_activity
		// is a VIEW and cannot be in a publication.
		for (const table of ['notebook_entries', 'notebook_entry_photos', 'notebook_entry_notes']) {
			expect(src, `${table} is not subscribed`).toContain(`table: '${table}'`);
		}
		expect(src).not.toContain("table: 'notebook_entry_activity'");
		// The console returns the teardown from its effect, which is what makes
		// a section change a re-subscribe rather than a leak.
		expect(console_()).toMatch(/return \(\) => \{[\s\S]{0,200}?unsubscribe\(\)/);
	});

	it('the quiet path never blanks the grid or steals the screen', () => {
		const src = console_();
		// `quiet` skips the spinner, the error banner and the grid reset -- a
		// change arriving while the network is briefly down must not replace a
		// perfectly good grid with an error nobody asked for.
		expect(src).toMatch(/if \(!opts\.quiet\) \{\s*\n\s*loading = true/);
		expect(src).toMatch(/if \(!opts\.quiet\) \{\s*\n\s*loadError = gridResult\.error;\s*\n\s*grid = null/);
		// The cursor is re-derived from the new payload rather than left
		// pointing at a row that may have gone.
		expect(src).toMatch(/cursor = clampCursor\(gridResult\.value, cursor\)/);
	});

	it('the panel is KEYED on the entry id, not reset by an effect', () => {
		// Two guarantees in one mechanism: moving to another student destroys
		// the half-typed comment with the panel (so it can never be submitted
		// against the wrong student), and a LIVE reload of the SAME entry keeps
		// the same key, so an update arriving mid-sentence does not throw the
		// sentence away. An id-watching effect could not tell those apart.
		expect(console_()).toMatch(/\{#key openEntry\.id\}/);
		expect(read('src/lib/notebook/EntryReview.svelte')).not.toMatch(
			/\$effect\(\(\) => \{\s*\n\s*void entry\.id;/
		);
	});
});

// ---------------------------------------------------------------------------
// 7. The keys are handled where the loop is, and the guards are real.
// ---------------------------------------------------------------------------

describe('the console owns the keys', () => {
	const src = () => read('src/lib/notebook/ReviewConsole.svelte');

	it('listens on the window, so the loop does not stop at the pane boundary', () => {
		// An instructor who has just clicked Accept has focus in the PANEL, and
		// the next arrow has to move the cursor from there.
		expect(src()).toContain('<svelte:window onkeydown={onWindowKey} />');
	});

	it('gates on typing, on a modal dialog, and on the mode', () => {
		const handler = src().slice(src().indexOf('function onWindowKey'));
		expect(handler).toMatch(/mode !== 'review'/);
		expect(handler).toMatch(/isTypingTarget\(target\)/);
		// The photo viewer is a native <dialog> in the top layer with its own
		// keys; accepting an entry from inside the picture of it is not a thing
		// anybody asked for.
		expect(handler).toMatch(/document\.querySelector\('dialog\[open\]'\)/);
		expect(handler).toMatch(/event\.preventDefault\(\)/);
	});

	it('prints the legend from the same array it dispatches from', () => {
		// The source half of the pure assertion in section 3: the bar renders
		// REVIEW_KEYS rather than a hand-written list beside it.
		expect(src()).toMatch(/\{#each REVIEW_KEYS as k \(k\.keys\)\}/);
		expect(src()).toMatch(/<kbd>\{k\.keys\}<\/kbd>/);
	});
});
