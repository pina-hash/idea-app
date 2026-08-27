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
		path: '/dev/home-order?role=student&classes=1&rows=3',
		label: 'Home page section order, non-managing student (Classes above Apps)',
		/* Mounts the REAL src/routes/+page.svelte (see the route's own +page.ts
		   for why its fixture items are dated off Date.now() rather than a
		   frozen clock). A prior vitest probe asserted `managesAnySection` as a
		   computed boolean and passed while never rendering a single row --
		   every assertion here reads elements actually painted in the DOM. */
		/* `.course-card` and `.app-card` mount at opacity:0 and are handed
		   `.visible` by an IntersectionObserver in this page's own onMount
		   (threshold 0.08) -- real entrance chrome, not a fixture gap. This
		   harness does not scroll, so a card below the fold at a given
		   viewport genuinely never intersects and never fades in; `present`
		   over `visible` is CORRECT here for the same reason a closed
		   Disclosure is (see /dev/spec-table above), not a relaxed assertion. */
		presence: [
			{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 0 },
			{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered due-soon rows', expectPresent: 1 },
			{ selector: '.launcher .app-card', label: 'rendered app cards', expectPresent: 1, expectVisible: 0 }
		],
		domOrder: [
			{
				before: '[data-tour="classes"]',
				after: '.launcher',
				label: 'Classes precedes Apps for a viewer who manages nothing'
			}
		],
		contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
		tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
	},
	{
		path: '/dev/home-order?role=teacher&classes=1&rows=3',
		label: 'Home page section order, managing teacher (Apps above Classes)',
		presence: [
			{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 0 },
			{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered ungraded-work rows', expectPresent: 1 },
			{ selector: '.launcher .app-card', label: 'rendered app cards', expectPresent: 1, expectVisible: 0 }
		],
		domOrder: [
			{
				before: '.launcher',
				after: '[data-tour="classes"]',
				label: 'Apps precedes Classes for a viewer who manages a section'
			}
		],
		contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
		tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
	},
	{
		path: '/dev/home-feed',
		label: 'Home feed harness, student mode',
		/* Mounts the REAL ClassroomFeed through the REAL buildFeed, against a
		   clock frozen in the fixture (`now={NOW}`), so unlike /dev/home-order
		   this one carries no live-clock trap of its own -- the assertions
		   below still read rendered rows rather than a ranking result, for the
		   same reason: a computed value proves the function ran, not that
		   anything painted. */
		/* This route mounts ClassroomFeed directly rather than the real
		   src/routes/+page.svelte, so the entrance IntersectionObserver that
		   page's own onMount wires up for `.course-card` never runs here --
		   the shared `.legacy-index .course-card` rule still stamps opacity:0
		   at mount and nothing ever adds `.visible`. `present` is the honest
		   assertion for this harness; the card genuinely renders, it is the
		   entrance-fade wiring that this route does not carry. */
		presence: [
			{ selector: '.legacy-index .course-card.section-card.feed-card', label: 'rendered section card(s)', expectPresent: 3, expectVisible: 0 },
			{ selector: '.legacy-index .assignment-item.linked', label: 'rendered feed rows', expectPresent: 1 }
		],
		contrast: [{ selector: '.legacy-index .assignment-name', label: 'feed row title', min: 4.5 }],
		tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }]
	},
	{
		path: '/dev/home-feed-teacher',
		label: 'Home feed harness, teacher mode (ungraded queue)',
		aliasOf: '/dev/home-feed',
		prepare: [
			{
				click: '[data-mode="teacher"]',
				until: '() => document.querySelector(\'[data-mode="teacher"]\').classList.contains("active")'
			}
		],
		presence: [
			{ selector: '.legacy-index .course-card.section-card.feed-card', label: 'rendered section card(s)', expectPresent: 3, expectVisible: 0 },
			{ selector: '.legacy-index .assignment-item.linked', label: 'rendered feed rows (teacher)', expectPresent: 1 }
		],
		contrast: [{ selector: '.legacy-index .assignment-name', label: 'feed row title (teacher)', min: 4.5 }],
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
