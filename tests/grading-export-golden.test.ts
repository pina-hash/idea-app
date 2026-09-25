import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { goldenCases, renderCase, type GoldenOutput } from './grading-export-golden-cases';

/**
 * THE SPEC PATH EXPORTS BYTE-IDENTICALLY TO BEFORE THE MANIFEST PATH EXISTED
 * (ledger 0298, R24).
 *
 * `tests/fixtures/grading-export-golden.json` was written by running
 * `goldenCases()` through the export module AS IT STOOD BEFORE ported HTML
 * worksheets were taught to it (see `tests/grading-export-golden-cases.ts`).
 * This replays the same inputs through the module as it stands now and
 * requires the JSON bytes, every cell of every sheet, the workbook's SHA-256
 * and both filenames to match.
 *
 * WHY IT IS AN AUTOMATED TEST: the failure it guards is silent. A spec export
 * that gained a key, lost a column or reordered two sheets still opens, still
 * reads correctly, and is only noticed when somebody diffs two exports of the
 * same class weeks apart -- which nobody does.
 *
 * Every mismatch names its case and its field, because "a golden differs" says
 * nothing about which of nine exports moved.
 */

const golden = JSON.parse(
	readFileSync(
		fileURLToPath(new URL('./fixtures/grading-export-golden.json', import.meta.url)),
		'utf8'
	)
) as { count: number; cases: (GoldenOutput & { name: string })[] };

describe('the spec path is byte-identical to the golden taken before the manifest path', () => {
	const cases = goldenCases();

	it('replays exactly as many cases as the golden holds, and more than none', () => {
		expect(cases.length).toBe(golden.count);
		expect(golden.cases.length).toBe(golden.count);
		expect(cases.length).toBeGreaterThanOrEqual(9);
	});

	for (const [i, c] of cases.entries()) {
		it(`${c.name}: JSON, sheets, workbook bytes and filenames`, async () => {
			const want = golden.cases[i];
			expect(want.name).toBe(c.name);
			const got = await renderCase(c.input);
			expect(got.json, `${c.name}: JSON`).toBe(want.json);
			expect(got.sheets, `${c.name}: sheets`).toBe(want.sheets);
			expect(got.xlsxSha256, `${c.name}: workbook bytes`).toBe(want.xlsxSha256);
			expect(got.jsonFilename, `${c.name}: JSON filename`).toBe(want.jsonFilename);
			expect(got.xlsxFilename, `${c.name}: workbook filename`).toBe(want.xlsxFilename);
		});
	}

	it('a manifest handed in BESIDE a spec changes nothing: the spec decides the export', async () => {
		// The console never does this (the grade route withholds one or the
		// other), but the export must not start reading a manifest just because
		// one arrived: the brief's rule is "when spec is null".
		const first = cases[0];
		const got = await renderCase({
			...first.input,
			manifest: {
				schemaVersion: 3,
				kind: 'html-assignment',
				title: 'Stray',
				course: 'IDEA100',
				points: 1,
				modules: [
					{
						id: 'stray',
						title: 'Stray',
						points: 1,
						blocks: [{ id: 'stray-a', field: 'a', type: 'text' }],
						criteria: []
					}
				]
			}
		});
		expect(got.json).toBe(golden.cases[0].json);
		expect(got.sheets).toBe(golden.cases[0].sheets);
	});
});
