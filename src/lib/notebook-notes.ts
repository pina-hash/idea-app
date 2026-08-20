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

/** One run of inline text. The absent-means-off flags keep stored docs small. */
export interface NoteInline {
	text: string;
	bold?: true;
	italic?: true;
	/** Already scheme-checked by `safeHref` at normalization AND at render. */
	href?: string;
}

export type NoteBlock =
	| { type: 'p'; runs: NoteInline[] }
	/** Each item is its own run list; nested lists flatten into their parent. */
	| { type: 'ul'; items: NoteInline[][] }
	| { type: 'ol'; items: NoteInline[][] };

/** A whole note: an ordered list of blocks. */
export type NoteDoc = NoteBlock[];

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
	/** When it last changed, or null if it never has. */
	editedAt: string | null;
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

/** Every run in a block, whatever kind it is. */
function blockRuns(block: NoteBlock): NoteInline[][] {
	return block.type === 'p' ? [block.runs] : block.items;
}

/** The note as plain text: one line per block or list item. */
export function docText(doc: NoteDoc): string {
	const lines: string[] = [];
	for (const block of doc) {
		for (const runs of blockRuns(block)) {
			lines.push(runs.map((r) => r.text).join(''));
		}
	}
	return lines.join('\n').trim();
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

/** Stored doc -> the editor's own document, for opening an existing note. */
export function docToTiptap(doc: NoteDoc): TiptapNode {
	const content: TiptapNode[] = doc.map((block) => {
		if (block.type === 'p') return paragraph(block.runs);
		return {
			type: block.type === 'ul' ? 'bulletList' : 'orderedList',
			content: block.items.map((item) => ({
				type: 'listItem',
				content: [paragraph(item)]
			}))
		};
	});
	return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
