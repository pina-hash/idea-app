/**
 * THE CLASSROOM HOVER INK, one spec per theme (ledger 0298, decision 40 item 1).
 * The factory is the spec; `classroom-palette-s-1-manage-1-state-hover-ink-*.mjs`
 * and `classroom-todo-state-hover-ink-*.mjs` name the theme they measure.
 * See ./_hover-ink.mjs for how a hover is forced.
 *
 * THE HARNESS IS /dev/classroom-palette, because it mounts the REAL
 * ClassroomShell -- with several classes, so the class strip has icons that are
 * not the current one, and with the palette, so the header tools render --
 * around the REAL ClassView, which is where most of the swept declarations
 * live: the header's class strip, tools and crumbs, and the stream's rows,
 * expanders and find chips. It holds no session, so the theme attribute is
 * forced the way every classroom harness forces it. (The shell's back link is
 * drawn only in the minimal header, which no classroom harness mounts; its
 * rule is the same edge declaration the class icon's is.)
 *
 * ONE CONTROL OF EACH KIND: an EDGE that turns (a class icon, a header tool, a
 * find chip), an INK on the hovered control itself (a crumb, a row expander)
 * and an INK on a child of the hovered control (a stream row's title). IDEA
 * must read gold on every one -- the dark themes render exactly as before --
 * and Space White green.
 */
import { FORCE_THEME, HOVER_FLOORS, HOVER_PROBE, HOVER_REACH, HOVER_VERDICTS, ISLAND_PROBE, floorVerdicts } from './_hover-ink.mjs';
import { MANAGER, READY } from './_classroom-palette.mjs';
import { MY_CLASSES } from './_classroom-todo.mjs';

export const CLASSROOM_TARGETS = [
	{ name: 'class icon', host: '[data-testid="class-icon"]:not(.current)', prop: 'border-top-color', state: 'hover' },
	/* Below the fold breakpoint the tools fold into Menu. Menu's own rule is
	   the class switcher's, so 375 measures that declaration and 1440 the
	   tools' one. */
	{ name: 'header tool', host: ['[data-testid="palette-trigger"]', '[data-testid="shell-menu"]'], prop: 'border-top-color', state: 'hover' },
	{ name: 'breadcrumb', host: '[data-testid="crumbs"] a', prop: 'color', state: 'hover' },
	{ name: 'row title', host: 'a.row-main', measure: '.row-title', prop: 'color', state: 'hover' },
	{ name: 'row expander', host: '.row-expand:not(.spacer)', prop: 'color', state: 'hover' },
	{ name: 'find chip', host: '.find-chip:not([aria-pressed="true"])', prop: 'border-top-color', state: 'hover' }
];

export const classroomHoverSpec = (theme) => {
	const ink = theme === 'space-white' ? 'green' : 'gold';
	/* Space White is the theme that exists for the projector, so it is the one
	   whose wall numbers are gated (the home and themes specs draw the line in
	   the same place). */
	const wall = theme === 'space-white';
	return {
		path: `${MANAGER}&state=hover-ink-${theme}`,
		aliasOf: MANAGER,
		label: `Classroom hover ink under ${theme}: header, crumbs and stream controls forced into :hover`,
		prepare: [
			READY,
			{ waitFor: `() => !!document.querySelector('a.row-main')`, timeoutMs: 20000 },
			FORCE_THEME(theme),
			{ evaluate: HOVER_PROBE(CLASSROOM_TARGETS), label: 'force each hover and read it back', waitMs: 100 }
		],
		orderResult: [
			{
				label: `every forced hover reads ${ink}`,
				evaluate: HOVER_VERDICTS,
				expected: CLASSROOM_TARGETS.map((t) => `${t.name}: hover ${t.prop === 'color' ? 'ink' : 'edge'} ${ink}`)
			},
			{
				label: 'each forced state reached exactly one node through a rule that names the ink',
				evaluate: HOVER_REACH,
				expected: CLASSROOM_TARGETS.map((t) => `${t.name}: one node forced`)
			},
			{
				label: wall
					? 'contrast on its real ground: ink 4.5, edge 3, and on the wall ink 3.0 and edge 2.0 washed'
					: 'contrast on its real ground: ink 4.5, edge 3 (the wall is recorded in the probe line, not gated)',
				evaluate: HOVER_FLOORS(CLASSROOM_TARGETS, { washed: wall }),
				expected: floorVerdicts(CLASSROOM_TARGETS, { washed: wall })
			},
			{
				/* The deck viewer's controls and the photo overlays live inside
				   these, so their hovers stay brass under every theme. The hex is
				   the island's own --gold, #c8a848, on all three themes. */
				label: 'inside a dark island the hover ink is the island brass',
				evaluate: ISLAND_PROBE,
				expected: ['ic-root', 'nb-island', 'deck-stage'].map((c) => `${c}: hover ink gold #c8a848`)
			}
		]
	};
};

/**
 * THE CLASS LIST AT /classroom (MyClasses), which /dev/classroom-palette does
 * not mount. Its card edge read gold through an ALIAS -- `--acc: var(--gold)`
 * on `.class-card`, painted by `.class-card:hover { border-color: var(--acc) }`
 * -- so a sweep for the literal `var(--gold)` inside `:hover` rules walked
 * straight past it, and on Space White the card turned the brown #715d22
 * under the pointer. It reads --hover-ink now. The to-do door beside the
 * cards is the swept `.todo-link:hover` edge, measured in the same pass.
 *
 * /dev/classroom-todo mounts the REAL MyClasses, as a student with work owed
 * (so the to-do door draws), inside the REAL ClassroomShell.
 */
export const HOME_TARGETS = [
	{ name: 'class card', host: 'a.class-card', prop: 'border-top-color', state: 'hover' },
	{ name: 'to-do door', host: '[data-testid="my-classes-todo"]', prop: 'border-top-color', state: 'hover' }
];

export const classroomHomeHoverSpec = (theme) => {
	const ink = theme === 'space-white' ? 'green' : 'gold';
	const wall = theme === 'space-white';
	return {
		path: `${MY_CLASSES}?state=hover-ink-${theme}`,
		aliasOf: MY_CLASSES,
		label: `Classroom class list hover ink under ${theme}: a class card and the to-do door forced into :hover`,
		prepare: [
			{ waitFor: `() => !!document.querySelector('a.class-card') && !!document.querySelector('[data-testid="my-classes-todo"]')`, timeoutMs: 20000, label: 'the class cards and the to-do door are on the page' },
			FORCE_THEME(theme),
			{ evaluate: HOVER_PROBE(HOME_TARGETS), label: 'force each hover and read it back', waitMs: 100 }
		],
		orderResult: [
			{
				label: `every forced hover reads ${ink}`,
				evaluate: HOVER_VERDICTS,
				expected: HOME_TARGETS.map((t) => `${t.name}: hover edge ${ink}`)
			},
			{
				label: 'each forced state reached exactly one node through a rule that names the ink',
				evaluate: HOVER_REACH,
				expected: HOME_TARGETS.map((t) => `${t.name}: one node forced`)
			},
			{
				label: wall
					? 'contrast on its real ground: edge 3, and on the wall 2.0 washed'
					: 'contrast on its real ground: edge 3 (the wall is recorded in the probe line, not gated)',
				evaluate: HOVER_FLOORS(HOME_TARGETS, { washed: wall }),
				expected: floorVerdicts(HOME_TARGETS, { washed: wall })
			}
		]
	};
};
