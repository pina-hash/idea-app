/**
 * THE SESSION PROBE FAILS (report 20, 2026-09-25): the assignment page's panel
 * cannot learn whether this reader is signed in, so it says so and sends
 * NOTHING -- a signed-in student's report going down the anonymous route would
 * carry no account, so guessing is the one wrong answer. It offers no contact
 * field either, because it does not know the reader is signed out.
 */
import { openPanel } from './_legacy-report.mjs';

export default {
	path: '/dev/feedback/assignment?signedIn=fail',
	label: 'Assignment page, session probe failing: the panel says it could not check and guesses nothing',
	prepare: [
		{ waitFor: '() => !!document.getElementById("idea-legacy-report-btn")', timeoutMs: 20000, label: 'the injected trigger has mounted' },
		openPanel(`() => /Could not reach the site/.test(document.querySelector('#idea-legacy-report [role="status"]').textContent)`)
	],
	presence: [
		{ selector: '#idea-legacy-report [role="status"]', label: 'the status line (positive control for the absence below)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report input[type="text"]', label: 'no contact field while it cannot tell', expectPresent: 0 }
	],
	textContains: [
		{ selector: '#idea-legacy-report [role="status"]', label: 'it says it could not check, in words', must: ['Could not reach the site', 'signed in'] },
		{ selector: '#idea-legacy-report > div > div:nth-child(2)', label: 'the note claims neither case', mustNot: ['carries your account', 'not signed in'], must: ['attached automatically'] }
	],
	contrast: [{ selector: '#idea-legacy-report [role="status"]', label: 'the could-not-check sentence', min: 4.5 }],
	/* The fixture's 503 IS the state under test; the browser logs it. */
	ignoreConsole: [/503 .*\/dev\/feedback\/assignment\/session/]
};
