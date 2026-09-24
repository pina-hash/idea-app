/**
 * A STUDENT'S FIRST VISIT IS OFFERED THE STUDENT'S TOUR AND NEVER THE
 * TEACHER'S (ledger 0297, LEARN). The same harness, the same store, as a
 * student: the offer names the student tour, the teacher's state is never
 * touched, and "Not now" records `dismissed` and hands focus to a header
 * control. The teacher spec beside this one is the positive control that the
 * teacher tour IS offered where it should be.
 */
import { TOUR_STUDENT, TOUR_READY } from './_classroom-tour.mjs';

export default {
	path: TOUR_STUDENT,
	label: 'Classroom tour offer (student, first visit), then Not now',
	prepare: [
		TOUR_READY,
		{ waitFor: `() => window.__tourProbe().tours.student === 'offered'`, timeoutMs: 5000 }
	],
	presence: [
		{ selector: '[data-testid="tour-offer"][data-tour-id="student"]', label: "the student's offer", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"][data-tour-id="teacher"]', label: "never the teacher's, to a student", expectPresent: 0 }
	],
	contrast: [
		{ selector: '.tour-offer-text', label: 'offer words', min: 4.5 },
		{ selector: '.tour-offer-btn', label: 'offer buttons', min: 4.5 }
	],
	tapTargets: [{ selector: '.tour-offer-btn', label: 'offer buttons' }],
	orderResult: [
		{
			label: 'the student tour offered; the teacher tour untouched',
			evaluate: `() => { const p = window.__tourProbe(); return [p.offer, p.tours.student, p.tours.teacher]; }`,
			expected: ['student', 'offered', 'unseen']
		},
		{
			label: 'Not now: gone, dismissed, focus on a header control',
			evaluate: `async () => {
				const b = document.querySelector('[data-testid="tour-offer-dismiss"]');
				b.focus();
				b.click();
				await new Promise((r) => setTimeout(r, 150));
				await window.__tourFlush();
				const a = document.activeElement;
				return [String(!document.querySelector('[data-testid="tour-offer"]')), window.__tourProbe().tours.student, String(!!a && a.matches('[data-testid="tour-trigger"], .menu-trigger') && a.getClientRects().length > 0)];
			}`,
			expected: ['true', 'dismissed', 'true']
		}
	]
};
