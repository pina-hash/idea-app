import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/home-order?role=student&classes=1&rows=4&due=-1,0,1,5',
	label: 'Home feed rows: all four due-date urgency steps on one card',
	/* WHY THIS ROUTE EXISTS SEPARATELY FROM THE OTHER home-order SPECS. The
	   default fixture dates row n at n days out, which reaches `imminent` and
	   `soon` and NEVER `today` or `overdue` -- so a pass over those specs would
	   report the urgency treatment working while the two steps that matter most
	   had never rendered. `?due=-1,0,1,5` is one row of each step, in that
	   order, and the assertions below read what is actually painted.

	   THE TREATMENT IS DELIBERATELY NOT COLOUR, so none of these rows is a
	   contrast check on a hue. The flag's colour is already spoken for by
	   `reasonTone` (what the row IS, not how near it is), a reader who cannot
	   separate two hues would get nothing from a fifth, and `--crimson` is
	   reserved for LIVE/REC/error. What carries the steps is position (the
	   ranking puts the soonest first), words (`feedIndicator` writes the date
	   out), and weight plus a leading-edge marker. The `orderResult` rows below
	   read exactly those three. */
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered ranked rows', expectPresent: 4, expectVisible: 4 },
		/* The positive control for the absence row beneath it: three of the four
		   rows carry a marker, so "one row carries none" cannot be the selector
		   having been renamed. */
		{ selector: '[data-tour="classes"] .assignment-item[data-urgency]', label: 'rows carrying an urgency step', expectPresent: 4, expectVisible: 4 },
		{ selector: '[data-tour="classes"] .assignment-item[data-urgency="soon"]', label: 'rows at the ordinary step (deliberately untreated)', expectPresent: 1, expectVisible: 1 },
		/* The retired "Open" chip. Every row in the ranked list is open by
		   construction, so the word was 12 identical labels on a four-class
		   student's page and none of them was actionable. Its absence is what
		   bought part of the row's height back. */
		{ selector: '[data-tour="classes"] .assignment-status', label: 'retired per-row Open chip', expectPresent: 0 }
	],
	/* `orderResult` compares ARRAYS and only arrays (`checks.mjs`: both sides
	   must be `Array.isArray`), so each probe below returns one rather than a
	   joined string. Written as strings first, all four printed values
	   IDENTICAL to their expectations and were still counted outside threshold
	   -- a green-looking line that could never pass. */
	orderResult: [
		{
			label: 'the four steps render in urgency order, soonest deadline first',
			evaluate: `() => [...document.querySelectorAll('[data-tour="classes"] .assignment-item.linked')]
				.map((el) => el.getAttribute('data-urgency'))`,
			expected: ['overdue', 'today', 'imminent', 'soon']
		},
		{
			label: 'each row states its own date in words, so no treatment has to be decoded',
			evaluate: `() => [...document.querySelectorAll('[data-tour="classes"] .assignment-item.linked')]
				.map((el) => el.querySelector('.feed-flag').textContent.trim())`,
			expected: ['Overdue yesterday', 'Due today', 'Due tomorrow', 'Due in 5 days']
		},
		{
			label: 'weight steps up as the deadline closes, and stops at the ordinary step',
			evaluate: `() => [...document.querySelectorAll('[data-tour="classes"] .assignment-item.linked')]
				.map((el) => getComputedStyle(el.querySelector('.feed-flag')).fontWeight)`,
			expected: ['700', '700', '700', '400']
		},
		{
			label: 'the leading-edge marker is present for the three pressing steps and absent for soon',
			evaluate: `() => [...document.querySelectorAll('[data-tour="classes"] .assignment-item.linked')]
				.map((el) => (getComputedStyle(el).boxShadow === 'none' ? 'none' : 'marker'))`,
			expected: ['marker', 'marker', 'marker', 'none']
		}
	],
	contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
	tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
};
