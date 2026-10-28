// tests/classroom-grading-work.test.ts
//
// "ANSWERED X OF Y / SAVED AFTER DUE" FOR HTML WORK (ledger 0457, report
// 6aa5954d), the one rule the grading console's roster and the connector both
// read. The manifest is the real smoke-test worksheet staged through the
// importer's own parser, and every expected count is written by hand from that
// file (five module questions, one header name field, one picture box).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stageHtmlDocument } from '../src/lib/classroom/html-assignment/store';
import { worksheetAnswered, worksheetAnsweredWords } from '../src/lib/classroom/grading-work';

const HTML = readFileSync(fileURLToPath(new URL('./fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');
const manifest = stageHtmlDocument('smoke.html', HTML).staged!.manifest;
const DUE = '2026-10-20T06:59:00.000Z';
const before = '2026-10-19T20:00:00.000Z';
const after = '2026-10-21T20:00:00.000Z';
const row = (block_id: string, text: string, updated_at = before) => ({ block_id, value: { text }, updated_at });

describe('worksheetAnswered', () => {
	it('counts the module questions and the picture, never the header name field', () => {
		const a = worksheetAnswered(manifest, [], [], DUE);
		expect(a).toMatchObject({ answered: 0, of: 6, savedAfterDue: 0, allAnswered: false });
		expect(worksheetAnsweredWords(a)).toBe('None of 6 answered');
	});

	it('the name field alone answers nothing', () => {
		const a = worksheetAnswered(manifest, [row('smoke-student-name', 'Ana')], [], DUE);
		expect(a.answered).toBe(0);
	});

	it('answers on time and after the due date', () => {
		const a = worksheetAnswered(
			manifest,
			[row('smoke-writing-line', 'A line.'), row('smoke-writing-reflection', 'One sentence only.', after)],
			[],
			DUE
		);
		expect(a).toMatchObject({ answered: 2, of: 6, short: 1, savedAfterDue: 1, lastSaved: after });
		expect(worksheetAnsweredWords(a)).toBe('Answered 2 of 6, saved after due');
	});

	it("the student's own due date decides late, not the post's", () => {
		const a = worksheetAnswered(manifest, [row('smoke-writing-line', 'A line.', after)], [], '2026-10-23T06:59:00.000Z');
		expect(a.savedAfterDue).toBe(0);
	});

	it('no due date is never late', () => {
		expect(worksheetAnswered(manifest, [row('smoke-writing-line', 'x', after)], [], null).savedAfterDue).toBe(0);
	});

	it('a picture in its box counts as answered', () => {
		const file = { id: 'f1', submission_id: 's1', block_id: 'smoke-evidence-photo', caption: null, filename: 'p.png', mime_type: 'image/png', sort_order: 1, created_at: before };
		expect(worksheetAnswered(manifest, [], [file], DUE).answered).toBe(1);
	});
});
