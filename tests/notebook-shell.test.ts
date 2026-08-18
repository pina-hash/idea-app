import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import NotebookEntryCard from '../src/lib/notebook/NotebookEntryCard.svelte';
import {
	NOTEBOOK_DISCARD_WARNING,
	clampSelection,
	notebookComposerHasWork,
	selectedEntryOf
} from '../src/lib/notebook/notebook-shell';
import { SPLIT_MIN_PX } from '../src/lib/shell/split.svelte';
import { REVEAL_VIEWPORT_FRACTION, shouldReveal } from '../src/lib/shell/reveal';
import type { NotebookEntry, StagedPhoto } from '../src/lib/notebook';

/**
 * THE NOTEBOOK ON THE TWO-PANE SHELL, asserted where it fails SILENTLY.
 *
 * Three things here, and each of them looks completely normal when it is
 * wrong. A `row` that mounts an editor is a list that works, only slowly and
 * with two editors per note. A detail pane that keeps naming a deleted entry
 * is a pane with something in it. A composer guard that fires on a navigation
 * the form survives is a guard, and people learn to click through it. None of
 * that shows up in a type check and none of it is visible in a screenshot.
 *
 * The source-walking half is the tests/classroom-measure.test.ts convention:
 * the files are named explicitly rather than globbed, so a surface that moves
 * out of this set fails loudly instead of quietly stopping being covered.
 */

/** Normalized, so an assertion about structure never turns on a line ending. */
function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

function entry(over: Partial<NotebookEntry> = {}): NotebookEntry {
	return {
		id: 'e-1',
		session_id: null,
		section_id: null,
		folder_id: null,
		pinned_at: null,
		custom_label: 'Gearbox ratios',
		upload_timestamp: '2026-08-08T13:20:00Z',
		status: 'compliant',
		flag_reason: null,
		instructor_comment: null,
		session: null,
		photos: [
			{
				id: 'p-1',
				drive_file_id: 'drive-p-1',
				variant: 'original',
				sequence_order: 1,
				original_filename: 'ratios.jpg'
			}
		],
		notes: [
			{
				id: 'n-1',
				entry_id: 'e-1',
				note_id: 'n-1',
				revision: 1,
				content: [{ type: 'p', runs: [{ text: 'Stage two came out at 3.4:1.' }] }],
				created_at: '2026-08-08T13:25:00Z'
			}
		],
		...over
	};
}

/** Every write transport a card can be handed, so `full` renders everything. */
const writes = {
	onAddPhotos: async () => ({ ok: true as const }),
	onAddNote: async () => ({ ok: true as const }),
	onEditNote: async () => ({ ok: true as const }),
	onMove: async () => ({ ok: true as const }),
	onPin: async () => ({ ok: true as const })
};

function html(props: Record<string, unknown>): string {
	return render(NotebookEntryCard, {
		props: { entry: entry(), folders: [], ...props } as never
	}).body;
}

/**
 * THE VARIANT BOUNDARY. `row` is what a 26rem navigation pane renders, thirty
 * at a time; every one of these is something that must not be mounted thirty
 * times over, and the reason each is absent is that the detail pane beside the
 * list is carrying it.
 */
