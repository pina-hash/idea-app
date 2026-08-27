import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	activeTab,
	canCollapseNav,
	classroomMeasure,
	locateClassroom,
	type ClassroomPlace
} from '../src/lib/classroom/nav';
import { navCollapseKey, readNavCollapsed, writeNavCollapsed } from '../src/lib/classroom/nav-collapse';

/**
 * "I WANT TO PRIORITIZE THE ACTUAL ASSIGNMENT AND THE ABILITY TO HIDE THE REST
 * OF THE ASSIGNMENTS ON THE SIDE." Filed three times over two days.
 *
 * WHAT HOLDS "THE REST OF THE ASSIGNMENTS": `.cr-nav`, mounted by
 * src/routes/classroom/[sectionId]/+layout.svelte as `ClassView`, a file this
 * session does not own. So the mechanism is a marker ClassroomShell puts on
 * screen (an `aria-pressed` button) and a `:has()` rule in classroom.css that
 * reads it from a common ancestor -- neither of which this file can drive
 * through jsdom, since this repo runs no Svelte/DOM test harness (see
 * vitest.config.ts and tests/classroom-measure.test.ts's own note on that).
 * What IS testable without a browser, and where a regression would be silent:
 *
 *   1. the persistence arithmetic (per-viewer key, wrapped read/write) --
 *      the disclosure.ts model, adapted;
 *   2. WHERE the control is allowed to mean anything (`canCollapseNav`);
 *   3. the shipped markup and CSS actually wire the two together the way the
 *      docstrings claim -- source-walking, the classroom-measure.test.ts /
 *      classroom-tab-strip.test.ts convention, for exactly the properties a
 *      dev harness in a real browser is needed to see visually but a text
 *      search can already prove structurally: nothing is unmounted, the
 *      breadcrumb's own `{#if}` is untouched, the toggle disappears below the
 *      split's own breakpoint, and the collapse never reaches into print or
 *      into the reading measure.
 */

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const SHELL = 'src/lib/classroom/ClassroomShell.svelte';
const CSS = 'src/lib/classroom/classroom.css';

describe('navCollapseKey: per person, not per item', () => {
	it('separates two people', () => {
		expect(navCollapseKey('user-a')).not.toBe(navCollapseKey('user-b'));
	});

	it('still keys a signed-out reader rather than colliding on undefined', () => {
		expect(navCollapseKey(null)).toContain('anon');
		expect(navCollapseKey(undefined)).toBe(navCollapseKey(null));
	});

	it('is the same key regardless of which item this person is reading', () => {
		// Unlike a disclosure (per item), this is one answer that follows the
		// person from one item to the next -- there is no scope/record argument
		// to vary it by item at all.
		expect(navCollapseKey('user-a')).toBe(navCollapseKey('user-a'));
	});
});

