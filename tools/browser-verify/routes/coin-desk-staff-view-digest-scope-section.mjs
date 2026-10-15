/**
 * THE DIGEST FOR SECTION COIN STAFF: their own students' autopay lines (four,
 * Block 2) and NO Undo on any of them, because the database marks a row
 * reversible for a full coin admin alone. The full-admin spec beside this one
 * is the positive control (four Undo keys there).
 */
export default {
	path: '/dev/coin-desk-staff?view=digest&scope=section',
	label: 'Coin V2 digest, section coin staff, no Undo',
	prepare: [
		{
			waitFor:
				'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-digest-autopay-row\\"]").length === 4',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '[data-testid="cd-digest-autopay-row"]', label: 'four Block 2 autopay lines', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="cd-digest-undo"]', label: 'no Undo for section staff', expectPresent: 0 },
		{ selector: '[data-testid="cd-digest-notify-toggle"]', label: 'the notification switch is still theirs', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cd-digest"]', label: 'says only a full coin admin can undo, names no Block 4 student', must: ['Only a full coin admin can undo one'], mustNot: ['Elena Evans'] }
	]
};
