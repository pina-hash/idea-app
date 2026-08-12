/**
 * Digital notebook, ORGANIZATION: folders, search, filtering, date grouping
 * and thumbnail selection.
 *
 * Plain data + pure functions only (the notebook.ts / curriculum.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend. Every rule about who may read
 * or file an entry lives in 0088's RLS and RPCs; nothing here re-implements
 * any of it -- this is the layer that decides what a student SEES, given rows
 * they were already allowed to have.
 *
 * SEARCH AND FILTERING ARE CLIENT-SIDE OVER THE WHOLE SET, deliberately, and
 * that is why the feed's "show older" is a RENDER limit rather than a query
 * limit. A student searching their notebook means all of it; a server-side
 * page size would silently scope "find the gearbox note" to whatever happened
 * to be loaded, which is worse than slow. The rows themselves are small --
 * metadata, note text, and photo ids, never image bytes, which come from the
 * proxy on demand and are already lazy -- so the cost that actually hurt was
 * rendering hundreds of full-width photos, which the collapsed view and the
 * render limit are what fix. Revisit if a single student's entry count reaches
 * the low thousands.
 */

import { docSummary, docText, noteThreads, type NoteDoc } from '$lib/notebook-notes';
import { entryTitle, orderedPhotos, photoPages, type NotebookEntry } from '$lib/notebook';

// ---------------------------------------------------------------------------
// 1. Folders
// ---------------------------------------------------------------------------

/**
 * The stored colour names, mirroring 0088's CHECK constraint exactly. The
 * database is the authority; this is the list the picker renders and the
 * theme maps to real colours, and the two must be edited together.
 */
export const FOLDER_COLORS = ['slate', 'gold', 'sage', 'clay', 'sky', 'plum'] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];

export const FOLDER_COLOR_LABELS: Record<FolderColor, string> = {
	slate: 'Slate',
	gold: 'Gold',
	sage: 'Sage',
	clay: 'Clay',
	sky: 'Sky',
	plum: 'Plum'
};

/** A notebook_folders row (0088), as every surface selects it. */
export interface NotebookFolder {
	id: string;
	name: string;
	color: FolderColor | null;
	created_at: string;
}

/** Folder names are capped by the table's own CHECK; mirrored for the input. */
export const FOLDER_NAME_MAX = 60;

export function isFolderColor(value: unknown): value is FolderColor {
	return typeof value === 'string' && (FOLDER_COLORS as readonly string[]).includes(value);
}

/**
 * Alphabetical, case-insensitively. There is deliberately no manual folder
 * order: a stored sort position needs a way to change it, and drag-to-reorder
 * is real work for something a name and a colour already solve at this scale.
 */
export function foldersInOrder(folders: NotebookFolder[]): NotebookFolder[] {
	return [...folders].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
	);
}

export function folderById(folders: NotebookFolder[], id: string | null): NotebookFolder | null {
	if (!id) return null;
	return folders.find((f) => f.id === id) ?? null;
}

/**
 * The name to show for whatever an entry is filed under, or null when it is
 * unfiled. Falls back to a plain placeholder rather than a blank when the row
 * is missing -- which is a real state for STAFF, since 0088 only lets them see
 * a folder through an entry, and a load that fetched entries without folders
 * would otherwise print nothing at all.
 */
export function folderLabel(folders: NotebookFolder[], id: string | null): string | null {
	if (!id) return null;
	return folderById(folders, id)?.name ?? 'A folder';
}

/**
 * Which folder to preselect for a NEW entry: whatever the student filed last.
 * Filing several entries in a row into the same folder is the common case --
 * a lab period produces four pages of one thing -- and defaulting to the last
 * one turns that into no clicks instead of four.
 *
 * `entries` is expected newest-first (which is how both the load and
 * newestFirst order it); an unfiled most-recent entry correctly yields null,
 * because "I stopped filing" is as real an intent as "I filed".
 */
export function suggestedFolder(entries: NotebookEntry[]): string | null {
	return entries[0]?.folder_id ?? null;
}

/**
 * The folder transports NotebookView injects, mirroring the note/photo split
 * it already uses: the real page points these at 0088's RPCs on the browser
 * client (the ReviewConsole convention), and a harness answers them in memory.
 *
 * Each resolves rather than throws, because every failure they can carry is
 * one a student needs shown -- a duplicate folder name, a folder somebody
 * deleted in another tab -- and the RPCs' own messages are written to be read.
 */
export type FolderResult = { ok: true } | { ok: false; error: string };

export interface FolderInput {
	/** null creates; a set id renames/recolours that folder. */
	id: string | null;
	name: string;
	color: FolderColor | null;
}

