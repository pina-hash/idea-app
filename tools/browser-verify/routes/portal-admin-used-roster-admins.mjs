/**
 * THE CONSOLE SORTED BY MOST USED (ledger 0117, report 24). The harness seeds
 * `preferences.dashboard.usage` with the roster used most and the admin
 * roster next; the grid and the nav strip must both come out roster, admins,
 * then the curated order for everything never used. The spec beside this one
 * (`portal-admin.mjs`, no usage) is the positive control: the same panels in
 * the curated order, so a page that ignored the preference would fail here
 * and pass there.
 *
 * AND A USE IS RECORDED BY INTERACTING, ONCE, INTO THE RIGHT NAMESPACE. The
 * prepare rows press inside the feedback panel twice and read the stub's
 * write log: exactly one write, under `preferences.dashboard`, with the
 * `homepage` sibling the fixture carries still present beside it (the
 * spread-merge claim), and the grid NOT reordered by it (the loaded snapshot
 * claim).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { PANEL_COUNT } from './portal-admin.mjs';

export default {
	path: '/dev/portal-admin?used=roster,admins',
	label: 'Admin console ordered by most used: roster, then admins, then curated',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			evaluate: `() => Array.from(document.querySelectorAll('.console-grid > .panel')).map((p) => p.dataset.panel).join(' > ')`,
			label: 'the panel order on screen'
		},
		{
			click: '.panel[data-panel="feedback"] .panel-title',
			until: `() => (window.__consoleWrites || []).length === 1`,
			label: 'a press inside the feedback panel records one use'
		},
		{
			/* A SECOND PRESS IN THE SAME PANEL, dispatched rather than clicked:
			   `click` skips a step whose `until` already holds, and "still one
			   write" is exactly a predicate that already holds. So the pointer
			   event is fired from the page and the write count read back in the
			   same step, which is the measurement. */
			evaluate: `async () => { const el = document.querySelector('.panel[data-panel="feedback"] .panel-blurb'); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 150)); return 'writes after a second press: ' + (window.__consoleWrites || []).length; }`,
			label: 'a second press inside the same panel records nothing more (once per panel per load)'
		},
		{
			evaluate: `() => { const w = window.__consoleWrites || []; const first = w[0] && w[0].patch && w[0].patch.preferences; return 'writes ' + w.length + '; namespaces ' + (first ? Object.keys(first).sort().join('+') : 'none') + '; feedback count ' + (first && first.dashboard && first.dashboard.usage && first.dashboard.usage.feedback ? first.dashboard.usage.feedback.count : 'unrecorded'); }`,
			label: 'what the write path recorded'
		}
	],
	presence: [
		{ selector: '.console-grid > .panel', label: 'panels', expectPresent: PANEL_COUNT, maxPresent: PANEL_COUNT }
	],
	domOrder: [
		{ before: '.panel[data-panel="roster"]', after: '.panel[data-panel="admins"]', label: 'most used first: roster before admins' },
		{ before: '.panel[data-panel="admins"]', after: '.panel[data-panel="frc-reviews"]', label: 'then the curated order: admins before the (unused) FRC queue' },
		{ before: '.chip[data-chip="roster"]', after: '.chip[data-chip="frc-reviews"]', label: 'the nav strip follows the same order' }
	],
	orderResult: [
		{
			label: 'one write, spread-merged under dashboard beside the launcher homepage namespace, and the grid did not move',
			evaluate: `() => { const w = window.__consoleWrites || []; const p = w[0] && w[0].patch && w[0].patch.preferences; const first = document.querySelector('.console-grid > .panel'); return [w.length === 1 ? 'one write' : w.length + ' writes', p && p.dashboard && p.homepage ? 'dashboard beside homepage' : 'namespaces ' + (p ? Object.keys(p).join('+') : 'none'), p && p.dashboard.usage && p.dashboard.usage.feedback && p.dashboard.usage.feedback.count === 1 ? 'feedback used once' : 'feedback count wrong', first && first.dataset.panel === 'roster' ? 'grid order unchanged' : 'grid moved to ' + (first && first.dataset.panel)]; }`,
			expected: ['one write', 'dashboard beside homepage', 'feedback used once', 'grid order unchanged']
		}
	],
	tapTargets: [{ selector: '.console-nav .chip', label: 'nav chips', min: 44 }]
};
