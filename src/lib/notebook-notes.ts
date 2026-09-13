/**
 * Digital notebook, WRITTEN NOTES: the canonical document shape and the pure
 * helpers around it.
 *
 * Plain data + pure functions only (the notebook.ts / curriculum.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend.
 *
 * WHY A TYPED DOCUMENT RATHER THAN A BLOB OF HTML. A note is written by a
 * student and rendered back to an instructor, so it is exactly the shape of
 * content that must never be able to execute. Storing sanitized HTML and
 * rendering it with `{@html}` makes the sanitizer the only thing standing
 * between the two -- and this platform's own rule is that a boundary must not
 * depend on one layer remembering to run. So the editor's output is
 * NORMALIZED SERVER-SIDE (src/lib/server/notebook-notes.ts) into the small
 * closed shape below, stored as jsonb, and rendered by walking it with real
 * Svelte elements. There is no `{@html}` anywhere in the note path, so even a
 * bug in the normalizer -- or a note written straight into the RPC through
 * PostgREST, bypassing the route entirely -- can at worst store text that
 * renders as text.
 *
 * The shape is deliberately the whole feature scope and nothing more: bold,
 * italic, links, bulleted and numbered lists. It is not a block editor, and a
 * node type it does not name simply does not survive normalization.
 */

import { safeHref, tiptapHasText, type TiptapNode } from '$lib/rich-text';
import { itemParts, richDocText } from '$lib/rich-text-doc';
/**
 * THE GRID'S PURE MODULE, AND NEVER `$lib/notebook/grid` ITSELF. The index
 * re-exports `grid-node.ts`, which imports `@tiptap/core`; this module is
 * imported by `$lib/server/notebook-notes` -- the normalizer -- so reaching it
 * through the index would put ProseMirror in every server route that touches a
 * note. `grid-doc.ts` has no dependencies at all, which is the property that
 * makes it importable from both sides.
 */
import {
	GRID_NODE_NAME,
	gridTextLength,
	isNoteGrid,
	type NoteGrid
} from '$lib/notebook/grid/grid-doc';

/** One run of inline text. The absent-means-off flags keep stored docs small. */
export interface NoteInline {
	text: string;
	bold?: true;
	italic?: true;
	/** Already scheme-checked by `safeHref` at normalization AND at render. */
	href?: string;
}

/**
 * A bulleted or numbered list, at the top of a note or inside a list item.
 *
 * ONE SHAPE FOR BOTH POSITIONS (0122). A nested list is the same object a
 * top-level one is, which is what lets the gate, the projection and the
 * renderer each gain nesting as one recursive branch rather than a second
 * vocabulary.
 */
export interface NoteList {
	type: 'ul' | 'ol';
	items: NoteItem[];
}

/**
 * One list item: its own runs, then any sublists under it.
 *
 *     item := ( run | list )*
 *
 * `type` is a TOTAL discriminator per element -- a run cannot carry one, and
 * has not been able to since 0078 -- so every note stored before 0122 is
 * exactly this shape with no list in it. There is no legacy branch.
 *
 * A LIST ITEM STILL CANNOT HOLD TWO PARAGRAPHS, and that is deliberate rather
 * than unfinished. See the note on `listItems` in
 * $lib/server/rich-text-normalize.
 */
export type NoteItem = (NoteInline | NoteList)[];

/**
 * A SPREADSHEET GRID, the third block a note can hold (0210).
 *
 * RE-EXPORTED FROM `$lib/notebook/grid`, NEVER RESTATED. `grid-doc.ts` declared
 * the shape in ledger 0192 because the migration and the ProseMirror node both
 * needed it before this module could name it, and its own header says in so
 * many words that the producer bundle MOVES nothing and IMPORTS it. A second
 * declaration here would be two ideas of what a grid is, held apart by nothing,
 * with `_notebook_note_grid_len` mirroring only one of them.
 */
export type { NoteGrid };

export type NoteBlock = { type: 'p'; runs: NoteInline[] } | NoteList | NoteGrid;

/** A whole note: an ordered list of blocks. */
export type NoteDoc = NoteBlock[];

/**
 * How deep a note's list nesting may go: 0122's `_notebook_note_list_len` cap,
 * and therefore the deepest a stored note can be. Carried down by everything
 * that walks a note -- the projection, the editor round trip, the renderer --
 * so none of them can be the one that trusts the gate and recurses forever on
 * a document that reached the table another way.
 */
export const NOTE_LIST_MAX_DEPTH = 12;

/**
 * A generous ceiling on a note's PLAIN TEXT, not a formatting budget -- the
 * 200-character cap this replaces was the reason `custom_label` was being
 * used as note content in the first place. It exists so a single row cannot
 * be megabytes; nothing a student writes by hand will reach it.
 */
