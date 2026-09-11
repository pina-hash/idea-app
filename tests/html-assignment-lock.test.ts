// tests/html-assignment-lock.test.ts
//
// A CLOSED ASSIGNMENT IS A SENTENCE AND A SHUT DOCUMENT, AND BOTH WOULD FAIL
// SILENTLY.
//
// 0198 lets an instructor close an assignment, which writes the state
// `classroom_save_response` has refused on since 0086. Every failure this file
// guards against is invisible:
//
//   * A surface that renders the frame WITHOUT the lock shows a student a
//     worksheet that takes typing and drops it. Nothing throws, nothing is red,
//     and the student's own conclusion is that they broke something.
//   * A sentence that said "unsubmit to keep working" -- which is what the
//     ported refusal said before this bundle -- sends that student looking for
//     a control that has never existed on the surface.
//   * `handedIn` counting a close as a hand-in lights the unfinished-work mark
//     against a whole roster the moment an assignment is closed, which is
//     exactly the signal the mark exists to give.
//
// THE THREE-VALUED PREDICATE IS THE WHOLE OF IT, and it is asserted here over
// hand-built rows. `tests/db/html-assignment-close.test.ts` puts the SAME
// functions to rows a real RPC wrote on a real Postgres, which is where the
// claim "the mirror agrees with the database" is actually made; this file is
// about the vocabulary and the wiring.
//
// WHERE THE EXPECTED VALUES COME FROM: `submitted_at` is set or not, which is
// 0086's own column and 0198's own discriminator. Nothing is compared against a
// value the predicate produced.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	assignmentAcceptsWork,
	assignmentLockNotice,
	assignmentLockState,
	ASSIGNMENT_CLOSE_ORDER_NOTE,
	ASSIGNMENT_LOCK_CHIP,
	ASSIGNMENT_LOCK_NOTICE,
	type AssignmentLockState
} from '../src/lib/classroom/html-assignment/lock';
import { HX_REFUSALS } from '../src/lib/classroom/html-assignment/answers';
import { CLASSROOM_LIVE_TOPICS, GRADING_POLL_MS } from '../src/lib/classroom/live';
import type { SubmissionRow } from '../src/lib/classroom/assignment-spec';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const FRAME = '../src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
const CONSOLE = '../src/lib/classroom/GradingConsole.svelte';
const ITEM_DETAIL = '../src/lib/classroom/ItemDetail.svelte';
const ENGINE = '../src/lib/classroom/AssignmentEngine.svelte';
const GRADE_PAGE = '../src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.svelte';

/** A submission row with only the two columns the predicate reads. */
function row(state: SubmissionRow['state'], submittedAt: string | null) {
	return { state, submitted_at: submittedAt };
}

