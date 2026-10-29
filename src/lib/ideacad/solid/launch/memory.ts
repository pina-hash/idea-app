// src/lib/ideacad/solid/launch/memory.ts
//
// AN IN-MEMORY `LaunchApi`, the transport the dev harness (`/dev/ideacad-launch`)
// and the mount test both hand the REAL `LaunchPage`. It answers every call
// the way 0217's functions answer it -- the same refusal sentences, byte for
// byte, taken from `supabase/migrations/0217_ideacad_feature_graph.sql` --
// so a control that reaches a refusal in the harness reaches the sentence a
// student would read. It is not a second copy of the rules: the database is
// the boundary, and what is mirrored here is only what a harness needs in
// order to be driven.
import type { LaunchApi, TrashReceipt } from './api';
import type { LaunchDocument, LaunchFolder, TrashedDocument } from './library';
import { copyTitle, TRASH_WINDOW_DAYS } from './wording';
import { parseOutcome, type AccessList, type ShareChange, type ShareOutcome, type SharePerson, type ShareRole } from './share';

/** A person the in-memory directory knows: what 0329 returns, their school email always present. */
export interface MemorySharePerson extends Omit<SharePerson, 'access' | 'email'> { email: string }

export interface MemoryLaunchSeed {
	documents?: LaunchDocument[]; folders?: LaunchFolder[]; trash?: TrashedDocument[]; now?: () => Date; latencyMs?: number;
	/** Hand in a directory to get the three sharing transports; leave it out and the share panel is absent. */
	people?: MemorySharePerson[];
	/** Grants already on file, by document id, then person key. */
	grants?: Record<string, Record<string, ShareRole>>;
}
export interface MemoryLaunchApi extends LaunchApi {
	state: { documents: LaunchDocument[]; folders: LaunchFolder[]; trash: TrashedDocument[]; grants: Record<string, Record<string, ShareRole>> };
	/** Every call, in order, as `name(args)`, so a test can assert what was asked. */
	calls: string[];
}

