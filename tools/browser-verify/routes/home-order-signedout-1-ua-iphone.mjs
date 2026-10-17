import { SETTLE_ENTRANCE } from './_shared.mjs';
import { CARD, CLOSE_TOUR, HIDE_STRIP, KEY, ROW_PROBE } from './_install-key.mjs';

/**
 * THE INSTALL APP KEY ON AN IPHONE (ledger 0396): Apple gives a page no way to
 * install itself, so the key opens a small card with the two taps, Share then
 * Add to Home Screen, in the phone pop-up's own words with the Share icon drawn
 * in. The harness's `?ua=iphone` is a real iPhone Safari user agent.
 *
 * WHAT IS MEASURED: the card opens on a real press with focus inside it, and
 * the phone pop-up (whose sentence is the same) steps aside while it is open
 * and comes back after; Escape, a tap outside and its Close key each shut it
 * with focus back on the key (`aria-expanded` following); Tab from Close goes
 * on to Take the tour; dismissing the phone pop-up leaves the key where it
 * was, and while the pop-up shows it sits above the corner feedback button,
 * which still answers at its centre (integration review: at 1000 the pop-up
 * used to cover the only feedback control on the page); with the page scrolled (24px before opening, and 30px after) the card
 * still opens 8px under the key and inside the window, and the key still
 * answers at its centre (review round 1: the header's backdrop filter used to
 * pin the fixed card to the header's box, so it slid up over the key by the
 * scroll offset); scrolled 400px, with its key out of the window, the card
 * closes rather than staying pinned to the top of the window (review round 2);
 * focus moving from the card to the key keeps it open, focus moving on past
 * the key closes it and stays where it went, and a later Escape moves nothing;
 * and, open for the last time, the card is inside the window,
 * under the key, outside the header, legible, and its Close key and the key are
 * 44px.
 *
 * Escape, Tab and the outside tap are dispatched events (the runner has no key
 * press step); the press on the key and on Close are real clicks, except after
 * a scroll, where the runner's click would scroll the key back into view first,
 * so the key's own click() is used.
 */
const LOG = `(window.__iaLog = window.__iaLog || [])`;
const FOCUS = `(document.activeElement === document.querySelector('${KEY}') ? 'focus on the key' : 'FOCUS ON ' + (document.activeElement && (document.activeElement.className || document.activeElement.tagName)))`;

