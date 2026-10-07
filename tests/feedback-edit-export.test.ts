// tests/feedback-edit-export.test.ts
//
// AN ADMIN'S CORRECTION OF A FILED REPORT (0233, report d362bfb3), on the pure
// side: what every surface reads as "what the report says now", and what the
// exports carry. What would fail SILENTLY:
//
//   1. AN UNEDITED REPORT EXPORTS EXACTLY AS IT DID. The golden beside this file
//      was generated from console.ts as it stood before the edit readers
//      existed, so this is the old code's own output, not a belief about it --
//      and it must hold for a row carrying `edit: null`, which is what every row
//      looks like once 0233 is applied.
//   2. AN EDITED REPORT READS AS EDITED EVERYWHERE THAT SHOWS ONE: the
//      markdown heading and quote, the kind filter, the bulk-note label. A
//      surface still reading `row.message` would show the garble the edit
//      removed, which is exactly what the next feedback round would then read.
//   3. THE REPORTER'S OWN WORDS ARE NOT LOST: the JSON export keeps them on the
//      row with the correction beside it, and the markdown names the edit.
//   4. A MALFORMED `edit` READS AS NO EDIT, never as half of one.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	EMPTY_FEEDBACK_FILTER,
	feedbackJson,
	feedbackMarkdown,
	feedbackRowLabel,
	filterFeedback,
	rowEdit,
	rowIsEdited,
	rowKind,
	rowMessage,
	rowOriginal,
	rowOriginalTried,
	rowTried
} from '../src/lib/feedback/console';
import { feedbackEditRefusalWords, FEEDBACK_EDIT_REFUSALS, type FeedbackRow } from '../src/lib/feedback/feedback';
import { EDIT_GOLDEN_ROWS, EDIT_GOLDEN_STAMP } from './fixtures/feedback-edit-rows';

const GOLDEN = JSON.parse(
	readFileSync(new URL('./fixtures/feedback-export-unedited-golden.json', import.meta.url), 'utf8')
) as { markdown: string; markdownWithheld: string; json: string; labels: string[] };

const opts = { generatedAt: EDIT_GOLDEN_STAMP };
const withNullEdit = EDIT_GOLDEN_ROWS.map((r) => ({ ...r, edit: null }));

describe('an unedited report exports byte-identically to the code before edits existed', () => {
	it('the golden is a real export (the positive control): seven reports, grouped, quoted', () => {
		expect(GOLDEN.markdown).toContain('Reports: 7');
		expect(GOLDEN.markdown).toContain('Grouped by route id');
		expect(GOLDEN.markdown).toContain('\\### not a heading');
		expect(GOLDEN.labels).toHaveLength(7);
	});

	it('markdown, with and without names, from rows with no edit key', () => {
		expect(feedbackMarkdown(EDIT_GOLDEN_ROWS, opts).text).toBe(GOLDEN.markdown);
		expect(feedbackMarkdown(EDIT_GOLDEN_ROWS, { ...opts, includeSubmitter: false }).text).toBe(GOLDEN.markdownWithheld);
	});

	it('markdown from rows carrying `edit: null`, the shape every row has after 0233', () => {
		expect(feedbackMarkdown(withNullEdit, opts).text).toBe(GOLDEN.markdown);
		expect(feedbackMarkdown(withNullEdit, { ...opts, includeSubmitter: false }).text).toBe(GOLDEN.markdownWithheld);
	});

	it('JSON from rows with no edit key, and the bulk-note labels', () => {
		expect(feedbackJson(EDIT_GOLDEN_ROWS, opts)).toBe(GOLDEN.json);
		expect(EDIT_GOLDEN_ROWS.map(feedbackRowLabel)).toEqual(GOLDEN.labels);
		expect(withNullEdit.map(feedbackRowLabel)).toEqual(GOLDEN.labels);
	});

	it('the edit readers answer the reporter\'s own words when nobody edited', () => {
		for (const row of [...EDIT_GOLDEN_ROWS, ...withNullEdit]) {
			expect(rowIsEdited(row)).toBe(false);
			expect(rowKind(row)).toBe(row.kind);
			expect(rowMessage(row)).toBe(row.message);
			expect(rowTried(row)).toBe(rowOriginalTried(row));
		}
		// The meta fallback still reads (the pre-0170 shape).
		expect(rowTried(EDIT_GOLDEN_ROWS[2])).toBe('Nothing, it worked.');
	});
});

