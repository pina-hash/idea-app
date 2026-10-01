/**
 * THE ITEM PAGE, ARRANGED: THE INSTRUCTIONS MOVED BELOW THE WORK (ledger 0360,
 * report R23). The work slot is the anchor and holds a real `<iframe>` that
 * posts each load to the harness, so the worksheet having loaded ONCE is part
 * of the claim: the panels were placed around it, it was never moved.
 */
import { DOM_ORDER, IGNORE, READY } from './_classroom-layout.mjs';

export default {
	path: '/dev/classroom-layout?page=item&preset=reordered',
	label: 'Item page as a student who moved the instructions below the work: the work slot loaded once',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{ waitFor: `() => document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads === '1'`, timeoutMs: 10000 }
	],
	orderResult: [
		{
			label: 'the instructions follow the work; the rubric stays last',
			evaluate: DOM_ORDER,
			expected: ['deck', 'notebook', 'links', 'files', 'work', 'body', 'rubric']
		},
		{ label: 'the worksheet frame loaded exactly once', evaluate: `() => [document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads]`, expected: ['1'] }
	],
	domOrder: [
		{ before: '[data-testid="lh-anchor"]', after: '.lh-main [data-panel="body"]', label: 'the work before the instructions', beforeLabel: 'work', afterLabel: 'instructions' }
	],
	presence: [
		{ selector: '.lh-main [data-panel="rubric"]', label: 'the rubric, shown (not hidden in this preset)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="lh-anchor"] iframe', label: 'the worksheet frame in the work slot', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	ignoreConsole: IGNORE
};
