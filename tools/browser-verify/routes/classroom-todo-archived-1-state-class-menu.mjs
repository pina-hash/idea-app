/**
 * THE CLASSES MENU (ledger 0392, report 2f019c5b: "Classes dropdown is ugly").
 *
 * My Classes with last year's three classes archived, and the header's Classes
 * key pressed. What is measured is what the report was about: every class is
 * ONE aligned row (the course code in its own column, the section beside it on
 * one line, never wrapped under it), the archived classes sit under their own
 * label rather than carrying a flag that broke the row, every row clears 44px,
 * and every word clears 4.5:1 on the menu's real ground. Above the fold the
 * menu drops from its own key; below it the Menu shows it in place, which is
 * why the 375 run opens the Menu first.
 */
import { ARCHIVED, ARCHIVED_READY } from './_classroom-todo.mjs';

export const OPEN_CLASS_MENU = {
	evaluate: `() => {
		/* Menu and Classes toggle ONE open state, so press exactly one of them:
		   the Menu where it is shown (phone width), the Classes key otherwise. */
		const menu = document.querySelector('[data-testid="shell-menu"]');
		const key = menu && getComputedStyle(menu).display !== 'none' ? menu : document.querySelector('[data-testid="section-switcher"]');
		if (key && key.getAttribute('aria-expanded') !== 'true') key.click();
		return key?.dataset.testid ?? 'none';
	}`,
	until: `() => !!document.querySelector('[data-testid="section-switcher-menu"]')`,
	gapMs: 500,
	label: 'open the Classes menu (through the Menu at phone width)'
};

export const CLASS_MENU_READY = {
	waitFor: `() => !!document.querySelector('[data-testid="section-switcher-menu"]')`,
	timeoutMs: 10000,
	label: 'the class menu is open'
};

/** Each class row's code and name share one line: their tops agree within 4px. */
export const ONE_LINE_ROWS = {
	label: 'every class row is one line: the code and the section side by side, never stacked',
	evaluate: `() => {
		const rows = [...document.querySelectorAll('[data-testid="switcher-section"]')];
		const stacked = rows.filter((r) => {
			const c = r.querySelector('.sw-item-code').getBoundingClientRect();
			const n = r.querySelector('.sw-item-name').getBoundingClientRect();
			return Math.abs(c.top - n.top) > 4 || n.left < c.right - 1;
		}).length;
		/* Lines are counted off the TEXT, not off a box height: a range over the
		   name returns one rect per line box it lands on. */
		const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size; };
		const wrapped = rows.filter((r) => lines(r.querySelector('.sw-item-name')) > 1).length;
		return ['rows=' + rows.length, 'stacked=' + stacked, 'wrapped=' + wrapped];
	}`,
	expected: ['rows=7', 'stacked=0', 'wrapped=0']
};

export const GROUPS = {
	label: 'the groups, in order, and the archived three under their own label',
	evaluate: `() => {
		const menu = document.querySelector('[data-testid="section-switcher-menu"]');
		const out = [];
		let group = 'top';
		for (const el of menu.children) {
			if (el.classList.contains('sw-group')) { group = el.textContent.trim(); continue; }
			if (el.matches('[data-testid="switcher-section"]')) out.push(group);
		}
		const counts = {};
		for (const g of out) counts[g] = (counts[g] ?? 0) + 1;
		return Object.entries(counts).map(([g, n]) => g + '=' + n);
	}`,
	expected: ['Your classes=4', 'Archived=3']
};

export default {
	path: `${ARCHIVED}&state=class-menu`,
	aliasOf: ARCHIVED,
	label: 'The Classes menu: grouped, one aligned line per class, archived under its own label',
	prepare: [ARCHIVED_READY, OPEN_CLASS_MENU, CLASS_MENU_READY],
	presence: [
		{ selector: '[data-testid="section-switcher-menu"]', label: 'the menu, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="switcher-section"]', label: 'seven classes', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '.sw-group', label: 'two group labels (no Setup without staff)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '.sw-all', label: 'All my classes, first', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [ONE_LINE_ROWS, GROUPS],
	tapTargets: [{ selector: '[data-testid="section-switcher-menu"] .sw-item', label: 'every menu row', min: 44 }],
	contrast: [
		{ selector: '[data-testid="switcher-section"] .sw-item-code', label: 'a course code', min: 4.5 },
		{ selector: '[data-testid="switcher-section"] .sw-item-name', label: 'a section name', min: 4.5 },
		{ selector: '.sw-group-label', label: 'a group label', min: 4.5 },
		{ selector: '.sw-all .sw-item-name', label: 'All my classes', min: 4.5 }
	]
};
