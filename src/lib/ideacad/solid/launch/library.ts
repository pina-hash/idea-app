// src/lib/ideacad/solid/launch/library.ts
//
// THE LAUNCH PAGE'S PURE LAYER: what a row IS once it leaves the database, and
// how the list is narrowed, ordered and grouped. No browser, no Supabase, no
// Svelte, so `tests/ideacad-solid-launch-library.test.ts` can pin every rule
// with no mount.
//
// A ROW IS NORMALISED ON THE WAY IN, BECAUSE THE DEPLOYMENT MAY SIT BETWEEN
// 0216 AND 0217. `ideacad_direct_documents` gained folderId, tags, thumbnail,
// featureCount, format, canTrash and createdAt in 0217; before it is applied
// the same RPC answers without them, and a launch page that read `row.tags`
// off such a row would throw on its first `.map`. `normalizeDocument` gives
// every missing field the value that is TRUE of that deployment -- no folder,
// no tags, nothing trashable -- rather than a guess, which is the select-ladder
// rule from CLAUDE.md applied to an RPC's shape.
//
// FOLDERS AND TAGS ARE THE OWNER'S FILING. 0217 projects `d.folder_id` on
// every row, so a shared document carries ITS OWNER'S folder id, which is no
// folder of the viewer's. `folderNameOf` resolves an id only against the
// viewer's own folder list, so a foreign id resolves to nothing rather than to
// a wrong name.

export interface LaunchDocument {
	id: string; title: string; itemId: string | null; ownerEmail: string; isOwn: boolean;
	updatedAt: string; createdAt: string; archivedAt: string | null;
	canWrite: boolean; canArchive: boolean; canTrash: boolean;
	bodyCount: number; featureCount: number; role: string;
	folderId: string | null; tags: string[]; thumbnail: string | null; format: string | null;
}
export interface TrashedDocument {
	id: string; title: string; deletedAt: string; purgeAt: string; updatedAt: string;
	folderId: string | null; tags: string[]; thumbnail: string | null; bodyCount: number; featureCount: number;
}
export interface LaunchFolder { id: string; name: string; createdAt: string; documentCount: number }

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;
const tags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t !== '') : []);

/** One row of `ideacad_direct_documents`, from 0216's shape or 0217's. */
export function normalizeDocument(raw: unknown): LaunchDocument {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const updatedAt = str(r.updatedAt);
	return {
		id: str(r.id), title: str(r.title, 'Untitled model'), itemId: strOrNull(r.itemId), ownerEmail: str(r.ownerEmail),
		isOwn: bool(r.isOwn), updatedAt, createdAt: str(r.createdAt, updatedAt), archivedAt: strOrNull(r.archivedAt),
		canWrite: bool(r.canWrite), canArchive: bool(r.canArchive), canTrash: bool(r.canTrash),
		bodyCount: num(r.bodyCount), featureCount: num(r.featureCount), role: str(r.role, 'viewer'),
		folderId: strOrNull(r.folderId), tags: tags(r.tags), thumbnail: strOrNull(r.thumbnail), format: strOrNull(r.format)
	};
}
/** One row of `ideacad_direct_trash`. */
export function normalizeTrashed(raw: unknown): TrashedDocument {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		id: str(r.id), title: str(r.title, 'Untitled model'), deletedAt: str(r.deletedAt), purgeAt: str(r.purgeAt), updatedAt: str(r.updatedAt),
		folderId: strOrNull(r.folderId), tags: tags(r.tags), thumbnail: strOrNull(r.thumbnail), bodyCount: num(r.bodyCount), featureCount: num(r.featureCount)
	};
}
/** One row of `ideacad_direct_folders`, or the receipt of a create / rename. */
export function normalizeFolder(raw: unknown): LaunchFolder {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return { id: str(r.id), name: str(r.name, 'Folder'), createdAt: str(r.createdAt), documentCount: num(r.documentCount) };
}

// ---------------------------------------------------------------------------
// Search: every whitespace-separated token must appear in the title, the
// owner's address or a tag, case-insensitively. An empty query matches all.
// ---------------------------------------------------------------------------
export interface Searchable { title: string; ownerEmail?: string; tags?: string[] }
export function queryTokens(query: string): string[] {
	return query.toLowerCase().split(/\s+/).filter((t) => t !== '');
}
export function matchesQuery(row: Searchable, query: string): boolean {
	const tokens = queryTokens(query);
	if (tokens.length === 0) return true;
	const hay = [row.title, row.ownerEmail ?? '', ...(row.tags ?? [])].join('\n').toLowerCase();
	return tokens.every((t) => hay.includes(t));
}
export const searchDocuments = <T extends Searchable>(rows: readonly T[], query: string): T[] => rows.filter((r) => matchesQuery(r, query));

