import { NO_SIDEWAYS, certHydrated } from './_cert-desk.mjs';

/**
 * A CHECKOUT VIDEO: the unlisted YouTube take plays EMBEDDED (never a new
 * tab), on the privacy host, with the continuous-take note the certifier
 * confirms, and the checkout card beside it in place of a project spec.
 */
export default {
	path: '/dev/cert-review?state=checkout-video',
	label: 'IDEA Certifications review: a checkout video embedded with the continuous-take note',
	prepare: certHydrated('review'),
	orderResult: [
		NO_SIDEWAYS,
		{ label: 'the player is the privacy host, embedded', evaluate: `() => { const f = document.querySelector('[data-testid="cert-evidence-video"] iframe'); return f ? new URL(f.src).host + ' ' + f.getAttribute('allow') : 'NO IFRAME'; }`, expected: 'www.youtube-nocookie.com fullscreen' }
	],
	presence: [
		{ selector: '[data-testid="cert-evidence-video"] iframe', label: 'one embedded player', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-checkout-note"]', label: 'the continuous-take note', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-evidence-pictures"]', label: 'no picture gallery on a video checkout', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-review-send"][aria-disabled="true"]', label: 'Send held before a choice', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cert-review-spec"]', label: 'the checkout card beside the video', must: ['Checkout card', 'Square a block'] },
		{ selector: '[data-testid="cert-checkout-note"]', label: 'the note', must: ['one continuous, unedited take', 'shows the student'] }
	],
	tapTargets: [{ selector: '[data-testid="cert-review-pass"], [data-testid="cert-review-fail"], [data-testid="cert-review-send"]', label: 'the decision keys', min: 44 }],
	contrast: [
		{ selector: '[data-testid="cert-checkout-note"] span:not(.cert-notice-glyph)', label: 'the note words', min: 4.5 },
		{ selector: '[data-testid="cert-review-spec"] h2', label: 'the card heading', min: 4.5 }
	]
};
