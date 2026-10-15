/**
 * THE CERTIFICATE UNDER SPACE WHITE (ledger 0391, surface f), on a revoked
 * award. The sheet is paper and does not follow the theme (the probe reads
 * its ground back as the paper colour whatever the plate is); the chrome
 * around it (the keys, the pointer sentence, the shell) does, and is
 * re-measured here on the light plate. The watermark and the status line
 * are the rows a reprint of a dead award rests on.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_TAP_TARGETS, SPACE_WHITE_ON } from './_cert.mjs';

const SHEET_GROUND = `() => {
	const el = document.querySelector('[data-testid="cert-sheet"]');
	if (!el) return ['no sheet'];
	return [getComputedStyle(el).backgroundColor + ' under ' + (document.documentElement.getAttribute('data-theme') || 'no theme')];
}`;

export default {
	path: '/dev/cert-certificate?state=revoked&theme=space-white',
	label: 'IDEA Certifications: a revoked certificate under Space White',
	prepare: [...certHydrated('certificate'), SPACE_WHITE_ON],
	orderResult: [{ label: 'the sheet stays paper under the light theme', evaluate: SHEET_GROUND, expected: ['rgb(253, 253, 251) under space-white'] }],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-sheet"][data-status="revoked"]', label: 'one revoked sheet', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-watermark"]', label: 'its watermark', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-status-line"]', label: 'its status line', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-qr"]', label: 'the QR', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view]', label: 'no stacked views in the single state (the control for the counts above)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cert-sheet"]', label: 'the sheet says revoked, and still every real field', must: ['REVOKED', 'Ana Reyes', 'Manual Mill Level 1', 'IDEA-7K3Q-M9XD-2HTR-W4PB', 'Mr. Pina'], mustNot: ['Lorem', '—'] }
	],
	tapTargets: [...SHELL_TAP_TARGETS, { selector: '[data-testid="cert-print"], [data-testid="cert-back"], [data-testid="cert-verify-link"]', label: 'Print, Back and Verify', min: 44 }],
	contrast: [
		// The certificate page has no lead paragraph: the sheet is the content.
		...SHELL_CONTRAST.filter((c) => c.selector !== '.cert-lead'),
		{ selector: '[data-testid="cert-holder-name"]', label: 'the name against the paper', min: 4.5 },
		{ selector: '[data-testid="cert-serial"]', label: 'the serial against the paper', min: 4.5 },
		{ selector: '.certificate-status', label: 'the revoked line (crimson on paper)', min: 4.5 },
		{ selector: '.certificate-readout', label: 'the muted mono on paper', min: 4.5 },
		{ selector: '.certificate-note', label: 'the pointer sentence on the light plate', min: 4.5 },
		{ selector: '[data-testid="cert-certificate-bar"] .cert-btn', label: 'the key words on the light plate', min: 4.5 }
	]
};
