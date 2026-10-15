/**
 * THE CATALOG UNDER SPACE WHITE (ledger 0391): the room reads only register
 * tokens, so the light theme paints it with no twin of its own; this spec is
 * what says so with numbers rather than by construction. The readouts' tone
 * inks (ok, warn, bad) and the dark Start are the rows worth re-measuring.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_TAP_TARGETS, SPACE_WHITE_ON } from './_cert.mjs';

export default {
	path: '/dev/cert-catalog?state=full&theme=space-white',
	label: 'IDEA Certifications: the full catalog under Space White',
	prepare: [...certHydrated('catalog'), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-catalog-card"]', label: 'seven certifications', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-card-start"][aria-disabled="true"]', label: 'one dark Start', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="cert-catalog-card"][data-code="MILL-2"]', label: 'the locked card still says why', must: ['Needs MILL-1 first'] }],
	tapTargets: [...SHELL_TAP_TARGETS, { selector: '[data-testid="cert-card-start"]', label: 'Start keys', min: 44 }, { selector: '.cert-card-link', label: 'card name links', min: 44 }],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.cert-card-name a', label: 'card names', min: 4.5 },
		{ selector: '.cert-card-def', label: 'definitions', min: 4.5 },
		{ selector: '.cert-readout:not(.is-ok):not(.is-warn)', label: 'plain readouts', min: 4.5 },
		{ selector: '.cert-readout.is-ok', label: 'the Earned readout (green ink on the light plate)', min: 4.5 },
		{ selector: '.cert-readout.is-warn', label: 'the Dormant readout (amber ink on the light plate)', min: 4.5 },
		{ selector: '[data-testid="cert-card-needs"]', label: 'the missing-prerequisite words', min: 4.5 },
		{ selector: '.cert-card-why', label: 'why a Start is dark', min: 4.5 },
		{ selector: '.cert-card', label: 'card edges', min: 3 }
	]
};
