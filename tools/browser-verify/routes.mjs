/**
 * What the harness drives, and what it measures on each surface.
 *
 * ONLY routes under /dev are listed, and that is a hard BOUNDARY rather than a
 * starting set -- see README.md. A dev route mounts the real component with
 * fixture data and needs no account and no Supabase; a real route needs a Bosco
 * Tech Google session that no automated run holds.
 *
 * Each entry:
 *   path        the dev route
 *   label       what the surface is
 *   prepare     [{ click }|{ evaluate }, waitMs?] -- reach the state to measure
 *   settleMs    how long to let entrance animations finish before measuring
 *   contrast    [{ selector, label, min }]   4.5 for copy, 3 for a boundary
 *   tapTargets  [{ selector, label, min }]
 *   presence    [{ selector, label, expectPresent, expectVisible }]
 *   ignoreConsole  regex sources for errors that belong to the FIXTURE
 *
 * Selectors are ANCHORED (a component root, then the element) rather than bare
 * tag names. A bare `svg` on /dev/animated-logo matched the site-feedback glyph
 * mounted by the root layout and reported it as a failure; the emblem there is
 * not an svg at all.
 */
export const WIDTHS = [375, 1440];

export const ROUTES = [
	{
		path: '/dev/pathways',
		label: 'Pathway identity harness',
		/* The page mounts the REAL first-login picker, whose overlay covers the
		   surface underneath. "Not now" dismisses it, which is what a student
		   does, and is the state the chips below are meant to be read in. */
		prepare: [
			{
				click: 'button.pwp-later',
				until: '() => !document.querySelector(".pwp-overlay")'
			}
		],
		presence: [
			{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
			{ selector: 'span.pathway-chip', label: 'pathway chips', expectPresent: 6 },
			{ selector: '.chip-grid .chip-cell', label: 'one cell per pathway', expectPresent: 6 },
			{ selector: '.pwp-overlay', label: 'picker overlay (dismissed)', expectPresent: 0, expectVisible: 0 }
		],
		contrast: [
			{ selector: '.harness h1', label: 'h1 on its plate', min: 4.5 },
			{ selector: '.harness p.note', label: 'note copy', min: 4.5 },
			{ selector: 'span.pathway-chip .pw-label', label: 'chip label on its fill', min: 4.5 }
		],
		tapTargets: [{ selector: '.harness .controls button', label: 'harness controls', min: 44 }]
	},
	{
		path: '/dev/spec-table',
		label: 'Spec table harness',
		presence: [
			{ selector: 'h1', label: 'page heading', expectPresent: 1 },
			/* A closed Disclosure keeps its region in the DOM at a zero box on
			   purpose (CLAUDE.md: hidden in CSS, never removed), so present > 0
			   with visible 0 is the CORRECT reading of a closed panel. */
			{ selector: 'table.entry-table', label: 'spec tables (closed disclosures)', expectPresent: 1, expectVisible: 0 }
		],
		contrast: [{ selector: 'h1', label: 'h1 on its plate', min: 4.5 }],
		tapTargets: [{ selector: 'button', label: 'buttons', min: 44 }]
	},
	{
		path: '/dev/spec-table-open',
		label: 'Spec table harness, disclosures opened',
		aliasOf: '/dev/spec-table',
		/* Assert the EFFECT wanted (a table with height), not a proxy for it.
		   The first predicate here read aria-expanded on one named button and
		   reported FAILED through twelve attempts that had in fact opened both
		   regions -- a true reading of the wrong thing. */
		prepare: [
			{
				click: 'button[aria-expanded="false"]',
				until: '() => { const t = document.querySelector("table.entry-table"); return !!t && t.getBoundingClientRect().height > 0; }',
				attempts: 6,
				waitMs: 300
			}
		],
		presence: [{ selector: 'table.entry-table', label: 'spec tables (opened)', expectPresent: 2, expectVisible: 1 }],
		contrast: [{ selector: 'table.entry-table td', label: 'table cell copy', min: 4.5 }],
		tapTargets: []
	},
	{
		path: '/dev/animated-logo',
		label: 'Animated emblem harness',
		presence: [
			{ selector: 'h1, .note', label: 'page copy', expectPresent: 1 },
			/* The emblem is img-based, not an svg. */
			{ selector: '.idea-logo', label: 'emblem roots', expectPresent: 1 },
			{ selector: '.idea-logo img.gear', label: 'emblem gear layer', expectPresent: 1 }
		],
		contrast: [{ selector: '.note', label: 'note copy on its plate', min: 4.5 }],
		tapTargets: [{ selector: '.sfb-trigger', label: 'site feedback trigger', min: 44 }]
	}
];

export function selectRoutes(filter) {
	if (!filter || filter.length === 0) return ROUTES;
	return ROUTES.filter((r) => filter.some((f) => r.path.includes(f) || (r.label ?? '').includes(f)));
}

/** The URL to visit for a spec (an aliased spec measures a different state of the same route). */
export const urlFor = (spec) => spec.aliasOf ?? spec.path;
