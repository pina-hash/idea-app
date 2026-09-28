// tests/feedback-console-undo.test.ts
//
// UNDO ON THE FEEDBACK CONSOLE (report R02): the bookkeeping, which is pure.
//
// What makes this a test rather than a harness drive is that the wrong answer
// is QUIET. An undo that remembered the status a report was moved TO rather
// than the one it came FROM runs, lands, and leaves the report exactly where it
// was; an undo that swept in a report the move refused writes a status nobody
// asked for; an undo sentence that counts instead of naming leaves a partial
// undo unreadable. Each of those renders a perfectly ordinary console.
//
// Expected values are written out by hand, never computed with the module's
// own helpers.

import { describe, expect, it } from 'vitest';
import {
	FEEDBACK_UNDO_MS,
	feedbackUndoFor,
	feedbackUndoLabel,
	feedbackUndoSummary,
	type FeedbackBulkOutcome
} from '../src/lib/feedback/console';
import type { FeedbackRow, FeedbackStatus } from '../src/lib/feedback/feedback';

function row(id: string, message: string, status: FeedbackStatus = 'new', route = '/classroom'): FeedbackRow {
	return {
		id,
		app: 'portal',
		context: route,
		kind: 'bug',
		message,
		meta: { route },
		status,
		created_at: '2026-09-25T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Student',
		submitter_email: 'a@boscotech.net'
	};
}

const ok = (r: FeedbackRow): FeedbackBulkOutcome => ({ row: r, ok: true });
const no = (r: FeedbackRow, message: string | null = null): FeedbackBulkOutcome => ({
	row: r,
	ok: false,
	message
});

describe('the undo window', () => {
	it('is ten seconds, the figure the brief and the report asked for', () => {
		expect(FEEDBACK_UNDO_MS).toBe(10_000);
	});
});

describe('what an undo would put back', () => {
	it('remembers the status each report showed BEFORE the move, as the caller read it', () => {
		const a = row('a', 'Sign in bounces me back.', 'new');
		const b = row('b', 'The QR code goes nowhere.', 'resolved');
		// The caller's reading, taken before the write: these are what the
		// console showed at the press, which is not always the stored status.
		const before = new Map<string, FeedbackStatus>([
			['a', 'new'],
			['b', 'seen']
		]);
		const undo = feedbackUndoFor('spam', [ok(a), ok(b)], (r) => before.get(r.id)!);
		expect(undo).toEqual({
			status: 'spam',
			entries: [
				{ row: a, prev: 'new' },
				{ row: b, prev: 'seen' }
			]
		});
	});

	it('leaves out a report the move REFUSED, since it never moved', () => {
		const a = row('a', 'one');
		const b = row('b', 'two');
		const undo = feedbackUndoFor('seen', [ok(a), no(b, 'refused')], () => 'new');
		expect(undo?.entries.map((e) => e.row.id)).toEqual(['a']);
		// And the positive control: with both landed, both are there.
		expect(feedbackUndoFor('seen', [ok(a), ok(b)], () => 'new')?.entries).toHaveLength(2);
	});

	it('leaves out a report that was already in the target status: a second write of the same value', () => {
		const a = row('a', 'one', 'seen');
		const b = row('b', 'two', 'new');
		const undo = feedbackUndoFor('seen', [ok(a), ok(b)], (r) => r.status);
		expect(undo?.entries.map((e) => e.row.id)).toEqual(['b']);
	});

	it('is null when nothing is left to take back, so no control is offered', () => {
		const a = row('a', 'one');
		expect(feedbackUndoFor('seen', [no(a)], () => 'new')).toBeNull();
		expect(feedbackUndoFor('seen', [ok(a)], () => 'seen')).toBeNull();
		expect(feedbackUndoFor('seen', [], () => 'new')).toBeNull();
	});
});

describe('what the control says', () => {
	it('names where the reports go back to, in words', () => {
		const a = row('a', 'one');
		const b = row('b', 'two');
		expect(feedbackUndoLabel({ status: 'spam', entries: [{ row: a, prev: 'new' }] })).toBe(
			'Undo: back to new'
		);
		expect(
			feedbackUndoLabel({
				status: 'resolved',
				entries: [
					{ row: a, prev: 'new' },
					{ row: b, prev: 'seen' }
				]
			})
		).toBe('Undo: back to where they were');
	});
});

describe('what an undo says afterwards', () => {
	it('names what it undid and where each report went', () => {
		const a = row('a', 'Sign in bounces me back.', 'new', '/');
		const b = row('b', 'The QR code goes nowhere.', 'new', '/maps');
		const summary = feedbackUndoSummary(
			{
				status: 'spam',
				entries: [
					{ row: a, prev: 'new' },
					{ row: b, prev: 'new' }
				]
			},
			[ok(a), ok(b)]
		);
		expect(summary).toBe(
			'Undid the move to spam: 2 reports back to new: / "Sign in bounces me back."; /maps "The QR code goes nowhere.".'
		);
	});

	it('says where each went when they came from different tabs', () => {
		const a = row('a', 'one');
		const b = row('b', 'two');
		const c = row('c', 'three');
		const summary = feedbackUndoSummary(
			{
				status: 'resolved',
				entries: [
					{ row: a, prev: 'new' },
					{ row: b, prev: 'seen' },
					{ row: c, prev: 'new' }
				]
			},
			[ok(a), ok(b), ok(c)]
		);
		expect(summary).toContain('3 reports back where they were (2 new, 1 seen)');
	});

	it('names BOTH halves of a partial undo, with the reason, and says the rest are still moved', () => {
		const a = row('a', 'went back');
		const b = row('b', 'did not');
		const summary = feedbackUndoSummary(
			{
				status: 'seen',
				entries: [
					{ row: a, prev: 'new' },
					{ row: b, prev: 'new' }
				]
			},
			[ok(a), no(b, 'Only site admins can do that.')]
		);
		expect(summary).toContain('1 report back to new: /classroom "went back"');
		expect(summary).toContain(
			'1 did not go back (Only site admins can do that.) and is still seen: /classroom "did not".'
		);
	});

	it('says so plainly when nothing went back', () => {
		const a = row('a', 'stuck');
		const summary = feedbackUndoSummary({ status: 'spam', entries: [{ row: a, prev: 'new' }] }, [no(a)]);
		expect(summary).toContain('Nothing was undone; the move to spam stands.');
		expect(summary).toContain('1 did not go back and is still spam');
	});
});
