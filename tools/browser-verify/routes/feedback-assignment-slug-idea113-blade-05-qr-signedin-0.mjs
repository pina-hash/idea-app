/**
 * THE ONE LIGHT ASSIGNMENT PAGE (report 35's rule, applied to a legacy page):
 * `idea113-blade-05-qr.html` is a white, printable QR sheet, and every other
 * carried-over assignment is neon on black. The injected panel reads the
 * page's own ground when it mounts and takes the set drawn for it, so here the
 * control and the panel are ink on white, and on a printout neither appears.
 */
import { openPanel, TRIGGER_FACTS, TRIGGER_FACTS_EXPECTED } from './_legacy-report.mjs';

export default {
	path: '/dev/feedback/assignment?slug=idea113-blade-05-qr&signedIn=0',
	label: 'Assignment QR sheet (light page): the Report control and panel in ink on white',
	prepare: [
		{ waitFor: '() => !!document.getElementById("idea-legacy-report-btn")', timeoutMs: 20000, label: 'the injected trigger has mounted' },
		openPanel(`() => !!document.querySelector('#idea-legacy-report input[type="text"]')`)
	],
	presence: [
		{ selector: '#idea-legacy-report-btn', label: 'the floating Report control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report', label: 'the report panel, once opened', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '#idea-legacy-report-btn span', label: 'the Report word on the floating control', min: 4.5 },
		{ selector: '#idea-legacy-report > div > div:nth-child(1)', label: 'the panel heading', min: 4.5 },
		{ selector: '#idea-legacy-report > div > div:nth-child(2)', label: 'the panel note', min: 4.5 },
		{ selector: '#idea-legacy-report button', label: 'the chips and the Close and Send controls', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#idea-legacy-report-btn', label: 'the floating Report control', min: 44 },
		{ selector: '#idea-legacy-report button', label: 'every control inside the panel', min: 44 }
	],
	orderResult: [
		{
			label: 'the control answers a tap at its centre, its edge clears 3:1 on the page, and the panel took the page palette',
			evaluate: TRIGGER_FACTS,
			expected: TRIGGER_FACTS_EXPECTED
		}
	],
	/* The page draws its QR code with a script from a CDN the harness blocks
	   (every non-loopback request is), so its own call fails here and not in
	   a classroom. Nothing the report control does. */
	ignoreConsole: [/QRCode is not defined/]
};
