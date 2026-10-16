/**
 * THEIR WORK BESIDE THEIR NAME (ledger 0392, Mr. Pina 2026-10-16: "a little
 * automatic slideshow with their uploaded work ... that automatically rolls
 * around, but that I can also sift through myself").
 *
 * The fixture's seven pictures (four hand-ins, three notebook pages; a CAD file
 * on the same row and the straightened copy's original are left out by the
 * projection). Steps, each with its own evidence:
 *
 *   1. it rolls on its own: the count moves from 1 of 7 without a press;
 *   2. Pause stops it: six seconds later the count has not moved;
 *   3. Next and the arrow key sift by hand;
 *   4. a thumbnail jumps to its picture;
 *   5. the picture opens the shared Lightbox on the whole set.
 */
const COUNT = `document.querySelector('[data-testid="so-slide-count"]')?.textContent?.trim()`;

export default {
	path: '/dev/classroom-student?state=slideshow',
	aliasOf: '/dev/classroom-student',
	label: "One student's page: the work slideshow rolls, pauses and sifts",
	settleMs: 500,
	prepare: [
		{ waitFor: `() => ${COUNT} === '1 of 7'`, label: 'the slideshow is up on its first picture of seven' },
		{
			evaluate: '() => {}',
			until: `() => ${COUNT} !== '1 of 7'`,
			attempts: 20,
			gapMs: 500,
			label: 'it moves on by itself (5s per picture)'
		},
		{
			click: '[data-testid="so-slide-play"]',
			until: `() => document.querySelector('[data-testid="so-slide-play"]')?.getAttribute('aria-pressed') === 'true'`,
			label: 'Pause'
		},
		{
			evaluate: `async () => { const a = ${COUNT}; await new Promise((r) => setTimeout(r, 6500)); window.__swsHeld = a === ${COUNT}; }`,
			until: '() => window.__swsHeld === true',
			label: 'paused, it holds still for six and a half seconds'
		},
		{
			evaluate: `() => { window.__swsBefore = ${COUNT}; document.querySelector('[data-testid="so-slide-next"]').click(); }`,
			until: `() => window.__swsBefore !== undefined && ${COUNT} !== window.__swsBefore`,
			label: 'Next moves it by hand'
		},
		{
			click: '.sws-strip .sws-thumb:nth-child(4)',
			until: `() => ${COUNT} === '4 of 7'`,
			label: 'the fourth thumbnail jumps to the fourth picture'
		},
		{
			evaluate: `() => { const r = document.querySelector('[data-testid="so-slideshow"]'); r.focus(); r.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); }`,
			until: `() => ${COUNT} === '5 of 7'`,
			label: 'the right arrow key moves to the fifth'
		},
		{
			click: '[data-testid="so-slide"]',
			until: `() => !!document.querySelector('[data-testid="so-lightbox"][open], dialog[open]')`,
			label: 'the picture opens the Lightbox'
		}
	],
	presence: [
		{ selector: 'dialog[open]', label: 'the Lightbox, open on the set', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.sws-strip .sws-thumb', label: 'one thumbnail per picture, the CAD file and the replaced original left out', expectPresent: 7, maxPresent: 7 }
	]
};
