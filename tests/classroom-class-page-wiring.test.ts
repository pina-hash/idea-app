// tests/classroom-class-page-wiring.test.ts
//
// THE CLASS PAGE'S HANDOFFS, AS THE SECTION LAYOUT AND THE SHELL WIRE THEM
// (ledger 0360: R07/R09 the live completion overlay, R17 the team style write,
// R23 each person's page layout and its Arrange).
//
// WHY A SOURCE READ, and what holds the behaviour. The section layout needs a
// signed-in Supabase client, a page store and a whole layout load to mount, so
// its WIRING is read off its source here, the way
// tests/classroom-class-teams.test.ts reads the same file; each mechanism it
// wires is held on the real component elsewhere:
//   - the overlay: tests/dom/html-progress-live-work-mount.svelte.test.ts (the
//     rail publishes, `overlayWork` + the row's chip read it);
//   - the team style editor: tests/dom/classroom-team-style-editor.test.ts
//     (`ClassTeams` with `style` offers Customize team, without it nothing);
//   - the arrangement: tests/dom/class-view-panel-layout-mount.test.ts and
//     tests/classroom-panel-layout-render.test.ts (ClassView over a layout);
//   - Arrange landing on the class editor: tests/dom/classroom-panel-layout-editor.test.ts
//     (`ClassroomSettings.open('panels:class')`).
// What none of those can see is whether the class page HANDS them their
// inputs, which is what a lost line here silently undoes.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ClassHeader from '../src/lib/classroom/ClassHeader.svelte';
import ClassThemeBanner from '../src/lib/classroom/ClassThemeBanner.svelte';
import { resolveClassTheme } from '../src/lib/classroom/class-theme';
import { COMMANDS } from '../src/lib/shell/commands';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const layout = read('../src/routes/classroom/[sectionId]/+layout.svelte');
const shell = read('../src/lib/classroom/ClassroomShell.svelte');

/** The `<ClassView ... />` mount in the section layout, and only that. */
const classViewMount = /<ClassView\b[\s\S]*?\/>/.exec(layout)?.[0] ?? '';
/** The `<ClassTeams ... />` mount. */
const classTeamsMount = /<ClassTeams\b[\s\S]*?\/>/.exec(layout)?.[0] ?? '';

describe('the section layout hands the class page what the wave-A work needs', () => {
	it('POSITIVE CONTROL: both mounts were found', () => {
		expect(classViewMount).toContain('section={data.section}');
		expect(classTeamsMount).toContain('sets={data.teams}');
	});

	it('R07/R09: the list beside an open worksheet is the server work overlaid with the rail, never the bare load', () => {
		expect(layout).toMatch(/import \{ setLiveWork \} from '\$lib\/classroom\/live-work\.svelte';/);
		expect(layout).toMatch(/const liveWork = setLiveWork\(\);/);
		expect(classViewMount).toMatch(/work=\{overlayWork\(data\.work, liveWork\.overrides\)\}/);
		expect(classViewMount).not.toMatch(/work=\{data\.work\}/);
		// NEVER CLEARED ON A RE-READ: an invalidateAll whose read began just
		// before the last acknowledgement would put finished work back to Missing.
		expect(layout).not.toMatch(/liveWork\.clear\(\)/);
	});

	it('R17: a student on a team gets the membership-gated style write on the class page', () => {
		expect(layout).toMatch(/import \{[^}]*\bsaveTeamStyle\b[^}]*\} from '\$lib\/classroom\/class-teams';/);
		expect(classTeamsMount).toMatch(/style=\{\(input\) => saveTeamStyle\(data\.supabase, input\)\}/);
		// Not behind a role: who may style a team is the database's question (0223).
		expect(classTeamsMount).not.toMatch(/style=\{data\.canManage/);
	});

	it('R23: the page renders this person\'s stored arrangement, and Arrange opens the class editor', () => {
		expect(classViewMount).toMatch(/panelLayout=\{classPrefs\?\.current\.panels\.classPage \?\? null\}/);
		expect(classViewMount).toMatch(
			/onArrange=\{classPrefStore \? \(\) => runCommand\('settings\.open', 'panels:class'\) : null\}/
		);
		expect(layout).toMatch(/import \{ runCommand \} from '\$lib\/shell\/command-handlers';/);
	});
});

