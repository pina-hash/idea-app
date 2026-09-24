/**
 * THE CLASSROOM TOUR IS OFFERED ONCE, AND TO A TEACHER THE TEACHER'S (ledger
 * 0297, LEARN). A first visit by somebody who manages the class on screen: the
 * offer sits under the header with two buttons and nothing behind it is
 * paused, and the stored state reads `offered` BEFORE anybody answers it --
 * which is what makes "once" true of a person who walks away. The sibling
 * `homepage` namespace in the same profile row survives the write.
 *
 * Then Escape, with focus on the offer: it goes away, the state reads
 * `dismissed`, and focus lands on a header control that is on screen (the
 * Tour button, or the Menu it folds into on a narrow window).
 *
 * The student half (never the teacher's tour) is the manage-0 spec.
 */
import { TOUR_TEACHER, TOUR_READY } from './_classroom-tour.mjs';

export default {
	path: TOUR_TEACHER,
	label: 'Classroom tour offer (teacher, first visit), then Escape',
	prepare: [
		TOUR_READY,
		{ waitFor: `() => window.__tourProbe().tours.teacher === 'offered' && window.__tourProbe().rowWrites >= 1`, timeoutMs: 5000 }
	],
	presence: [
		{ selector: '[data-testid="tour-offer"][data-tour-id="teacher"]', label: "the teacher's offer", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"][data-tour-id="student"]', label: "never the student's, to a teacher", expectPresent: 0 },
		{ selector: '.tour-backdrop, [data-testid="tour-callout"]', label: 'nothing is paused behind an offer', expectPresent: 0 },
		/* Visible in the header row on a wide window, folded into the closed
		   Menu on a narrow one, so visibility is 0 or 1 and presence exactly 1. */
		{ selector: '[data-testid="tour-trigger"]', label: 'the Tour control (folded into Menu on a narrow window)', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="tour-offer"]', label: 'the offer is a question and two answers', must: ['New to IDEA Classroom?', 'Show me around', 'Not now'] }
	],
	contrast: [
		{ selector: '.tour-offer-text', label: 'offer words', min: 4.5 },
		{ selector: '.tour-offer-btn', label: 'offer buttons', min: 4.5 }
	],
	tapTargets: [{ selector: '.tour-offer-btn', label: 'offer buttons' }],
	orderResult: [
		{
			label: 'offered at once, only the teacher tour, homepage untouched, "Take the tour" live',
			evaluate: `() => { const p = window.__tourProbe(); return [p.tours.teacher, p.tours.student, JSON.stringify(p.row.homepage), String(p.handlers.includes('tour.start'))]; }`,
			expected: ['offered', 'unseen', '{"pinned":["gauntlet"]}', 'true']
		},
		{
			label: 'Escape on the offer: gone, not prevented elsewhere, dismissed, focus on a header control',
			evaluate: `async () => {
				document.querySelector('[data-testid="tour-offer-dismiss"]').focus();
				const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
				document.activeElement.dispatchEvent(ev);
				await new Promise((r) => setTimeout(r, 150));
				await window.__tourFlush();
				const a = document.activeElement;
				return [String(!document.querySelector('[data-testid="tour-offer"]')), String(ev.defaultPrevented), window.__tourProbe().tours.teacher, String(!!a && a.matches('[data-testid="tour-trigger"], .menu-trigger') && a.getClientRects().length > 0)];
			}`,
			expected: ['true', 'true', 'dismissed', 'true']
		}
	]
};
