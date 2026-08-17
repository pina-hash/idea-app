import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classroomMeasure, locateClassroom, type ClassroomPlace } from '../src/lib/classroom/nav';

/**
 * THE CHROME AND THE PAGE UNDER IT AGREE ABOUT HOW WIDE THE PAGE IS.
 *
 * ClassroomShell used to pin the breadcrumbs and the section tabs at 60rem
 * while the content beneath them could be 46rem (an item) or 62rem (grading),
 * so the chrome only lined up on the routes that happened to be 60rem too.
 * Both read `--cr-measure` now, which src/routes/classroom/+layout.svelte sets
 * from `classroomMeasure`.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. The agreement lives in two files that
 * have no reason to be opened together: a `case` in nav.ts, and a `max-width`
 * in a component's own <style> block. Nothing type-checks the pairing, nothing
 * renders wrong enough to notice, and the failure is a few pixels of
 * misalignment -- the exact shape of thing that drifts back apart. So the
 * pairing is asserted directly against the shipping source.
 *
 * It is a SOURCE-WALKING test, the tests/coin-symbol.test.ts convention: the
 * files are listed explicitly rather than globbed, so a component that moves
 * out of this set fails loudly instead of quietly stopping being covered.
 */

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/**
 * Where each place's content measure is actually written. `item-deck` is
 * deliberately absent: DeckViewer is a full-screen viewer with no content
 * column at all, so there is no width for the chrome to agree with.
 */
const SURFACES: { place: ClassroomPlace; path: string; file: string }[] = [
	{ place: 'home', path: '/classroom', file: 'src/lib/classroom/MyClasses.svelte' },
	{ place: 'section', path: '/classroom/s-1', file: 'src/lib/classroom/ClassView.svelte' },
	{ place: 'people', path: '/classroom/s-1/people', file: 'src/lib/classroom/PeoplePanel.svelte' },
	{ place: 'grades', path: '/classroom/s-1/grades', file: 'src/lib/classroom/GradesPanel.svelte' },
	{ place: 'item', path: '/classroom/s-1/item/i-1', file: 'src/lib/classroom/ItemDetail.svelte' },
	{
		place: 'item-grade',
		path: '/classroom/s-1/item/i-1/grade',
		file: 'src/lib/classroom/GradingConsole.svelte'
	},
	{ place: 'admin', path: '/classroom/admin', file: 'src/lib/classroom/AdminConsole.svelte' },
	{ place: 'updates', path: '/classroom/updates', file: 'src/lib/classroom/UpdatesPage.svelte' },
	{
		place: 'feedback',
		path: '/classroom/feedback',
		file: 'src/lib/classroom/FeedbackConsole.svelte'
	}
];

/** The one width declaration on a surface's own content column. */
function declaredMeasure(file: string): string | null {
	const src = read(file);
	const m = src.match(/\.classroom-page\s*\{[^}]*?max-width:\s*var\(--cr-measure,\s*var\(--measure-([a-z]+)\)\)/s);
	if (m) return m[1];
	// The two surfaces that are their own page rather than a .classroom-page.
	const any = src.match(/max-width:\s*var\(--cr-measure,\s*var\(--measure-([a-z]+)\)\)/);
	return any ? any[1] : null;
}

