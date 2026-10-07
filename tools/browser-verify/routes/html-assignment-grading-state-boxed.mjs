/**
 * A STORED PICTURE DRAWN OVER THE BOX THE DOCUMENT HOLDS OPEN (ledger 0368).
 *
 * Mr. Pina, 2026-10-06, grading a ported worksheet: "I need for images to show
 * within html assignments not under them. I should also be able to click on
 * and expand an image with view controls." The document cannot draw a stored
 * picture (its CSP admits no host for the proxy URL, and bytes go
 * frame-to-parent only), so `/hx/photo` holds a 4:3 box open for its `photo`
 * field and reports it with `idea:image-box`; `HtmlAssignmentFrame` draws
 * Alice's stored picture over the frame at that rectangle.
 *
 * WHAT ONLY A BROWSER CAN SAY, and each row reads a geometry a DOM test would
 * read as zero:
 *
 *   1. THE PAIR. One picture over the document and NO list under it, because a
 *      picture is drawn in exactly one place (`hxImagePlacement`). The default
 *      spec measures the other half: a document reporting no box, a list and
 *      nothing over the frame.
 *   2. WHERE IT IS DRAWN. The overlay's box, measured from `.hx-frame-box`'s
 *      padding edge (where the frame starts), equals the rectangle the document
 *      asked for, to the pixel -- and still does after the console's own
 *      scroller is scrolled, because the frame and the overlay share one
 *      container. The scroller is FOUND, not assumed: above 1024px it is a
 *      column of the console, below it the document.
 *   3. IT IS ON TOP. A hit test at the overlay's centre lands on the picture's
 *      button, not on the frame under it.
 *   4. IT OPENS. A press opens the classroom Lightbox with its zoom controls.
 */
import { OPEN_FIRST_STUDENT } from './html-assignment-grading.mjs';

/** Shared with the file spec: open Alice, then wait for the document to have
    reported its box and the parent to have drawn over it. */
export const OPEN_AND_WAIT_FOR_BOX = [
	...OPEN_FIRST_STUDENT,
	{
		waitFor: `() => document.querySelector('.hx-frame-wrap')?.getAttribute('data-hx-ready') === 'yes' && !!document.querySelector('[data-hx-image-box]')`,
		timeoutMs: 20000
	}
];

/** Source of a page-side helper: the nearest ancestor that actually scrolls. */
export const NEAREST_SCROLLER = `(el) => {
	for (let n = el.parentElement; n; n = n.parentElement) {
		const oy = getComputedStyle(n).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
	}
	return document.scrollingElement;
}`;

export default {
	path: '/dev/html-assignment-grading?state=boxed',
	/* NO `aliasOf`: the state is in the query string, so the URL IS the state
	   (see the empty spec for why an alias would measure the default). */
	label: 'Grading console: a stored picture drawn over the box the document holds open',

	prepare: OPEN_AND_WAIT_FOR_BOX,

	orderResult: [
		{
			label: 'one picture over the document, and no list under it',
			evaluate: `() => [
				'over=' + document.querySelectorAll('[data-testid="hx-image-over"]').length,
				'overImgs=' + document.querySelectorAll('.hx-image-over img').length,
				'decoded=' + ((document.querySelector('.hx-image-over img')?.naturalWidth ?? 0) > 0),
				'strip=' + document.querySelectorAll('.hx-images').length,
				'field=' + (document.querySelector('[data-hx-image-field]')?.getAttribute('data-hx-image-field') ?? 'absent')
			]`,
			expected: ['over=1', 'overImgs=1', 'decoded=true', 'strip=0', 'field=photo']
		},
		{
			label: 'drawn at the rectangle the document asked for, before and after the console scrolls',
			evaluate: `async () => {
				const over = document.querySelector('.hx-image-over');
				const host = document.querySelector('.hx-frame-box');
				if (!over || !host) return ['absent'];
				const asked = over.getAttribute('data-hx-image-box').split(',').map(Number);
				const drawn = () => {
					const o = over.getBoundingClientRect();
					const h = host.getBoundingClientRect();
					return [o.left - h.left - host.clientLeft, o.top - h.top - host.clientTop, o.width, o.height];
				};
				const same = (d) => d.every((v, i) => Math.abs(v - asked[i]) <= 0.5);
				const before = drawn();
				const scroller = (${NEAREST_SCROLLER})(host);
				const top0 = over.getBoundingClientRect().top;
				const from = scroller.scrollTop;
				scroller.scrollTo({ top: from + 300, behavior: 'instant' });
				await new Promise((r) => setTimeout(r, 150));
				const moved = Math.round(top0 - over.getBoundingClientRect().top);
				const after = drawn();
				scroller.scrollTo({ top: from, behavior: 'instant' });
				return [
					'askedIsFourNumbers=' + (asked.length === 4 && asked.every(Number.isFinite)),
					'drawnMatchesAsked=' + same(before),
					'pageMoved>0=' + (moved > 0),
					'stillMatchesAfterScroll=' + same(after),
					'boxOffTheLeftEdge=' + (asked[0] > 0)
				];
			}`,
			expected: [
				/* The rectangle itself varies with the frame's width, so the rows
				   assert the comparisons rather than the numbers. */
				'askedIsFourNumbers=true',
				'drawnMatchesAsked=true',
				'pageMoved>0=true',
				'stillMatchesAfterScroll=true',
				'boxOffTheLeftEdge=true'
			]
		},
		{
			label: 'the picture is on top of the frame, and a press opens the Lightbox',
			evaluate: `async () => {
				const btn = document.querySelector('[data-testid="hx-image-over"]');
				if (!btn) return ['absent'];
				btn.scrollIntoView({ block: 'center', behavior: 'instant' });
				await new Promise((r) => setTimeout(r, 100));
				const r = btn.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				btn.click();
				let dlg = null;
				for (let i = 0; i < 30 && !(dlg = document.querySelector('dialog[data-testid="hx-lightbox"][open]')); i++) {
					await new Promise((res) => setTimeout(res, 100));
				}
				const out = [
					'centreHitsPicture=' + !!hit?.closest('[data-testid="hx-image-over"]'),
					'dialogOpen=' + !!dlg,
					'zoomIn=' + document.querySelectorAll('[data-testid="hx-lightbox-zoom-in"]').length,
					'download=' + document.querySelectorAll('[data-testid="hx-lightbox-download"]').length,
					'caption=' + (document.querySelector('[data-testid="hx-lightbox-caption"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? 'absent')
				];
				document.querySelector('[data-testid="hx-lightbox-close"]')?.click();
				return out;
			}`,
			expected: [
				'centreHitsPicture=true',
				'dialogOpen=true',
				'zoomIn=1',
				'download=1',
				'caption=The fillet after the third rebuild (blade-root-fillet.png)'
			]
		}
	],

	presence: [
		{ selector: '[data-testid="hx-image-over"]', label: 'the picture over the box', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-images', label: 'the list under the frame (none: the picture has a box)', expectPresent: 0 },
		{ selector: '[data-grade-level]', label: 'the rubric level buttons, so this is the working pane', expectPresent: 3 }
	],

	tapTargets: [{ selector: '[data-testid="hx-image-over"]', label: 'the picture, which opens larger', min: 44 }],

	contrast: [{ selector: '.hx-image-over .enlarge-cue', label: 'the Enlarge word on the picture', min: 4.5 }]
};
