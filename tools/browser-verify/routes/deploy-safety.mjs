/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { HYDRATED } from './_deploy-safety.mjs';

/**
 * THE DEPLOY SAFETY HARNESS AT REST: the real assignment engine with a written
 * answer and a photo zone, the in-app links every case spec presses, and the
 * counters. No new version is live and nothing has been pressed, so the
 * counters read one document, no holds and no verdict -- the state every
 * `deploy-safety-case-*` spec starts from.
 */
export default {
	path: '/dev/deploy-safety',
	label: 'Deploy safety harness, at rest',
	prepare: [{ waitFor: HYDRATED, timeoutMs: 45_000 }],
	presence: [
		{
			selector: '[data-testid="engine-here"] textarea',
			label: 'the answer field',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* TWO, both the real `FileUploadPanel`: the spec's photo zone and the
			   engine's own hand-in panel. The upload case picks into the first,
			   which is the photo zone; both go through the same upload path. */
			selector: '[data-testid="engine-here"] .fup-zone',
			label: 'the photo zone and the hand-in panel',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		}
	],
	textContains: [
		{
			selector: '[data-testid="ds-bar"]',
			label: 'the counters at rest',
			must: ['documents 1', 'updated no', 'holds 0', 'last verdict none']
		}
	],
	contrast: [{ selector: '[data-testid="ds-bar"] .ds-chip', label: 'the counters', min: 4.5 }],
	tapTargets: [
		{ selector: '[data-testid="link-next"]', label: 'Next page' },
		{ selector: '[data-testid="link-deck"]', label: 'The deck' },
		{ selector: '[data-testid="link-projector"]', label: 'A projector surface' },
		{ selector: '[data-testid="link-editors"]', label: 'The editors' },
		{ selector: '[data-testid="engine-here"] textarea', label: 'the answer field' }
	]
};
