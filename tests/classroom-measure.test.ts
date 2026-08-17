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
