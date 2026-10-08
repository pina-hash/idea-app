/**
 * THE FILES VIEW OF A BIG PROJECT (Mr. Pina's report of 2026-10-07: the
 * project page "scrolls on for way too long ... I literally need to scroll
 * down tens and tens of times"). 240 files in 12 top-level folders, 60 checked
 * out: the view arrives with every folder closed, so the page is a header, a
 * toolbar and twelve folder rows. The rows are hidden, never removed (240 in
 * the DOM, 0 visible); opening a folder shows its twenty.
 */
import { ARMORY_HYDRATED, DOC_HEIGHT, hitsSelf } from './_armory.mjs';

export default {
	path: '/dev/armory?state=many',
	label: 'IDEA Armory: the Files view of 240 files in 12 folders, arriving folded',
	prepare: [
		...ARMORY_HYDRATED,
		{ evaluate: DOC_HEIGHT },
		{
			evaluate: `() => [...document.querySelectorAll('[data-testid="armory-file-row"]')].filter((r) => r.getBoundingClientRect().height > 0).length`,
			until: `() => [...document.querySelectorAll('[data-testid="armory-file-row"]')].filter((r) => r.getBoundingClientRect().height > 0).length === 0`
		},
		{
			evaluate: `() => document.documentElement.scrollHeight`,
			until: `() => document.documentElement.scrollHeight <= (innerWidth < 600 ? 2200 : 1400)`
		},
		{
			click: '[data-folder="Arm"] [data-testid="armory-folder-toggle"]',
			until: `() => [...document.querySelectorAll('[data-folder="Arm"] [data-testid="armory-file-row"]')].filter((r) => r.getBoundingClientRect().height > 0).length === 20`
		}
	],
	orderResult: [
		{ label: 'the first tab answers a tap at its centre', evaluate: hitsSelf('[data-testid="armory-tab-files"]'), expected: ['every one answers itself'] },
		{ label: 'every folder toggle answers a tap at its centre', evaluate: hitsSelf('[data-testid="armory-folder-toggle"]'), expected: ['every one answers itself'] }
	],
	presence: [
		{ selector: '[data-testid="armory-tabs"] .ar-tab', label: 'five views for a mentor', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '.ar-tab[aria-current="page"]', label: 'one current', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-folder-toggle"]', label: 'twelve folders', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="armory-folder-toggle"][aria-expanded="false"]', label: 'eleven still closed', expectPresent: 11, maxPresent: 11, expectVisible: 11 },
		{ selector: '[data-testid="armory-file-row"]', label: 'all 240 rows in the DOM, twenty showing (the opened folder)', expectPresent: 240, maxPresent: 240, expectVisible: 20, maxVisible: 20 },
		{ selector: '[data-folder="Arm"] .ar-subfolder', label: 'the opened folder shows its subfolder', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-report"] .sfb-trigger', label: 'the report control is docked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.sfb-shell .sfb-trigger', label: 'nothing floats over the files', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-folder="Arm"] [data-testid="armory-folder-toggle"]', label: 'a folder says what is in it', must: ['Arm', '20 files', '5 checked out'] },
		{ selector: '[data-testid="armory-files"] .ar-count', label: 'the count says to open a folder', must: ['240 files, 60 checked out', 'Open a folder'] }
	],
	tapTargets: [
		{ selector: '.ar-tab', label: 'the view tabs', min: 44 },
		{ selector: '.ar-filter', label: 'the filters', min: 44 },
		{ selector: '[data-testid="armory-folder-toggle"]', label: 'the folder toggles', min: 44 },
		{ selector: '[data-folder="Arm"] a.ar-file', label: 'an opened folder\'s rows', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="armory-folder-toggle"] .ar-folder-meta', label: 'folder counts', min: 4.5 },
		{ selector: '[data-folder="Arm"] .ar-file-line', label: 'who and when, in a folder', min: 4.5 },
		{ selector: '.ar-tab', label: 'the tabs', min: 4.5 }
	]
};
