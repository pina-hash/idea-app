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
}

/**
 * Group revision rows into notes, in the order the notes were WRITTEN.
 *
 * Ordering is by the first revision's timestamp, so editing a note keeps its
 * place in the entry rather than jumping it to the end -- an entry added to
 * over weeks still reads as one chronological record.
 */
export function noteThreads(rows: NotebookNoteRow[]): NoteThread[] {
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
			revisions: ordered.length
		});
	}

	return threads.sort(
		(a, b) => a.createdAt.localeCompare(b.createdAt) || a.noteId.localeCompare(b.noteId)
	);
}

/**
 * Link schemes a note may carry. Checked at normalization AND again at
 * render: the renderer must stay safe for a doc that reached the database by
 * some other door.
 */
const SAFE_SCHEMES = ['http://', 'https://', 'mailto:'];

export function safeHref(href: string | undefined | null): string | null {
	const trimmed = (href ?? '').trim();
	if (!trimmed) return null;
	const lower = trimmed.toLowerCase();
	if (!SAFE_SCHEMES.some((s) => lower.startsWith(s))) return null;
	// A control character in a URL is only ever an attempt to smuggle a
	// scheme past the prefix check above.
	if ([...trimmed].some((c) => c.charCodeAt(0) <= 0x20 || c.charCodeAt(0) === 0x7f)) return null;
	return trimmed;
}

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

/** A ProseMirror-shaped node, loose enough for both directions. */
export interface TiptapNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	content?: TiptapNode[];
}

/**
 * Does an editor document contain any text at all?
 *
 * The editor is never empty structurally -- ProseMirror always holds at least
 * one paragraph -- so "is there anything to save" has to look at the text. The
 * server decides for real (normalizeNoteDoc refuses an empty note); this is
 * only what keeps the Save button honest while someone is typing.
 */
export function tiptapHasText(node: TiptapNode | null | undefined): boolean {
	if (!node || typeof node !== 'object') return false;
	if (typeof node.text === 'string' && node.text.trim() !== '') return true;
	return (node.content ?? []).some(tiptapHasText);
}

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
