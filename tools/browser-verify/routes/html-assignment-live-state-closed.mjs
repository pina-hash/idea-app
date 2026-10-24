/**
 * CLOSED WHILE OPEN, AND REOPENED (ledger 0431, report 9f746072). The harness
 * moves the frame's `lock` the way the item page does when the heartbeat or
 * the class's live notice reports the student's own row moving; the sentence
 * appears above the worksheet with no reload, and the Full page key and the
 * frame itself stay where they were.
 */
export default {
	path: '/dev/html-assignment-live?state=closed',
	aliasOf: '/dev/html-assignment-live',
	label: 'HTML assignment: closed while the worksheet is open',
	prepare: [
		{ waitFor: '() => window.__hxLive?.ready === true', attempts: 40, gapMs: 250 },
		{ click: '[data-drive="close"]', until: '() => !!document.querySelector(\'[data-hx-lock="closed"]\')' }
	],
	presence: [
		{ selector: '[data-hx-lock="closed"]', label: 'the closed sentence above the worksheet', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'iframe[data-hx-frame]', label: 'the same frame, not reloaded or replaced', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-hx-lock="closed"]', label: 'the sentence says it is read only and nothing saved is lost', must: ['closed this assignment', 'read only', 'Everything you saved is still here'] }
	],
	contrast: [{ selector: '[data-hx-lock="closed"]', label: 'the closed sentence', min: 4.5 }]
};
