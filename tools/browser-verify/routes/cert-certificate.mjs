/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, THE PRINTED CERTIFICATE (ledger 0391, surface f):
 * every state stacked on /dev/cert-certificate through the real
 * `CertificatePage` (the component the route mounts), each with a real QR.
 * What has to be true: every sheet is a landscape Letter page (11 by 8.5,
 * within 1%) that fits inside the window at both widths (the frame scales it,
 * so no horizontal scroll at 375); the name, the serial, the certifier, the
 * date and the verify URL clear 4.5 against the paper; the full mark and the
 * QR both decode; a dead award (expired, suspended, revoked) carries its
 * watermark and its status line and a live one carries neither; a 32-character
 * name sits on one line; no filler word anywhere, beside the real words as
 * the control; the Print, Back and Verify keys clear 44px.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

const SHEET_RATIO = `() => {
	const sheets = [...document.querySelectorAll('[data-testid="cert-sheet"]')];
	if (!sheets.length) return ['no sheet found'];
	const target = 11 / 8.5;
	let ok = 0;
	const off = [];
	for (const el of sheets) {
		const r = el.getBoundingClientRect();
		const ratio = r.width / r.height;
		if (Math.abs(ratio - target) / target <= 0.01) ok++;
		else off.push(ratio.toFixed(3));
	}
	return [ok + ' of ' + sheets.length + ' sheets at 11 by 8.5 within 1%' + (off.length ? ' (off: ' + off.join(', ') + ')' : '')];
}`;

const SHEET_FITS = `() => {
	const sheets = [...document.querySelectorAll('[data-testid="cert-sheet"]')];
	if (!sheets.length) return ['no sheet found'];
	const w = document.documentElement.clientWidth;
	const inside = sheets.filter((el) => { const r = el.getBoundingClientRect(); return r.left >= -0.5 && r.right <= w + 0.5 && r.width > 100; }).length;
	return [inside + ' of ' + sheets.length + ' sheets inside the window'];
}`;

const IMAGES_DECODE = `() => {
	const qr = [...document.querySelectorAll('[data-testid="cert-qr"]')];
	const marks = [...document.querySelectorAll('[data-testid="cert-mark"]')];
	const decoded = (list) => list.filter((img) => img.complete && img.naturalWidth > 0).length;
	return [decoded(qr) + ' of ' + qr.length + ' QR codes decoded, ' + decoded(marks) + ' of ' + marks.length + ' marks decoded'];
}`;

const NAME_ONE_LINE = `() => {
	const names = [...document.querySelectorAll('[data-testid="cert-holder-name"]')];
	if (!names.length) return ['no name found'];
	const whole = names.filter((el) => el.scrollWidth <= el.clientWidth + 1).length;
	return [whole + ' of ' + names.length + ' names whole on one line'];
}`;