describe('0198: what "closed" means', () => {
	it('separates an instructor close from a student hand-in on submitted_at', () => {
		expect(assignmentLockState(row('submitted', null))).toBe('closed');
		expect(assignmentLockState(row('submitted', '2026-09-10T18:00:00Z'))).toBe('turned-in');
	});

	it('treats draft, returned and no row at all as open', () => {
		// `returned` IS OPEN, and that is 0086's own definition of the word --
		// graded and released, editable again -- not a decision this module took.
		// It is the half of this bundle that needed no code: grading writes
		// `returned` on release and `draft` otherwise, never `submitted`.
		expect(assignmentLockState(row('draft', null))).toBe('open');
		expect(assignmentLockState(row('returned', null))).toBe('open');
		expect(assignmentLockState(row('returned', '2026-09-10T18:00:00Z'))).toBe('open');
		expect(assignmentLockState(null)).toBe('open');
		expect(assignmentLockState(undefined)).toBe('open');
	});

	it('offers work exactly where the database would accept it', () => {
		// The mirror of `classroom_save_response`'s own gate, which refuses on
		// one state and one state only.
		for (const [r, accepts] of [
			[row('draft', null), true],
			[row('returned', null), true],
			[row('submitted', null), false],
			[row('submitted', '2026-09-10T18:00:00Z'), false],
			[null, true]
		] as const) {
			expect(assignmentAcceptsWork(r)).toBe(accepts);
		}
	});

	it('says nothing when there is nothing to say', () => {
		expect(assignmentLockNotice(row('draft', null))).toBeNull();
		expect(assignmentLockNotice(row('returned', null))).toBeNull();
		expect(assignmentLockNotice(null)).toBeNull();
		expect(assignmentLockNotice(row('submitted', null))).toBe(ASSIGNMENT_LOCK_NOTICE.closed);
		expect(assignmentLockNotice(row('submitted', '2026-09-10T18:00:00Z'))).toBe(
			ASSIGNMENT_LOCK_NOTICE['turned-in']
		);
	});

	it('never tells a closed student to unsubmit, which is what the sentence used to say', () => {
		// THE REGRESSION THIS FILE EXISTS FOR. The ported refusal read 'This is
		// submitted, so edits are locked. Unsubmit to keep working.' There is no
		// turn-in on a ported document and no unsubmit control on the surface, so
		// both halves were false.
		expect(ASSIGNMENT_LOCK_NOTICE.closed).not.toMatch(/unsubmit/i);
		expect(ASSIGNMENT_LOCK_NOTICE.closed).toMatch(/teacher/i);
		expect(ASSIGNMENT_LOCK_NOTICE.closed).toMatch(/read only/i);
		// And it says the work is still there, because the first thing a person
		// assumes about a page that stopped saving is that they lost something.
		expect(ASSIGNMENT_LOCK_NOTICE.closed).toMatch(/still here/i);

		// The turned-in sentence keeps the advice, because there it is true.
		expect(ASSIGNMENT_LOCK_NOTICE['turned-in']).toMatch(/unsubmit/i);
	});

	it('is ONE string, shared by the proactive notice and the save refusal', () => {
		// A student who reads one sentence on the frame before typing and a
		// different one from the save state afterwards has been told two things
		// about one event.
		expect(HX_REFUSALS.locked).toBe(ASSIGNMENT_LOCK_NOTICE.closed);
	});

	it('uses no em dash, per the copy convention', () => {
		const copy = [
			...Object.values(ASSIGNMENT_LOCK_NOTICE),
			...Object.values(ASSIGNMENT_LOCK_CHIP),
			ASSIGNMENT_CLOSE_ORDER_NOTE
		];
		for (const line of copy) expect(line).not.toMatch(/—/);
	});

	it('states the order a close and a grade have to be done in', () => {
		// Both are Mr. Pina's decisions of 2026-09-10 and they meet on one cell:
		// releasing a grade writes `returned`, which re-opens that student. The
		// control has to say so.
		expect(ASSIGNMENT_CLOSE_ORDER_NOTE).toMatch(/grade first/i);
		expect(ASSIGNMENT_CLOSE_ORDER_NOTE).toMatch(/re-open/i);
	});

	it('gives every non-open state a word, so colour is never the only signal', () => {
		const states: Exclude<AssignmentLockState, 'open'>[] = ['closed', 'turned-in'];
		for (const s of states) {
			expect(ASSIGNMENT_LOCK_CHIP[s]).toBeTruthy();
			expect(ASSIGNMENT_LOCK_NOTICE[s]).toBeTruthy();
		}
		// Two facts, two words. One word for both would tell a teacher a student
		// handed something in when the teacher is the one who closed it.
		expect(ASSIGNMENT_LOCK_CHIP.closed).not.toBe(ASSIGNMENT_LOCK_CHIP['turned-in']);
	});
});

