/**
 * ONE LAB COMPUTER, ONE LABEL (ledger 0441): the Checked out view of the same
 * shared lab. Ana and Diego each hold a file on the shared IDEA-06 (each on a
 * sign-in of their own) and Ben holds one on the clone imaged alike; both of
 * the shared computer's rows read one label, the clone's its own.
 */
import { ARMORY_HYDRATED, DOC_HEIGHT } from './_armory.mjs';

export default {
	path: '/dev/armory?state=shared-out',
	label: 'IDEA Armory: checkouts on a shared lab computer carry its one label',
	prepare: [...ARMORY_HYDRATED, { evaluate: DOC_HEIGHT }],
	orderResult: [
		{
			label: 'each checkout names its computer: the shared one twice, the clone once',
			evaluate: `() => [...document.querySelectorAll('[data-testid="armory-checkout"] .ar-out-device')].map((c) => c.textContent.trim()).sort()`,
			expected: ['IDEA-06 (3fa1)', 'IDEA-06 (3fa1)', 'IDEA-06 (b2c4)']
		}
	],
	presence: [{ selector: '[data-testid="armory-checkout"]', label: 'three checkouts', expectPresent: 3, maxPresent: 3, expectVisible: 3 }],
	contrast: [{ selector: '.ar-out-device', label: 'computer labels', min: 4.5 }]
};
