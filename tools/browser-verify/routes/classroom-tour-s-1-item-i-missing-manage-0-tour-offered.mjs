/**
 * THE LIST IS AS WIDE AS YOU MAKE IT (ledger 0297, LEARN). With an item open
 * above 1024px the list and the item sit side by side, and the gap between
 * them is a WAI-ARIA window splitter: the arrow keys move it a step, Page Up
 * and Page Down four, Home and End go to the ends (the end is clamped so the
 * item keeps at least 32rem), and Enter puts it back to standard. Its
 * single-pointer twin is Narrower and Wider in Settings (WCAG 2.5.7), which
 * works at every width. The width is remembered on THIS DEVICE and never
 * written to the account.
 *
 * Below 1024px there is one column and no separator; the keys half of the
 * verdict then asserts exactly that, and the buttons half runs as it does on a
 * desktop.
 *
 * A student, with the tour already offered so nothing sits under the header.
 */
import { TOUR_READY } from './_classroom-tour.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

const SETTINGS_OPEN = `() => !!document.querySelector('dialog[data-testid="classroom-settings"][open]')`;

export default {
	path: '/dev/classroom-tour/s-1/item/i-missing?manage=0&tour=offered',
	label: 'List width: the separator by keyboard, Narrower and Wider in Settings, stored on the device',
	prepare: [
		{ ...TOUR_READY, waitFor: `() => !!document.querySelector('[data-testid="split-separator"]') && typeof window.__tourProbe === 'function'` },
		{
			label: 'the separator, by keyboard',
			evaluate: `async () => {
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const sep = document.querySelector('[data-testid="split-separator"]');
				const nav = document.querySelector('[data-testid="class-nav-pane"]');
				const detail = document.querySelector('[data-testid="class-detail-pane"]');
				const shown = getComputedStyle(sep).display !== 'none' && sep.getBoundingClientRect().width > 0;
				if (!shown) {
					window.__sepKeys = 'ok';
					return 'one column below 1024px: no separator (display ' + getComputedStyle(sep).display + ')';
				}
				const read = () => ({ v: Number(sep.getAttribute('aria-valuenow')), w: nav.getBoundingClientRect().width, d: detail.getBoundingClientRect().width });
				const press = async (key) => {
					sep.focus();
					sep.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
					/* The split eases its columns over 180ms; read after it lands. */
					await sleep(400);
					return read();
				};
				const bad = [];
				const s = read();
				const g = sep.getBoundingClientRect();
				const right = await press('ArrowRight');
				await window.__tourFlush();
				const storedRight = window.__tourProbe().local?.display?.navWidth;
				const end = await press('End');
				const home = await press('Home');
				const pg = await press('PageUp');
				const left = await press('ArrowLeft');
				const enter = await press('Enter');
				await window.__tourFlush();
				const p = window.__tourProbe();
				if (s.v !== 26 || Math.abs(s.w - 416) > 1.5) bad.push('start ' + s.v + '/' + s.w);
				if (right.v !== 27 || Math.abs(right.w - s.w - 16) > 1.5) bad.push('ArrowRight ' + right.v + '/' + right.w);
				if (storedRight !== 27) bad.push('stored ' + storedRight);
				if (!(end.v > right.v && end.v <= 40 && end.d >= 512 - 1)) bad.push('End ' + end.v + ', item ' + end.d);
				if (home.v !== 18 || Math.abs(home.w - 288) > 1.5) bad.push('Home ' + home.v + '/' + home.w);
				if (pg.v !== 22) bad.push('PageUp ' + pg.v);
				if (left.v !== 21) bad.push('ArrowLeft ' + left.v);
				if (enter.v !== 26 || p.navWidth !== null || p.local?.display?.navWidth !== undefined) bad.push('Enter ' + enter.v + ', stored ' + p.navWidth);
				if ('display' in (p.row.classroom ?? {})) bad.push('width written to the account');
				window.__sepKeys = bad.join('; ') || 'ok';
				return 'separator ' + Math.round(g.width) + 'x' + Math.round(g.height) + 'px; start ' + s.v + 'rem = ' + Math.round(s.w) + 'px, item ' + Math.round(s.d) + 'px; ArrowRight ' + right.v + ' (' + Math.round(right.w) + 'px, stored ' + storedRight + '); End ' + end.v + ' (item ' + Math.round(end.d) + 'px); Home ' + home.v + ' (' + Math.round(home.w) + 'px); PageUp ' + pg.v + '; ArrowLeft ' + left.v + '; Enter ' + enter.v + ' (stored ' + p.navWidth + ')';
			}`
		},
		OPEN_SHELL_MENU,
		{ click: '[data-testid="settings-trigger"]', until: SETTINGS_OPEN },
		{
			label: 'Narrower and Wider in Settings',
			evaluate: `async () => {
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const q = (id) => document.querySelector('[data-testid="' + id + '"]');
				const press = async (id) => { q(id).click(); await sleep(400); await window.__tourFlush(); return window.__tourProbe().navWidth; };
				const words = () => q('settings-nav-width-value').textContent.trim();
				const bad = [];
				const log = [];
				const nav = document.querySelector('[data-testid="class-nav-pane"]');
				const wide = innerWidth >= 1024;
				let v = await press('settings-nav-wider');
				v = await press('settings-nav-wider');
				log.push('Wider x2 ' + v + ' "' + words() + '"' + (wide ? ' list ' + Math.round(nav.getBoundingClientRect().width) + 'px' : ''));
				if (v !== 28 || words() !== '2 steps wider') bad.push('Wider x2 ' + v + ' ' + words());
				if (wide && Math.abs(nav.getBoundingClientRect().width - 448) > 1.5) bad.push('list did not follow ' + nav.getBoundingClientRect().width);
				v = await press('settings-nav-narrower');
				log.push('Narrower ' + v);
				if (v !== 27) bad.push('Narrower ' + v);
				v = await press('settings-reset-display');
				log.push('Reset ' + v + ' "' + words() + '"');
				if (v !== null || words() !== 'Standard') bad.push('Reset ' + v + ' ' + words());
				for (let i = 0; i < 8; i++) v = await press('settings-nav-narrower');
				const dis = q('settings-nav-narrower').getAttribute('aria-disabled');
				const extra = await press('settings-nav-narrower');
				log.push('Narrower x9 ' + extra + ' (aria-disabled ' + dis + ')');
				if (v !== 18 || extra !== 18 || dis !== 'true') bad.push('floor ' + v + '/' + extra + '/' + dis);
				const p = window.__tourProbe();
				if (p.local?.display?.navWidth !== 18) bad.push('device slot ' + JSON.stringify(p.local));
				if ('display' in (p.row.classroom ?? {})) bad.push('width written to the account');
				v = await press('settings-reset-display');
				window.__sepButtons = bad.join('; ') || 'ok';
				return log.join('; ') + '; Reset ' + v;
			}`
		}
	],
	presence: [
		/* One separator in the DOM at every width; on screen only with two columns. */
		{ selector: '[data-testid="split-separator"][role="separator"][aria-orientation="vertical"]', label: 'the separator (on screen above 1024px)', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 1 },
		{ selector: 'dialog[data-testid="classroom-settings"]', label: 'Settings, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-nav-narrower"], [data-testid="settings-nav-wider"]', label: 'Narrower and Wider', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [
		{
			selector: 'dialog[data-testid="classroom-settings"]',
			label: "a student's settings: list width and the to-do default, not a teacher's",
			must: ['List width', 'Standard', 'To-do opens on', 'This device', 'Your account', 'Classroom tour'],
			mustNot: ['Density', 'Grades lists by']
		}
	],
	contrast: [
		{ selector: '[data-testid="settings-nav-width-value"]', label: 'the width, in words', min: 4.5 },
		{ selector: '[data-testid="settings-nav-narrower"], [data-testid="settings-nav-wider"]', label: 'Narrower and Wider', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="settings-nav-narrower"], [data-testid="settings-nav-wider"]', label: 'Narrower and Wider' }],
	orderResult: [
		{
			label: 'the keys move and clamp the list and Enter resets it (above 1024px; below it there is no separator); the buttons step, floor and reset; the width stays on this device',
			evaluate: `() => [String(window.__sepKeys), String(window.__sepButtons)]`,
			expected: ['ok', 'ok']
		}
	]
};
