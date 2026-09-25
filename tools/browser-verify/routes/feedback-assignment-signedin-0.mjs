/**
 * A CARRIED-OVER ASSIGNMENT PAGE CARRIES A REPORT CONTROL (report 20,
 * 2026-09-25: "must be available on every single possible page"), measured
 * SIGNED OUT on the REAL `idea100-blade-01.html` served through the REAL
 * `/assignments/<slug>` pipeline (`/dev/feedback/assignment`).
 *
 * The page's bytes are the same for every reader -- the route is a shared
 * public cache entry with no `Vary: Cookie` -- so the panel learns whether this
 * reader is signed in by asking when it OPENS. Signed out, it says the report
 * carries no name and offers a way to be reached; the signed-in spec beside
 * this one is the other half of both of those.
 */
import { openPanel, TRIGGER_FACTS, TRIGGER_FACTS_EXPECTED } from './_legacy-report.mjs';

export default {
	path: '/dev/feedback/assignment?signedIn=0',
	label: 'Assignment page (signed out): the injected Report control and its panel, in the page palette',
	prepare: [
		{ waitFor: '() => !!document.getElementById("idea-legacy-report-btn")', timeoutMs: 20000, label: 'the injected trigger has mounted' },
		openPanel(`() => !!document.querySelector('#idea-legacy-report input[type="text"]')`)
	],
	presence: [
		{ selector: '#idea-legacy-report-btn', label: 'the floating Report control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report', label: 'the report panel, once opened', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report button[data-kind]', label: 'one chip per feedback kind', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '#idea-legacy-report textarea', label: 'the message field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report input[type="text"]', label: 'the optional contact field (signed out only)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '#idea-legacy-report-btn', label: 'the control carries its word', must: ['Report'] },
		{ selector: '#idea-legacy-report > div > div:nth-child(2)', label: 'the note says this report carries no name', must: ['not signed in', 'no name'], mustNot: ['carries your account'] }
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
	]
};
