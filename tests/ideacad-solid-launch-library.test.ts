// tests/ideacad-solid-launch-library.test.ts
//
// THE LAUNCH PAGE'S PURE LAYER: normalisation of a row from either 0216's or
// 0217's shape, search, sort, filter and grouping. Every expected value is
// hand-written data; the ordering cases are built to TIE on the sorted field
// so the id tie-break is the only thing that can separate them, and every
// exclusion is paired with a positive control on the same fixture.
import { describe, expect, it } from 'vitest';
import {
	collectTags, filterDocuments, folderNameOf, groupDocuments, groupKeyOf, LAUNCH_GROUP_LABELS, LAUNCH_SORTS, LAUNCH_SORT_LABELS,
	matchesQuery, normalizeDocument, normalizeFolder, normalizeTrashed, parseTagLine, queryTokens, roleWord, searchDocuments, sortDocuments,
	type LaunchDocument, type LaunchFolder
} from '../src/lib/ideacad/solid/launch/library';

const doc = (over: Partial<LaunchDocument>): LaunchDocument => ({
	id: 'd', title: 'T', itemId: null, ownerEmail: 'me@boscotech.net', isOwn: true, updatedAt: '2026-09-20T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null,
	canWrite: true, canArchive: true, canTrash: true, bodyCount: 1, featureCount: 2, role: 'owner', folderId: null, tags: [], thumbnail: null, format: 'ideacad-solid-v2', ...over
});
const FOLDERS: LaunchFolder[] = [{ id: 'f1', name: 'Gears', createdAt: '2026-08-01T00:00:00.000Z', documentCount: 1 }];

