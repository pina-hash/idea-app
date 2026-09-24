/**
 * A zip of pictures dropped on the presentation box becomes a gallery (ledger
 * 0297, package ITEM; report 23). The page builds a real zip of four pictures
 * plus the Mac noise a right-click Compress adds, and drops it with a real
 * DragEvent; the choice is asked, Image gallery is pressed, and each picture
 * goes through the ordinary upload path (in memory here) onto the item.
 */
export default {
	path: '/dev/item-gallery?role=manager',
	label: 'A teacher turns a dropped zip of pictures into a gallery',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'[data-testid="deck-panel-manage"]\')' },
		{
			evaluate: '() => window.__dropGalleryZip()',
			until: '() => !!document.querySelector(\'[data-testid="zip-choice-gallery"]\')'
		},
		{
			click: '[data-testid="zip-choice-gallery"]',
			until: '() => document.querySelectorAll(\'[data-testid="attach-gallery-open"]\').length === 10',
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="attach-gallery-open"]', label: 'six tiles plus the four from the zip', expectPresent: 10, maxPresent: 10 },
		{ selector: '[data-testid="deck-gallery-note"]', label: 'the gallery says what it added', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="zip-choice"]', label: 'the choice is gone once answered', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="deck-gallery-note"]',
			label: 'four pictures, not five: the Mac resource fork is not a picture',
			must: ['4 pictures from bench photos.zip']
		}
	],
	orderResult: [
		{
			label: 'the pictures were uploaded in natural order, one at a time',
			evaluate: '() => window.__galleryUploads()',
			expected: ['overview.png', 'photo1.png', 'photo2.png', 'photo10.png']
		}
	],
	tapTargets: [{ selector: '[data-testid="deck-panel-manage"] .deck-upload .btn', label: 'Upload a zip', min: 44 }]
};