describe('the shell opens Display settings AT a page\'s arrangement', () => {
	it('settings.open passes its argument through, so Arrange lands on the class editor', () => {
		expect(shell).toMatch(/registerCommandHandler\('settings\.open', \(arg\) => settingsEl\?\.open\(arg\)\)/);
		// The bare form that dropped the argument is gone.
		expect(shell).not.toMatch(/registerCommandHandler\('settings\.open', \(\) => settingsEl\?\.open\(\)\)/);
	});

	it('the palette finds the page layout under Display settings', () => {
		const cmd = COMMANDS.find((c) => c.id === 'settings.open');
		expect(cmd?.description).toBe('Density, list width, what a class opens on, the page layout, and a reset for each.');
		for (const k of ['layout', 'arrange', 'reorder', 'hide sections']) expect(cmd?.keywords, k).toContain(k);
		expect(cmd?.description).not.toMatch(/—/);
	});
});

describe('the class banner\'s badge arrives once, on both mounts (ledger 0360, report R16)', () => {
	const THEME = resolveClassTheme({ winners: { palette: 'steel', badge: 'flame' }, accent: 'gold' })!;
	const section = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 5',
		block: 'E',
		teacher_email: 'pina@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Design and Fabrication', active: true }
	};
	const svgs = (html: string) => html.match(/<svg class="badge-icon[^"]*"/g) ?? [];

	it('the class header draws its one badge with the arrival motion, never the hover one', () => {
		const html = render(ClassHeader as never, { props: { section, theme: THEME } as never }).body;
		expect(svgs(html)).toHaveLength(1);
		expect(svgs(html)[0]).toMatch(/\bonce\b/);
		expect(svgs(html)[0]).not.toMatch(/\bhover\b/);
	});

	it('so does the banner\'s own column, where a surface still uses it', () => {
		const title = createRawSnippet(() => ({ render: () => '<h1 class="pane-title">Design and Fabrication</h1>' }));
		const html = render(ClassThemeBanner as never, { props: { theme: THEME, children: title } as never }).body;
		expect(svgs(html)).toHaveLength(1);
		expect(svgs(html)[0]).toMatch(/\bonce\b/);
		// POSITIVE CONTROL: no theme, no badge at all.
		const plain = render(ClassThemeBanner as never, { props: { theme: null, children: title } as never }).body;
		expect(svgs(plain)).toHaveLength(0);
	});
});

describe('a class-list row editor is never ranked inside a stacking context (report R06 on the class page)', () => {
	// Paint order is the browser's: the hit tests are
	// tools/browser-verify/routes/classroom-split-s-1-manage-1-state-edit-layer.mjs,
	// and tests/dom/class-view-edit-layer-stacking.test.ts holds the class on the
	// real ClassView. What only a read of the stylesheets can hold is that both
	// rules ending a context while an editor is open are still written.
	const view = read('../src/lib/classroom/ClassView.svelte');
	const plate = read('../src/lib/classroom/plate.css');

	it('the class page gives up its `main` stacking context while a row is edited', () => {
		expect(view).toMatch(/class:edit-layer-open=\{editable && editing !== null\}/);
		expect(view).toMatch(/\.classroom-page\.edit-layer-open \{\s*z-index: auto;\s*\}/);
	});

	it('a selected row holding an open editor gives up the plate stacking context', () => {
		expect(plate).toMatch(
			/\.group-card \.row-wrap:is\(\.selected, \.is-selected\):has\(\.row-editor\) \{\s*z-index: auto;\s*\}/
		);
		// POSITIVE CONTROL: the context it ends is the plate's own selected-row rule.
		expect(plate).toMatch(/\.group-card \.row-wrap:is\(\.selected, \.is-selected\) \{\s*position: relative;\s*z-index: 1;/);
	});
});
