import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropRootWhitespace, renderCase, renderCases } from './classroom-panel-layout-render-cases';

/**
 * AN UNSET PAGE LAYOUT RENDERS THE CLASS PAGE EXACTLY AS IT RENDERED BEFORE THE
 * PAGE COULD BE ARRANGED (ledger 0360, report R23 on the R19 class header).
 *
 * Every class page anybody opens on the day this ships has no stored layout,
 * so that is the one state that has to be right, and its failure is silent: a
 * panel one slot out of place, a wrapper the stack added, the notices on the
 * wrong side of the teams, still renders a perfectly working page that nobody
 * compares with yesterday's.
 *
 * `tests/fixtures/class-view-null-layout-golden.json` was written by running
 * these cases through ClassView AS IT STOOD AT bbc2fae5, before it rendered
 * through `PanelStack` (see the cases file for the command), with only its
 * root tag rewritten mechanically in ledger 0368 (the cases file says how)
 * and, in ledger 0396 (part 7, the toolbar under the banner), its TOOLBAR
 * REGION replaced mechanically: in each of the four cases that have one, the
 * markup from the search row's opening `<div` up to the stream's opening
 * `<div class="stream` was swapped for the same span of the current render
 * and nothing else was touched. That span is the search row, the Videos
 * section and (in the two teacher cases) the resting bulk bar, which are one
 * `class-toolbar` row now: the Videos trigger a key in it, its list a band
 * under it, Select all at its right edge. Before splicing, everything outside
 * the span was checked equal between the old golden and the new render under
 * this file's own normalization (and the empty class, which has no span,
 * equal whole), so the splice moved exactly the toolbar. Review rounds 1 and
 * 2 spliced the same span again, by the same check. Round 1: the search field
 * draws its own words (`.find-ph`). Round 2: at rest a teacher's row holds
 * Select all alone as its last key, with no bulk bar around it and no
 * reserve of actions (the selection's tray only exists once something is
 * ticked, when the filters make way for it), and Select all's label holds
 * "Deselect all (00)"; only the two teacher cases moved, and the student and
 * bare cases' spans came out byte-identical to round 1's. Review round 4
 * spliced it again, by the same check, and in every case with a span exactly
 * this moved: the row carries `data-shape` (its keys word by word, which the
 * stylesheet's line-break rules key on); empty, `aria-hidden` line breaks
 * (`<span class="tb-br">`) sit after the search field, before the status
 * chips, before the Done chip (a student's) and before the Videos key
 * wherever the row has each; and the kind picker's `<select>` carries
 * ClassView's scope class, because the stylesheet now gives it one width in
 * every class. The count of a narrowed list moved to the row's end, which no
 * case shows (none of them is filtered).
 * `tests/classroom-class-toolbar.test.ts` asserts the row's composition. This replays the
 * same props through ClassView as it stands now, with no `panelLayout`, and
 * requires the markup to match character for character once Svelte's
 * hydration comments are stripped (they mark block boundaries, which a
 * snippet moving inside a keyed list legitimately adds, and render nothing)
 * and the whitespace-only text that is a DIRECT child of the page's root is
 * dropped (`dropRootWhitespace` says why that, and only that, renders
 * nothing). Whitespace anywhere deeper is compared exactly.
 *
 * The other direction, so this cannot pass by rendering nothing: each case's
 * markup is asserted to contain the pieces it was given, and a stored layout
 * that moves the posts above the header changes the render.
 */

const GOLDEN = fileURLToPath(new URL('./fixtures/class-view-null-layout-golden.json', import.meta.url));

