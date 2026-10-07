/**
 * THE CHECKED OUT VIEW OF SIXTY CHECKOUTS (Armory v0.3 item 2, and the report
 * that a project with many checkouts was tens of screens long): a compact
 * table, oldest first, 25 rows at a time. Measured: the page's height against
 * a budget at both widths, the holder keys adding up to the whole list, 50
 * rows after one "Show more", and every Force check in key answering a tap at
 * its own centre (the docked report control and the next row never take it).
 */
import { ARMORY_HYDRATED, DOC_HEIGHT, hitsSelf } from './_armory.mjs';

export default {
	path: '/dev/armory?state=many-out',
	label: 'IDEA Armory: sixty checkouts as a table, 25 at a time',
	prepare: [
		...ARMORY_HYDRATED,
		{ evaluate: DOC_HEIGHT },
		{ evaluate: `() => { const y = (sel, edge = 'bottom') => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect()[edge] + scrollY) : -1; }; return ['header ' + y('.ar-header'), 'h1 ' + y('h1'), 'lead ' + y('.ar-lead'), 'status ' + y('.ar-status'), 'tabs ' + y('.ar-tabs'), 'view-h ' + y('.ar-view-h'), 'toolbar ' + y('.ar-toolbar'), 'holders ' + y('.ar-holders'), 'count ' + y('.ar-count'), 'table top ' + y('.ar-out-table', 'top'), 'row1 h ' + Math.round(document.querySelector('[data-testid=armory-checkout]').getBoundingClientRect().height), 'table ' + y('.ar-out-table'), 'more ' + y('.ar-more'), 'main ' + y('main.ar-root')].join(' | '); }` },
		{
			evaluate: `() => document.documentElement.scrollHeight`,
			until: `() => document.documentElement.scrollHeight <= (innerWidth < 600 ? 2600 : 1800)`
		},
		{
			evaluate: `() => document.querySelectorAll('[data-testid="armory-checkout"]').length`,
			until: `() => document.querySelectorAll('[data-testid="armory-checkout"]').length === 25`
		},
		{ click: '[data-testid="armory-out-more"]', until: `() => document.querySelectorAll('[data-testid="armory-checkout"]').length === 50` },
		{ evaluate: DOC_HEIGHT }
	],
	orderResult: [
		{
			label: 'the holder keys add up to the whole list',
			evaluate: `() => { const keys = [...document.querySelectorAll('[data-testid="armory-holder"]')]; const all = Number(keys.find((k) => k.dataset.holder === 'all')?.dataset.count); const rest = keys.filter((k) => k.dataset.holder !== 'all').reduce((n, k) => n + Number(k.dataset.count), 0); return [all, rest]; }`,
			expected: [60, 60]
		},
		{
			label: 'one Force check in per row held by somebody else',
			evaluate: `() => { const rows = [...document.querySelectorAll('[data-testid="armory-checkout"]')]; const others = rows.filter((r) => r.querySelector('.ar-out-who')?.textContent.trim() !== 'You').length; const keys = document.querySelectorAll('[data-testid="armory-checkout"] [data-testid="armory-take-back"]').length; return [keys > 0 && keys === others && others < rows.length ? 'one key per row held by somebody else, none on your own' : others + ' rows of others, ' + keys + ' keys, ' + rows.length + ' rows']; }`,
			expected: ['one key per row held by somebody else, none on your own']
		},
		{ label: 'every Force check in answers a tap at its centre', evaluate: hitsSelf('[data-testid="armory-checkout"] [data-testid="armory-take-back"]'), expected: ['every one answers itself'] },
		{
			label: 'oldest first',
			evaluate: `() => { const t = [...document.querySelectorAll('[data-testid="armory-checkout"] .ar-out-since')].map((c) => c.textContent.trim()); return [t[0]?.startsWith('Oct') ? 'an older day first' : 'first row ' + t[0]]; }`,
			expected: ['an older day first']
		}
	],
	presence: [
		{ selector: '[data-testid="armory-checkout"]', label: 'fifty rows after one Show more', expectPresent: 50, maxPresent: 50, expectVisible: 50 },
		{ selector: '[data-testid="armory-out-more"]', label: 'Show more is still offered', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-out-all"]', label: 'and Show all', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-holder"]', label: 'Everyone, Mine and five people (keys where the view is wide)', expectPresent: 7, maxPresent: 7 },
		{ selector: '[data-testid="armory-holder-select"] option', label: 'and the same seven in the select a phone shows', expectPresent: 7, maxPresent: 7 },
		{ selector: '.sfb-shell .sfb-trigger', label: 'nothing floats over the table', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="armory-out-count"]', label: 'the count, in words', must: ['60 files checked out, oldest first', 'Showing the first 50'] },
		{ selector: '[data-testid="armory-holder"][data-holder="all"]', label: 'Everyone carries the count', must: ['Everyone (60)'] }
	],
	tapTargets: [
		{ selector: '[data-testid="armory-take-back"]', label: 'Force check in', min: 44 },
		{ selector: '.ar-out-file a', label: 'file links', min: 44 },
		{ selector: ':is([data-testid="armory-holder"], [data-testid="armory-holder-select"])', label: 'holder keys, or the select', min: 44 },
		{ selector: '[data-testid="armory-out-search"]', label: 'the search box', min: 44 }
	],
	contrast: [
		{ selector: ':is(.ar-out-who, .ar-out-device, .ar-out-since, .ar-out-folder)', label: 'who, where, since and folder, on the well', min: 4.5 },
		{ selector: '.ar-out-name', label: 'file names', min: 4.5 }
	]
};