describe('readNavCollapsed / writeNavCollapsed: a blocked or full store costs the memory, never the control', () => {
	function fakeStore() {
		const map = new Map<string, string>();
		const store = {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k)
		};
		(globalThis as Record<string, unknown>).localStorage = store;
		return map;
	}

	it('reads back exactly what was written, and clears rather than writing false', () => {
		const map = fakeStore();
		try {
			const key = navCollapseKey('user-a');
			expect(readNavCollapsed(key)).toBe(false);
			writeNavCollapsed(key, true);
			expect(readNavCollapsed(key)).toBe(true);
			expect(map.size).toBe(1);
			writeNavCollapsed(key, false);
			// A person who has never touched the control and one who explicitly
			// put it back leave the same, empty trace.
			expect(readNavCollapsed(key)).toBe(false);
			expect(map.size).toBe(0);
		} finally {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});

	it('degrades to "not collapsed" with no store at all, rather than throwing', () => {
		expect(typeof localStorage).toBe('undefined');
		const key = navCollapseKey('user-a');
		expect(() => writeNavCollapsed(key, true)).not.toThrow();
		expect(readNavCollapsed(key)).toBe(false);
	});

	it('an unrecognised stored value reads as not collapsed rather than throwing', () => {
		const map = fakeStore();
		try {
			const key = navCollapseKey('user-a');
			map.set(key, 'yes');
			expect(readNavCollapsed(key)).toBe(false);
		} finally {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});
});

describe('canCollapseNav: only where a list pane actually sits beside something', () => {
	/**
	 * EVERY PLACE THE ROUTER KNOWS ABOUT, so a new one added to `ClassroomPlace`
	 * without an opinion here is a fresh case to decide rather than a silent
	 * default. `classroomMeasure`'s own SURFACES list
	 * (tests/classroom-measure.test.ts) is the model: state every place once
	 * rather than letting the "everything else is false" branch cover a case
	 * nobody actually reasoned about.
	 */
	const PLACES: { place: ClassroomPlace; expected: boolean; because: string }[] = [
		{ place: 'home', expected: false, because: 'never splits at all (MyClasses)' },
		{
			place: 'section',
			expected: false,
			because: 'nothing is open yet -- the list already has the whole split (split.css :not(.has-detail))'
		},
		{ place: 'people', expected: false, because: 'never splits' },
		{ place: 'grades', expected: false, because: 'never splits' },
		{ place: 'item', expected: true, because: 'the one place a list pane sits beside an open item' },
		{ place: 'item-grade', expected: false, because: 'the grading console is full width, no split' },
		{ place: 'item-deck', expected: false, because: 'the deck viewer is full-screen, no content column' },
		{ place: 'admin', expected: false, because: 'never splits' },
		{ place: 'updates', expected: false, because: 'never splits' },
		{ place: 'feedback', expected: false, because: 'never splits' },
		{ place: 'view-as', expected: false, because: 'minimal mode has no switcher and no toggle either' },
		{ place: 'other', expected: false, because: 'not a recognised classroom route' }
	];

	for (const { place, expected, because } of PLACES) {
		it(`${place}: ${expected} (${because})`, () => {
			expect(canCollapseNav({ place, sectionId: 's-1', itemId: place === 'item' ? 'i-1' : null })).toBe(
				expected
			);
		});
	}

	it('agrees with the real router on an actual item URL', () => {
		const loc = locateClassroom('/classroom/s-1/item/i-1');
		expect(loc.place).toBe('item');
		expect(canCollapseNav(loc)).toBe(true);
	});

	it('is false on the class list itself, where the split shows the list full width', () => {
		const loc = locateClassroom('/classroom/s-1');
		expect(loc.place).toBe('section');
		expect(canCollapseNav(loc)).toBe(false);
	});

	/**
	 * `item` is also the one place `activeTab` returns null -- the section tabs
	 * do not render there either (ClassroomShell's `visibleTabs.length > 1 &&
	 * tab` guard). That is what makes the breadcrumb row the ONLY chrome on an
	 * item page, and why the toggle sits inside it rather than the tab bar.
	 */
	it('is exactly the place with no active section tab', () => {
		const loc = locateClassroom('/classroom/s-1/item/i-1');
		expect(activeTab(loc)).toBeNull();
		expect(canCollapseNav(loc)).toBe(true);
	});
});

describe('the shipped shell wires the toggle to canCollapseNav, not to a wider condition', () => {
	it('the toggle is gated on showNavToggle, and that is canCollapseNav(loc) and nothing looser', () => {
		const shell = read(SHELL);
		expect(shell).toMatch(/const showNavToggle = \$derived\(!minimal && canCollapseNav\(loc\)\)/);
		expect(shell).toContain('{#if showNavToggle}');
	});

	it('the toggle is a real button with a visible word, an aria-pressed state, and the marker classroom.css keys on', () => {
		const shell = read(SHELL);
		expect(shell).toMatch(/<button[^>]*class="nav-toggle[^"]*"[^>]*>/s);
		expect(shell).toContain('data-testid="nav-collapse-toggle"');
		expect(shell).toContain('aria-pressed={navCollapsed}');
		// A glyph alone is not a control (IDEA_INTERFACE_STANDARDS): the label
		// carries the two states in words.
		expect(shell).toContain("'Show other items'");
		expect(shell).toContain("'Hide other items'");
	});

	it('sits inside the SAME breadcrumb nav, as a second child -- not a replacement for the trail', () => {
		const shell = read(SHELL);
		const navStart = shell.indexOf('<nav class="crumbs"');
		const navEnd = shell.indexOf('</nav>', navStart);
		expect(navStart).toBeGreaterThan(-1);
		const block = shell.slice(navStart, navEnd);
		expect(block).toContain('<ol>');
		expect(block).toContain('data-testid="nav-collapse-toggle"');
	});

	it('the breadcrumb list keeps its own unconditional guard: collapsing the switcher does not touch the way out', () => {
		const shell = read(SHELL);
		// Still exactly the same gate it always was -- the toggle's own
		// {#if showNavToggle} is nested INSIDE this, never wrapping it.
		expect(shell).toContain('{#if !minimal && crumbs.length > 1}');
	});

	it('is keyed per viewer, the disclosure.ts model, not per browser', () => {
		const shell = read(SHELL);
		expect(shell).toMatch(/const viewer = \$derived\(\(page\.data\?\.claims\?\.sub/);
		expect(shell).toContain('navCollapseKey(viewer)');
	});

	it('persists across a remount via localStorage, not only module state', () => {
		const shell = read(SHELL);
		expect(shell).toContain('writeNavCollapsed(');
		expect(shell).toContain('readNavCollapsed(');
	});

	it("disappears below the split's own breakpoint, matched exactly", () => {
		const shell = read(SHELL);
		const css = read(CSS);
		// Same literal in both files, or the two can silently disagree about
		// where the split turns on.
		expect(shell).toMatch(/@media \(max-width: 1023\.98px\) \{\s*\.nav-toggle \{\s*display: none;/);
		expect(css).toMatch(/@media screen and \(min-width: 1024px\) \{/);
	});
});

describe('the CSS mechanism hides a view, never removes content', () => {
	it("the hiding rule is display:none on .cr-nav, gated on the toggle's aria-pressed via :has()", () => {
		const css = read(CSS);
		expect(css).toMatch(
			/\.cr-root:has\(\[data-testid='nav-collapse-toggle'\]\[aria-pressed='true'\]\) \.cr-split > \.cr-nav \{\s*display: none;/
		);
	});

	it('reclaims the vacated column via the SAME custom property the split already animates, not a hardcoded track list', () => {
		const css = read(CSS);
		expect(css).toMatch(/--cr-nav-w: 0px;/);
		// Mirrors split.css's own "nothing open" collapse, which sets --cr-nav-w
		// to the OTHER extreme (100%) for the mirror-image case. Same property,
		// so the same transition interpolates both.
		const splitCss = read('src/lib/shell/split.css');
		expect(splitCss).toMatch(/--cr-nav-w: 100%;/);
	});

	/** Comments only, so this session's own prose about print or --cr-measure
	 *  cannot be mistaken for the CSS it is describing (the classroom-measure
	 *  / classroom-tab-strip convention). */
	function stripComments(css: string): string {
		return css.replace(/\/\*[\s\S]*?\*\//g, '');
	}

	it('is screen-only, so a printed copy is unaffected by an on-screen collapse', () => {
		const css = stripComments(read(CSS));
		const at = css.indexOf("[data-testid='nav-collapse-toggle']");
		expect(at).toBeGreaterThan(-1);
		// The nearest @media wrapping the rule is `screen and (min-width...)`,
		// never a bare (or print) media query.
		const before = css.slice(0, at);
		const lastMedia = before.lastIndexOf('@media');
		expect(css.slice(lastMedia, at)).toMatch(/^@media screen and \(min-width: 1024px\) \{/);
		expect(css).not.toMatch(/@media print[\s\S]{0,400}nav-collapse-toggle/);
	});

	it('never touches the detail pane\'s reading measure -- widening the split must not widen the sentences', () => {
		const raw = read(CSS);
		// The rule that pins the item's prose to --measure-reading regardless of
		// how much room the pane has is untouched by this change.
		expect(raw).toMatch(/\.cr-split > \.cr-detail \{\s*--cr-measure: var\(--measure-reading\);/);
		// And the new RULE BODY (comments stripped) never sets --cr-measure.
		const css = stripComments(raw);
		const block = css.slice(css.indexOf('@media screen and (min-width: 1024px)'));
		expect(block).not.toMatch(/--cr-measure/);
	});

	it('does not remove .cr-nav from the template anywhere it is mounted -- CSS hides it, Svelte never conditions it', () => {
		// The nav pane's own file is out of this session's scope and is not
		// touched at all; this only pins that THIS session did not sneak an
		// {#if} in anywhere it owns.
		const shell = read(SHELL);
		expect(shell).not.toMatch(/\{#if[^}]*navCollapsed[^}]*\}[\s\S]{0,50}cr-nav/);
	});
});

describe('classroomMeasure agrees the item page keeps its own reading measure', () => {
	it('item resolves to reading, same as before this change', () => {
		expect(classroomMeasure(locateClassroom('/classroom/s-1/item/i-1'))).toBe('reading');
	});
});
