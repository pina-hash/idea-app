/**
 * THE SAME ASSIGNMENT PAGE, SIGNED IN (report 20, 2026-09-25): the SAME bytes
 * as the signed-out spec beside this one -- the route cannot vary them -- and
 * the panel learns from the session probe that this reader has an account. So
 * the note says the report carries it, there is NO contact field (absent, not
 * hidden: the signed-out spec is its positive control), and a send goes to the
 * signed-in endpoint. The last prepare step really sends one, and the
 * order-result row reads back what the fixture endpoint RECEIVED rather than
 * trusting the panel's own "Sent".
 */
import { openPanel, TRIGGER_FACTS, TRIGGER_FACTS_EXPECTED } from './_legacy-report.mjs';

export default {
	path: '/dev/feedback/assignment?signedIn=1',
	label: 'Assignment page (signed in): the panel knows, offers no contact field, and posts to the signed-in route',
	prepare: [
		{ waitFor: '() => !!document.getElementById("idea-legacy-report-btn")', timeoutMs: 20000, label: 'the injected trigger has mounted' },
		openPanel(`() => /carries your account/.test(document.querySelector('#idea-legacy-report > div > div:nth-child(2)').textContent)`),
		{
			evaluate: `() => { const t = document.querySelector('#idea-legacy-report textarea'); t.value = 'The rubric table is cut off on my phone.'; return 'typed ' + t.value.length; }`,
			label: 'type a report'
		},
		{
			click: '#idea-legacy-report > div > div:last-child > button:last-child',
			until: `() => /Sent/.test(document.querySelector('#idea-legacy-report [role="status"]').textContent)`,
			label: 'press Send and wait for the acknowledgement'
		}
	],
	presence: [
		{ selector: '#idea-legacy-report-btn', label: 'the floating Report control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* PRESENT, NOT VISIBLE: the panel closes itself 1.2s after "Sent", which is
		   before the checks run, so its fields are in the DOM and off screen. */
		{ selector: '#idea-legacy-report textarea', label: 'the message field (positive control for the absence below)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '#idea-legacy-report input[type="text"]', label: 'no contact field when signed in', expectPresent: 0 }
	],
	textContains: [
		{ selector: '#idea-legacy-report > div > div:nth-child(2)', label: 'the note says this report carries the account', must: ['carries your account'], mustNot: ['not signed in'] }
	],
	orderResult: [
		{
			label: 'what the signed-in endpoint received: the app, the context, the captured route and path, and the kind',
			evaluate: `async () => {
				const r = await fetch('/dev/feedback/assignment/sink', { cache: 'no-store' });
				const b = (await r.json()).last;
				if (!b) return ['NOTHING RECEIVED'];
				return [b.app, b.context, b.meta && b.meta.route, b.meta && b.meta.path, b.kind, 'contact' in b ? 'CARRIED A CONTACT' : 'no contact'];
			}`,
			expected: ['assignments', '/assignments/[slug]', '/assignments/[slug]', '/dev/feedback/assignment', 'bug', 'no contact']
		},
		{
			label: 'the control answers a tap at its centre, its edge clears 3:1 on the page, and the panel took the page palette',
			evaluate: TRIGGER_FACTS,
			expected: TRIGGER_FACTS_EXPECTED
		}
	]
};