describe('the row variant mounts no editor and no body', () => {
	const row = () => html({ variant: 'row', current: false, onOpen: () => {}, ...writes });

	/**
	 * NoteEditor is reached through two DOORS on a full card -- the "Add a note"
	 * panel, and a note thread's own edit control -- and both are opened by a
	 * click, so an at-rest render carries neither. Asserting only the rendered
	 * markup would therefore be vacuous. The doors are asserted below; this
	 * asserts the SOURCE: the `row` branch of the template does not name any of
	 * the three components that can mount an editor or a stager at all.
	 */
	it('names no editor, note thread or photo stager in its own branch', () => {
		const src = read('src/lib/notebook/NotebookEntryCard.svelte');
		const start = src.indexOf("{#if variant === 'row'}");
		const end = src.indexOf('\n{:else}\n', start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const branch = src.slice(start, end);
		for (const component of ['NoteEditor', 'EntryNotes', 'PhotoStager', 'NotebookPhotos']) {
			expect(branch, `the row branch mounts ${component}`).not.toContain(`<${component}`);
		}
		// ...and the full branch, which is the rest of the template, mounts them.
		const full = src.slice(end);
		for (const component of ['NoteEditor', 'EntryNotes', 'PhotoStager', 'NotebookPhotos']) {
			expect(full, `the full branch lost ${component}`).toContain(`<${component}`);
		}
	});

	it('mounts no note editor', () => {
		expect(row()).not.toContain('note-editor');
	});

	it('renders no note thread', () => {
		expect(row()).not.toContain('data-testid="entry-notes"');
		expect(row()).not.toContain('Stage two came out at 3.4:1.');
	});

	it('renders no expand affordance and no expanded body', () => {
		const markup = row();
		expect(markup).not.toContain('data-testid="entry-disclosure"');
		expect(markup).not.toContain('aria-expanded');
		// The add panels and the photo stager go with the body.
		expect(markup).not.toContain('data-testid="add-photos"');
		expect(markup).not.toContain('data-testid="add-note"');
		expect(markup).not.toContain('data-testid="nb-staged"');
	});

	/**
	 * KEPT HONEST: every absence above would also hold if the component rendered
	 * nothing at all, so this pins that `full` -- handed the same entry and the
	 * same transports -- really does render each of them.
	 */
	it('...and `full` renders all of it, so the absences above mean something', () => {
		const markup = html({ variant: 'full', collapsed: false, onToggle: () => {}, ...writes });
		expect(markup).toContain('data-testid="entry-notes"');
		expect(markup).toContain('Stage two came out at 3.4:1.');
		expect(markup).toContain('data-testid="entry-disclosure"');
		expect(markup).toContain('data-testid="add-photos"');
		expect(markup).toContain('data-testid="add-note"');
	});

	it('is `full` by default, so every existing call site is unchanged', () => {
		const markup = html({ collapsed: false, onToggle: () => {}, ...writes });
		expect(markup).toContain('data-testid="entry-disclosure"');
	});
});

describe('the row is two lines, with the counts as indicators', () => {
	const markup = () =>
		html({
			variant: 'row',
			current: false,
			onOpen: () => {},
			foldersReady: true,
			pinsReady: true,
			...writes
		});

	it('carries exactly one title line and one meta line', () => {
		const m = markup();
		expect(m.match(/class="row-title[^"]*"/g) ?? []).toHaveLength(1);
		expect(m.match(/class="row-meta[^"]*"/g) ?? []).toHaveLength(1);
	});

	it('drops the preview line the full card shows when collapsed', () => {
		// A third line is what the two-line contract exists to prevent; the whole
		// note is in the detail pane rather than three words of it in the row.
		expect(markup()).not.toContain('row-preview');
	});

	it('states the counts as text as well as glyphs', () => {
		const m = markup();
		// The glyph-and-number indicator...
		expect(m).toContain('class="ind');
		// ...and the same fact in words, since a glyph beside a bare number reads
		// as nothing at all to a screen reader.
		expect(m).toContain('1 photo');
		expect(m).toContain('1 note');
	});

	it('marks the open row the way the classroom marks it', () => {
		const open = html({ variant: 'row', current: true, onOpen: () => {}, ...writes });
		expect(open).toContain('aria-current="true"');
		expect(open).toContain('data-selected="true"');
		expect(markup()).not.toContain('aria-current');
	});
});

/**
 * THE DETAIL PANE RE-DERIVES. The feed reloads after every save, which replaces
 * every entry object -- so a pane holding the row it was handed at click time
 * would keep describing the state the entry had BEFORE the thing just saved to
 * it. That is the trap ReferenceDoc shipped, and it is invisible: the pane has
 * something in it and the something looks right.
 */
describe('selection is resolved against the current list, never captured', () => {
	it('follows the row through a reload that replaces every object', () => {
		const before = [entry({ id: 'a', custom_label: 'One note' })];
		const after = [
			entry({
				id: 'a',
				custom_label: 'One note',
				notes: [
					...before[0].notes,
					{
						id: 'n-2',
						entry_id: 'a',
						note_id: 'n-2',
						revision: 1,
						content: [{ type: 'p', runs: [{ text: 'The one just saved.' }] }],
						created_at: '2026-08-09T09:00:00Z'
					}
				]
			})
		];
		expect(selectedEntryOf(before, 'a')?.notes).toHaveLength(1);
		expect(selectedEntryOf(after, 'a')?.notes).toHaveLength(2);
		// Not the same object either way: nothing here is a snapshot.
		expect(selectedEntryOf(after, 'a')).not.toBe(before[0]);
	});

	it('resolves an entry that has stopped existing to nothing', () => {
		expect(selectedEntryOf([entry({ id: 'a' })], 'gone')).toBeNull();
		expect(selectedEntryOf([], 'a')).toBeNull();
		expect(selectedEntryOf([entry({ id: 'a' })], null)).toBeNull();
	});

	it('clamps a selection whose entry is gone, and keeps one that is not', () => {
		const list = [entry({ id: 'a' }), entry({ id: 'b' })];
		expect(clampSelection(list, 'b')).toBe('b');
		expect(clampSelection(list, 'c')).toBeNull();
		expect(clampSelection([], 'a')).toBeNull();
		expect(clampSelection(list, null)).toBeNull();
	});
});

/**
 * THE GUARD. It has to fire on real work and stay silent otherwise -- a warning
 * that appears when there is nothing to lose is one people learn to dismiss
 * without reading, which is worse than no warning at all.
 */
describe('what counts as unsaved work', () => {
	const file = () => ({ file: new File([new Uint8Array([1])], 'a.jpg') }) as unknown as StagedPhoto;
	const none = { staged: [] as StagedPhoto[], title: '', noteDraft: null };

	it('is nothing on an untouched form', () => {
		expect(notebookComposerHasWork(none)).toBe(false);
	});

	it('is a staged photo, a typed title, or a note with text in it', () => {
		expect(notebookComposerHasWork({ ...none, staged: [file()] })).toBe(true);
		expect(notebookComposerHasWork({ ...none, title: 'Gearbox' })).toBe(true);
		expect(
			notebookComposerHasWork({
				...none,
				noteDraft: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }]
				}
			})
		).toBe(true);
	});

	it('is NOT whitespace, and NOT an empty editor document', () => {
		// Both are what an untouched form actually contains: Tiptap seeds an
		// empty paragraph on mount, and a title field people tab through.
		expect(notebookComposerHasWork({ ...none, title: '   ' })).toBe(false);
		expect(
			notebookComposerHasWork({ ...none, noteDraft: { type: 'doc', content: [{ type: 'paragraph' }] } })
		).toBe(false);
	});

	it('says the same thing wherever it is asked', () => {
		const view = read('src/lib/notebook/NotebookView.svelte');
		expect(NOTEBOOK_DISCARD_WARNING.length).toBeGreaterThan(20);
		// One constant, two call sites: the Close control and the guard.
		expect(view.match(/NOTEBOOK_DISCARD_WARNING/g) ?? []).toHaveLength(3);
	});
});

