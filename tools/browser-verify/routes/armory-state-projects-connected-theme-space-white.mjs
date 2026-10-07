/**
 * /armory UNDER SPACE WHITE (Mr. Pina's report of 2026-10-07, "the latest and
 * greatest themes ... the same design scheme that's used for IDEA
 * Classroom"). The site plate's title bar, recessed readouts on cards in the
 * My Classes anatomy, and an `auto-fit` grid that leaves no dead track at
 * 1440. The harness holds no session, so the theme is forced the
 * /dev/foundry-room way.
 */
import { ARMORY_HYDRATED } from './_armory.mjs';

export default {
	path: '/dev/armory?state=projects-connected&theme=space-white',
	label: 'IDEA Armory: the projects page under Space White',
	prepare: [...ARMORY_HYDRATED, { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }],
	orderResult: [
		{
			label: 'the cards share the whole row: no dead track',
			evaluate: `() => { const g = document.querySelector('[data-testid="armory-projects"]'); const cards = [...g.querySelectorAll('[data-testid="armory-project-card"]')]; const gr = g.getBoundingClientRect(); const right = Math.max(...cards.map((c) => c.getBoundingClientRect().right)); return [Math.abs(gr.right - right) < 2 ? 'the last card reaches the grid edge' : 'gap ' + (gr.right - right).toFixed(1) + 'px']; }`,
			expected: ['the last card reaches the grid edge']
		},
		{
			label: 'the title is the plate title bar',
			evaluate: `() => { const h = document.querySelector('h1.plate-title'); return [!!h, h ? getComputedStyle(h, '::before').content !== 'none' : false]; }`,
			expected: [true, true]
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '.site-plate h1.plate-title', label: 'the plate title bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-projects"] [data-testid="armory-project-card"]', label: 'three live cards', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="armory-projects"] [data-testid="armory-project-readouts"] .ar-readout', label: 'readouts on every card', expectPresent: 12, maxPresent: 12, expectVisible: 12 }
	],
	contrast: [
		{ selector: '.ar-project-name', label: 'card names', min: 4.5 },
		{ selector: '[data-testid="armory-projects"] .ar-readout', label: 'card readouts and role chips', min: 4.5 },
		{ selector: '.ar-project-meta', label: 'last change', min: 4.5 },
		{ selector: '.ar-project-cta', label: 'Open', min: 4.5 },
		{ selector: '.ar-eyebrow', label: 'the eyebrow', min: 4.5 },
		{ selector: 'h1.plate-title', label: 'the title bar', min: 4.5 },
		{ selector: '.ar-status-line', label: 'the status line', min: 4.5 }
	],
	tapTargets: [
		{ selector: 'a.ar-project', label: 'project cards', min: 44 },
		{ selector: '[data-testid="armory-keys"] .btn', label: 'the keys', min: 44 }
	]
};
