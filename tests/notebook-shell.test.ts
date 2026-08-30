import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import NotebookEntryCard from '../src/lib/notebook/NotebookEntryCard.svelte';
import NotebookDeletedZone from '../src/lib/notebook/NotebookDeletedZone.svelte';
import StudentReviewBackStrip from '../src/lib/notebook/StudentReviewBackStrip.svelte';
import {
	NOTEBOOK_DISCARD_WARNING,
	NOTEBOOK_NOTE_DISCARD_WARNING,
	clampSelection,
	notebookComposerHasWork,
	selectedEntryOf
} from '../src/lib/notebook/notebook-shell';
import { SPLIT_MIN_PX } from '../src/lib/shell/split.svelte';
import { REVEAL_VIEWPORT_FRACTION, shouldReveal } from '../src/lib/shell/reveal';
import {
	deletedEntryActor,
	deletedEntryActorName,
	livePhotos,
	orderedPhotos,
	photoPages
} from '../src/lib/notebook';
import {
	NOTEBOOK_ENTRY_SELECTS,
	NOTEBOOK_FOLDER_SELECT,
	NOTEBOOK_FULL_SELECT,
	NOTEBOOK_NOTES_SELECT,
	NOTEBOOK_PHOTOS_SELECT,
	NOTEBOOK_SCALAR_SELECT,
	REVIEW_ENTRY_SELECTS,
	REVIEW_ENTRY_FULL_SELECT
} from '../src/lib/notebook-selects';
import type {
	NotebookDeletedEntry,
	NotebookEntry,
	NotebookPhoto,
	StagedPhoto
} from '../src/lib/notebook';

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
		// Turned in (0118), so nothing in this file is accidentally a draft case.
		submitted_at: '2026-08-08T13:20:00Z',
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
		expect(NOTEBOOK_NOTE_DISCARD_WARNING.length).toBeGreaterThan(20);

		/**
		 * THE RULE, NOT A COUNT.
		 *
		 * This used to assert exactly three occurrences of one constant, which a
		 * second KIND of unsaved work necessarily breaks -- and it broke the
		 * moment the guard learned about an open note editor, which is a
		 * legitimate change. What the assertion was actually protecting is that
		 * the page never spells a warning out for itself: every warning it can
		 * show comes from notebook-shell.ts, so the Close control and the
		 * navigation guard cannot diverge, and a third kind is added there
		 * rather than by typing a fourth sentence into this page.
		 */
		const fromTheOneModule = view.match(/NOTEBOOK_DISCARD_WARNING|notebookUnsavedWarning\(/g) ?? [];
		expect(fromTheOneModule.length).toBeGreaterThanOrEqual(3);
		// No hand-written warning prose anywhere in the page.
		expect(view).not.toMatch(/has not been saved yet/);
		expect(view).not.toMatch(/only in this browser/);
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

	it('no notebook surface takes the shell VIEWPORT ARITHMETIC, so no bar wraps another', () => {
		// THE REGRESSION THIS PINS, AND THE RULE IT IS NOW STATED AS. The DEFAULT
		// pane geometry is `100vh - --cr-chrome-h`, which is right when the split
		// IS the page and the chrome above it is a known constant -- the
		// classroom's is. The notebook's never is: a hero that wraps, notices,
		// fail-soft cards, and on /classroom/view-as the whole thing mounted
		// inside the classroom's own shell and impersonation banner. A
		// viewport-height pane under any of that leaves the DOCUMENT scrolling
		// too, which is two bars with one inside the other.
		//
		// The rule is therefore "not the default", not "always page-flow" -- the
		// original spelling of this assertion, which naming a THIRD correct
		// answer necessarily broke. Both surviving answers avoid the constant:
		// `page` gives the scroll back to the document, and `fill` bounds the
		// panes at the height of the box the caller put the split in, which is
		// measured rather than assumed.
		const surfaces = {
			// Mounted under somebody else's shell in view-as, so it cannot bound
			// itself at ALL: only the document knows how tall it is.
			'src/lib/notebook/NotebookView.svelte': 'page',
			// An application frame of its own (`cr-app`), so its parent has a real
			// height to hand down and both panes can scroll inside it.
			'src/lib/notebook/ReviewConsole.svelte': 'fill'
		} as const;
		for (const [file, mode] of Object.entries(surfaces)) {
			const src = read(file);
			// On the TAG, not anywhere in the file: the phrase appears in these
			// components' comments too, and an assertion a comment can satisfy
			// cannot fail (the narrow="stack" assertion below learned this by
			// mutation).
			expect(src, `${file} does not name a scroll mode`).toMatch(
				new RegExp(`<ClassSplit[\\s\\S]{0,300}?scroll="${mode}"`)
			);
			expect(src, `${file} takes the default pane geometry`).not.toMatch(
				/<ClassSplit[\s\S]{0,300}?scroll="panes"/
			);
			// And neither may write the arithmetic itself instead.
			expect(src, `${file} does its own viewport arithmetic`).not.toMatch(/100vh|100dvh/);
		}
		// ...and the classroom keeps the default, being the surface the default
		// is correct for.
		expect(read('src/routes/classroom/[sectionId]/+layout.svelte')).not.toContain('scroll=');
	});

	it('fill-height names no viewport height, which is the whole point of it', () => {
		// `fill` exists because --cr-chrome-h cannot be kept true: it is wrong by
		// a DIFFERENT amount per surface and per state. A `100vh` that crept back
		// into its own block would be the same bug wearing the fix's name.
		const css = split();
		const block = css.slice(css.indexOf('.cr-split.fill-height'));
		expect(block).toMatch(/height:\s*100%/);
		expect(block).not.toMatch(/100vh|--cr-chrome-h/);
		// The one place a viewport height IS legitimate is the application frame
		// the caller opts into, and it is dynamic (a phone's collapsing chrome).
		const app = css.slice(css.indexOf('.cr-app'), css.indexOf('.cr-split {'));
		expect(app).toMatch(/height:\s*100dvh/);
		expect(app).not.toMatch(/100vh[^-]/);
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

	/* -----------------------------------------------------------------------
	 * THE RULE, RATHER THAN THE TWO FILES IT WAS FOUND IN.
	 *
	 * The assertion above names `NotebookView` and `ReviewConsole` by hand, so
	 * it is a claim about two files and not about the guarantee. The guarantee
	 * is `reveal.ts`'s own first paragraph: under `scroll="page"` NEITHER PANE
	 * BOUNDS ITSELF, so both columns start at the same place in the document
	 * and something opened from a row forty down the list renders above where
	 * the click happened -- a click that looks like it did nothing. That is
	 * true of every page-flow split, and SIX callers outside the notebook take
	 * exactly that cost today with nothing anywhere reddening.
	 *
	 * So the sweep is over every `<ClassSplit` mount in `src/`, and the six are
	 * an EXPLICIT, PINNED EXEMPTION LIST rather than a silent gap. A list is
	 * something somebody can shorten; an unwritten rule is not.
	 *
	 * IT BITES IN BOTH DIRECTIONS, which is what stops it rotting into a
	 * ratchet that records whatever is currently true:
	 *   - a page-flow caller NOT on the list that does not reveal fails;
	 *   - an entry on the list that HAS been fixed fails, so the list can only
	 *     ever shrink and a fix cannot be quietly re-exempted;
	 *   - an entry on the list that has stopped being page-flow fails, for the
	 *     same reason;
	 *   - the length is pinned, so an addition is deliberate.
	 *
	 * `scroll="fill"` and the default `panes` are NOT covered: those panes bound
	 * their own height, so the detail column does not start halfway down a
	 * document. ReviewConsole is `fill` and reveals anyway -- harmless, and the
	 * named assertion above keeps covering it either way.
	 * -------------------------------------------------------------------- */

	/** Every `.svelte` file under src/, so a new split cannot arrive uncovered. */
	function svelteFiles(): string[] {
		const root = new URL('../src/', import.meta.url);
		const out: string[] = [];
		const walk = (rel: string) => {
			for (const entry of readdirSync(new URL(rel, root), { withFileTypes: true })) {
				if (entry.isDirectory()) walk(`${rel}${entry.name}/`);
				else if (entry.name.endsWith('.svelte')) out.push(`src/${rel}${entry.name}`);
			}
		};
		walk('');
		return out.sort();
	}

	type SplitMount = { file: string; scroll: string; reveals: boolean; binds: boolean };

	/**
	 * The mounts, read off the OPENING TAG rather than the whole file: a file
	 * can hold more than one split, and `scroll` has to come from the tag it
	 * belongs to. Every caller today writes `scroll` as a literal (asserted
	 * below), so nothing here has to evaluate an expression.
	 */
	function splitMounts(): SplitMount[] {
		const mounts: SplitMount[] = [];
		for (const file of svelteFiles()) {
			const src = read(file);
			for (const tag of src.match(/<ClassSplit[\s\S]*?>/g) ?? []) {
				const literal = tag.match(/\bscroll="([a-z]+)"/);
				// A bound scroll would make this sweep unable to answer, so it is a
				// FAILURE rather than a skip -- the ALLOWED_PURE lesson: a file the
				// checker could not read is a file it never checked.
				expect(tag, `${file}: scroll is not a literal, this sweep cannot classify it`).not.toMatch(
					/\bscroll=\{/
				);
				mounts.push({
					file,
					scroll: literal?.[1] ?? 'panes',
					reveals: src.includes('revealDetailPane(detailEl)'),
					binds: tag.includes('bind:detailEl')
				});
			}
		}
		return mounts;
	}

	/**
	 * THE SIX, each with the reason it is exempt rather than merely listed.
	 * Every one is another lane's file: this bundle owns `src/lib/notebook/**`,
	 * `src/routes/notebook/**` and `src/routes/dev/**`, and reaching into a
	 * surface somebody else is working in to add an effect and a binding is how
	 * two lanes collide. NO LINE NUMBERS on purpose -- a list that has to be
	 * renumbered is a list that gets renumbered without being read.
	 */
	const KNOWN_UNREVEALED: { file: string; why: string }[] = [
		{ file: 'src/lib/coin-desk/LogView.svelte', why: 'coin-desk lane owns it' },
		{ file: 'src/lib/maps/MapsEditor.svelte', why: 'maps lane owns it' },
		{ file: 'src/lib/foundry/FoundryGallery.svelte', why: 'foundry lane owns it' },
		{ file: 'src/lib/foundry/FoundryMine.svelte', why: 'foundry lane owns it' },
		{ file: 'src/lib/foundry/ReviewQueue.svelte', why: 'foundry lane owns it' },
		{
			file: 'src/routes/dev/classroom-inspector/+page.svelte',
			why: 'the harness for a classroom surface; it should follow whatever that surface does'
		}
	];

	it('sweeps something -- a page-flow split exists to be checked', () => {
		const pageFlow = splitMounts().filter((m) => m.scroll === 'page');
		// The positive control. A walker that found no files, or a tag regex that
		// stopped matching, would otherwise pass every assertion below vacuously.
		expect(pageFlow.length).toBeGreaterThanOrEqual(KNOWN_UNREVEALED.length + 1);
		expect(splitMounts().some((m) => m.scroll !== 'page')).toBe(true);
	});

	it('every page-flow split reveals its detail pane, except the pinned six', () => {
		const exempt = new Set(KNOWN_UNREVEALED.map((e) => e.file));
		const offenders = splitMounts()
			.filter((m) => m.scroll === 'page' && !exempt.has(m.file))
			.filter((m) => !m.reveals || !m.binds)
			.map((m) => `${m.file} (reveals=${m.reveals}, binds=${m.binds})`);
		expect(
			offenders,
			'a page-flow split opens its detail pane above where the click happened unless it reveals'
		).toEqual([]);
	});

	it('the exemption list can only shrink', () => {
		const byFile = new Map(splitMounts().map((m) => [m.file, m]));
		for (const { file, why } of KNOWN_UNREVEALED) {
			const mount = byFile.get(file);
			expect(mount, `${file} is on the exemption list and no longer mounts a split`).toBeDefined();
			expect(mount?.scroll, `${file} is no longer page-flow; drop it from the list`).toBe('page');
			expect(
				mount?.reveals && mount?.binds,
				`${file} now reveals (${why}) -- remove it from KNOWN_UNREVEALED`
			).toBe(false);
		}
		// Pinned, so a seventh is a deliberate act and not a quiet widening.
		expect(KNOWN_UNREVEALED.length).toBe(6);
	});
});


/* ===========================================================================
 * SOFT DELETION, CLIENT SIDE (0116).
 *
 * The database's own filters are covered against a real Postgres
 * (tests/notebook-soft-delete.test.ts). These are the client's half of the same
 * sweep: the one place a removed photo is dropped, and the ladder rule that
 * keeps a pre-0116 project working.
 * ======================================================================== */

function photo(over: Partial<NotebookPhoto> = {}): NotebookPhoto {
	return {
		id: 'p-1',
		drive_file_id: 'drive-1',
		variant: 'original',
		sequence_order: 1,
		original_filename: 'page.jpg',
		...over
	};
}

describe('a removed photo is dropped wherever photos are rendered or counted', () => {
	it('livePhotos keeps the live one and drops the removed one', () => {
		const kept = photo({ id: 'live' });
		const gone = photo({ id: 'gone', sequence_order: 2, removed_at: '2026-08-10T00:00:00Z' });
		expect(livePhotos([kept, gone]).map((p) => p.id)).toEqual(['live']);
	});

	it('a photo with NO removed_at field at all is live -- the pre-0116 read', () => {
		// A narrower rung of the ladder cannot select a column that does not
		// exist, so `undefined` has to mean live or every photo on a pre-0116
		// project would vanish.
		const rows = [photo({ id: 'a' }), photo({ id: 'b', sequence_order: 2 })];
		for (const row of rows) expect('removed_at' in row).toBe(false);
		expect(livePhotos(rows).map((p) => p.id)).toEqual(['a', 'b']);
	});

	it('photoPages and orderedPhotos both go through it', () => {
		const kept = photo({ id: 'live' });
		const gone = photo({ id: 'gone', sequence_order: 2, removed_at: '2026-08-10T00:00:00Z' });
		const third = photo({ id: 'third', sequence_order: 3 });

		expect(photoPages([kept, gone, third]).map((p) => p.original?.id)).toEqual(['live', 'third']);
		// Page NUMBERS close up: two pages, numbered 1 and 2, not 1 and 3.
		expect(photoPages([kept, gone, third]).map((p) => p.page)).toEqual([1, 2]);
		expect(orderedPhotos(entry({ photos: [kept, gone, third] })).map((p) => p.id)).toEqual([
			'live',
			'third'
		]);
	});

	it('a removed ORIGINAL leaves its enhanced as its own page rather than vanishing', () => {
		const original = photo({ id: 'orig', removed_at: '2026-08-10T00:00:00Z' });
		const enhanced = photo({ id: 'enh', variant: 'enhanced', sequence_order: 2 });
		const pages = photoPages([original, enhanced]);
		expect(pages).toHaveLength(1);
		expect(pages[0].original).toBeNull();
		expect(pages[0].enhanced?.id).toBe('enh');
	});
});

describe('the select ladders gained a rung rather than growing one', () => {
	/**
	 * GENERALIZED IN 0118, NOT WEAKENED. These four assertions used to spell the
	 * ladder out position by position -- capability names in order, and each
	 * pre-0116 rung compared to its own constant by index. Adding a rung
	 * necessarily breaks that, which is the tests/classroom-measure.test.ts
	 * situation exactly: an assertion that pins the CURRENT shape fails on every
	 * legitimate extension and says nothing about the rule.
	 *
	 * So they assert the RULE now: rungs are widest-first, a rung names the
	 * columns of the capability it adds and nothing wider, and no rung below a
	 * capability's own is edited to carry it. That is what the ladder is FOR --
	 * a project sitting between two hand-applied migrations reads exactly the
	 * notebook it had -- and it stays true however many rungs are added.
	 */
	it('the feed ladder is widest-first, ending on the scalar probe', () => {
		const selects = NOTEBOOK_ENTRY_SELECTS.map((r) => r.select);
		// Strictly narrowing: each rung is shorter than the one above it. A rung
		// that is not a narrowing of its predecessor is not a rung.
		for (let i = 1; i < selects.length; i++) {
			expect([i, selects[i].length < selects[i - 1].length]).toEqual([i, true]);
		}
		// The last rung carries no capability of its own -- failing it is what
		// `configured: false` means -- and it is the scalar probe verbatim.
		const last = NOTEBOOK_ENTRY_SELECTS[NOTEBOOK_ENTRY_SELECTS.length - 1];
		expect(last.capability).toBeNull();
		expect(last.select).toBe(NOTEBOOK_SCALAR_SELECT);
		// Every rung that predates the two soft-delete/draft columns is still
		// byte-identical to its own constant, whatever sits above it.
		const byCapability = new Map(NOTEBOOK_ENTRY_SELECTS.map((r) => [r.capability, r.select]));
		expect(byCapability.get('pins')).toBe(NOTEBOOK_FULL_SELECT);
		expect(byCapability.get('folders')).toBe(NOTEBOOK_FOLDER_SELECT);
		expect(byCapability.get('notes')).toBe(NOTEBOOK_NOTES_SELECT);
		expect(byCapability.get('photos')).toBe(NOTEBOOK_PHOTOS_SELECT);
	});

	it('a rung names only the columns of its own capability and wider', () => {
		// The rule, stated as a boundary rather than as an index: everything at or
		// above the rung that ADDS a column may name it, and nothing below may.
		const index = (capability: string) =>
			NOTEBOOK_ENTRY_SELECTS.findIndex((r) => r.capability === capability);
		const deletion = index('deletion');
		const drafts = index('drafts');
		expect(deletion).toBeGreaterThanOrEqual(0);
		expect(drafts).toBeGreaterThanOrEqual(0);
		// Drafts is wider than deletion, so it sits above it.
		expect(drafts).toBeLessThan(deletion);

		NOTEBOOK_ENTRY_SELECTS.forEach((rung, i) => {
			expect([rung.capability, 'deleted_at', /deleted_at/.test(rung.select)]).toEqual([
				rung.capability,
				'deleted_at',
				i <= deletion
			]);
			expect([rung.capability, 'removed_at', /removed_at/.test(rung.select)]).toEqual([
				rung.capability,
				'removed_at',
				i <= deletion
			]);
			expect([rung.capability, 'submitted_at', /submitted_at/.test(rung.select)]).toEqual([
				rung.capability,
				'submitted_at',
				i <= drafts
			]);
		});
	});

	it('the review ladder follows the same rule, and its pre-0116 rungs are untouched', () => {
		const selects = [...REVIEW_ENTRY_SELECTS];
		for (let i = 1; i < selects.length; i++) {
			expect([i, selects[i].length < selects[i - 1].length]).toEqual([i, true]);
		}
		// The widest carries every added column; the first rung that predates them
		// is its own constant, byte-identical.
		expect(selects[0]).toMatch(/deleted_at/);
		expect(selects[0]).toMatch(/removed_at/);
		expect(selects[0]).toMatch(/submitted_at/);
		expect(selects).toContain(REVIEW_ENTRY_FULL_SELECT);
		const oldest = selects.slice(selects.indexOf(REVIEW_ENTRY_FULL_SELECT));
		for (const select of oldest) {
			expect(select).not.toMatch(/deleted_at/);
			expect(select).not.toMatch(/removed_at/);
			expect(select).not.toMatch(/submitted_at/);
		}
	});

	it('the feed load filters on the rung’s OWN excludeDeleted, not a derived guess', () => {
		// The filter and the rung it belongs to live in two files, and the failure
		// -- a working notebook reported as missing -- has no error anywhere.
		//
		// It asked `capability === 'deletion'` until 0118 added a rung above that
		// one; the new rung carried `deleted_at` and silently stopped filtering on
		// it, putting deleted entries back in the feed. So the load must read the
		// rung's own flag, and tests/notebook-page-load.test.ts pins that the flag
		// and the column agree.
		const load = read('src/routes/notebook/+page.server.ts');
		expect(load).toMatch(/read\(rung\.select, rung\.excludeDeleted\)/);
		expect(load).not.toMatch(/rung\.capability === 'deletion'/);
		expect(load).toMatch(/excludeDeleted \? query\.is\('deleted_at', null\) : query/);
	});

	it('the class page falls back when a filter or a column is refused', () => {
		const layout = read('src/routes/classroom/[sectionId]/+layout.server.ts');
		expect(layout).toMatch(/\.is\('deleted_at', null\)/);
		// Widest first, and an UNFILTERED final read -- without which every card
		// reads "missing" on an older project with nothing raised anywhere. Named
		// by shape rather than by the exact line, so adding a rung to this ladder
		// (0118 added one) does not have to edit this assertion.
		expect(layout).toMatch(/if \(!withDrafts\.error\) return \{ rows: withDrafts\.data, drafts: true \}/);
		expect(layout).toMatch(/if \(!filtered\.error\) return \{ rows: filtered\.data, drafts: false \}/);
		expect(layout).toMatch(/const plain = await base\(/);
		expect(layout).toMatch(/return \{ rows: plain\.data, drafts: false \}/);
	});

	it('the review console refuses to open a deleted entry', () => {
		const console_ = read('src/routes/notebook/review/+page.svelte');
		expect(console_).toMatch(/if \(r\.deleted_at\) return \{ ok: false/);
	});
});


/* ===========================================================================
 * WHO REMOVED A DELETED ENTRY.
 *
 * SILENT WHEN WRONG, which is why it is here rather than left to a browser
 * pass. The staff Deleted section on /notebook/review/student/[email] lists
 * student-deleted and staff-deleted entries TOGETHER -- the payload carries no
 * `deleted_by` filter, deliberately, because a manager may restore either --
 * and its heading used to say "Entries {studentName} removed from this
 * notebook" over all of them. Nothing about that reads as broken: an
 * instructor simply believes a student threw away work that the instructor's
 * own colleague deleted, and no screenshot, type check or render assertion
 * about presence would ever say so.
 *
 * The two sentences are each other's POSITIVE CONTROL: asserting only that
 * "staff" appears somewhere would pass on a component that printed "staff" for
 * every row, so both are checked on the same fixture and required to DIFFER.
 * ======================================================================== */

describe('deletedEntryActor names an actor only from ids the caller already holds', () => {
	const STUDENT = 'u-student';
	const VIEWER = 'u-viewer';
	const OTHER = 'u-other-staff';

	it('the student themselves', () => {
		expect(deletedEntryActor(STUDENT, STUDENT, VIEWER)).toBe('student');
	});

	it('the viewer, the one other id resolved (the admin log rule)', () => {
		expect(deletedEntryActor(VIEWER, STUDENT, VIEWER)).toBe('viewer');
	});

	it('anybody else is staff, and stays a bare uuid', () => {
		expect(deletedEntryActor(OTHER, STUDENT, VIEWER)).toBe('staff');
		// The uuid is never in the answer: this resolves no name and must not
		// start, or the page gains a read of other people's rows.
		expect(deletedEntryActorName('staff', 'Ana Reyes')).not.toContain(OTHER);
	});

	it('null is unknown, NOT staff -- 0116 nulls it when the account goes', () => {
		expect(deletedEntryActor(null, STUDENT, VIEWER)).toBe('unknown');
		expect(deletedEntryActor(undefined, STUDENT, VIEWER)).toBe('unknown');
	});

	it('a student with no account yet cannot be credited with a removal', () => {
		// user_id null is an ordinary state (0094: on a roster, never signed in).
		// Matching null against null would name them for every staff removal.
		expect(deletedEntryActor(OTHER, null, VIEWER)).toBe('staff');
		expect(deletedEntryActor(OTHER, null, null)).toBe('staff');
	});

	it('the student is checked before the viewer, so the answer is total', () => {
		expect(deletedEntryActor(STUDENT, STUDENT, STUDENT)).toBe('student');
	});
});

describe('the staff Deleted section says who removed each row', () => {
	const deleted = (over: Partial<NotebookDeletedEntry> = {}): NotebookDeletedEntry => ({
		id: 'd-1',
		custom_label: 'Old sketch',
		session: null,
		upload_timestamp: '2026-02-05T13:00:00Z',
		deleted_at: '2026-02-06T09:15:00Z',
		...over
	});

	/** Both kinds on ONE fixture, exactly as the real payload delivers them. */
	function zone(): string {
		return render(NotebookDeletedZone, {
			props: {
				entries: [
					deleted({ id: 'by-student', custom_label: 'Wrong units', deleted_by: 'u-student' }),
					deleted({ id: 'by-staff', custom_label: 'Duplicate page', deleted_by: 'u-other' }),
					deleted({ id: 'by-viewer', custom_label: 'Blurred shot', deleted_by: 'u-viewer' }),
					deleted({ id: 'by-nobody', custom_label: 'Bench notes', deleted_by: null })
				],
				studentName: 'Ana Reyes',
				studentUserId: 'u-student',
				viewerId: 'u-viewer'
			} as never
		}).body;
	}

	/** The line for one row, so a claim about it cannot be satisfied by another. */
	function lineFor(label: string): string {
		const body = zone();
		const at = body.indexOf(label);
		expect(at, `${label} is not in the rendered zone at all`).toBeGreaterThan(-1);
		const meta = body.indexOf('Deleted by', at);
		expect(meta, `${label} has no attribution line after it`).toBeGreaterThan(-1);
		return body.slice(meta, body.indexOf('</span', meta));
	}

	it('a student-deleted row names the student', () => {
		expect(lineFor('Wrong units')).toContain('Ana Reyes');
	});

	it('a staff-deleted row does NOT name the student', () => {
		const line = lineFor('Duplicate page');
		expect(line).toContain('staff');
		expect(line, 'a staff removal is being attributed to the student').not.toContain('Ana Reyes');
	});

	it('the two sentences differ -- each is the other\'s positive control', () => {
		expect(lineFor('Wrong units')).not.toBe(lineFor('Duplicate page'));
	});

	it("the viewer's own removal reads 'you', and nothing else does", () => {
		expect(lineFor('Blurred shot')).toContain('you');
		expect(lineFor('Wrong units')).not.toContain('you');
		expect(lineFor('Duplicate page')).not.toContain('you');
	});

	it('a null actor is not attributed to anyone', () => {
		const line = lineFor('Bench notes');
		expect(line).not.toContain('Ana Reyes');
		expect(line).not.toContain('staff');
	});

	it('no actor uuid reaches the page', () => {
		const body = zone();
		for (const id of ['u-student', 'u-other', 'u-viewer']) {
			expect(body, `${id} is being rendered; this surface resolves no uuid`).not.toContain(id);
		}
	});

	it('the heading no longer makes one claim over a mixed list', () => {
		// The defect exactly: a section-level sentence naming the student, above
		// rows that are half somebody else's removals.
		const heading = zone().split('<ul')[0];
		expect(heading).not.toContain('Ana Reyes');
	});

	it('every row still carries its Restore control, whoever removed it', () => {
		const body = render(NotebookDeletedZone, {
			props: {
				entries: [
					deleted({ id: 'by-student', deleted_by: 'u-student' }),
					deleted({ id: 'by-staff', custom_label: 'Other', deleted_by: 'u-other' })
				],
				studentName: 'Ana Reyes',
				studentUserId: 'u-student',
				viewerId: 'u-viewer',
				restoreEntry: async () => ({ ok: true as const })
			} as never
		}).body;
		// Attribution is a SENTENCE, never a gate: the RPC's own
		// classroom_manages_section / notebook_manages_student check is what
		// decides who may restore what.
		expect(body.match(/data-testid="staff-restore-entry"/g)?.length).toBe(2);
	});

	it('an omitted restoreEntry still removes every control (absence is the mechanism)', () => {
		const body = render(NotebookDeletedZone, {
			props: {
				entries: [deleted({ deleted_by: 'u-student' })],
				studentName: 'Ana Reyes',
				studentUserId: 'u-student',
				viewerId: 'u-viewer'
			} as never
		}).body;
		expect(body).not.toContain('staff-restore-entry');
		// The positive control for that absence: the row itself is still there.
		expect(body).toContain('staff-deleted-meta');
	});
});

/* ===========================================================================
 * THE RETURN LINK CARRIES THE SECTION.
 *
 * /notebook/review reads `?section=` and NOTHING ELSE off the URL (its own
 * load validates the id against the viewer's sections and falls back to the
 * default), so this is the whole of what a way back can preserve. Both
 * directions are asserted: an id present must reach the href, and an absent
 * one must not invent a query string.
 * ======================================================================== */

describe('StudentReviewBackStrip', () => {
	function strip(sectionId: string | null): string {
		return render(StudentReviewBackStrip, {
			props: { displayName: 'Ana Reyes', email: 'ana@boscotech.net', sectionId } as never
		}).body;
	}

	it('carries the section it was given', () => {
		expect(strip('sec-abc')).toContain('href="/notebook/review?section=sec-abc"');
	});

	it('a section that needs escaping is encoded, never pasted', () => {
		expect(strip('a b&c')).toContain('href="/notebook/review?section=a%20b%26c"');
	});

	it('no section is the bare link this always had, not an empty query', () => {
		const body = strip(null);
		expect(body).toContain('href="/notebook/review"');
		expect(body).not.toContain('?section=');
	});

	it('defaults to the bare link when the prop is not passed at all', () => {
		const body = render(StudentReviewBackStrip, {
			props: { displayName: null, email: 'ana@boscotech.net' } as never
		}).body;
		expect(body).toContain('href="/notebook/review"');
	});
});