describe('0198: the wiring, which is what fails silently', () => {
	it('shuts the frame when either the caller or the lock says so', () => {
		const frame = src(FRAME);
		// The document is told `shut`, never the raw `readOnly`, so a caller that
		// passes a lock and forgets `readOnly` cannot leave a worksheet that takes
		// typing and drops it.
		expect(frame).toMatch(/const shut = \$derived\(\s*readOnly \|\| lock === 'closed' \|\| lock === 'turned-in'/);
		expect(frame).not.toMatch(/postState\([^)]*readOnly\)/);
		expect(frame).toContain('postState(values, images, shut)');
		expect(frame).toContain('postState(snapshot.values, snapshot.images, snapshot.shut)');
	});

	it('renders the sentence in parent chrome, above the document', () => {
		const frame = src(FRAME);
		const notice = frame.indexOf('data-hx-lock');
		// THE ELEMENT, not the first `<iframe` in the file -- the header comment
		// says the word several times, and anchoring on it compares the notice
		// against a paragraph of prose instead of against the document.
		const iframe = frame.indexOf('bind:this={frame}');
		expect(notice).toBeGreaterThan(0);
		expect(iframe).toBeGreaterThan(0);
		// ABOVE, because a student scrolling a worksheet reads downward and a
		// sentence explaining why nothing saves belongs before the thing that is
		// not saving.
		expect(notice).toBeLessThan(iframe);
		// A standing fact, not an event: an assertive region would interrupt on
		// every render for something that is not urgent.
		expect(frame).toMatch(/role="status" data-hx-lock/);
	});

	it('hands the lock down on every surface that mounts the frame', () => {
		// THE SWEEP, and it is the only thing that reddens if somebody adds a
		// third mount without it. A mount that forgets this is a student typing
		// into a closed worksheet, which throws nothing.
		for (const [name, file] of [
			['the student item page', ITEM_DETAIL],
			['the grading console page', GRADE_PAGE]
		] as const) {
			const text = src(file);
			expect(text, name).toContain('<HtmlAssignmentFrame');
			expect(text, name).toMatch(/lock=\{/);
			expect(text, name).toContain('assignmentLockState');
		}
	});

	it('does not count a close as a hand-in', () => {
		const console_ = src(CONSOLE);
		// `handedIn` used to be `state === 'submitted' || state === 'returned'`,
		// which after 0198 marks every student on a closed roster as having
		// handed work in -- including the ones who never opened it.
		expect(console_).not.toMatch(/return state === 'submitted' \|\| state === 'returned';/);
		expect(console_).toMatch(/return state === 'returned' \|\| lockOf\(s\) === 'turned-in';/);
	});

	it('gives the closed chip its own word on both surfaces', () => {
		expect(src(CONSOLE)).toContain('ASSIGNMENT_LOCK_CHIP.closed');
		expect(src(ENGINE)).toContain('ASSIGNMENT_LOCK_CHIP.closed');
	});

	it('offers no unsubmit on a closed assignment, because it would only be refused', () => {
		const engine = src(ENGINE);
		// The control is offered on `turned-in` and on nothing else. A control
		// whose only possible outcome is a refusal must not be offered.
		expect(engine).toMatch(/\{#if lock === 'turned-in'\}/);
		expect(engine).not.toMatch(/\{#if subState === 'submitted'\}\s*<section class="card locked-card">/);
		// And the refusal has a sentence if a student had the button on screen
		// when the close landed underneath them.
		expect(engine).toContain("res.data.reason === 'closed'");
	});
});

describe('0198 and live: the grading console stops needing a reload', () => {
	it('adds exactly one topic, and the existing two are untouched', () => {
		expect([...CLASSROOM_LIVE_TOPICS]).toEqual(['hall-pass', 'song-queue', 'responses']);
	});

	it('keeps a poll as the floor, unconditionally', () => {
		const console_ = src(CONSOLE);
		// THE POLL DEPENDS ON NOTHING. An interval that re-ran whenever the
		// channel changed state would stop being a floor at exactly the moment
		// the channel is unreliable, and a console handed no bus would stop
		// refreshing altogether -- worse than the reload it replaces.
		expect(console_).toContain('setInterval(() => void load(), GRADING_POLL_MS)');
		expect(GRADING_POLL_MS).toBeGreaterThan(0);
		// Between the hall pass's 45s and the song queue's 90s.
		expect(GRADING_POLL_MS).toBeGreaterThanOrEqual(45_000);
		expect(GRADING_POLL_MS).toBeLessThanOrEqual(90_000);
	});

	it('re-reads through its own transport and never patches from a payload', () => {
		const console_ = src(CONSOLE);
		// A notice means "re-ask the server", never "apply this row". If this
		// ever became a patch, a grader could be shown a row their own
		// role-scoped read had deliberately reshaped (0138's manager exclusion
		// lives in that projection, not in the table).
		const handler = console_.slice(
			console_.indexOf("if (topic !== 'responses') return;"),
			console_.indexOf('(status) => {', console_.indexOf("if (topic !== 'responses') return;"))
		);
		expect(handler).toContain('void load()');
		expect(handler).not.toMatch(/data\s*=/);
		expect(handler).not.toMatch(/payload/);
	});

	it('untracks the caller-supplied subscribe, which is the repo rule for an injected call', () => {
		const console_ = src(CONSOLE);
		expect(console_).toMatch(/untrack\(\(\) =>\s*bus\.subscribe\(/);
	});

	it('says the one quiet sentence a stalled channel earns, and nothing otherwise', () => {
		const console_ = src(CONSOLE);
		expect(console_).toContain("liveStatus === 'stalled'");
		// Nothing for `connecting` (every page starts there) or `live`.
		expect(console_).not.toMatch(/liveStatus === 'connecting'/);
		expect(console_).not.toMatch(/liveStatus === 'live'/);
	});

	it('announces nothing from the grade page, because grading changes no answers', () => {
		expect(src(GRADE_PAGE)).not.toContain('.announce(');
	});
});

describe('0198: the close control', () => {
	it('is absent when no transport is handed down', () => {
		const console_ = src(CONSOLE);
		// ABSENCE IS THE MECHANISM. There is no `readOnly`-shaped flag to forget.
		expect(console_).toMatch(/\{#if close\}/);
		expect(console_).toMatch(/close\?: CloseAssignmentTransport \| null;/);
	});

	it('confirms in two steps and names the real count', () => {
		const console_ = src(CONSOLE);
		expect(console_).toContain('data-testid="close-arm"');
		expect(console_).toContain('data-testid="close-confirm"');
		expect(console_).toContain('data-testid="close-confirm-go"');
		// The count comes from the roster on screen, not from anything the server
		// reported.
		expect(console_).toMatch(/students\.filter\(\(s\) => lockOf\(s\) === 'open'\)\.length/);
		expect(console_).toMatch(/students\.filter\(\(s\) => lockOf\(s\) === 'closed'\)\.length/);
	});

	it('states the grade-then-close order wherever the control is, armed or not', () => {
		const console_ = src(CONSOLE);
		const tool = console_.slice(console_.indexOf('data-testid="close-tool"'));
		const order = tool.indexOf('ASSIGNMENT_CLOSE_ORDER_NOTE');
		const armed = tool.indexOf('{#if armedClose}');
		expect(order).toBeGreaterThan(0);
		// BEFORE the armed branch, so it is on screen whether or not the control
		// has been pressed.
		expect(order).toBeLessThan(armed);
	});

	it('reports a refusal rather than swallowing it', () => {
		const console_ = src(CONSOLE);
		// A co-posted item legitimately carries students of a class this caller
		// does not manage. A close that silently skipped them would leave a class
		// half open with nothing on screen saying so.
		expect(console_).toMatch(/refused/);
		expect(console_).toContain('left open');
	});

	it('clears its busy flag in a finally', () => {
		const console_ = src(CONSOLE);
		const fn = console_.slice(
			console_.indexOf('async function runClose'),
			console_.indexOf('// THE BATCH.', console_.indexOf('async function runClose'))
		);
		expect(fn).toContain('} finally {');
		expect(fn).toContain('closeBusy = false;');
	});
});