export default {
	path: '/dev/home-order?signedout=1&ua=iphone',
	label: 'Install app key, iPhone: the Share card opens, and Escape, outside and Close shut it with focus back on the key',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
		HIDE_STRIP,
		CLOSE_TOUR,
		{ waitFor: `() => document.querySelector('${KEY}')?.dataset.installMode === 'ios'`, timeoutMs: 5000, label: 'the key is there, in its iPhone mode' },
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'press the key: the card opens' },
		{
			evaluate: `() => { const c = document.querySelector('${CARD}'); const k = document.querySelector('${KEY}'); ${LOG}.push(c.contains(document.activeElement) ? 'focus inside the card' : 'FOCUS OUTSIDE THE CARD'); ${LOG}.push(k.getAttribute('aria-expanded') === 'true' && k.getAttribute('aria-controls') === c.id ? 'key expanded, controls the card' : 'KEY ARIA WRONG'); ${LOG}.push(document.querySelector('[data-install="popup"]') ? 'THE POP-UP STAYED UNDER THE CARD' : 'the pop-up stepped aside'); return window.__iaLog.join(' | '); }`
		},
		{
			evaluate: `async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 250)); ${LOG}.push(document.querySelector('${CARD}') ? 'ESCAPE LEFT IT OPEN' : 'Escape shut it'); ${LOG}.push(${FOCUS}); ${LOG}.push(document.querySelector('${KEY}').getAttribute('aria-expanded') === 'false' ? 'key collapsed' : 'KEY STILL EXPANDED'); ${LOG}.push(document.querySelector('[data-install="popup"]') ? 'the pop-up is back' : 'THE POP-UP DID NOT COME BACK'); return window.__iaLog.join(' | '); }`,
			label: 'Escape'
		},
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'open it again, for Tab' },
		{
			evaluate: `async () => { const close = document.querySelector('${CARD} .ia-close'); close.focus(); close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 250)); ${LOG}.push(document.activeElement === document.querySelector('.legacy-index .tour-link') ? 'Tab from Close goes on to Take the tour' : 'TAB WENT TO ' + (document.activeElement && (document.activeElement.className || document.activeElement.tagName))); ${LOG}.push(document.querySelector('${CARD}') ? 'TAB LEFT IT OPEN' : 'and the card shut'); return window.__iaLog.join(' | '); }`,
			label: 'Tab from Close'
		},
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'open it again' },
		{
			evaluate: `async () => { document.querySelector('.legacy-index .hero h1').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 250)); ${LOG}.push(document.querySelector('${CARD}') ? 'AN OUTSIDE TAP LEFT IT OPEN' : 'a tap outside shut it'); ${LOG}.push(${FOCUS}); return window.__iaLog.join(' | '); }`,
			label: 'a tap outside'
		},
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'open it again' },
		{ click: `${CARD} .ia-close`, until: `() => !document.querySelector('${CARD}')`, attempts: 6, label: 'press Close' },
		{ evaluate: `() => { ${LOG}.push('Close shut it'); ${LOG}.push(${FOCUS}); return window.__iaLog.join(' | '); }` },
		{
			evaluate: `async () => { const d = document.querySelector('[data-install="popup"] .ip-dismiss'); if (!d) { ${LOG}.push('NO PHONE POP-UP'); return 'no pop-up'; } const fb = document.querySelector('.sfb-shell .sfb-trigger').getBoundingClientRect(); const pop = document.querySelector('[data-install="popup"]').getBoundingClientRect(); const at = document.elementFromPoint(fb.left + fb.width / 2, fb.top + fb.height / 2); ${LOG}.push((at && at.closest('.sfb-shell') ? 'the feedback button answers at its centre' : 'THE FEEDBACK BUTTON IS COVERED') + ', ' + (pop.bottom <= fb.top ? 'the pop-up sits above it' : 'THE POP-UP REACHES ' + Math.round(pop.bottom - fb.top) + 'px INTO IT')); d.click(); await new Promise((r) => setTimeout(r, 250)); ${LOG}.push(document.querySelector('[data-install="popup"]') ? 'POP-UP STILL UP' : 'pop-up dismissed'); ${LOG}.push(document.querySelector('${KEY}') ? 'the key is still there' : 'THE KEY WENT WITH IT'); return window.__iaLog.join(' | '); }`,
			label: 'dismiss the phone pop-up (its own Got it)'
		},
		{
			evaluate: `async () => {
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				const read = (when) => {
					const c = document.querySelector('${CARD}');
					const k = document.querySelector('${KEY}');
					if (!c) { ${LOG}.push(when + ': NO CARD'); return; }
					const r = c.getBoundingClientRect();
					const b = k.getBoundingClientRect();
					const gap = r.top - b.bottom;
					const hit = document.elementFromPoint(b.left + b.width / 2, (b.top + b.bottom) / 2);
					${LOG}.push(when + ': ' + [gap > 6 && gap < 11 ? 'card 8px under the key' : 'CARD ' + gap.toFixed(1) + 'px FROM THE KEY', r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth ? 'inside the window' : 'OFF THE WINDOW', hit && k.contains(hit) ? 'key answers at its centre' : 'KEY COVERED'].join(', '));
				};
				window.scrollTo({ top: 24, behavior: 'instant' });
				await wait(200);
				document.querySelector('${KEY}').click();
				await wait(300);
				read('opened after 24px of scroll');
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				window.scrollTo({ top: 0, behavior: 'instant' });
				await wait(200);
				document.querySelector('${KEY}').click();
				await wait(300);
				window.scrollTo({ top: 30, behavior: 'instant' });
				await wait(300);
				read('opened, then scrolled 30px');
				window.scrollTo({ top: 400, behavior: 'instant' });
				await wait(400);
				const k = document.querySelector('${KEY}');
				const kb = k.getBoundingClientRect();
				${LOG}.push('scrolled 400px, the key ' + (kb.bottom <= 0 ? 'out of the window' : 'STILL ON SCREEN at ' + kb.bottom.toFixed(0)) + ': ' + (document.querySelector('${CARD}') ? 'THE CARD STAYED, PINNED TO THE WINDOW' : 'the card closed') + ', ' + (k.getAttribute('aria-expanded') === 'false' ? 'key collapsed' : 'KEY STILL EXPANDED') + ', ' + (document.activeElement === k ? 'focus on the key' : 'FOCUS ON ' + (document.activeElement && (document.activeElement.className || document.activeElement.tagName))) + ', ' + (scrollY > 300 ? 'the page stayed scrolled' : 'THE PAGE SCROLLED BACK TO ' + Math.round(scrollY)));
				window.scrollTo({ top: 0, behavior: 'instant' });
				await wait(200);
				return window.__iaLog.join(' | ');
			}`,
			label: 'with the page scrolled: opened after 24px, opened then scrolled 30px, then 400px (the key leaves the window, so the card closes)'
		},
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'open it again, for focus leaving' },
		{
			evaluate: `async () => {
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				const k = document.querySelector('${KEY}');
				const logo = document.querySelector('.legacy-index header .logo');
				k.focus();
				await wait(200);
				${LOG}.push('focus from the card to the key: ' + (document.querySelector('${CARD}') ? 'the card stays' : 'THE CARD CLOSED'));
				logo.focus();
				await wait(200);
				${LOG}.push('focus on past the key, to the logo: ' + (document.querySelector('${CARD}') ? 'THE CARD STAYED' : 'the card closed') + ', ' + (document.activeElement === logo ? 'focus where it went' : 'FOCUS PULLED TO ' + (document.activeElement && (document.activeElement.className || document.activeElement.tagName))));
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				await wait(200);
				${LOG}.push('then Escape: ' + (document.activeElement === logo ? 'focus stays on the logo' : 'ESCAPE PULLED FOCUS TO ' + (document.activeElement && (document.activeElement.className || document.activeElement.tagName))));
				return window.__iaLog.join(' | ');
			}`,
			label: 'focus leaving the card and the key closes it, and a later Escape moves nothing'
		},
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'open the card for the measurements' }
	],
	presence: [
		{ selector: KEY, label: 'the Install app key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: CARD, label: 'the Share card, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${CARD} .is-share svg`, label: 'the Share icon drawn in the sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-install="popup"]', label: 'the phone pop-up, dismissed', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: `${CARD} .ia-card-body`, label: 'the pop-up\'s own iOS words', must: ['Tap the Share icon, then', '"Add to Home Screen"', 'to install IDEA on your device.'], mustNot: ['—'] },
		{ selector: `${CARD} .ia-card-title`, label: 'the card names itself', must: ['Install IDEA'] }
	],
	tapTargets: [
		{ selector: KEY, label: 'the Install app key', min: 44 },
		{ selector: `${CARD} .ia-close`, label: 'the card\'s Close key', min: 44 }
	],
	contrast: [
		{ selector: KEY, label: 'the key\'s ink on its face', min: 4.5 },
		{ selector: `${CARD} .ia-card-title`, label: 'card title', min: 4.5 },
		{ selector: `${CARD} .ia-card-body`, label: 'card sentence', min: 4.5 },
		{ selector: `${CARD} .ia-close`, label: 'card Close key', min: 4.5 }
	],
	orderResult: [
		{
			label: 'open, Escape, outside, Close, the pop-up dismissed, scrolled away, and focus moved past',
			evaluate: '() => window.__iaLog',
			expected: [
				'focus inside the card',
				'key expanded, controls the card',
				'the pop-up stepped aside',
				'Escape shut it',
				'focus on the key',
				'key collapsed',
				'the pop-up is back',
				'Tab from Close goes on to Take the tour',
				'and the card shut',
				'a tap outside shut it',
				'focus on the key',
				'Close shut it',
				'focus on the key',
				'the feedback button answers at its centre, the pop-up sits above it',
				'pop-up dismissed',
				'the key is still there',
				'opened after 24px of scroll: card 8px under the key, inside the window, key answers at its centre',
				'opened, then scrolled 30px: card 8px under the key, inside the window, key answers at its centre',
				'scrolled 400px, the key out of the window: the card closed, key collapsed, focus on the key, the page stayed scrolled',
				'focus from the card to the key: the card stays',
				'focus on past the key, to the logo: the card closed, focus where it went',
				'then Escape: focus stays on the logo'
			]
		},
		{
			label: 'the card is inside the window, under the key, and leaves the key uncovered',
			evaluate: `() => {
				const c = document.querySelector('${CARD}').getBoundingClientRect();
				const k = document.querySelector('${KEY}').getBoundingClientRect();
				return [
					c.left >= 0 && c.right <= innerWidth + 0.5 && c.top >= 0 && c.bottom <= innerHeight ? 'card inside the window' : 'CARD OFF SCREEN ' + [c.left, c.top, c.right, c.bottom].map(Math.round),
					c.top >= k.bottom ? 'card below the key' : 'CARD NOT BELOW THE KEY',
					document.querySelector('${CARD}').contains(document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)) ? 'card answers at its centre' : 'CARD COVERED',
					document.querySelector('.legacy-index header').contains(document.querySelector('${CARD}')) ? 'CARD INSIDE THE HEADER' : 'card outside the header, at the room root'
				];
			}`,
			expected: ['card inside the window', 'card below the key', 'card answers at its centre', 'card outside the header, at the room root']
		},
		{ label: 'where the key sits', evaluate: ROW_PROBE, expected: ['on the Take the tour row', 'overlaps nothing', 'answers at its centre', 'header does not scroll sideways'] }
	]
};