export const NOTE_MAX_CHARS = 20_000;

/** A notebook_entry_notes row (0078), as every surface selects it. */
export interface NotebookNoteRow {
	id: string;
	entry_id: string;
	/** The LOGICAL note's stable id: the id of its first revision. */
	note_id: string;
	revision: number;
	content: NoteDoc;
	created_at: string;
	/**
	 * When this revision last absorbed an autosave, or null if it never has
	 * (0129). `created_at` says when the revision was STARTED and a replacement
	 * never moves it, so the two together are what a history reads.
	 *
	 * OPTIONAL, and absence means what it means everywhere else in this file: a
	 * read from a narrower rung of the select ladder, where the column does not
	 * exist and no revision can have been replaced. Both read as "never
	 * changed", which is why every rung below the coalescing one keeps working.
	 */
	updated_at?: string | null;
	/**
	 * When this note was removed, or null (0119). Soft: the row survives, which
	 * is the only reason a restore can exist at all.
	 *
	 * STAMPED ON EVERY REVISION IN THE CHAIN, never only the head. A note is its
	 * whole `note_id` chain and which revision counts is a `max()` (0078), so
	 * marking one row would promote the revision beneath it and quietly put an
	 * older draft of the note back on screen. `noteThreads` filters on this
	 * field, so the chain rule is what lets that filter drop a whole thread.
	 *
	 * OPTIONAL, and absence means something different from null -- the same
	 * two-state rule `NotebookPhoto.removed_at` carries. `null` is a live note;
	 * `undefined` is a read from a narrower rung of the select ladder, where the
	 * column does not exist and nothing can have been deleted. Both read as
	 * live, which is why every rung below the history one keeps working.
	 */
	deleted_at?: string | null;
	/**
	 * Who removed it (0119), or null. The student themselves, or an instructor:
	 * only the first is restorable by the student -- `notebook_restore_note`
	 * refuses a staff-deleted note and says to ask their instructor -- so this is
	 * what a Restore control reads to know whether to offer itself.
	 */
	deleted_by?: string | null;
}

/**
 * One logical note: the revision that counts, plus the ones it replaced.
 *
 * Revisions are rows, never edits in place (0078), so "the note" is a derived
 * view over its chain -- the same derive-don't-store discipline the coin
 * balance and the contract status already use.
 */
export interface NoteThread {
	noteId: string;
	/** The highest revision: what the note says now. */
	current: NotebookNoteRow;
	/** Everything it replaced, newest superseded revision first. */
	history: NotebookNoteRow[];
	/** When the note was first written (revision 1). */
	createdAt: string;
	/** When a LATER REVISION was started, or null if there has never been one. */
	editedAt: string | null;
	/**
	 * When the note's text last changed at all (0129) -- the head's
	 * `updated_at` if an autosave has replaced it in place, and its
	 * `created_at` otherwise.
	 *
	 * KEPT APART FROM `editedAt`, because they answer different questions and
	 * coalescing is what made the difference visible. `editedAt` is "somebody
	 * made a new version of this", which is an event worth a line in a history;
	 * a replacement is the same version still being written, and reporting it
	 * as an edit is the noise this whole change exists to remove.
	 */
	changedAt: string;
	revisions: number;
	/**
	 * When the note was removed, or null (0119). Always null on a thread from
	 * `noteThreads`, which returns only live notes; it carries a real stamp only
	 * on one from `deletedNoteThreads`.
	 */
	deletedAt: string | null;
	/** Who removed it (0119), or null. See `NotebookNoteRow.deleted_by`. */
	deletedBy: string | null;
}

/**
 * Group revision rows into notes without asking whether they are live -- the
 * shared half of the two exported views below, so "what does this note say, and
 * what did it replace" is derived once and cannot drift between the live list
 * and the deleted one.
 */
function buildThreads(rows: NotebookNoteRow[]): NoteThread[] {
	const byNote = new Map<string, NotebookNoteRow[]>();
	for (const row of rows) {
		const list = byNote.get(row.note_id);
		if (list) list.push(row);
		else byNote.set(row.note_id, [row]);
	}

	const threads: NoteThread[] = [];
	for (const [noteId, revisions] of byNote) {
		const ordered = [...revisions].sort((a, b) => a.revision - b.revision);
		const current = ordered[ordered.length - 1];
		const root = ordered[0];
		threads.push({
			noteId,
			current,
			history: ordered.slice(0, -1).reverse(),
			createdAt: root.created_at,
			editedAt: ordered.length > 1 ? current.created_at : null,
			changedAt: current.updated_at ?? current.created_at,
			revisions: ordered.length,
			deletedAt: current.deleted_at ?? null,
			deletedBy: current.deleted_by ?? null
		});
	}

	return threads.sort(
		(a, b) => a.createdAt.localeCompare(b.createdAt) || a.noteId.localeCompare(b.noteId)
	);
}

