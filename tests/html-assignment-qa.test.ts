// tests/html-assignment-qa.test.ts
//
// LEDGER 0360, REPORT 41c7fcd5: THE QUESTIONS AND ANSWERS OF A PORTED WORKSHEET,
// READ FROM THE STORED MANIFEST AND THE STORED ROWS.
//
// The silent failures are the ones an answer view is for: an answer shown under
// the wrong question, "left blank" folded into "no answer saved", and a question
// named something the export does not call it. Expected values here are typed
// from the fixture, never read off the module.

import { describe, expect, it } from 'vitest';
import { htmlQaAnsweredCount, htmlQaColumn, htmlQaQuestions } from '../src/lib/classroom/html-assignment/qa';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import type { ResponseRow, StudentWork, SubmissionFileRow } from '../src/lib/classroom/assignment-spec';

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gears',
	course: 'IDEA100',
	points: 10,
	header: [{ id: 'h-name', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'm-ratio',
			title: 'Ratios',
			points: 10,
			blocks: [
				{ id: 'r-why', field: 'why', type: 'longText', prompt: 'Why does the small gear turn faster?' },
				{ id: 'r-teeth', field: 'teeth', type: 'text' },
				{ id: 'r-check', field: 'checked', type: 'checkbox' },
				{ id: 'r-table', field: 'trials', type: 'table' },
				{ id: 'r-photo', field: 'photo', type: 'image', prompt: 'Photo of your gear train' },
				{ id: 'r-link', field: 'deck', type: 'text', link: 'presentation', prompt: 'Deck link' }
			],
			criteria: []
		}
	]
} as unknown as HtmlAssignmentManifest;

const row = (email: string, block: string, value: ResponseRow['value']): ResponseRow => ({
	item_id: 'i',
	student_email: email,
	block_id: block,
	value
});

const ANA: StudentWork = {
	email: 'ana@x.net',
	displayName: 'Ana Reyes',
	active: true,
	submission: { id: 'sub-a' } as StudentWork['submission'],
	responses: [
		row('ana@x.net', 'h-name', { text: 'Ana' }),
		row('ana@x.net', 'r-why', { text: 'Fewer teeth, so one turn of the big one\nturns it more.' }),
		row('ana@x.net', 'r-teeth', { text: '' }),
		row('ana@x.net', 'r-check', { checked: [true] }),
		row('ana@x.net', 'r-table', {
			text: JSON.stringify([
				{ trial: '1', ratio: '2:1' },
				{ trial: '', ratio: '' }
			])
		}),
		row('ana@x.net', 'r-link', { text: 'https://docs.google.com/presentation/d/a/edit' }),
		// A ROW WHOSE BLOCK THE MANIFEST NO LONGER DECLARES.
		row('ana@x.net', 'old-q', { text: 'From the first upload' })
	],
	files: [
		{
			id: 'f1',
			submission_id: 'sub-a',
			block_id: 'r-photo',
			filename: 'train.jpg',
			caption: 'Second build',
			mime_type: 'application/octet-stream'
		} as SubmissionFileRow
	],
	approvals: []
};

const BEN: StudentWork = {
	email: 'ben@x.net',
	displayName: 'Ben Okafor',
	active: false,
	submission: null,
	responses: [row('ben@x.net', 'r-why', { text: 'It is smaller.' }), row('ben@x.net', 'r-link', { text: 'my deck' })],
	files: [],
	approvals: []
};

describe('htmlQaQuestions', () => {
	it('keeps manifest order, header first, and reads the prompt over "<module>: <field>"', () => {
		const qs = htmlQaQuestions(MANIFEST);
		expect(qs.map((q) => q.label)).toEqual([
			'Identity: studentName',
			'Why does the small gear turn faster?',
			'Ratios: teeth',
			'Ratios: checked',
			'Ratios: trials',
			'Photo of your gear train',
			'Deck link'
		]);
		expect(qs.map((q) => q.prompted)).toEqual([false, true, false, false, false, true, true]);
		expect(qs[0].header).toBe(true);
		expect(qs.slice(1).every((q) => !q.header)).toBe(true);
		expect(qs.map((q) => q.link)).toEqual([null, null, null, null, null, null, 'presentation']);
	});

	it('a block the manifest does not declare is never a question', () => {
		expect(htmlQaQuestions(MANIFEST).some((q) => q.blockId === 'old-q')).toBe(false);
	});

	it('a manifest it cannot walk asks nothing', () => {
		expect(htmlQaQuestions(null)).toEqual([]);
		expect(htmlQaQuestions({ modules: 'nope' })).toEqual([]);
	});
});

describe('htmlQaColumn', () => {
	it('every student, in the order given, with "no answer saved" and "left blank" told apart', () => {
		const teeth = htmlQaColumn(MANIFEST, [ANA, BEN], 'r-teeth');
		expect(teeth.map((a) => [a.displayName, a.text])).toEqual([
			['Ana Reyes', ''],
			['Ben Okafor', null]
		]);
		expect(teeth.map((a) => a.active)).toEqual([true, false]);
	});

	it('keeps a student’s own line breaks, words a checkbox, and flattens a table', () => {
		expect(htmlQaColumn(MANIFEST, [ANA], 'r-why')[0].text).toBe(
			'Fewer teeth, so one turn of the big one\nturns it more.'
		);
		expect(htmlQaColumn(MANIFEST, [ANA], 'r-check')[0].text).toBe('Ticked');
		// The blank second row is dropped, the CSV's own reading.
		expect(htmlQaColumn(MANIFEST, [ANA], 'r-table')[0].text).toBe('Row 1: trial=1, ratio=2:1');
	});

	it('hangs the photograph off its own question', () => {
		const photo = htmlQaColumn(MANIFEST, [ANA, BEN], 'r-photo');
		expect(photo.map((a) => a.image)).toEqual([{ name: 'train.jpg', caption: 'Second build' }, null]);
	});

	it('carries the links in the answer, a declared one that is not a link included', () => {
		const deck = htmlQaColumn(MANIFEST, [ANA, BEN], 'r-link');
		expect(deck[0].links.map((l) => [l.url, l.host])).toEqual([
			['https://docs.google.com/presentation/d/a/edit', 'Google Slides']
		]);
		expect(deck[1].links.map((l) => [l.url, l.raw])).toEqual([[null, 'my deck']]);
	});

	it('an orphaned block is not invented as a question with answers', () => {
		expect(htmlQaColumn(MANIFEST, [ANA, BEN], 'old-q')).toEqual([]);
		// Positive control: a declared block answers both students.
		expect(htmlQaColumn(MANIFEST, [ANA, BEN], 'r-why')).toHaveLength(2);
	});

	it('htmlQaAnsweredCount counts text and photographs, never a blank', () => {
		expect(htmlQaAnsweredCount(htmlQaColumn(MANIFEST, [ANA, BEN], 'r-why'))).toBe(2);
		expect(htmlQaAnsweredCount(htmlQaColumn(MANIFEST, [ANA, BEN], 'r-teeth'))).toBe(0);
		expect(htmlQaAnsweredCount(htmlQaColumn(MANIFEST, [ANA, BEN], 'r-photo'))).toBe(1);
	});
});
