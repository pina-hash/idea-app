// tests/classroom-panel-layout-render-cases.ts
//
// THE INPUTS FOR THE CLASS PAGE'S NULL-LAYOUT CHARACTERIZATION (ledger 0360,
// report R23 wired onto the R19 class header). Not a `.test.ts`, so vitest does
// not collect it: `tests/classroom-panel-layout-render.test.ts` replays these,
// and `tests/fixtures/class-view-null-layout-golden.json` holds what the class
// page rendered for them at bbc2fae5 -- the commit BEFORE the class page went
// through `PanelStack` -- generated mechanically by
//
//   GOLDEN_WRITE=1 npm test -- tests/classroom-panel-layout-render.test.ts
//
// run on that commit with this file and the test beside it, and never retyped.
// Since ledger 0368 the ROOT TAG is the one thing rewritten in it, and that was
// done mechanically rather than by re-running the writer against the new code:
// in each case `<main class="classroom-page svelte-1w65r8g">` and the closing
// `</main>` became `<section ... role="main">` and `</section>`, and the pane
// case's `<section>` gained `as-pane` (four roots, four closers, one pane; the
// stable root that stops an item open rebuilding the class page). Nothing else
// in the file moved, so any other difference is still a regression.
//
// What each case is for: a teacher with every header slot filled (tools, the
// theme vote, notices, the posted teams, the teams key, Quick post) under a
// voted look, a student with no theme, a teacher whose list is a pane beside
// an open item, a bare mount (what most harnesses pass), and an empty class.
// The voted look carries NO badge: the badge's arrival motion is a separate,
// deliberate change (`BadgeIcon` `motion="once"`), and this file pins the
// arrangement, not the badge.

import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ClassView from '../src/lib/classroom/ClassView.svelte';
import { resolveClassTheme } from '../src/lib/classroom/class-theme';
import type { ClassroomItem, ClassroomSection, StudentWork } from '../src/lib/classroom/classroom';
import type { ClassCheckIn } from '../src/lib/classroom/class-check-ins';

export const CLOCK = { now: '2026-09-25T17:00:00.000Z', today: '2026-09-25' };

const course = { id: 'c-1', code: 'IDEA209H', title: 'Design and Fabrication', active: true };
export const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 5',
	block: 'E',
	teacher_email: 'pina@boscotech.edu',
	active: true,
	course
};

function item(id: string, over: Partial<ClassroomItem>): ClassroomItem {
	return {
		id,
		kind: 'material',
		title: id,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: 'pina@boscotech.edu',
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-09-20T00:00:00Z',
		edited_at: null,
		created_at: '2026-09-20T00:00:00Z',
		updated_at: '2026-09-20T00:00:00Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	} as ClassroomItem;
}

export const ITEMS: ClassroomItem[] = [
	item('day-24', { title: 'Day 24: gear trains' }),
	item('ws', { kind: 'assignment', title: 'Gear train worksheet', points: 10, due_at: '2026-09-23T06:59:00.000Z' }),
	item('next', { kind: 'assignment', title: 'Truss sketch', points: 20, due_at: '2026-09-27T06:59:00.000Z' }),
	item('vid', {
		title: 'Watch: how a truss carries load',
		links: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: 'The video' }] as never
	})
];

const CHECK_IN: ClassCheckIn = {
	session_id: 'ns-24',
	section_id: 's-1',
	unit_number: 3,
	session_date: '2026-09-24',
	session_label: 'Day 24 gear sketches',
	status: 'missing',
	flag_reason: null,
	item_id: 'day-24'
};

const WORK: Record<string, StudentWork> = { ws: { state: 'in-progress', score: null } };