export default {
	path: '/dev/cert-certificate',
	label: 'IDEA Certifications: the printed certificate (valid, valid with an expiry, expired, suspended, revoked, a 32-character name)',
	prepare: [...certHydrated('certificate')],
	orderResult: [
		{ label: 'every sheet is a landscape Letter page', evaluate: SHEET_RATIO, expected: ['6 of 6 sheets at 11 by 8.5 within 1%'] },
		{ label: 'every sheet fits inside the window (the frame scales it)', evaluate: SHEET_FITS, expected: ['6 of 6 sheets inside the window'] },
		{ label: 'every QR code and every mark decodes', evaluate: IMAGES_DECODE, expected: ['6 of 6 QR codes decoded, 6 of 6 marks decoded'] },
		{ label: 'every name, the 32-character one included, sits whole on one line', evaluate: NAME_ONE_LINE, expected: ['6 of 6 names whole on one line'] }
	],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-testid="cert-sheet"]', label: 'six sheets', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-qr"]', label: 'a QR code on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-mark"]', label: 'the full IDEA mark on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-serial"]', label: 'the serial on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-certifier"]', label: 'the certifier block on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-view="revoked"] [data-testid="cert-watermark"]', label: 'a revoked award carries its watermark (the control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="suspended"] [data-testid="cert-watermark"]', label: 'a suspended one too', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="expired"] [data-testid="cert-watermark"]', label: 'and an expired one', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="valid"] [data-testid="cert-watermark"], [data-view="valid-dated"] [data-testid="cert-watermark"], [data-view="long-name"] [data-testid="cert-watermark"]', label: 'a live award carries none', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-status-line"]', label: 'three status lines, one per dead award', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="valid"] [data-testid="cert-status-line"]', label: 'none on a live one', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-print"]', label: 'Print on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-back"]', label: 'Back on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-verify-link"]', label: 'Verify on each', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-certificate-note"]', label: 'the pointer sentence under each', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	textContains: [
		{
			selector: '[data-view="valid"] [data-testid="cert-sheet"]',
			label: 'every field is real and nothing is filler',
			must: ['Bosco Tech', 'IDEA', 'Certification', 'This certifies that', 'Ana Reyes', 'zero outside help', 'Manual Mill Level 1', 'MILL-1', 'Level 1', 'Machining', 'Awarded November 5, 2026', 'Mr. Pina', 'Certifier', 'Serial', 'IDEA-7K3Q-M9XD-2HTR-W4PB', 'Scan to verify', 'https://ideabosco.com/certifications/verify?serial=IDEA-7K3Q-M9XD-2HTR-W4PB'],
			mustNot: ['Lorem', 'ipsum', 'placeholder', 'Placeholder', 'Sample', 'TODO', 'Valid through', 'REVOKED', 'SUSPENDED', 'EXPIRED', '@boscotech', '—']
		},
		{ selector: '[data-view="valid-dated"] [data-testid="cert-dates"]', label: 'an award with an expiry says until when', must: ['Awarded August 20, 2026', 'Valid through August 16, 2027'] },
		{ selector: '[data-view="expired"] [data-testid="cert-sheet"]', label: 'an expired award says so', must: ['EXPIRED', 'Valid through August 17, 2026'] },
		{ selector: '[data-view="suspended"] [data-testid="cert-status-line"]', label: 'a suspended award says so in a line', must: ['SUSPENDED', 'live record'] },
		{ selector: '[data-view="revoked"] [data-testid="cert-status-line"]', label: 'a revoked award says so in a line', must: ['REVOKED'] },
		{ selector: '[data-view="long-name"] [data-testid="cert-holder-name"]', label: 'the 32-character name', must: ['Maximiliano Fernandez de la Cruz'] },
		{ selector: '[data-view="long-name"] [data-testid="cert-sheet"]', label: 'with its own level and code', must: ['MILL-2', 'Level 2', 'CNC Mill Level 2', 'IDEA-9ZYX-WVTS-RQPN-MKJH'] },
		{ selector: '[data-testid="cert-certificate-note"]', label: 'the paper is a pointer to the record', must: ['pointer to the live record', 'landscape, US Letter'] },
		{ selector: '[data-testid="cert-root"]', label: 'no address anywhere', mustNot: ['@boscotech', '@gmail'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-testid="cert-print"]', label: 'Print', min: 44 },
		{ selector: '[data-testid="cert-back"]', label: 'Back', min: 44 },
		{ selector: '[data-testid="cert-verify-link"]', label: 'Verify', min: 44 }
	],
	contrast: [
		// The certificate page has no lead paragraph: the sheet is the content.
		...SHELL_CONTRAST.filter((c) => c.selector !== '.cert-root .page-header .ph-meta'),
		{ selector: '[data-testid="cert-holder-name"]', label: 'the name against the paper', min: 4.5 },
		{ selector: '[data-testid="cert-serial"]', label: 'the serial against the paper', min: 4.5 },
		{ selector: '.certificate-cert-name', label: 'the certification name (green on paper)', min: 4.5 },
		{ selector: '.certificate-title', label: 'IDEA Certification', min: 4.5 },
		{ selector: '.certificate-eyebrow', label: 'Bosco Tech (green mono)', min: 4.5 },
		{ selector: '.certificate-certifies', label: 'This certifies that (muted small caps)', min: 4.5 },
		{ selector: '.certificate-claim', label: 'the claim line', min: 4.5 },
		{ selector: '.certificate-readout', label: 'code, level and category (muted mono)', min: 4.5 },
		{ selector: '.certificate-dates', label: 'the dates', min: 4.5 },
		{ selector: '.certificate-certifier-name', label: 'the certifier', min: 4.5 },
		{ selector: '.certificate-label', label: 'the mono labels', min: 4.5 },
		{ selector: '.certificate-verify-url', label: 'the verify URL', min: 4.5 },
		{ selector: '[data-view="revoked"] .certificate-status', label: 'the revoked line (crimson on paper)', min: 4.5 },
		{ selector: '[data-view="expired"] .certificate-status', label: 'the expired line (amber on paper)', min: 4.5 },
		{ selector: '.certificate-note', label: 'the pointer sentence on the plate', min: 4.5 },
		{ selector: '.certificate', label: 'the double rule against the paper', min: 3 }
	]
};
