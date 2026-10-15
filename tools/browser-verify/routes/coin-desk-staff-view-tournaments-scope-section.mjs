/**
 * TOURNAMENTS FOR SECTION COIN STAFF: the area is a full coin admin's, so the
 * real route answers 404 and the nav does not offer it. The harness stands in
 * for the 404 with its own card; the transfer component is not mounted.
 */
export default {
	path: '/dev/coin-desk-staff?view=tournaments&scope=section',
	label: 'Coin V2 tournament transfer, section coin staff, not offered',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-staff-hydrated=\\"true\\"]")', timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="cd-harness-404"]', label: 'the 404 stand-in', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-tournaments"]', label: 'no transfer component', expectPresent: 0 }
	],
	textContains: [
		{ selector: '.cd-root nav', label: 'the nav offers the section areas and not Tournaments', must: ['Queue', 'Payday', 'Digest'], mustNot: ['Tournaments'] }
	]
};
