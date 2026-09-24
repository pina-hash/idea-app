/**
 * Pictures on an item page (ledger 0297, package ITEM): six picture
 * attachments become a gallery grid beside one list row for the PDF, a body
 * figure and every tile open the lightbox, and two YouTube links earn a card
 * while a third, in the middle of a sentence, stays a link.
 *
 * THE THUMBNAIL HOST IS BLOCKED HERE, like every non-loopback request, so each
 * video card is measured in its broken-still state (the frame and the play
 * mark, no picture). The loaded state and the request's missing Referer were
 * measured separately with the host answered locally; see the ITEM report.
 */
export default {
	path: '/dev/item-gallery',
	label: 'An item with a picture gallery, a body figure and YouTube cards (student)',
	prepare: [
		{
			click: '[data-testid="attach-gallery-open"]',
			until: '() => !!document.querySelector(\'[data-testid="attach-lightbox"][open]\')',
			waitMs: 400
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the classroom room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="attach-gallery"]', label: 'one gallery grid', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="attach-gallery-open"]', label: 'six picture tiles', expectPresent: 6, maxPresent: 6 },
		/* The PDF is not a picture, so it stays a list row BESIDE the grid. */
		{ selector: '.attach-list .attach-name', label: 'one list row, the PDF', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-video"]', label: 'two video cards (alone, and ending a sentence)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="item-figure-open"]', label: 'the body figure opens large', expectPresent: 1, maxPresent: 1 },
		/* THE LIGHTBOX, OPENED BY THE PREPARE CLICK: exactly one dialog open. */
		{ selector: 'dialog[open]', label: 'one open lightbox', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="attach-lightbox-download"][download]', label: 'Download is a real download link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Fitted, so no Move controls: a fitted picture is never offered
		   buttons that do nothing. */
		{ selector: '[data-testid="attach-lightbox-pan"]', label: 'no Move controls on a fitted picture', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="attach-lightbox-count"]', label: 'where in the gallery this is', must: ['1 of 6'] }
	],
	orderResult: [
		{
			label: 'the opened picture decoded and fits inside the stage',
			evaluate: `() => {
				const img = document.querySelector('[data-testid="attach-lightbox-img"]');
				const stage = document.querySelector('[data-testid="attach-lightbox-stage"]');
				if (!img || !stage) return ['missing'];
				if (!img.naturalWidth) return ['not decoded'];
				const i = img.getBoundingClientRect();
				const s = stage.getBoundingClientRect();
				const inside = i.left >= s.left - 1 && i.right <= s.right + 1 && i.top >= s.top - 1 && i.bottom <= s.bottom + 1;
				return [inside ? 'decoded and fitted' : 'overflows the stage'];
			}`,
			expected: ['decoded and fitted']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="attach-lightbox"] .lb-btn', label: 'lightbox controls', min: 44 },
		{ selector: '[data-testid="attach-gallery-open"]', label: 'a gallery tile', min: 44 },
		{ selector: '[data-testid="item-video"]', label: 'a video card', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="attach-lightbox-caption"]', label: 'the lightbox caption', min: 4.5 },
		{ selector: '.item-video-label', label: 'a video card label', min: 4.5 },
		{ selector: '.item-video-meta', label: 'a video card meta line', min: 4.5 }
	]
};