export interface FolderTransports {
	saveFolder: (input: FolderInput) => Promise<FolderResult>;
	deleteFolder: (id: string) => Promise<FolderResult>;
	/** One entry or many: notebook_move_entries takes an array either way. */
	moveEntries: (entryIds: string[], folderId: string | null) => Promise<FolderResult>;
}

// ---------------------------------------------------------------------------
// 2. Selection: which folder is being viewed
// ---------------------------------------------------------------------------

/**
 * The rail's selection. A folder id views that folder, `'unfiled'` views what
 * has no folder, and `'all'` views everything -- three distinct states rather
 * than a nullable id, because "unfiled" is a place a student goes on purpose
 * and must not collide with "no filter".
 */
export type FolderSelection = 'all' | 'unfiled' | (string & {});

export function inSelection(entry: NotebookEntry, selection: FolderSelection): boolean {
	if (selection === 'all') return true;
	if (selection === 'unfiled') return entry.folder_id === null;
	return entry.folder_id === selection;
}

/** Per-folder entry counts, plus the two pseudo-folders the rail also shows. */
export function folderCounts(entries: NotebookEntry[]): Map<FolderSelection, number> {
	const counts = new Map<FolderSelection, number>();
	counts.set('all', entries.length);
	counts.set('unfiled', 0);
	for (const entry of entries) {
		const key: FolderSelection = entry.folder_id ?? 'unfiled';
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

// ---------------------------------------------------------------------------
// 3. Search + filters
// ---------------------------------------------------------------------------

/**
 * Everything about an entry a search should be able to find it by: its
 * displayed title, its own typed title, its check-in's label, every word of
 * every CURRENT note revision, and the photo filenames.
 *
 * Superseded note revisions are deliberately excluded. Searching should find
 * the notebook as it reads now; an entry surfacing for words the student
 * removed three edits ago -- and then not containing them -- reads as a bug.
 */
export function entrySearchText(entry: NotebookEntry): string {
	const parts: string[] = [entryTitle(entry)];
	if (entry.custom_label) parts.push(entry.custom_label);
	if (entry.session?.session_label) parts.push(entry.session.session_label);
	for (const thread of noteThreads(entry.notes ?? [])) {
		parts.push(docText(thread.current.content));
	}
	for (const photo of entry.photos) {
		if (photo.original_filename) parts.push(photo.original_filename);
	}
	return parts.join(' \n ').toLowerCase();
}

/**
 * Every whitespace-separated term must appear somewhere in the entry (AND, not
 * OR): typing more words should narrow a search, which is what anyone expects
 * of a search box and what makes it usable once a notebook is large enough to
 * need one.
 */
export function matchesSearch(entry: NotebookEntry, query: string): boolean {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = entrySearchText(entry);
	return terms.every((t) => haystack.includes(t));
}

/**
 * The toggle chips. Each is a plain predicate over one entry and they combine
 * with AND, so "Photos" plus "Notes" means entries carrying both -- narrowing,
 * consistently, exactly like the search terms above.
 */
export type EntryFilterId = 'attention' | 'photos' | 'notes' | 'checkins';

export const ENTRY_FILTERS: { id: EntryFilterId; label: string; hint: string }[] = [
	{
		id: 'attention',
		label: 'Needs attention',
		hint: 'Flagged by an instructor, or waiting on their review'
	},
	{ id: 'photos', label: 'Has photos', hint: 'Entries with at least one page photographed' },
	{ id: 'notes', label: 'Has notes', hint: 'Entries you have written something on' },
	{ id: 'checkins', label: 'Check-ins', hint: 'Entries filed against a scheduled check-in' }
];

const FILTER_PREDICATES: Record<EntryFilterId, (e: NotebookEntry) => boolean> = {
	attention: (e) => e.status === 'flagged' || e.status === 'pending_review',
	photos: (e) => e.photos.length > 0,
	notes: (e) => (e.notes?.length ?? 0) > 0,
	checkins: (e) => e.session_id !== null
};

export interface EntryQuery {
	selection: FolderSelection;
	search: string;
	filters: EntryFilterId[];
}

export const EMPTY_QUERY: EntryQuery = { selection: 'all', search: '', filters: [] };

/** True when the query would narrow anything -- what "Clear" is offered for. */
export function queryIsActive(query: EntryQuery): boolean {
	return query.selection !== 'all' || query.search.trim() !== '' || query.filters.length > 0;
}

/**
 * Folder, then chips, then search. Order is immaterial to the result (every
 * step is a conjunction) and chosen for cost: the cheap identity checks run
 * before the one that walks every note's text.
 */
export function applyQuery(entries: NotebookEntry[], query: EntryQuery): NotebookEntry[] {
	return entries.filter(
		(e) =>
			inSelection(e, query.selection) &&
			query.filters.every((f) => FILTER_PREDICATES[f](e)) &&
			matchesSearch(e, query.search)
	);
}

// ---------------------------------------------------------------------------
// 4. Date grouping
// ---------------------------------------------------------------------------

export interface EntryGroup {
	/** Stable across renders, so a keyed each block does not thrash. */
	key: string;
	label: string;
	entries: NotebookEntry[];
}

const DAY_MS = 86_400_000;

/** Local midnight, since these buckets are about the student's own calendar. */
function startOfDay(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Which bucket a timestamp lands in, as a (key, label) pair.
 *
 * Buckets are coarse on purpose and get coarser with age: Today and Yesterday
 * by name, then this week and last week, then one per calendar month, then a
 * single "Older". A student scanning for something from October wants the
 * month, not thirty date headings.
 */
export function groupKeyFor(iso: string, now: Date): { key: string; label: string } {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return { key: 'unknown', label: 'Undated' };

	const days = Math.floor((startOfDay(now) - startOfDay(then)) / DAY_MS);
	if (days <= 0) return { key: 'today', label: 'Today' };
	if (days === 1) return { key: 'yesterday', label: 'Yesterday' };
	if (days < 7) return { key: 'this-week', label: 'Earlier this week' };
	if (days < 14) return { key: 'last-week', label: 'Last week' };

	const sameYear = then.getFullYear() === now.getFullYear();
	// A month bucket is only meaningful within about a year; past that the
	// months repeat and everything folds into one tail.
	if (days < 330) {
		return {
			key: `m-${then.getFullYear()}-${then.getMonth()}`,
			label: then.toLocaleDateString(undefined, {
				month: 'long',
				...(sameYear ? {} : { year: 'numeric' })
			})
		};
	}
	return { key: 'older', label: 'Older' };
}

/**
 * Bucket an ALREADY-ORDERED list, preserving its order within and between
 * groups. It never re-sorts: the feed's order is newestFirst's business, and
 * grouping that also sorted would be a second, silently competing opinion
 * about it.
 */
export function groupByDate(entries: NotebookEntry[], now: Date = new Date()): EntryGroup[] {
	const groups: EntryGroup[] = [];
	for (const entry of entries) {
		const { key, label } = groupKeyFor(entry.upload_timestamp, now);
		const last = groups[groups.length - 1];
		if (last && last.key === key) last.entries.push(entry);
		else groups.push({ key, label, entries: [entry] });
	}
	return groups;
}

// ---------------------------------------------------------------------------
// 5. Thumbnails
// ---------------------------------------------------------------------------

/**
 * What a collapsed entry shows next to its title.
 *
 * A photo entry shows its first page -- the corrected version when there is
 * one, which is what the expanded view shows too, so the tile and the entry
 * agree. A note-only entry has NO image and never will, so rather than a
 * generic icon it gets its own opening words rendered as a tiny page: it is
 * genuinely representative of the content, costs no storage and no request,
 * and is how the note is told apart from the note above it at a glance.
 */
export type EntryThumbKind =
	| { kind: 'photo'; photoId: string }
	| { kind: 'note'; text: string }
	| { kind: 'empty' };

/** Chosen to fill a small tile at readable size without wrapping forever. */
const THUMB_TEXT_CHARS = 120;

export function entryThumb(entry: NotebookEntry): EntryThumbKind {
	const pages = photoPages(orderedPhotos(entry));
	const first = pages[0];
	if (first) {
		const photo = first.enhanced ?? first.original;
		if (photo) return { kind: 'photo', photoId: photo.id };
	}
	const thread = noteThreads(entry.notes ?? [])[0];
	if (thread) {
		const text = docSummary(thread.current.content, THUMB_TEXT_CHARS);
		if (text) return { kind: 'note', text };
	}
	return { kind: 'empty' };
}

/**
 * The thumbnail-sized variant of the photo proxy.
 *
 * A collapsed feed asks for one image per entry, and pointing those at the
 * full-size route would pull several megabytes each to paint a tile a couple
 * of centimetres across -- the exact cost this whole view exists to remove.
 * The route resolves the smaller rendition itself; see its own comment for why
 * that is not a Drive link.
 */
export function photoThumbSrc(photoId: string): string {
	return `/api/notebook/photo/${encodeURIComponent(photoId)}?size=thumb`;
}

/**
 * A one-line preview under a collapsed entry's title: what the entry says, so
 * the tab is legible without expanding it. Photo entries have nothing to
 * quote, and a made-up line would be worse than none.
 */
export function entryPreview(entry: NotebookEntry, max = 90): string | null {
	const thread = noteThreads(entry.notes ?? [])[0];
	if (!thread) return null;
	const text = docSummary(thread.current.content as NoteDoc, max);
	return text || null;
}
