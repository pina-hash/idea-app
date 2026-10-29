// tests/html-assignment-rubric-visibility.test.ts
//
// LEDGER 0458, REPORT c9d7efc3: a rubric line whose requirement a student can
// only find in a tooltip or a closed fold is flagged at upload. A warning, never
// a refusal: a page may say the same thing in other words.

import { describe, expect, it } from 'vitest';
import { rubricVisibilityWarnings } from '$lib/classroom/html-assignment/manifest';

const m = {
	modules: [
		{
			id: 'm1',
			title: 'Measure',
			criteria: [
				{ id: 'c1', text: 'Records three caliper readings with units' },
				{ id: 'c2', text: 'Explains tolerance stackup between mating parts' }
			]
		}
	]
};

describe('rubric lines said where a student sees them', () => {
	it('a line said in the step passes', () => {
		const html = '<main><h2>Measure</h2><p>Write three caliper readings with their units.</p><p>Explain the tolerance stackup between the mating parts.</p></main>';
		expect(rubricVisibilityWarnings(m, html)).toEqual([]);
	});

	it('a line said only in a tooltip or a closed fold is flagged, by name', () => {
		const html =
			'<main><h2>Measure</h2><p>Write three caliper readings with their units.</p>' +
			'<span class="it" data-tip="Explain the tolerance stackup between the mating parts">?</span>' +
			'<details><summary>More</summary><p>Tolerance stackup between mating parts matters.</p></details></main>';
		const out = rubricVisibilityWarnings(m, html);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatch(/"Explains tolerance stackup between mating parts" in "Measure"/);
	});

	it('the manifest itself is not the page: words only in the manifest script still flag', () => {
		const html = `<main><p>Measure your part.</p></main><script type="application/json" id="idea-manifest">${JSON.stringify(m)}</script><p title="caliper readings units recorded">x</p>`;
		const out = rubricVisibilityWarnings(m, html);
		expect(out.some((w) => w.includes('Records three caliper readings'))).toBe(true);
	});
});