const DOES_NOT_EXIST = 'That document does not exist.';
const LINKED = 'This model is linked to an assignment, so it is kept. Archive it instead.';
const FOLDER_MISSING = 'That folder does not exist.';
let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(++counter).toString(36)}`;

export function createMemoryLaunchApi(seed: MemoryLaunchSeed = {}): MemoryLaunchApi {
	const now = seed.now ?? (() => new Date());
	const state = { documents: structuredClone(seed.documents ?? []), folders: structuredClone(seed.folders ?? []), trash: structuredClone(seed.trash ?? []), grants: structuredClone(seed.grants ?? {}) };
	const calls: string[] = [];
	const wait = () => (seed.latencyMs ? new Promise<void>((r) => setTimeout(r, seed.latencyMs)) : Promise.resolve());
	const log = (name: string, ...args: unknown[]) => calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
	const own = (id: string): LaunchDocument => { const d = state.documents.find((x) => x.id === id); if (!d || !d.isOwn) throw Error(DOES_NOT_EXIST); return d; };
	const folderCount = (f: LaunchFolder) => state.documents.filter((d) => d.folderId === f.id).length;
	const folderRows = () => [...state.folders].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map((f) => ({ ...f, documentCount: folderCount(f) }));
	const touch = (d: LaunchDocument) => { d.updatedAt = now().toISOString(); };
	const cleanTags = (tags: string[]) => {
		const cleaned = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t !== ''))].sort();
		for (const t of cleaned) if (t.length > 30 || t.includes(',')) throw Error('A tag is 1 to 30 characters with no commas.');
		if (cleaned.length > 12) throw Error('Use at most 12 tags.');
		return cleaned;
	};
	const api: MemoryLaunchApi = {
		state, calls,
		async list() { log('list'); await wait(); return structuredClone(state.documents); },
		async folders() { log('folders'); await wait(); return folderRows(); },
		async trashList() { log('trashList'); await wait(); return structuredClone([...state.trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || a.id.localeCompare(b.id))); },
		async create(title) {
			log('create', title); await wait();
			const t = title.trim(); if (t.length < 1 || t.length > 120) throw Error('Name the document using 1 to 120 characters.');
			const stamp = now().toISOString();
			const d: LaunchDocument = { id: nextId('doc'), title: t, itemId: null, ownerEmail: 'you@boscotech.net', isOwn: true, updatedAt: stamp, createdAt: stamp, archivedAt: null, canWrite: true, canArchive: true, canTrash: true, bodyCount: 0, featureCount: 0, role: 'owner', folderId: null, tags: [], thumbnail: null, format: 'ideacad-solid-v2' };
			state.documents.unshift(d); return { id: d.id };
		},
		async archive(id, archived) {
			log('archive', id, archived); await wait();
			const d = state.documents.find((x) => x.id === id);
			if (!d || !d.canArchive) throw Error(DOES_NOT_EXIST);
			d.archivedAt = archived ? (d.archivedAt ?? now().toISOString()) : null; d.canWrite = !archived && (d.isOwn || d.role === 'editor' || d.role === 'manager'); touch(d);
			return { ok: true };
		},
		async trash(id) {
			log('trash', id); await wait();
			const d = own(id); if (d.itemId) throw Error(LINKED);
			const deletedAt = now().toISOString(), purgeAt = new Date(now().getTime() + TRASH_WINDOW_DAYS * 86_400_000).toISOString();
			state.documents = state.documents.filter((x) => x.id !== id);
			state.trash.unshift({ id: d.id, title: d.title, deletedAt, purgeAt, updatedAt: deletedAt, folderId: d.folderId, tags: d.tags, thumbnail: d.thumbnail, bodyCount: d.bodyCount, featureCount: d.featureCount });
			const receipt: TrashReceipt = { ok: true, id: d.id, title: d.title, deletedAt, purgeAt, swept: 0 };
			return receipt;
		},
		async restore(id) {
			log('restore', id); await wait();
			const t = state.trash.find((x) => x.id === id); if (!t) throw Error(DOES_NOT_EXIST);
			state.trash = state.trash.filter((x) => x.id !== id);
			const stamp = now().toISOString();
			state.documents.unshift({ id: t.id, title: t.title, itemId: null, ownerEmail: 'you@boscotech.net', isOwn: true, updatedAt: stamp, createdAt: t.updatedAt, archivedAt: null, canWrite: true, canArchive: true, canTrash: true, bodyCount: t.bodyCount, featureCount: t.featureCount, role: 'owner', folderId: t.folderId, tags: t.tags, thumbnail: t.thumbnail, format: 'ideacad-solid-v2' });
			return { ok: true };
		},
		async purge(id) {
			log('purge', id); await wait();
			if (state.documents.some((x) => x.id === id)) throw Error('Move this model to the trash first.');
			const t = state.trash.find((x) => x.id === id); if (!t) throw Error(DOES_NOT_EXIST);
			state.trash = state.trash.filter((x) => x.id !== id); return { ok: true, purged: true, id, title: t.title };
		},
		async createFolder(name) {
			log('createFolder', name); await wait();
			const n = name.trim(); if (n.length < 1 || n.length > 80) throw Error('Name the folder using 1 to 80 characters.');
			if (state.folders.some((f) => f.name.toLowerCase() === n.toLowerCase())) throw Error('You already have a folder with that name.');
			const f: LaunchFolder = { id: nextId('folder'), name: n, createdAt: now().toISOString(), documentCount: 0 }; state.folders.push(f); return { ...f };
		},
		async renameFolder(id, name) {
			log('renameFolder', id, name); await wait();
			const f = state.folders.find((x) => x.id === id); if (!f) throw Error(FOLDER_MISSING);
			const n = name.trim(); if (n.length < 1 || n.length > 80) throw Error('Name the folder using 1 to 80 characters.');
			if (state.folders.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw Error('You already have a folder with that name.');
			f.name = n; return { ...f, documentCount: folderCount(f) };
		},
		async deleteFolder(id) {
			log('deleteFolder', id); await wait();
			const f = state.folders.find((x) => x.id === id); if (!f) throw Error(FOLDER_MISSING);
			const movedOut = folderCount(f); for (const d of state.documents) if (d.folderId === id) d.folderId = null;
			state.folders = state.folders.filter((x) => x.id !== id); return { movedOut };
		},
		async move(id, folderId) {
			log('move', id, folderId); await wait();
			const d = own(id); if (folderId !== null && !state.folders.some((f) => f.id === folderId)) throw Error(FOLDER_MISSING);
			d.folderId = folderId; return { ok: true, id, folderId };
		},
		async tag(id, tags) { log('tag', id, tags); await wait(); const d = own(id); d.tags = cleanTags(tags); return { tags: [...d.tags] }; },
		async rename(id, title) {
			log('rename', id, title); await wait();
			const d = state.documents.find((x) => x.id === id); if (!d || !d.canWrite) throw Error('You cannot edit this document.');
			const t = title.trim(); if (t.length < 1 || t.length > 120) throw Error('Name the document using 1 to 120 characters.');
			d.title = t; touch(d); return { ok: true };
		},
		async duplicate(id, title) {
			log('duplicate', id, title ?? null); await wait();
			const d = state.documents.find((x) => x.id === id); if (!d) throw Error(DOES_NOT_EXIST);
			const t = (title ?? copyTitle(d.title)).trim(); if (t.length < 1 || t.length > 120) throw Error('Name the document using 1 to 120 characters.');
			const stamp = now().toISOString();
			const copy: LaunchDocument = { ...structuredClone(d), id: nextId('doc'), title: t, itemId: null, ownerEmail: 'you@boscotech.net', isOwn: true, updatedAt: stamp, createdAt: stamp, archivedAt: null, canWrite: true, canArchive: true, canTrash: true, role: 'owner', folderId: d.isOwn ? d.folderId : null, tags: d.isOwn ? [...d.tags] : [] };
			state.documents.unshift(copy); return { id: copy.id };
		}
	};
	if (seed.people) Object.assign(api, memorySharing(seed.people, state, own, log, wait));
	return api;
}

/*
 * THE THREE SHARING CALLS, answered the way 0325 answers them as 0329 leaves
 * them, with their sentences byte for byte: the directory returns each
 * person's name and email, matches any part of either, and ranks teammates,
 * classmates, then everyone; the batch share acts per person and hands back
 * the inverse.
 */
const SHARE_OWN_ONLY = 'You can only share your own document.';
function memorySharing(
	directory: MemorySharePerson[],
	state: { documents: LaunchDocument[]; grants: Record<string, Record<string, ShareRole>> },
	own: (id: string) => LaunchDocument,
	log: (name: string, ...args: unknown[]) => void,
	wait: () => Promise<void>
): Pick<LaunchApi, 'access' | 'people' | 'setAccess'> {
	const rank = { teammate: 2, classmate: 1, school: 0 } as const;
	const shared = (id: string) => (state.grants[id] ??= {});
	const mine = (id: string) => { try { return own(id); } catch { throw Error(SHARE_OWN_ONLY); } };
	const listFor = (id: string): AccessList => {
		const g = shared(id);
		const people = directory.filter((p) => g[p.key]).map(({ relation: _relation, ...p }) => ({ ...p, role: g[p.key], grantedAt: null })).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
		return { canChange: true, count: people.length, people };
	};
	return {
		async access(id) { log('access', id); await wait(); mine(id); return listFor(id); },
		async people(id, query) {
			log('people', id, query); await wait(); mine(id);
			const q = query.trim().toLowerCase(), g = shared(id);
			if (q !== '' && q.replace(/\s+/g, '').length < 2) return [];
			return directory
				.filter((p) => (q === '' ? p.relation === 'teammate' : p.name.toLowerCase().includes(q) || p.email.includes(q)))
				.sort((a, b) => rank[b.relation] - rank[a.relation] || a.name.localeCompare(b.name))
				.slice(0, 12)
				.map((p) => ({ ...p, access: g[p.key] ?? null }));
		},
		async setAccess(id, changes: ShareChange[]): Promise<ShareOutcome> {
			log('setAccess', id, changes); await wait(); mine(id);
			if (!Array.isArray(changes) || changes.length === 0) throw Error('Choose who to share with.');
			const g = shared(id), results: unknown[] = [], undo: ShareChange[] = [];
			changes.forEach((c, index) => {
				const person = 'key' in c ? directory.find((p) => p.key === c.key) : directory.find((p) => p.email === c.email.trim().toLowerCase());
				if (!person) { results.push({ index, ok: false, reason: 'key' in c ? 'That person is not available to share with.' : 'Choose the email address of someone who has signed in.' }); return; }
				const before = g[person.key] ?? null, after = c.role === 'none' ? null : c.role;
				if (after) g[person.key] = after; else delete g[person.key];
				results.push({ index, ok: true, key: person.key, name: person.name, email: person.email, role: after, before, changed: before !== after });
				if (before !== after) undo.push({ key: person.key, role: before ?? 'none' });
			});
			return parseOutcome({ total: changes.length, succeeded: results.filter((r: any) => r.ok).length, refused: results.filter((r: any) => !r.ok).length, results, undo, access: listFor(id) });
		}
	};
}
