/**
 * THE STRIP'S ARCHIVED KEY, PRESSED (report R12). One real button at the end
 * of the class row opens a short list of the archived classes in words.
 *
 * Measured with it open: the key reads as pressed (aria-expanded and the lit
 * pad), the three classes are listed as links a finger can hit, the list sits
 * wholly inside the window at both widths (it is `anchored`, fixed to the
 * viewport, because the row it belongs to scrolls and would clip it), and the
 * page has not grown a horizontal scroll. Then Escape closes it and puts focus
 * back on the key, and a press elsewhere on the page closes it too.
 *
 * `aliasOf` because this is a STATE of the archived route, not a route.
 */
import { ARCHIVED, ARCHIVED_READY } from './_classroom-todo.mjs';

const LIST_OPEN = `() => { const l = document.querySelector('[data-testid="class-strip-archived-list"]'); return !!l && !l.hidden && l.getBoundingClientRect().height > 0; }`;

export default {
	path: `${ARCHIVED}&state=strip-open`,
	aliasOf: ARCHIVED,
	label: 'The strip Archived key opens its list of archived classes, and Escape or a press elsewhere closes it',
	prepare: [ARCHIVED_READY, { click: '[data-testid="class-strip-archived"]', until: LIST_OPEN }],
	presence: [
		{ selector: '[data-testid="class-strip-archived"][aria-expanded="true"]', label: 'the key says it is open', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-strip-archived"].current', label: 'the key is the lit pad while open', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-strip-archived-list"]', label: 'the list', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-strip-archived-item"]', label: 'the three archived classes', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-strip-archived-item"][aria-current]', label: 'none is marked current (the page is My Classes)', expectPresent: 0 }
	],
	tapTargets: [{ selector: '[data-testid="class-strip-archived-item"]', label: 'each archived class', min: 44 }],
	contrast: [
		{ selector: '[data-testid="class-strip-archived-item"] .sw-item-name', label: 'class label', min: 4.5 },
		{ selector: '[data-testid="class-strip-archived-item"] .sw-item-code', label: 'course code', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the list is wholly inside the window and the page does not scroll sideways',
			evaluate: `() => {
				const r = document.querySelector('[data-testid="class-strip-archived-list"]').getBoundingClientRect();
				const d = document.documentElement;
				return [
					r.left >= 0 && r.right <= innerWidth + 0.5 ? 'inside horizontally' : 'OUTSIDE ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + innerWidth,
					r.top >= 0 && r.bottom <= innerHeight + 0.5 ? 'inside vertically' : 'OUTSIDE ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' of ' + innerHeight,
					d.scrollWidth > d.clientWidth ? 'page scrolls sideways ' + (d.scrollWidth - d.clientWidth) + 'px' : 'no sideways scroll'
				];
			}`,
			expected: ['inside horizontally', 'inside vertically', 'no sideways scroll']
		},
		{
			label: 'the archived classes, in words, in the strip order',
			evaluate: `() => [...document.querySelectorAll('[data-testid="class-strip-archived-item"]')].map((a) => a.querySelector('.sw-item-code').textContent.trim() + ' ' + a.querySelector('.sw-item-name').textContent.trim())`,
			expected: ['ENG1H Period 3 · Block C', 'FRC Period 8 · Block H', 'IDEA100 Period 6 · Block F']
		},
		{
			label: 'Escape closes it and focus returns to the key; a press elsewhere closes it again',
			evaluate: `async () => {
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const key = document.querySelector('[data-testid="class-strip-archived"]');
				const list = () => document.querySelector('[data-testid="class-strip-archived-list"]');
				document.querySelector('[data-testid="class-strip-archived-item"]').focus();
				document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
				await sleep(150);
				const escaped = list().hidden;
				const focused = document.activeElement === key;
				key.click();
				await sleep(150);
				const reopened = !list().hidden;
				const hero = document.querySelector('main h1');
				hero.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
				await sleep(150);
				return [String(escaped), String(focused), String(reopened), String(list().hidden), key.getAttribute('aria-expanded')];
			}`,
			expected: ['true', 'true', 'true', 'true', 'false']
		}
	]
};