// ---------------------------------------------------------------------------
// Sort. Every comparator ends on the id, so two rows that tie on the field --
// thirty copies of one assignment title, two documents saved in one
// transaction -- come back in the same order on every render.
// ---------------------------------------------------------------------------
export type LaunchSort = 'updated' | 'created' | 'title';
export const LAUNCH_SORTS: readonly LaunchSort[] = ['updated', 'created', 'title'];
export const LAUNCH_SORT_LABELS: Record<LaunchSort, string> = { updated: 'Last edited', created: 'Newest first', title: 'Title A to Z' };
export interface Sortable { id: string; title: string; updatedAt: string; createdAt?: string }
const stamp = (iso: string | undefined): number => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : 0; };
const byId = (a: Sortable, b: Sortable) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function sortDocuments<T extends Sortable>(rows: readonly T[], sort: LaunchSort): T[] {
	const out = [...rows];
	if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true }) || byId(a, b));
	else if (sort === 'created') out.sort((a, b) => stamp(b.createdAt ?? b.updatedAt) - stamp(a.createdAt ?? a.updatedAt) || byId(a, b));
	else out.sort((a, b) => stamp(b.updatedAt) - stamp(a.updatedAt) || byId(a, b));
	return out;
}

// ---------------------------------------------------------------------------
// Filter. `view` decides live against archived; `folderId` narrows to one of
// the viewer's folders (own rows only, since a folder is the owner's filing);
// `tag` narrows to rows carrying it; `owner` narrows to yours or others'.
// ---------------------------------------------------------------------------
export type LaunchView = 'live' | 'archived' | 'trash';
export type LaunchOwner = 'all' | 'mine' | 'others';
export interface LaunchFilter { view?: LaunchView; folderId?: string | null; tag?: string | null; owner?: LaunchOwner }
export function filterDocuments(rows: readonly LaunchDocument[], filter: LaunchFilter): LaunchDocument[] {
	const view = filter.view ?? 'live';
	if (view === 'trash') return []; // the trash is its own list (`ideacad_direct_trash`); no live row belongs in it
	return rows.filter((r) => {
		if (view === 'archived' ? r.archivedAt === null : r.archivedAt !== null) return false;
		if (filter.folderId && !(r.isOwn && r.folderId === filter.folderId)) return false;
		if (filter.tag && !r.tags.includes(filter.tag)) return false;
		if (filter.owner === 'mine' && !r.isOwn) return false;
		if (filter.owner === 'others' && r.isOwn) return false;
		return true;
	});
}

// ---------------------------------------------------------------------------
// Grouping. Four questions a reader asks of a card, answered by where it sits:
// is it mine, is it assignment work, is it a class's work I manage, is it
// something somebody shared with me. Archived rows are their own group under
// the Archived view and never mixed into a live group.
// ---------------------------------------------------------------------------
export type LaunchGroupKey = 'mine' | 'assignments' | 'managed' | 'shared' | 'archived';
export const LAUNCH_GROUP_LABELS: Record<LaunchGroupKey, string> = {
	mine: 'Your models', assignments: 'Assignment work', managed: 'Class work you manage', shared: 'Shared with you', archived: 'Archived'
};
const GROUP_ORDER: readonly LaunchGroupKey[] = ['mine', 'assignments', 'managed', 'shared', 'archived'];
export function groupKeyOf(row: LaunchDocument): LaunchGroupKey {
	if (row.archivedAt !== null) return 'archived';
	if (row.isOwn) return row.itemId ? 'assignments' : 'mine';
	return row.role === 'manager' ? 'managed' : 'shared';
}
export interface LaunchGroup { key: LaunchGroupKey; label: string; rows: LaunchDocument[] }
/** Only the groups that have rows, in a fixed order; row order inside a group is the caller's. */
export function groupDocuments(rows: readonly LaunchDocument[]): LaunchGroup[] {
	const buckets = new Map<LaunchGroupKey, LaunchDocument[]>();
	for (const r of rows) { const k = groupKeyOf(r); const list = buckets.get(k) ?? []; list.push(r); buckets.set(k, list); }
	return GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => ({ key: k, label: LAUNCH_GROUP_LABELS[k], rows: buckets.get(k)! }));
}

/** Every tag on the viewer's OWN rows, unique, sorted: the filter chips. */
export function collectTags(rows: readonly LaunchDocument[]): string[] {
	return [...new Set(rows.filter((r) => r.isOwn).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'en'));
}
/** The folder a row is filed in, resolved against the VIEWER's folders only. */
export function folderNameOf(row: { folderId: string | null; isOwn?: boolean }, folders: readonly LaunchFolder[]): string | null {
	if (!row.folderId || row.isOwn === false) return null;
	return folders.find((f) => f.id === row.folderId)?.name ?? null;
}
/** The word a card carries for the viewer's relationship to a row that is not theirs. */
export function roleWord(row: LaunchDocument): string | null {
	if (row.isOwn) return null;
	if (row.role === 'manager') return 'You manage';
	if (row.role === 'editor') return 'Shared, can edit';
	return 'Shared, view only';
}
/** Tags typed as one comma-separated line, cleaned the way 0217's `_ideacad_clean_tags` cleans them:
 *  trimmed, lower-cased, empties dropped, de-duplicated, sorted. The database still decides the caps. */
export function parseTagLine(line: string): string[] {
	return [...new Set(line.split(',').map((t) => t.trim().toLowerCase()).filter((t) => t !== ''))].sort((a, b) => a.localeCompare(b, 'en'));
}
