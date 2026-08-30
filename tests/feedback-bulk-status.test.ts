import { describe, expect, it } from 'vitest';
import {
	FEEDBACK_BULK_NAME_LIMIT,
	feedbackBulkSummary,
	feedbackRowLabel,
	type FeedbackBulkOutcome
} from '../src/lib/feedback/console';
import type { FeedbackRow } from '../src/lib/feedback/feedback';

/**
 * WHAT A BULK STATUS CHANGE SAYS AFTERWARDS.
 *
 * `app_feedback_set_status` takes ONE id, so a batch is N independent writes
 * and there is no transaction to make it atomic. That makes a PARTIAL result an
 * ordinary outcome rather than an edge case, and the dangerous version of it is
 * a set left half changed with nothing on screen saying which half: the next
 * thing anybody does over dozens of open reports is press the button again over
 * the same selection.
 *
 * NOTHING ON SCREEN REPORTS A SUMMARY THAT QUIETLY STOPS NAMING THINGS. A
 * sentence reading "12 of 30 updated" looks like a working confirmation and is
 * exactly the answer that cannot be acted on, which is what puts these here
 * rather than in the harness beside them.
 */

function row(id: string, message: string, route = '/classroom'): FeedbackRow {
	return {
		id,
		app: 'portal',
		context: route,
		kind: 'bug',
		message,
		meta: { route },
		status: 'new',
		created_at: '2026-08-21T09:02:00.000Z',
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

describe('how a report is named', () => {
	it('is the route plus the opening of what was written', () => {
		expect(feedbackRowLabel(row('f1', 'The save button does nothing.', '/notebook'))).toBe(
			'/notebook "The save button does nothing."'
		);
	});

	/**
	 * A report is free text somebody typed, routinely several lines of it. A
	 * confirmation that swallows a paragraph is a confirmation nobody reads.
	 */
	it('flattens and caps a long multi-line message', () => {
		const label = feedbackRowLabel(
			row('f1', 'line one\n\nline two goes on and on and on and on and on and on and on')
		);
		expect(label).not.toContain('\n');
		expect(label.endsWith('..."')).toBe(true);
		expect(label.length).toBeLessThan(80);
	});

	it('falls back to the route alone when there is no message text', () => {
		expect(feedbackRowLabel(row('f1', '   ', '/coins'))).toBe('/coins');
	});
});

describe('what a bulk status change reports', () => {
	it('NAMES what moved rather than only counting it', () => {
		const a = row('f1', 'Sign in bounces me back.');
		const bRow = row('f2', 'The QR code goes nowhere.');
		const summary = feedbackBulkSummary('resolved', [ok(a), ok(bRow)]);
		expect(summary).toContain('Moved 2 reports to resolved');
		expect(summary).toContain('Sign in bounces me back.');
		expect(summary).toContain('The QR code goes nowhere.');
	});

	/**
	 * THE ONE THAT MATTERS. Both halves are named, so a half-changed set is
	 * legible: the reports that moved, and the reports that did not with the
	 * server's own reason.
	 */
	it('names BOTH halves of a partial batch, with the refusal reason', () => {
		const moved = row('f1', 'Moved fine.');
		const refused = row('f2', 'Refused here.');
		const summary = feedbackBulkSummary('seen', [
			ok(moved),
			no(refused, 'Only site admins can review feedback.')
		]);
		expect(summary).toContain('Moved 1 report to seen');
		expect(summary).toContain('Moved fine.');
		expect(summary).toContain('1 did not move');
		expect(summary).toContain('Only site admins can review feedback.');
		expect(summary).toContain('Refused here.');
	});

	it('says plainly when nothing moved at all', () => {
		const summary = feedbackBulkSummary('resolved', [no(row('f1', 'Nope.'), 'Refused.')]);
		expect(summary).toContain('Nothing moved to resolved.');
		expect(summary).toContain('1 did not move');
		expect(summary).toContain('Nope.');
	});

	/**
	 * A LIST THAT SILENTLY STOPS READS AS THE WHOLE LIST, which is the same
	 * reason the markdown export states its own budget. The cap is allowed to
	 * cut; it is not allowed to cut quietly.
	 */
	it('states the remainder when the name cap cuts the list', () => {
		const many = Array.from({ length: FEEDBACK_BULK_NAME_LIMIT + 3 }, (_, i) =>
			ok(row(`f${i}`, `report number ${i}`))
		);
		const summary = feedbackBulkSummary('seen', many);
		expect(summary).toContain(`Moved ${many.length} reports to seen`);
		expect(summary).toContain('(and 3 more)');
		expect(summary).toContain('report number 0');
		// The positive control for the cap: the ones past it are NOT named.
		expect(summary).not.toContain(`report number ${FEEDBACK_BULK_NAME_LIMIT + 2}`);
	});

	it('a refusal with no message still names the reports', () => {
		const summary = feedbackBulkSummary('new', [no(row('f1', 'No reason given.'))]);
		expect(summary).toContain('1 did not move:');
		expect(summary).toContain('No reason given.');
		expect(summary).not.toContain('()');
	});
});