describe('the class page with no stored layout is the page as it was', () => {
	const cases = renderCases();

	if (process.env.GOLDEN_WRITE === '1') {
		it('writes the golden (run once, on the commit before the change)', () => {
			const out = { count: cases.length, cases: cases.map((c) => ({ name: c.name, html: renderCase(c.props) })) };
			writeFileSync(GOLDEN, JSON.stringify(out, null, '\t') + '\n');
			expect(existsSync(GOLDEN)).toBe(true);
		});
		return;
	}

	const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { count: number; cases: { name: string; html: string }[] };

	it('replays exactly as many cases as the golden holds, and more than none', () => {
		expect(cases.length).toBe(golden.count);
		expect(golden.cases.length).toBe(golden.count);
		expect(cases.length).toBeGreaterThanOrEqual(5);
	});

	for (const [i, c] of cases.entries()) {
		it(`${c.name}: the same markup`, () => {
			const want = golden.cases[i];
			expect(want.name).toBe(c.name);
			const expected = dropRootWhitespace(want.html);
			expect(dropRootWhitespace(renderCase(c.props))).toBe(expected);
			// An explicit null is the same as no prop at all, and so is a layout
			// that says nothing.
			expect(dropRootWhitespace(renderCase({ ...c.props, panelLayout: null }))).toBe(expected);
			expect(dropRootWhitespace(renderCase({ ...c.props, panelLayout: { order: [], hidden: [] } }))).toBe(expected);
		});
	}

	it('THE OTHER DIRECTION: a stored layout changes the render, and the normalization keeps a space between words', () => {
		const teacher = cases[0].props;
		const want = dropRootWhitespace(golden.cases[0].html);
		const moved = dropRootWhitespace(renderCase({ ...teacher, panelLayout: { order: ['stream', 'banner'], hidden: [] } }));
		expect(moved).not.toBe(want);
		// The posts lead, the header follows them, and the notices lead the page.
		expect(moved.indexOf('quick-posts')).toBeLessThan(moved.indexOf('data-testid="class-header"'));
		expect(moved.indexOf('<div class="stream')).toBeGreaterThan(-1);
		expect(moved.indexOf('<div class="stream')).toBeLessThan(moved.indexOf('data-testid="class-header"'));
		const hidden = dropRootWhitespace(renderCase({ ...teacher, panelLayout: { order: [], hidden: ['tools'] } }));
		expect(hidden).not.toContain('data-testid="class-tools"');
		expect(hidden).toContain('Hidden on this page: Class tools.');
		// Only whitespace that is a direct child of the root is dropped.
		expect(dropRootWhitespace('<main> <p>a <b>b</b></p> </main>')).toBe('<main><p>a <b>b</b></p></main>');
		expect(dropRootWhitespace('<main><p>a<b>b</b></p></main>')).not.toBe(dropRootWhitespace('<main><p>a <b>b</b></p></main>'));
		expect(dropRootWhitespace('<main><img src="x"> <br> <p>t</p></main>')).toBe('<main><img src="x"><br><p>t</p></main>');
	});

	it('THE OTHER DIRECTION FOR THUMBNAILS (ledger 0396): every shape but Off draws one per row', () => {
		const { classThumbShape: _off, ...teacher } = cases[0].props;
		const count = (html: string, needle: string) => html.split(needle).length - 1;
		const off = renderCase(cases[0].props);
		const rows = count(off, 'data-testid="item-row"') + count(off, 'check-in-row');
		expect(rows).toBeGreaterThanOrEqual(4);
		expect(count(off, 'data-testid="post-thumb"')).toBe(0);
		expect(count(off, 'class="kind-glyph')).toBe(rows);
		// No shape stored anywhere is the built-in Tile: a thumbnail on every row,
		// the kind glyph moved into it, and the same rows as Off.
		for (const [shape, props] of [
			['tile', teacher],
			['tile', { ...teacher, classThumbShape: 'tile' }],
			['wide', { ...teacher, classThumbShape: 'wide' }],
			['banner', { ...teacher, classThumbShape: 'banner' }]
		] as const) {
			const html = renderCase(props as Record<string, unknown>);
			expect(count(html, 'data-testid="item-row"') + count(html, 'check-in-row'), shape).toBe(rows);
			expect(count(html, 'data-testid="post-thumb"'), shape).toBe(rows);
			expect(count(html, `data-shape="${shape}"`), shape).toBe(rows);
			expect(count(html, 'class="kind-glyph'), shape).toBe(0);
			expect(html).toContain(`data-thumbs="${shape}"`);
			expect(count(html, 'class="row-body'), shape).toBe(shape === 'wide' ? rows : 0);
			expect(count(html, 'class="row-banner'), shape).toBe(shape === 'banner' ? rows : 0);
		}
		// (A person's own Display settings choice beats the class default; that
		// rule is `resolveThumbShape`'s, pinned in tests/classroom-thumbnail.test.ts,
		// because a server render has no preference store to hold one.)
	});

	it('POSITIVE CONTROL: the golden holds the pieces each case was handed', () => {
		const [teacher, student, pane, bare, empty] = golden.cases.map((c) => c.html);
		for (const needle of ['data-testid="class-header"', 'data-testid="class-tools"', 'data-testid="class-theme-panel"', 'data-testid="quick-posts"', 'data-testid="class-teams"', 'data-testid="class-header-teams"', 'data-testid="quick-post-open"', 'data-testid="new-post"', 'data-testid="stream-find"']) {
			expect(teacher, needle).toContain(needle);
		}
		expect(student).toContain('data-testid="quick-posts"');
		expect(student).not.toContain('data-testid="new-post"');
		expect(pane).toContain('<h2 class="pane-title');
		expect(bare).toContain('data-testid="class-header"');
		expect(empty).not.toContain('data-testid="stream-find"');
		// The notices come before the teams, and the header before both.
		expect(teacher.indexOf('class-header"')).toBeLessThan(teacher.indexOf('quick-posts'));
		expect(teacher.indexOf('quick-posts')).toBeLessThan(teacher.indexOf('class-teams'));
	});
});