const EDIT = {
	revision: 2,
	kind: 'idea',
	message: 'The Save button should save the draft.',
	tried: null,
	edited_by: 'apina@boscotech.edu',
	edited_at: '2026-10-07T17:30:00.000Z'
};
const edited: FeedbackRow = { ...EDIT_GOLDEN_ROWS[0], edit: EDIT };

describe('an edited report reads as edited on every surface that shows one', () => {
	it('the readers', () => {
		expect(rowEdit(edited)).toEqual(EDIT);
		expect(rowKind(edited)).toBe('idea');
		expect(rowMessage(edited)).toBe('The Save button should save the draft.');
		// The admin cleared "tried": the correction wins, it does not fall back.
		expect(rowTried(edited)).toBeNull();
		expect(rowOriginal(edited)).toEqual({
			kind: 'bug',
			message: 'The Save button does nothing.\n### not a heading\n---',
			tried: 'Reloaded twice.'
		});
	});

	it('the markdown heading, the quote and one `edited:` fact; the original is not printed', () => {
		const md = feedbackMarkdown([edited], opts).text;
		expect(md).toContain('### 1. idea at /classroom/[sectionId]');
		expect(md).toContain('> The Save button should save the draft.');
		expect(md).toContain(
			"- edited: 2026-10-07T17:30:00.000Z by apina@boscotech.edu (revision 2); the reporter's own words are kept in the console and in the JSON export"
		);
		expect(md).not.toContain('The Save button does nothing.');
		expect(md).not.toContain('Tried first');
		// Positive control: the same row unedited prints the original.
		expect(feedbackMarkdown([EDIT_GOLDEN_ROWS[0]], opts).text).toContain('The Save button does nothing.');
	});

	it('the JSON keeps the reporter\'s own words on the row, the correction beside them', () => {
		const parsed = JSON.parse(feedbackJson([edited], opts));
		expect(parsed.reports[0].message).toBe('The Save button does nothing.\n### not a heading\n---');
		expect(parsed.reports[0].kind).toBe('bug');
		expect(parsed.reports[0].tried).toBe('Reloaded twice.');
		expect(parsed.reports[0].edit).toEqual(EDIT);
		// The toggle withholds the reporter, never the admin who corrected it.
		const withheld = JSON.parse(feedbackJson([edited], { ...opts, includeSubmitter: false }));
		expect(withheld.reports[0].submitter_name).toBeNull();
		expect(withheld.reports[0].edit.edited_by).toBe('apina@boscotech.edu');
	});

	it('the kind filter and the label read the correction', () => {
		const rows = [edited, EDIT_GOLDEN_ROWS[1]];
		const idea = filterFeedback(rows, { ...EMPTY_FEEDBACK_FILTER, kind: 'idea' });
		expect(idea.map((r) => r.id)).toEqual(['g1', 'g2']);
		const bug = filterFeedback(rows, { ...EMPTY_FEEDBACK_FILTER, kind: 'bug' });
		expect(bug.map((r) => r.id)).toEqual([]);
		expect(feedbackRowLabel(edited)).toBe('/classroom/[sectionId] "The Save button should save the draft."');
	});
});

describe('a malformed edit is no edit at all', () => {
	const bad: unknown[] = [
		'a string',
		[],
		{ revision: 0, kind: 'bug', message: 'x', edited_at: 'now' },
		{ revision: 1.5, kind: 'bug', message: 'x', edited_at: 'now' },
		{ revision: 1, kind: '', message: 'x', edited_at: 'now' },
		{ revision: 1, kind: 'bug', message: '   ', edited_at: 'now' },
		{ revision: 1, kind: 'bug', message: 'x' },
		{ revision: '2', kind: 'bug', message: 'x', edited_at: 'now' }
	];
	it.each(bad.map((b, i) => [i, b] as const))('shape %i reads as unedited', (_i, b) => {
		const row = { ...EDIT_GOLDEN_ROWS[0], edit: b } as unknown as FeedbackRow;
		expect(rowEdit(row)).toBeNull();
		expect(rowMessage(row)).toBe(EDIT_GOLDEN_ROWS[0].message);
	});
	it('and the well-formed control reads as edited', () => {
		expect(rowIsEdited(edited)).toBe(true);
	});
});

describe('the refusal words', () => {
	it('every reason the database answers has a sentence, and an unknown one is named', () => {
		for (const reason of ['kind', 'empty', 'too_long', 'tried_too_long', 'stale']) {
			expect(FEEDBACK_EDIT_REFUSALS[reason], reason).toBeTruthy();
		}
		expect(feedbackEditRefusalWords('stale')).toMatch(/Another admin changed this report/);
		expect(feedbackEditRefusalWords('brand_new')).toBe('The database refused that edit (brand_new).');
	});
});
