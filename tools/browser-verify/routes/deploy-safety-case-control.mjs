/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { HYDRATED, READ_BETWEEN, TYPE_THEN_PRESS } from './_deploy-safety.mjs';

/**
 * THE NEGATIVE CONTROL FOR `deploy-safety-case-text`: the identical run with
 * NO new version live. The answer is still flushed and acknowledged (that is
 * the save guard, which owes nothing to a deploy), the link still arrives, and
 * NO full page load happens. Without this spec, the text case's one document
 * could be the harness reloading for some other reason and nobody could tell.
 */
export default {
	path: '/dev/deploy-safety?case=control',
	label: 'Deploy safety: unsaved answer, then a link, with NO new version (control)',
	prepare: [
		{ waitFor: HYDRATED, timeoutMs: 45_000 },
		{
			evaluate: TYPE_THEN_PRESS('The lower chord buckled first.', '[data-testid="link-next"]', 'click'),
			waitMs: 100
		},
		{ waitFor: `() => location.pathname === '/dev/deploy-safety/next'`, timeoutMs: 15_000 },
		/* Long enough for a reload that was going to happen to have happened: the
		   text case's arrives about 400ms after the press. */
		{ waitFor: `() => { const m = window.__dsLog().find((e) => e.label === 'click'); return m && Date.now() - m.at > 2500; }`, timeoutMs: 15_000 }
	],
	orderResult: [
		{
			evaluate: READ_BETWEEN('click', null),
			expected: [
				'documents 0',
				'to (none)',
				'verdicts not-updated/goto',
				'acknowledged first no-reload'
			],
			label:
				'no full page load at all, the answer acknowledged, and the verdict naming the reason: no newer version'
		}
	],
	presence: [
		{
			selector: '[data-testid="arrived"]',
			label: 'the link target, arrived at in-app',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	]
};
