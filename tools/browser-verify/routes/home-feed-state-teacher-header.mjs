/**
 * THE CLASS CARD'S HEADER, MEASURED IN TEACHER MODE (ledger 0396, part 3,
 * polish round). Teacher mode carries the longest identity the harness has
 * ("Intro to Engineering Design" beside "You teach this"), so it is where the
 * words come closest to the fold key.
 *
 * Four readings, each a property the polish round fixed:
 *  - EVERY POINT OF EVERY HEADER IS A CONTROL. A 40 x 7 grid over each header
 *    (its bottom rule excluded) lands on the class link, the key to what the
 *    class needs (ledger 0416) or the fold key, and on nothing else. The fold's reach covers the column it sits in: a point just
 *    under the header's top edge above the key, just over its bottom edge
 *    below it, and in the margin to the card's right edge all answer the fold.
 *    Before the round 19 of 280 points a header landed on the bare header at
 *    1440, and 24 to 28 at 375.
 *  - THE REACH STOPS AT THE HEADER. 48 points down the open list's right side,
 *    under the key, hit the list and never the fold.
 *  - THE WORDS STOP AT LEAST 12PX SHORT OF THE KEY. The gap is the key's left
 *    edge less the right edge of the identity's furthest text or chip. It was
 *    5.4px on two of these cards at 375.
 *  - THE LINK'S CORNER IS THE CARD'S. The focus ring is the link's outline, so
 *    the link takes the card's inner radius at its top left, and at its bottom
 *    left while the card is folded (the third card is folded first).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

const TEACHER = '[data-testid="home-feed-harness"] button[data-mode="teacher"]';
/* The third card: a card preceded by two others (there are exactly three). */
const THIRD_TOGGLE = '.legacy-index .feed-card ~ .feed-card ~ .feed-card [data-testid="feed-toggle"]';

const kindAt = `(x, y) => {
	const el = document.elementFromPoint(x, y);
	// Ledger 0416: a teacher's card also carries the key to what the class needs.
	return el?.closest('[data-testid="feed-open"]') ? 'link' : el?.closest('[data-testid="feed-toggle"]') ? 'fold' : el?.closest('[data-testid="feed-attention"]') ? 'needs' : 'nothing';
}`;