describe('the classroom chrome is as wide as the page under it', () => {
	for (const { place, path, file } of SURFACES) {
		it(`${place} resolves to the measure ${file.split('/').pop()} declares`, () => {
			const loc = locateClassroom(path);
			expect(loc.place).toBe(place);
			const routeAnswer = classroomMeasure(loc);
			expect(routeAnswer, `${place} has no measure`).not.toBeNull();
			expect(declaredMeasure(file), `${file} declares no --cr-measure fallback`).toBe(routeAnswer);
		});
	}

	it('the shell chrome reads the same property, not a literal', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		// Both the trail and the tabs.
		const uses = shell.match(/max-width:\s*var\(--cr-measure,\s*var\(--measure-page\)\)/g) ?? [];
		expect(uses.length).toBe(2);
		// And neither of them is still pinned to the old literal.
		expect(shell).not.toMatch(/max-width:\s*60rem/);
	});

	it('no migrated classroom surface still hardcodes a page width', () => {
		for (const { file } of SURFACES) {
			expect(read(file), `${file} still carries a literal page width`).not.toMatch(
				/max-width:\s*(46|48|52|60|62)rem/
			);
		}
	});

	it('every measure the router can return is a real token', () => {
		const tokens = read('src/lib/design-system/effects.css');
		const places: ClassroomPlace[] = [
			'home',
			'section',
			'people',
			'grades',
			'item',
			'item-grade',
			'item-deck',
			'admin',
			'updates',
			'feedback',
			'view-as',
			'other'
		];
		for (const place of places) {
			const m = classroomMeasure({ place, sectionId: null, itemId: null });
			if (m === null) continue;
			expect(tokens, `--measure-${m} is not defined`).toMatch(new RegExp(`--measure-${m}:\\s*\\d`));
		}
		// The split's own measure is set by classroom.css, not by the router, and
		// has to exist just the same.
		expect(tokens).toMatch(/--measure-split:\s*\d/);
		expect(read('src/lib/classroom/classroom.css')).toMatch(
			/--cr-measure:\s*var\(--measure-split\)/
		);
	});

	it('view-as sets no measure, so its two differently-sized pages keep their own', () => {
		expect(classroomMeasure(locateClassroom('/classroom/view-as'))).toBeNull();
		expect(classroomMeasure(locateClassroom('/classroom/view-as/a@b.net/s-1'))).toBeNull();
	});
});

/**
 * THE CHROME AND THE CONTENT START AND END ON THE SAME LINE.
 *
 * Same shape of problem as the measure above, and the same reason it is a test
 * rather than a comment: the gutter was NINE separate literals -- `1.2rem` in
 * the trail, the tabs, the split, and every page component's own
 * `.classroom-page` -- and they agreed only by having been typed the same. The
 * one that did not agree was the pane pair, where a page component's padding
 * landed INSIDE the split's, so the item's content sat 19px further in than
 * the list beside it and 19px further in than the trail above both.
 *
 * There is one declaration now (`--cr-gutter` on `.cr-root`), and everything
 * reads it. That is a five-word change away from drifting back, and nothing
 * type-checks it, so it is asserted directly against the shipping source.
 */
const GUTTER_SURFACES = [
	'src/lib/classroom/MyClasses.svelte',
	'src/lib/classroom/ClassView.svelte',
	'src/lib/classroom/PeoplePanel.svelte',
	'src/lib/classroom/GradesPanel.svelte',
	'src/lib/classroom/ItemDetail.svelte',
	'src/lib/classroom/GradingConsole.svelte',
	'src/lib/classroom/AdminConsole.svelte',
	'src/lib/classroom/UpdatesPage.svelte',
	'src/lib/classroom/FeedbackConsole.svelte'
];

