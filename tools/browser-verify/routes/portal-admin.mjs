/**
 * THE ADMIN CONSOLE (ledger 0117, reports 24 and 26): one page where there
 * were two, laid out across the window, with every control on the 44px
 * floor. The real `src/routes/dashboard/+page.svelte` is what the harness
 * mounts; nothing here reads a reconstruction.
 *
 * THREE CLAIMS, EACH A NUMBER:
 *  1. IT TAKES THE WINDOW. The grid's width is read against the viewport's
 *     inner width less the gutter, and its column count is read off the
 *     computed template: one column at 375, three or more at 1440. The
 *     previous page held everything in a 1100px column, which at Mr. Pina's
 *     2844px is 39% of the screen -- and the number that would show up here
 *     as `grid 1100 of 2844`.
 *  2. EVERY PANEL IS THERE, ONCE, AND THE NAV INDEXES THEM IN THE SAME ORDER.
 *     Nine sections, nine chips; the review queues first in the curated
 *     order, which is what "most used" means before anything has been used.
 *  3. THE CONTROLS ARE CONTROLS. Chips, the order select, the roster filter,
 *     the pathway selects, the FRC disclosure and every `.btn` clear 44px at
 *     both widths. The queue components' own buttons (`.frq-*`, `.gdq-*`)
 *     are measured too and REPORTED: they are `$lib/frc` and `$lib/greenline`
 *     files this bundle does not own.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export const PANEL_COUNT = 9;

export default {
	path: '/dev/portal-admin',
	label: 'Admin console: one app, the whole window, panels in curated order',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			evaluate: `() => { const g = document.querySelector('[data-testid="console-grid"]'); const r = g.getBoundingClientRect(); const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length; const h = document.querySelector('.console-hero').getBoundingClientRect(); return 'window ' + innerWidth + 'px; grid ' + Math.round(r.width) + 'px at x=' + Math.round(r.left) + ', ' + cols + ' column(s); hero ' + Math.round(h.width) + 'px; document scrollWidth ' + document.documentElement.scrollWidth; }`,
			label: 'the console against the window: grid width, column count, hero width'
		}
	],
	presence: [
		{ selector: '[data-testid="admin-console"]', label: 'the console (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.console-grid > .panel', label: 'panels', expectPresent: PANEL_COUNT, maxPresent: PANEL_COUNT, expectVisible: PANEL_COUNT },
		{ selector: '.console-nav .chip', label: 'nav chips, one per panel', expectPresent: PANEL_COUNT, maxPresent: PANEL_COUNT, expectVisible: PANEL_COUNT },
		{ selector: '[data-testid="admin-roster"]', label: 'the admin roster is ON this page now', expectPresent: 1, maxPresent: 1 },
		/* Not the owner: no grant form and no Remove control, which is the
		   negative half of the owner spec beside this one. */
		{ selector: '[data-testid="admin-grant-form"]', label: 'grant form (absent for a non-owner)', expectPresent: 0 },
		{ selector: '.panel[data-panel="roster"] .roster-row', label: 'roster rows', expectPresent: 6, maxPresent: 6 },
		/* The page has no 1100px column left in it: nothing carries the old
		   section classes. */
		{ selector: '.admin-console .courses, .admin-console .divider, .admin-console .promo-callout', label: 'old 1100px-capped section wrappers (must be gone)', expectPresent: 0 }
	],
	domOrder: [
		{ before: '.panel[data-panel="frc-reviews"]', after: '.panel[data-panel="roster"]', label: 'curated order: FRC reviews before the roster when nothing has been used' },
		{ before: '.panel[data-panel="roster"]', after: '.panel[data-panel="admins"]', label: 'curated order: the roster before the admin roster' },
		{ before: '.chip[data-chip="frc-reviews"]', after: '.chip[data-chip="roster"]', label: 'the nav strip is in the same order as the grid' }
	],
	orderResult: [
		{
			label: 'the grid spans the window (less the gutter) and the column count fits the width',
			evaluate: `() => { const g = document.querySelector('[data-testid="console-grid"]'); if (!g) return ['NO GRID']; const r = g.getBoundingClientRect(); const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length; const spans = r.width >= innerWidth - 2 * 48 - 1 && r.left <= 48 ? 'grid spans the window' : 'grid ' + Math.round(r.width) + ' of ' + innerWidth; const want = innerWidth >= 1024 ? 3 : 1; const colsOk = innerWidth >= 1024 ? cols >= want : cols === want; return [spans, colsOk ? 'columns fit the width' : cols + ' column(s) at ' + innerWidth]; }`,
			expected: ['grid spans the window', 'columns fit the width']
		},
		{
			label: 'no horizontal scroll: document scrollWidth equals the viewport',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth]`,
			expected: ['no overflow']
		}
	],
	contrast: [
		{ selector: '.panel-title', label: 'panel titles', min: 4.5 },
		{ selector: '.panel-blurb', label: 'panel blurbs', min: 4.5 },
		{ selector: '.chip-word', label: 'nav chip words', min: 4.5 },
		{ selector: '.chip-count', label: 'nav chip counts', min: 4.5 },
		{ selector: '.meta-count', label: 'panel counts', min: 4.5 },
		{ selector: '.roster-name', label: 'roster names', min: 4.5 },
		{ selector: '.roster-email', label: 'roster emails', min: 4.5 },
		{ selector: '.frc-sum-meta', label: 'FRC completion summary', min: 4.5 },
		{ selector: '.ar-email', label: 'admin roster emails', min: 4.5 },
		{ selector: '.ar-since', label: 'admin roster meta', min: 4.5 },
		{ selector: '.panel', label: 'panel edge on the plate', min: 3 }
	],
	tapTargets: [
		{ selector: '.console-nav .chip', label: 'nav chips', min: 44 },
		{ selector: '[data-testid="console-sort"]', label: 'the order select', min: 44 },
		{ selector: '.roster-filter', label: 'the roster filter', min: 44 },
		{ selector: '.roster-set select', label: 'pathway selects', min: 44 },
		{ selector: '.roster-frc summary', label: 'FRC completion disclosure', min: 44 },
		{ selector: '.panel .btn', label: 'panel buttons and links', min: 44 },
		/* Not this bundle's files -- measured and reported, never widened here. */
		{ selector: '.frq button, .frq a', label: 'FRC review queue controls ($lib/frc, reported only)', min: 44 },
		{ selector: '.gdq button', label: 'decal queue controls ($lib/greenline, reported only)', min: 44 }
	]
};