/**
 * The entry's LIVE notes, in the order they were WRITTEN.
 *
 * Ordering is by the first revision's timestamp, so editing a note keeps its
 * place in the entry rather than jumping it to the end -- an entry added to
 * over weeks still reads as one chronological record.
 *
 * THE DELETED FILTER IS HERE, AT THE ONE FUNNEL, and that is the point (0119).
 * Every surface that renders, counts, previews, titles or copies an entry's
 * notes goes through this function -- EntryNotes, the folder counts and
 * previews, `entryTitle`, `entryPlainText` -- so one filter covers all of them
 * and a new consumer inherits it. The alternative, a `liveNotes()` every caller
 * remembers to apply, is exactly the second copy that quietly stops matching.
 *
 * A ROW WITH NO `deleted_at` FIELD AT ALL IS LIVE. That is a read from a
 * narrower rung of the select ladder, which cannot ask for a column that is not
 * there, and it is correct: nothing can have been deleted on a project with
 * nowhere to mark it.
 *
 * IT DROPS WHOLE THREADS, NOT ROWS, because deletion stamps every revision in
 * the chain (0119). Filtering here can therefore never leave a thread holding
 * only its older revisions, with revision N-1 promoted to `current` and
 * standing in for the note that was removed.
 */
export function noteThreads(rows: NotebookNoteRow[]): NoteThread[] {
	return buildThreads(rows.filter((r) => !r.deleted_at));
}

/**
 * The mirror of `noteThreads` (0119): the notes removed from this entry, for
 * the removed-notes disclosure on the student's own card and for the entry
 * history.
 *
 * KEPT BESIDE `noteThreads`, NEVER MERGED INTO IT, on the same rule
 * `removedPhotos` follows: `noteThreads` is what every surface renders an
 * entry's notes from, and a deleted note must never reappear there because a
 * caller forgot to filter twice.
 *
 * Each thread keeps its full revision history, which is what lets a restore
 * show the note as it actually read -- and its `deletedBy`, which is what says
 * whether the student can undo it themselves.
 */
export function deletedNoteThreads(rows: NotebookNoteRow[]): NoteThread[] {
	return buildThreads(rows.filter((r) => !!r.deleted_at));
}

/**
 * Link schemes a note may carry, and the check that enforces them -- at
 * normalization AND again at render, since the renderer must stay safe for a
 * doc that reached the database by some other door.
 *
 * MOVED to $lib/rich-text and re-exported here, so every existing importer is
 * untouched. It is the one security-relevant decision the whole rich-text path
 * makes (a typed document cannot express a script tag, so an href is the only
 * place hostile input has to go), and the classroom's item bodies need the
 * identical rule -- two copies is two places to fix.
 */
export { safeHref };

/**
 * The note as plain text: one line per block or list item, at every level.
 *
 * The walk is shared with the classroom's item bodies ($lib/rich-text-doc),
 * which is where the reasoning lives -- including why a sublist's items each
 * get their own line, and why the trim is SQL's rather than JavaScript's.
 */
export function docText(doc: NoteDoc): string {
	return richDocText(doc.flatMap(gridAsText), NOTE_LIST_MAX_DEPTH);
}

/**
 * A GRID'S CONTRIBUTION TO THE PLAIN-TEXT PROJECTION, AND WHY IT IS DONE HERE
 * RATHER THAN IN `richDocText`.
 *
 * `richDocText` is the MIRROR of `_classroom_doc_text` -- `CLAUDE.md` states
 * that in those words -- and `_classroom_doc_ok` refuses a grid outright, so a
 * grid arm added there would be a branch the SQL it mirrors does not have, dead
 * on the classroom side and mirroring nothing on this one. So the notebook
 * substitutes its grids for ordinary paragraphs on the way in and the shared
 * walk stays exactly the walk it was.
 *
 * A GRID WITH NO TEXT CONTRIBUTES NO BLOCK AT ALL, WHICH IS THE FLOOR AGREEING
 * WITH THE GATE RATHER THAN A TIDINESS DECISION. `0210`'s floor is unchanged
 * from `0125`: `v_total > 0`, where `v_total` is a sum of LENGTHS with no
 * separators in it, so a note holding two empty grids totals zero and is
 * refused. Mapped to an empty paragraph instead, this projection would answer
 * `"\n"` for that note -- not the empty string -- and `docIsEmpty` would say it
 * had content while the database refused it. Dropping the runless block is what
 * makes "some block contributed length" and "the projection is non-empty" the
 * same question, which is the question the gate asks.
 *
 * THE CELLS ARE JOINED WITH A SPACE, one line per grid. It is a projection for
 * reading -- a card preview, a summary, the emptiness test -- and not a
 * reconstruction of the table; `docLength` has never been the gate's own
 * arithmetic (it counts the newlines between blocks, which `v_total` does not),
 * and a grid does not change that either way.
 */