describe('one page gutter, read by everything', () => {
	it('is declared once, and at both widths', () => {
		const css = read('src/lib/classroom/classroom.css');
		// The narrow default on .cr-root itself...
		expect(css).toMatch(/--cr-gutter:\s*1rem/);
		// ...widened at the desktop breakpoint, in the same file.
		expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]{0,200}--cr-gutter:\s*2rem/);
	});

	it('the trail and the tabs read it, and neither keeps a literal', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		const uses = shell.match(/padding:\s*0 var\(--cr-gutter[^)]*\)/g) ?? [];
		expect(uses.length, 'the breadcrumb row and the tab bar').toBe(2);
		// The phone override that used to put the chrome on its own line is gone.
		expect(shell).not.toMatch(/padding-inline:\s*0\.9rem/);
	});

	it('the split reads it, and the panes add no second gutter of their own', () => {
		const css = read('src/lib/classroom/classroom.css');
		expect(css).toMatch(/\.cr-split\s*\{[\s\S]*?padding:\s*0 var\(--cr-gutter\)/);
		// Both panes, not just the list -- the detail's own padding is what put
		// the item's content on a different line from the list's.
		expect(css).toMatch(
			/\.cr-split > \.cr-nav \.classroom-page,\s*\.cr-split > \.cr-detail \.classroom-page \{\s*padding-inline:\s*0;/
		);
	});

	it('every page surface reads it, and none still hardcodes 1.2rem', () => {
		for (const file of GUTTER_SURFACES) {
			const src = read(file);
			expect(src, `${file} does not read --cr-gutter`).toMatch(
				/padding:\s*0 var\(--cr-gutter, 1\.2rem\) 3rem/
			);
			expect(src, `${file} still carries a literal gutter`).not.toMatch(/padding:\s*0 1\.2rem/);
		}
	});

	it('the list pane has real internal padding, so its content clears its own edges', () => {
		const css = read('src/lib/classroom/classroom.css');
		const pane = css.match(/\.cr-split > \.cr-nav \{[\s\S]*?\}/)?.[0] ?? '';
		expect(pane).toMatch(/padding:\s*var\(--space-5\)/);
		// And a boundary, so that inset reads as the pane's rather than as a
		// stray indent against the trail above it.
		expect(pane).toMatch(/border:\s*1px solid var\(--hairline\)/);
	});

	it('the gap between the panes comes from the scale', () => {
		const css = read('src/lib/classroom/classroom.css');
		expect(css).toMatch(/\.cr-split\s*\{[\s\S]*?gap:\s*var\(--space-5\)/);
	});

	it('the tab bar leaves a full step under it, not 0.9rem', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/\.sec-tabs\s*\{[\s\S]*?margin:\s*0 auto var\(--space-5\)/);
	});
});

/**
 * SCROLLBARS ARE STYLED WITH THE STANDARD PROPERTIES, and the WebKit
 * pseudo-elements are the FALLBACK -- not the reverse. The pairing is easy to
 * write the wrong way round and impossible to see in a browser that supports
 * both, since the standard properties simply win there.
 */
describe('scrollbars', () => {
	const css = () => read('src/lib/classroom/classroom.css');

	it('uses the standard properties, and thin rather than hidden', () => {
		expect(css()).toMatch(/scrollbar-color:\s*var\(--text-3\) transparent/);
		expect(css()).toMatch(/scrollbar-width:\s*thin/);
		expect(css()).not.toMatch(/\.cr-root[^{]*\{[^}]*scrollbar-width:\s*none/);
	});

	/**
	 * `scrollbar-color` inherits and `scrollbar-width` does not (measured: with
	 * only the .cr-root declaration both panes came back `auto`), so the width
	 * has to reach the descendants explicitly.
	 */
	it('sets the width on descendants too, since that property does not inherit', () => {
		expect(css()).toMatch(/\.cr-root,\s*\.cr-root \*\s*\{\s*scrollbar-width:\s*thin;\s*\}/);
	});

	it('keeps the WebKit rules as a fallback, on the descendant form', () => {
		expect(css()).toMatch(/\.cr-root ::-webkit-scrollbar,/);
		expect(css()).toMatch(/\.cr-root ::-webkit-scrollbar-thumb,/);
		// Never a hidden bar: a zero-width scrollbar is the thing rule 14 forbids.
		expect(css()).not.toMatch(/::-webkit-scrollbar[^{]*\{[^}]*width:\s*0/);
	});

	/**
	 * The one region allowed to hide its bar keeps its OWN rule, which outranks
	 * the shared one -- and it has replaced the affordance with an edge fade per
	 * end. A region that has not done that may not hide it.
	 */
	it('the reference tab rail is the documented exception, with its own fades', () => {
		const doc = read('src/lib/classroom/ReferenceDoc.svelte');
		expect(doc).toMatch(/scrollbar-width:\s*none/);
		expect(doc).toMatch(/\.tab-rail\.fade-start::before/);
		expect(doc).toMatch(/\.tab-rail\.fade-end::after/);
	});
});
