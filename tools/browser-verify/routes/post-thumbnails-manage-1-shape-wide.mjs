/**
 * A TEACHER'S CLASS PAGE IN WIDE (ledger 0396, review round 1). A teacher's
 * item row leads with its checkbox and its grip, which a notebook check-in row
 * does not have; with a thumbnail showing, the check-in row holds their room
 * open, so its slot starts where the item slots start and is the same width
 * (it was about 376px against 256px at 960, and further left, before). The
 * draft's live thumbnail is never asked for: the route refuses an unpublished
 * post's, so the slot plans the generated look and makes no frame (and no
 * request that could only be a 404).
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?manage=1&shape=wide`,
	label: "A teacher's class page in Wide: the check-in's slot lines up, the draft shows the generated look",
	prepare: [
		THUMBS_READY,
		{
			evaluate: `() => { document.querySelector('[data-item-id="post-safety"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'the unit-less group is on screen'; }`,
			waitMs: 600
		},
		{ evaluate: `() => 'settled'`, waitMs: 800 }
	],
	orderResult: [
		{
			label: "the check-in's slot starts and ends where the post's under it does",
			evaluate: `() => {
				const checkIn = document.querySelector('.check-in-row [data-testid="post-thumb"]').getBoundingClientRect();
				const post = document.querySelector('[data-item-id="post-safety"] [data-testid="post-thumb"]').getBoundingClientRect();
				return ['left aligned ' + (Math.abs(checkIn.left - post.left) < 1), 'same width ' + (Math.abs(checkIn.width - post.width) < 1)];
			}`,
			expected: ['left aligned true', 'same width true']
		},
		{
			label: "the draft asks for no live thumbnail and shows the generated look",
			evaluate: `() => { const p = document.querySelector('[data-item-id="draft-next"] [data-testid="post-thumb"]'); return [p.getAttribute('data-source') + ' ready=' + p.getAttribute('data-ready'), 'glyph shown ' + (getComputedStyle(p.querySelector('.pt-gen')).visibility === 'visible')]; }`,
			expected: ['generated ready=false', 'glyph shown true']
		}
	],
	presence: [
		{ selector: '.stream[data-thumbs="wide"]', label: 'the list is in Wide', expectPresent: 1, maxPresent: 1 },
		/* Room held, nothing drawn: the plate paints a `.menu-trigger` as a key,
		   and an empty key at the end of the row would read as a dead control. */
		{ selector: '.check-in-row :is(.row-select-hit, .row-grip, .row-menu).spacer[aria-hidden="true"]', label: "the check-in holds the checkbox's, the grip's and the menu's room, drawing none of them", expectPresent: 3, maxPresent: 3, expectVisible: 0, maxVisible: 0 },
		{ selector: '.check-in-row input, .check-in-row button', label: 'and carries no control of its own', expectPresent: 0 },
		{ selector: '[data-item-id="draft-next"] iframe', label: 'no frame made for the draft', expectPresent: 0 },
		{ selector: '.row-wrap:not([data-item-id="draft-next"]) [data-testid="html-thumbnail"]', label: 'the published live thumbnails still have their slots', expectPresent: 3, maxPresent: 3 }
	]
};