/**
 * ONE SPLIT, ONE BREAKPOINT. The number lives in split.css, and one module is
 * allowed to know it in JS (which entry-card variant to render is a prop, not a
 * display rule). If those two ever disagree, the list renders rows while the
 * stylesheet is still stacking them -- which looks like a styling bug and is
 * not one.
 */
describe('the shell is shared, not copied', () => {
	const split = () => read('src/lib/shell/split.css');

	it('the JS breakpoint is the number the stylesheet keys on', () => {
		expect(SPLIT_MIN_PX).toBe(1024);
		expect(split()).toContain(`@media (min-width: ${SPLIT_MIN_PX}px)`);
		expect(split()).toContain(`@media (max-width: ${SPLIT_MIN_PX - 0.02}px)`);
	});

	it('both notebook screens mount the shared component', () => {
		for (const file of [
			'src/lib/notebook/NotebookView.svelte',
			'src/lib/notebook/ReviewConsole.svelte'
		]) {
			expect(read(file), `${file} does not mount the shared split`).toContain(
				"import ClassSplit from '$lib/shell/ClassSplit.svelte'"
			);
		}
	});

	it('neither notebook screen declares pane geometry of its own', () => {
		for (const file of [
			'src/lib/notebook/NotebookView.svelte',
			'src/lib/notebook/ReviewConsole.svelte'
		]) {
			const src = read(file);
			// The pane idiom specifically -- a component may still lay its own
			// content out on a grid.
			expect(src, `${file} declares its own two-column split`).not.toMatch(
				/grid-template-columns:\s*minmax\(0,/
			);
			// The review console's own 992px arrangement, and the bottom-docked
			// sheet that went with it.
			expect(src, `${file} keeps a breakpoint of its own`).not.toMatch(/@media \(min-width: 62rem\)/);
			expect(src).not.toContain('--nb-sheet-h');
		}
	});

	it('both rooms pull the shell in, so neither can drift from it', () => {
		expect(read('src/lib/classroom/classroom.css')).toContain("@import '../shell/split.css';");
		expect(read('src/lib/notebook/notebook-theme.css')).toContain("@import '../shell/split.css';");
	});

	it('the notebook owns ONE scroll region, so no bar wraps another', () => {
		// THE REGRESSION THIS PINS. The default pane geometry is viewport height
		// less --cr-chrome-h, which is right when the split IS the page -- the
		// classroom's is, with a breadcrumb and a tab bar above it and nothing
		// below. The notebook's is not: ~355px of masthead and hero above, a
		// version badge below, and on /classroom/view-as the whole thing is
		// mounted inside the classroom's own shell. A viewport-height pane under
		// that leaves the DOCUMENT scrolling too, which is two bars with one
		// inside the other.
		for (const file of [
			'src/lib/notebook/NotebookView.svelte',
			'src/lib/notebook/ReviewConsole.svelte'
		]) {
			// On the TAG, not anywhere in the file: the phrase appears in both
			// components' comments, and an assertion a comment can satisfy cannot
			// fail (the narrow="stack" assertion below learned this by mutation).
			expect(read(file), `${file} does not hand the scroll to the page`).toMatch(
				/<ClassSplit[\s\S]{0,200}?scroll="page"/
			);
		}
		// ...and the classroom keeps the default, being the surface the default
		// is correct for.
		expect(read('src/routes/classroom/[sectionId]/+layout.svelte')).not.toContain('scroll=');
	});

	it('page-flow genuinely un-bounds both panes rather than moving the bar', () => {
		// A sticky, internally-scrolling detail pane was the obvious shape and is
		// NOT what shipped: it scrolls internally the moment it is taller than the
		// screen, and the compose form is ~1200px against a 900px viewport, so
		// that is its ordinary state. It would have answered a report about two
		// scrollbars with two scrollbars. Nothing here may re-bound a pane -- and
		// per the file's own rule, nothing may HIDE a bar either.
		const block = split().slice(split().indexOf('.cr-split.page-flow'));
		expect(block).toMatch(/max-height:\s*none/);
		expect(block).toMatch(/overflow-y:\s*visible/);
		expect(block).not.toMatch(/position:\s*sticky/);
		expect(split()).not.toMatch(/scrollbar-width:\s*none/);
		expect(split()).not.toMatch(/::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
	});

	it('the folder rail stops being a scroller inside a scroller at desktop', () => {
		// A horizontal chip strip is right for a full-width band on a phone, where
		// vertical room is the scarce thing. In a 26rem navigation pane it was a
		// bar nested in a bar, offering nothing the room below it gives for free.
		const rail = read('src/lib/notebook/FolderRail.svelte');
		const desktop = rail.slice(rail.indexOf(`@media (min-width: ${SPLIT_MIN_PX}px)`));
		expect(desktop, 'the rail keeps a bar of its own inside the pane').toMatch(
			/flex-wrap:\s*wrap/
		);
		expect(desktop).toMatch(/overflow-x:\s*visible/);
		// The phone behaviour is what it always was.
		expect(rail).toMatch(/overflow-x:\s*auto/);
	});

	it('the notebook stacks below the breakpoint rather than swapping', () => {
		// The compose form has always been the first block on a phone's notebook,
		// and the feed under it; swapping would hide the feed behind the form.
		// On the TAG, not anywhere in the file: the phrase appears in this
		// component's own header comment too, and an assertion a comment can
		// satisfy is an assertion that cannot fail (found by mutating it).
		expect(read('src/lib/notebook/NotebookView.svelte')).toMatch(
			/<ClassSplit[^>]*narrow="stack"/
		);
		expect(split()).toMatch(/\.cr-split\.narrow-stack > \.cr-detail \{\s*order:\s*1;/);
		expect(split()).toMatch(/\.cr-split\.narrow-stack > \.cr-nav \{\s*order:\s*2;/);
		// ...and the classroom's swap is unchanged, being the default.
		expect(read('src/routes/classroom/[sectionId]/+layout.svelte')).not.toContain('narrow=');
	});
});

describe('bringing the detail pane into view', () => {
	/**
	 * The cost of un-bounding the panes, paid in one place: with nothing pinned,
	 * opening something from a row far down a long list renders it at the top of
	 * a column already scrolled past, and the click reads as doing nothing.
	 *
	 * The half that fails SILENTLY is the other one -- scrolling when the pane
	 * was already showing. That is a page yanking itself for no reason, and it
	 * looks identical to a page that simply moved, so it is asserted here rather
	 * than eyeballed.
	 */
	it('scrolls when the pane is above the viewport', () => {
		expect(shouldReveal(-1, 900)).toBe(true);
		expect(shouldReveal(-800, 900)).toBe(true);
	});

	it('scrolls when the pane is below the halfway line', () => {
		expect(shouldReveal(900 * REVEAL_VIEWPORT_FRACTION + 1, 900)).toBe(true);
		expect(shouldReveal(1200, 900)).toBe(true);
	});

	it('does NOT scroll a pane that is already showing', () => {
		expect(shouldReveal(0, 900)).toBe(false);
		expect(shouldReveal(232, 900)).toBe(false);
		expect(shouldReveal(900 * REVEAL_VIEWPORT_FRACTION, 900)).toBe(false);
	});

	it('does nothing without a real viewport to measure against', () => {
		// Server render, a detached element, a zero-height frame: none of those
		// are a page that needs moving, and scrolling on them is not defensible
		// as a default.
		expect(shouldReveal(-100, 0)).toBe(false);
		expect(shouldReveal(Number.NaN, 900)).toBe(false);
		expect(shouldReveal(-100, Number.NaN)).toBe(false);
	});

	it('is what both notebook surfaces actually call', () => {
		for (const file of [
			'src/lib/notebook/NotebookView.svelte',
			'src/lib/notebook/ReviewConsole.svelte'
		]) {
			const src = read(file);
			expect(src, `${file} does not reveal its detail pane`).toContain('revealDetailPane(detailEl)');
			// Bound rather than found by selector, so a page holding more than one
			// split cannot reveal the wrong one.
			expect(src).toMatch(/<ClassSplit[\s\S]{0,200}?bind:detailEl/);
		}
	});
});