export default {
	path: '/dev/home-feed?state=teacher-header',
	aliasOf: '/dev/home-feed',
	label: 'Home class card header in teacher mode: every point a control, the reach stops at the header, words clear the key, the link takes the card corner',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			click: TEACHER,
			until: `() => document.querySelector('${TEACHER}')?.classList.contains('active') && document.querySelectorAll('.feed-card').length === 3`,
			waitMs: 300
		},
		{
			click: THIRD_TOGGLE,
			until: `() => document.querySelector('${THIRD_TOGGLE}')?.getAttribute('aria-expanded') === 'false'`,
			waitMs: 600
		}
	],
	presence: [
		{ selector: '.legacy-index .feed-card .section-meta', label: 'teacher subline on every card (positive control for the mode)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.legacy-index .feed-card.collapsed', label: 'the third card is folded', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'every grid point of every header lands on the link or the fold, and the fold answers its whole column',
			evaluate: `() => {
				const kind = ${kindAt};
				return [...document.querySelectorAll('.legacy-index .feed-card')].map((card, ci) => {
					const head = card.querySelector('.feed-head');
					head.scrollIntoView({ block: 'center', behavior: 'instant' });
					const h = head.getBoundingClientRect();
					const bb = parseFloat(getComputedStyle(head).borderBottomWidth) || 0;
					let nothing = 0, total = 0;
					for (let i = 0; i < 40; i++) for (let j = 0; j < 7; j++) {
						total++;
						if (kind(h.left + (h.width * (i + 0.5)) / 40, h.top + ((h.height - bb) * (j + 0.5)) / 7) === 'nothing') nothing++;
					}
					const t = card.querySelector('[data-testid="feed-toggle"]').getBoundingClientRect();
					const cx = (t.left + t.right) / 2, cy = (t.top + t.bottom) / 2;
					const column = [kind(cx, h.top + 2), kind(cx, h.bottom - bb - 2), kind((t.right + h.right) / 2, cy), kind(h.right - 2, h.top + 2)];
					return 'card ' + (ci + 1) + ': ' + nothing + ' of ' + total + ' points on nothing; above, below, right of the key and the far corner: ' + column.join(' ');
				});
			}`,
			expected: [
				'card 1: 0 of 280 points on nothing; above, below, right of the key and the far corner: fold fold fold fold',
				'card 2: 0 of 280 points on nothing; above, below, right of the key and the far corner: fold fold fold fold',
				'card 3: 0 of 280 points on nothing; above, below, right of the key and the far corner: fold fold fold fold'
			]
		},
		{
			label: 'the fold reach stops at the header: the open lists keep every press down their right side',
			evaluate: `() => {
				const kind = ${kindAt};
				return [...document.querySelectorAll('.legacy-index .feed-card:not(.collapsed)')].map((card, ci) => {
					const list = card.querySelector('.assignment-list');
					list.scrollIntoView({ block: 'start', behavior: 'instant' });
					window.scrollBy(0, -120);
					const lr = list.getBoundingClientRect();
					const t = card.querySelector('[data-testid="feed-toggle"]').getBoundingClientRect();
					const h = card.querySelector('.feed-head').getBoundingClientRect();
					let fold = 0, total = 0;
					for (let j = 0; j < 12; j++) for (const x of [t.left + 2, (t.left + t.right) / 2, t.right - 2, h.right - 3]) {
						total++;
						if (kind(x, lr.top + 1 + ((Math.min(lr.height, 300) - 2) * j) / 11) === 'fold') fold++;
					}
					return 'open card ' + (ci + 1) + ': ' + fold + ' of ' + total + ' list points on the fold';
				});
			}`,
			expected: ['open card 1: 0 of 48 list points on the fold', 'open card 2: 0 of 48 list points on the fold']
		},
		{
			label: 'the identity stops at least 12px short of the fold key',
			evaluate: `() => [...document.querySelectorAll('.legacy-index .feed-card')].map((card, ci) => {
				const a = card.querySelector('[data-testid="feed-open"]');
				const key = card.querySelector('[data-testid="feed-toggle"]').getBoundingClientRect();
				let right = -Infinity;
				const walk = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
				let n;
				while ((n = walk.nextNode())) {
					if (!n.textContent.trim()) continue;
					const r = document.createRange();
					r.selectNodeContents(n);
					for (const rr of r.getClientRects()) if (rr.width > 0) right = Math.max(right, rr.right);
				}
				a.querySelectorAll('.course-badge, .feed-attn').forEach((e) => (right = Math.max(right, e.getBoundingClientRect().right)));
				return 'card ' + (ci + 1) + ': 12px or more between the words and the key: ' + (key.left - right >= 11.9);
			})`,
			expected: [
				'card 1: 12px or more between the words and the key: true',
				'card 2: 12px or more between the words and the key: true',
				'card 3: 12px or more between the words and the key: true'
			]
		},
		{
			label: 'the link takes the card inner corner (top left always, bottom left while folded)',
			evaluate: `() => [...document.querySelectorAll('.legacy-index .feed-card')].map((card, ci) => {
				const c = getComputedStyle(card);
				const inner = parseFloat(c.borderTopLeftRadius) - parseFloat(c.borderTopWidth);
				const a = getComputedStyle(card.querySelector('[data-testid="feed-open"]'));
				const folded = card.classList.contains('collapsed');
				const tl = Math.abs(parseFloat(a.borderTopLeftRadius) - inner) < 0.5;
				const bl = Math.abs(parseFloat(a.borderBottomLeftRadius) - (folded ? inner : 0)) < 0.5;
				return 'card ' + (ci + 1) + (folded ? ' (folded)' : ' (open)') + ': top left ' + tl + ', bottom left ' + bl + ', inner radius above zero ' + (inner > 0);
			})`,
			expected: [
				'card 1 (open): top left true, bottom left true, inner radius above zero true',
				'card 2 (open): top left true, bottom left true, inner radius above zero true',
				'card 3 (folded): top left true, bottom left true, inner radius above zero true'
			]
		}
	],
	contrast: [
		{ selector: '.legacy-index .feed-card .feed-open .section-meta', label: 'teacher subline inside the link', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.legacy-index .feed-card [data-testid="feed-toggle"]', label: 'fold keys', min: 44 }
	]
};
