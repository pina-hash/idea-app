/**
 * A LONG NOTICE WITH FILES, AS A STUDENT READS IT (ledger 0368, report R04: "quick
 * post should support images and files ... so that students can pull them up in
 * window and navigate them ... if its a longer one it should be collapsible").
 * At 375 and 1440.
 *
 * The notice shows a lead and one closed "Rest of the notice" key, so a long
 * notice does not take the screen; its three pictures are 4.5rem tiles that
 * open the one Lightbox on the notice's picture set, ArrowRight moving to the
 * next picture with the count moving with it; its PDF and CAD part are
 * download rows. The notices region is measured closed and open, printed.
 */
import { IGNORE, READY } from './_class-header.mjs';

const HEIGHTS = `async () => {
	const region = document.querySelector('[data-testid="quick-posts"]');
	const key = document.querySelector('[data-testid="quick-post-more"]');
	const closed = region.getBoundingClientRect().height;
	key.click();
	await new Promise((r) => setTimeout(r, 300));
	const open = region.getBoundingClientRect().height;
	key.click();
	await new Promise((r) => setTimeout(r, 300));
	const tile = document.querySelector('[data-testid="attach-gallery-tile"] .gallery-open').getBoundingClientRect();
	return 'notices region ' + closed.toFixed(1) + 'px folded, ' + open.toFixed(1) + 'px open; a tile ' + tile.width.toFixed(1) + 'x' + tile.height.toFixed(1) + 'px';
}`;

const VIEWER = `async () => {
	const tiles = [...document.querySelectorAll('[data-post="qp-1"] [data-testid="attach-gallery-open"]')];
	tiles[0].click();
	await new Promise((r) => setTimeout(r, 400));
	const dialog = document.querySelector('[data-testid="attach-lightbox"]');
	const count = () => document.querySelector('[data-testid="attach-lightbox-count"]')?.textContent.trim() || '';
	const caption = () => document.querySelector('[data-testid="attach-lightbox-caption"]')?.textContent.replace(/\\s+/g, ' ').trim() || '';
	const first = count();
	const firstCaption = caption();
	(document.activeElement || dialog).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	await new Promise((r) => setTimeout(r, 300));
	const second = count();
	const secondCaption = caption();
	return [
		'tiles=' + tiles.length,
		'viewer open=' + !!dialog?.open,
		'count moved=' + (first !== '' && second !== '' && first !== second),
		'picture moved=' + (firstCaption !== secondCaption)
	];
}`;

export default {
	path: '/dev/class-header?posts=1&long=1&files=5',
	label: 'A long notice with files: a lead and a fold, picture tiles that open the viewer, download rows',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header has painted' }, { evaluate: HEIGHTS }],
	presence: [
		{ selector: '[data-post="qp-1"] [data-testid="quick-post-more"][aria-expanded="false"]', label: 'the long notice folds, closed on arrival', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-post="qp-1"] [data-testid="quick-post-rest"]', label: 'the rest is in the page, folded away', expectPresent: 1, maxPresent: 1, maxVisible: 0 },
		{ selector: '[data-post="qp-1"] [data-testid="attach-gallery-tile"]', label: 'three picture tiles', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-post="qp-1"] [data-testid="attach-row"]', label: 'two download rows (a PDF and a CAD part)', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	contrast: [
		{ selector: '[data-post="qp-1"] [data-testid="quick-post-body"]', label: 'the lead', min: 4.5 },
		{ selector: '[data-post="qp-1"] [data-testid="quick-post-more"] .disc-label', label: 'the fold key word', min: 4.5 },
		{ selector: '[data-post="qp-1"] a.attach-name', label: 'a download row', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-post="qp-1"] [data-testid="quick-post-more"]', label: 'Rest of the notice', min: 44 },
		{ selector: '[data-post="qp-1"] [data-testid="attach-gallery-open"]', label: 'a picture tile', min: 44 }
	],
	orderResult: [
		{
			label: 'a tile opens the viewer on the notice set, and ArrowRight shows the next picture',
			evaluate: VIEWER,
			expected: ['tiles=3', 'viewer open=true', 'count moved=true', 'picture moved=true']
		}
	]
};