describe('normalisation: a row from before 0217 gets the values that are TRUE of that deployment', () => {
	it('fills folderId, tags, thumbnail, featureCount, format, canTrash and createdAt for a 0216-shaped row', () => {
		const row = normalizeDocument({ id: 'a', title: 'Old', itemId: null, ownerEmail: 'x@boscotech.net', isOwn: true, updatedAt: '2026-09-01T00:00:00.000Z', archivedAt: null, canWrite: true, canArchive: true, bodyCount: 2, role: 'owner' });
		expect(row).toEqual({ id: 'a', title: 'Old', itemId: null, ownerEmail: 'x@boscotech.net', isOwn: true, updatedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', archivedAt: null, canWrite: true, canArchive: true, canTrash: false, bodyCount: 2, featureCount: 0, role: 'owner', folderId: null, tags: [], thumbnail: null, format: null });
	});
	it('passes a 0217 row through unchanged and drops a non-string tag (positive control on the shape)', () => {
		const full = { id: 'b', title: 'New', itemId: 'i', ownerEmail: 'y@boscotech.net', isOwn: false, updatedAt: '2026-09-02T00:00:00.000Z', createdAt: '2026-08-02T00:00:00.000Z', archivedAt: '2026-09-03T00:00:00.000Z', canWrite: false, canArchive: true, canTrash: false, bodyCount: 3, featureCount: 7, role: 'manager', folderId: 'f', tags: ['gear', 5, 'v2'], thumbnail: 'data:image/png;base64,AA==', format: 'ideacad-solid-v2' };
		expect(normalizeDocument(full)).toEqual({ ...full, tags: ['gear', 'v2'] });
	});
	it('never throws on garbage, and a trashed row and a folder normalise the same way', () => {
		expect(normalizeDocument(null).title).toBe('Untitled model');
		expect(normalizeTrashed({ id: 't', title: 'X', deletedAt: '2026-09-01T00:00:00.000Z', purgeAt: '2026-10-01T00:00:00.000Z' })).toEqual({ id: 't', title: 'X', deletedAt: '2026-09-01T00:00:00.000Z', purgeAt: '2026-10-01T00:00:00.000Z', updatedAt: '', folderId: null, tags: [], thumbnail: null, bodyCount: 0, featureCount: 0 });
		expect(normalizeFolder({ id: 'f', name: 'Gears', createdAt: 'c', documentCount: 4 })).toEqual({ id: 'f', name: 'Gears', createdAt: 'c', documentCount: 4 });
	});
});

describe('search: every token must land in the title, the owner or a tag', () => {
	const rows = [doc({ id: '1', title: 'Spur gear', tags: ['v2'] }), doc({ id: '2', title: 'Bracket', ownerEmail: 'ana.reyes@boscotech.net', isOwn: false }), doc({ id: '3', title: 'Roller', tags: ['intake', 'gear'] })];
	it('matches case-insensitively across the three fields, and an empty query matches everything', () => {
		expect(queryTokens('  Gear  V2 ')).toEqual(['gear', 'v2']);
		expect(searchDocuments(rows, 'GEAR').map((r) => r.id)).toEqual(['1', '3']);
		expect(searchDocuments(rows, 'reyes').map((r) => r.id)).toEqual(['2']);
		expect(searchDocuments(rows, 'gear v2').map((r) => r.id)).toEqual(['1']);
		expect(searchDocuments(rows, '').map((r) => r.id)).toEqual(['1', '2', '3']);
		expect(searchDocuments(rows, 'nothing-here')).toEqual([]);
	});
	it('a row with no owner or tags still searches by title', () => {
		expect(matchesQuery({ title: 'Lone' }, 'lone')).toBe(true);
		expect(matchesQuery({ title: 'Lone' }, 'gear')).toBe(false);
	});
});

describe('sort: three orders, each ending on the id so ties never reshuffle', () => {
	const a = doc({ id: 'b', title: 'Blade CAD 01', updatedAt: '2026-09-20T10:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' });
	const b = doc({ id: 'a', title: 'Blade CAD 01', updatedAt: '2026-09-20T10:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' });
	const c = doc({ id: 'c', title: 'blade cad 2', updatedAt: '2026-09-21T10:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' });
	it('exposes the three sorts with a label each', () => {
		expect(LAUNCH_SORTS).toEqual(['updated', 'created', 'title']);
		for (const s of LAUNCH_SORTS) expect(LAUNCH_SORT_LABELS[s]).toMatch(/\S/);
	});
	it('updated: newest edit first, then id; created: newest creation first; title: A to Z, case-blind, numeric, then id', () => {
		expect(sortDocuments([a, b, c], 'updated').map((r) => r.id)).toEqual(['c', 'a', 'b']);
		expect(sortDocuments([a, b, c], 'created').map((r) => r.id)).toEqual(['a', 'b', 'c']);
		expect(sortDocuments([c, a, b], 'title').map((r) => r.id)).toEqual(['a', 'b', 'c']);
		expect(sortDocuments([doc({ id: 'x', title: 'Part 10' }), doc({ id: 'y', title: 'Part 9' })], 'title').map((r) => r.title)).toEqual(['Part 9', 'Part 10']);
	});
	it('does not mutate its input', () => { const input = [a, b, c]; sortDocuments(input, 'title'); expect(input.map((r) => r.id)).toEqual(['b', 'a', 'c']); });
});

describe('filter: view, folder, tag and owner, each paired with its positive control', () => {
	const rows = [
		doc({ id: 'live', folderId: 'f1', tags: ['gear'] }),
		doc({ id: 'archived', archivedAt: '2026-09-10T00:00:00.000Z', folderId: 'f1' }),
		doc({ id: 'foreign', isOwn: false, role: 'viewer', folderId: 'f1', tags: ['gear'] }),
		doc({ id: 'unfiled', tags: ['bracket'] })
	];
	it('live excludes archived rows and archived excludes live ones; the trash view has no live rows at all', () => {
		expect(filterDocuments(rows, { view: 'live' }).map((r) => r.id)).toEqual(['live', 'foreign', 'unfiled']);
		expect(filterDocuments(rows, { view: 'archived' }).map((r) => r.id)).toEqual(['archived']);
		expect(filterDocuments(rows, { view: 'trash' })).toEqual([]);
		expect(filterDocuments(rows, {}).map((r) => r.id)).toEqual(['live', 'foreign', 'unfiled']);
	});
	it('a folder narrows to the OWNER\'s rows in it: a shared row carrying the same id is somebody else\'s filing', () => {
		expect(filterDocuments(rows, { folderId: 'f1' }).map((r) => r.id)).toEqual(['live']);
		expect(filterDocuments(rows, { folderId: null }).map((r) => r.id)).toEqual(['live', 'foreign', 'unfiled']);
	});
	it('a tag narrows to rows carrying it, and owner narrows to mine or others', () => {
		expect(filterDocuments(rows, { tag: 'gear' }).map((r) => r.id)).toEqual(['live', 'foreign']);
		expect(filterDocuments(rows, { tag: 'bracket' }).map((r) => r.id)).toEqual(['unfiled']);
		expect(filterDocuments(rows, { owner: 'mine' }).map((r) => r.id)).toEqual(['live', 'unfiled']);
		expect(filterDocuments(rows, { owner: 'others' }).map((r) => r.id)).toEqual(['foreign']);
	});
});

describe('grouping: the five groups, in order, absent when empty, and every row lands in exactly one', () => {
	const rows = [
		doc({ id: 'shared', isOwn: false, role: 'viewer' }), doc({ id: 'mine' }), doc({ id: 'arch', archivedAt: '2026-09-10T00:00:00.000Z' }),
		doc({ id: 'managed', isOwn: false, role: 'manager', itemId: 'i' }), doc({ id: 'assignment', itemId: 'i' }), doc({ id: 'mine2' })
	];
	it('orders the groups mine, assignments, managed, shared, archived and keeps the caller\'s row order inside each', () => {
		const groups = groupDocuments(rows);
		expect(groups.map((g) => g.key)).toEqual(['mine', 'assignments', 'managed', 'shared', 'archived']);
		expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([['mine', 'mine2'], ['assignment'], ['managed'], ['shared'], ['arch']]);
		expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
		for (const g of groups) expect(g.label).toBe(LAUNCH_GROUP_LABELS[g.key]);
	});
	it('an empty group is absent rather than rendered empty', () => {
		expect(groupDocuments([doc({ id: 'only' })]).map((g) => g.key)).toEqual(['mine']);
		expect(groupDocuments([])).toEqual([]);
	});
	it('an archived row is archived whatever else it is; an editor grant is shared, a manager is managed', () => {
		expect(groupKeyOf(doc({ archivedAt: 'x', itemId: 'i', isOwn: false, role: 'manager' }))).toBe('archived');
		expect(groupKeyOf(doc({ isOwn: false, role: 'editor' }))).toBe('shared');
		expect(roleWord(doc({ isOwn: false, role: 'editor' }))).toBe('Shared, can edit');
		expect(roleWord(doc({ isOwn: false, role: 'viewer' }))).toBe('Shared, view only');
		expect(roleWord(doc({ isOwn: false, role: 'manager' }))).toBe('You manage');
		expect(roleWord(doc({ isOwn: true }))).toBeNull();
	});
});

describe('tags and folders are the owner\'s filing', () => {
	it('collectTags reads own rows only, unique and sorted; a foreign folder id resolves to nothing', () => {
		expect(collectTags([doc({ tags: ['v2', 'gear'] }), doc({ tags: ['gear'] }), doc({ isOwn: false, tags: ['secret'] })])).toEqual(['gear', 'v2']);
		expect(folderNameOf(doc({ folderId: 'f1' }), FOLDERS)).toBe('Gears');
		expect(folderNameOf(doc({ folderId: 'f-of-somebody-else' }), FOLDERS)).toBeNull();
		expect(folderNameOf(doc({ folderId: 'f1', isOwn: false }), FOLDERS)).toBeNull();
		expect(folderNameOf(doc({ folderId: null }), FOLDERS)).toBeNull();
	});
	it('parseTagLine cleans the way 0217 cleans: trimmed, lower-cased, empties dropped, unique, sorted', () => {
		expect(parseTagLine(' Gear, v2 ,, gear,Bracket ')).toEqual(['bracket', 'gear', 'v2']);
		expect(parseTagLine('')).toEqual([]);
	});
});
