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
 *   2. Pause stops it: six seconds later the count has not moved, and the key
 *      now reads Play with no pressed state (polish round C: it was drawn lit
 *      while paused, and heard as "Play, pressed"), in the same box it had
 *      while it read Pause (polish round 1: at 375 the word change moved it a
 *      line);
 *   3. Next and the arrow key sift by hand;
 *   4. a thumbnail jumps to its picture;
 *   4b. Play, pressed with the real mouse and left resting on the key, with
 *      the focus that click leaves on it, plays: the count moves within the
 *      interval (polish round 1: focus and a mouse on the key both held it,
 *      so "Pause" read over a slideshow standing still), then Pause again;
 *   5. the picture opens the shared Lightbox on the whole set.
 */
const COUNT = `document.querySelector('[data-testid="so-slide-count"]')?.textContent?.trim()`;
/* The play key's box and the strip's top, both against the slideshow's own
   top, so a page scrolled by a click between two readings cannot pass for a
   key that moved (or hide one that did). */
const KEY_BOX = `(() => { const o = document.querySelector('[data-testid="so-slideshow"]').getBoundingClientRect(); const r = document.querySelector('[data-testid="so-slide-play"]').getBoundingClientRect(); const st = document.querySelector('[data-testid="so-slideshow"] .sws-strip').getBoundingClientRect(); return 'key ' + [r.left - o.left, r.top - o.top, r.width, r.height].map(Math.round).join(',') + ', strip top ' + Math.round(st.top - o.top); })()`;

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
			evaluate: `() => { window.__swsKeyBefore = ${KEY_BOX}; }`,
			label: 'the play key box while it reads Pause'
		},
		{
			click: '[data-testid="so-slide-play"]',
			until: `() => document.querySelector('[data-testid="so-slide-play"]')?.dataset.playing === 'false'`,
			label: 'Pause'
		},
		{
			evaluate: `() => { window.__swsKeyAfter = ${KEY_BOX}; }`,
			label: 'the play key box once it reads Play'
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
			click: '[data-testid="so-slide-play"]',
			until: `() => document.querySelector('[data-testid="so-slide-play"]')?.dataset.playing === 'true'`,
			label: 'Play, with the real mouse, which stays on the key and leaves focus on it'
		},
		{
			evaluate: `async () => {
				const key = document.querySelector('[data-testid="so-slide-play"]');
				window.__swsPlayFocus = document.activeElement === key ? 'focus on the play key' : 'focus elsewhere: ' + (document.activeElement?.dataset?.testid || document.activeElement?.tagName);
				const a = ${COUNT};
				for (let i = 0; i < 80 && ${COUNT} === a; i++) await new Promise((r) => setTimeout(r, 100));
				window.__swsResumed = ${COUNT} !== a;
				window.__swsResumedWord = document.querySelector('[data-testid="so-slide-play-word"]').textContent.trim();
			}`,
			until: '() => window.__swsResumed === true',
			label: 'it moves on within the interval while the mouse rests on the key'
		},
		{
			click: '[data-testid="so-slide-play"]',
			until: `() => document.querySelector('[data-testid="so-slide-play"]')?.dataset.playing === 'false'`,
			label: 'Pause again, so the Lightbox opens on a still slideshow'
		},
		{
			click: '[data-testid="so-slide"]',
			until: `() => !!document.querySelector('[data-testid="so-lightbox"][open], dialog[open]')`,
			label: 'the picture opens the Lightbox'
		}
	],
	orderResult: [
		{
			label: 'the play key keeps one box when its word changes',
			evaluate: '() => [window.__swsKeyBefore === window.__swsKeyAfter ? "one box" : window.__swsKeyBefore + " then " + window.__swsKeyAfter]',
			expected: ['one box']
		},
		{
			label: 'after Play, with the key focused and the mouse on it, it moves and the key says Pause',
			evaluate: '() => [window.__swsPlayFocus, window.__swsResumed, window.__swsResumedWord]',
			expected: ['focus on the play key', true, 'Pause']
		}
	],
	presence: [
		{ selector: 'dialog[open]', label: 'the Lightbox, open on the set', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-slide-play"][data-playing="false"][aria-label="Play the slideshow"]', label: 'paused, the key says Play', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="so-slideshow"] [aria-pressed]', label: 'no key in the slideshow carries a pressed state, so none is drawn lit', expectPresent: 0 },
		{ selector: '.sws-strip .sws-thumb', label: 'one thumbnail per picture, the CAD file and the replaced original left out', expectPresent: 7, maxPresent: 7 }
	]
};