/** A voted look with a palette and a pattern and no badge. */
const THEME = resolveClassTheme({ winners: { palette: 'ocean', pattern: 'rings' }, accent: 'gold' });

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));
const TOOLS = snippet('<div class="class-tools" data-testid="class-tools"><button type="button">Hall pass</button></div>');
const THEME_PANEL = snippet('<div class="disc" data-testid="class-theme-panel"><button type="button" class="disc-trigger">Class theme</button></div>');
const NOTICES = snippet('<section class="qp" data-testid="quick-posts"><p>Special schedule today.</p></section>');
const TEAMS = snippet('<section class="ct" data-testid="class-teams"><p>Torque Squad</p></section>');
const TEAMS_KEY = { text: 'Teams posted until Fri, Sep 26', href: '/classroom/s-1/people', label: 'People' };

/** The FAKE write transports a teacher's mount needs for its keys to render; nothing here calls them. */
const FAKE = {} as never;

export interface RenderCase {
	name: string;
	props: Record<string, unknown>;
}

export function renderCases(): RenderCase[] {
	return [
		{
			name: 'teacher, every header slot, a voted look',
			props: {
				section: SECTION,
				items: ITEMS,
				canManage: true,
				transports: FAKE,
				unitTransports: FAKE,
				onCompose: () => undefined,
				checkIns: [CHECK_IN],
				clock: CLOCK,
				basePath: '/classroom',
				theme: THEME,
				themePanel: THEME_PANEL,
				tools: TOOLS,
				bulletin: NOTICES,
				belowHeader: TEAMS,
				teamsNotice: TEAMS_KEY,
				quickPost: { open: false, toggle: () => undefined }
			}
		},
		{
			name: 'student, no voted look, tools, notices and teams',
			props: {
				section: SECTION,
				items: ITEMS,
				canManage: false,
				checkIns: [CHECK_IN],
				work: WORK,
				clock: CLOCK,
				basePath: '/classroom',
				tools: TOOLS,
				bulletin: NOTICES,
				belowHeader: TEAMS
			}
		},
		{
			name: 'teacher, the list as a pane beside an open item',
			props: {
				section: SECTION,
				items: ITEMS,
				canManage: true,
				transports: FAKE,
				onCompose: () => undefined,
				clock: CLOCK,
				basePath: '/classroom',
				asPane: true,
				selectedItemId: 'ws',
				theme: THEME,
				themePanel: THEME_PANEL,
				tools: TOOLS,
				belowHeader: TEAMS,
				teamsNotice: TEAMS_KEY
			}
		},
		{
			name: 'a bare mount, as most harnesses pass it',
			props: { section: SECTION, items: ITEMS, canManage: false, basePath: '/classroom' }
		},
		{
			name: 'an empty class',
			props: { section: SECTION, items: [], canManage: false, clock: CLOCK, basePath: '/classroom' }
		}
	];
}

/** The server render of one case, with Svelte's hydration comments stripped. */
export function renderCase(props: Record<string, unknown>): string {
	const out = render(ClassView as never, { props: props as never });
	return out.body.replace(/<!--[\s\S]*?-->/g, '');
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * THE ONE NORMALIZATION, AND WHY IT IS RENDERING-EQUIVALENT. A panel rendered
 * through `PanelStack` carries no whitespace text around it, where the
 * template it came out of had a newline between blocks, so a whitespace-only
 * text node that is a DIRECT CHILD of the page's root element (`main` or
 * `section.classroom-page`) can appear or vanish at a panel's edge. Every
 * child of that root is a block box, and whitespace between block boxes forms
 * no line box and renders nothing, so those nodes -- and only those, at depth
 * one -- are dropped here. Whitespace anywhere deeper, where it can be a space
 * between two words or two inline elements, is compared exactly.
 */
export function dropRootWhitespace(html: string): string {
	let depth = 0;
	let out = '';
	for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
		if (token.startsWith('</')) {
			depth -= 1;
			out += token;
			continue;
		}
		if (token.startsWith('<')) {
			const name = /^<([a-zA-Z0-9-]+)/.exec(token)?.[1]?.toLowerCase() ?? '';
			if (!token.endsWith('/>') && !VOID.has(name)) depth += 1;
			out += token;
			continue;
		}
		if (depth === 1 && token.trim() === '') continue;
		out += token;
	}
	return out;
}