function gridAsText(block: NoteBlock): NoteBlock[] {
	if (!isNoteGrid(block)) return [block];
	if (gridTextLength(block) === 0) return [];
	const text = block.rows
		.map((row) => row.filter((cell) => cell !== '').join(' '))
		.filter((line) => line !== '')
		.join(' ');
	return [{ type: 'p', runs: [{ text }] }];
}

export function docIsEmpty(doc: NoteDoc | null | undefined): boolean {
	return !doc || doc.length === 0 || docText(doc) === '';
}

/** Total plain-text length, the quantity NOTE_MAX_CHARS caps. */
export function docLength(doc: NoteDoc): number {
	return docText(doc).length;
}

/** A one-line preview: the note's opening text, cut on a word boundary. */
export function docSummary(doc: NoteDoc, max = 70): string {
	const text = docText(doc).replace(/\s+/g, ' ').trim();
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const space = cut.lastIndexOf(' ');
	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

// ---------------------------------------------------------------------------
// Tiptap interop
//
// The editor speaks ProseMirror JSON; storage speaks the shape above. The
// INBOUND direction (editor -> stored doc) is the sanitizer and lives on the
// server. This is the outbound half -- seeding the editor from a stored doc --
// which is pure display and safe to ship to the client.
// ---------------------------------------------------------------------------

/**
 * The editor's own node shape, and "is there anything to save" -- both shared
 * with every other rich-text surface, both re-exported so this module's
 * importers never need to know they moved.
 */
export { tiptapHasText, type TiptapNode };

function runToTiptap(run: NoteInline): TiptapNode | null {
	if (!run.text) return null;
	const marks: TiptapNode['marks'] = [];
	if (run.bold) marks.push({ type: 'bold' });
	if (run.italic) marks.push({ type: 'italic' });
	const href = safeHref(run.href);
	if (href) marks.push({ type: 'link', attrs: { href } });
	return { type: 'text', text: run.text, ...(marks.length ? { marks } : {}) };
}

function paragraph(runs: NoteInline[]): TiptapNode {
	const content = runs.map(runToTiptap).filter((n): n is TiptapNode => n !== null);
	return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/**
 * One stored list -> the editor's own list, sublists included.
 *
 * A LIST ITEM IS `paragraph block*` IN THE EDITOR'S SCHEMA, so the item's own
 * runs are its paragraph and each sublist follows as a further block of the
 * same item -- which is exactly where the editor put the sublist that was
 * normalized into this shape. An item that holds only a sublist round-trips
 * as an EMPTY paragraph plus that list, which is the arrangement it came from.
 * Getting this wrong is invisible until someone reopens a note to edit it and
 * saves it back one level flatter than they wrote it.
 */
function listToTiptap(list: NoteList, depth: number): TiptapNode {
	return {
		type: list.type === 'ul' ? 'bulletList' : 'orderedList',
		content: list.items.map((item) => {
			const { runs, lists } = itemParts(item);
			return {
				type: 'listItem',
				content: [
					paragraph(runs),
					...(depth < NOTE_LIST_MAX_DEPTH ? lists.map((sub) => listToTiptap(sub, depth + 1)) : [])
				]
			};
		})
	};
}

/**
 * Stored doc -> the editor's own document, for opening an existing note.
 *
 * THE GRID ARM IS THE ONE THAT LOSES WORK IF IT IS FORGOTTEN, silently and in
 * the direction nobody looks. `NoteBlock` gained a grid, so without a branch
 * here a stored grid falls into the `else` and is handed to `listToTiptap`,
 * which reads `block.items` -- undefined -- and seeds the editor with an empty
 * list. The student reopens a note to add a sentence, sees their table gone,
 * and the next save writes the note WITHOUT it, because the editor's document
 * is what gets normalized. Nothing throws and nothing is reported.
 *
 * IT IS `GRID_NODE_NAME` AND THE `rows` ATTRIBUTE, WHICH IS THE NODE'S OWN
 * SHAPE. Spelled through the imported constant rather than the string
 * `'notebookGrid'` so the schema and this seed cannot drift; the attribute is a
 * real array here, because ProseMirror JSON is JSON -- the stringified form is
 * the DOM's and belongs only to `toDOM`/`parseDOM`.
 */
export function docToTiptap(doc: NoteDoc): TiptapNode {
	const content: TiptapNode[] = doc.map((block) =>
		block.type === 'p'
			? paragraph(block.runs)
			: isNoteGrid(block)
				? { type: GRID_NODE_NAME, attrs: { rows: block.rows } }
				: listToTiptap(block, 1)
	);
	return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
