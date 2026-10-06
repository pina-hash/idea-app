/**
 * What the /armory pages read, run as the signed-in caller on
 * `locals.supabase`: RLS and the RPCs' own membership checks are the boundary,
 * and a project or file the caller cannot see answers 404, the same as one
 * that does not exist. A database without the Armory schema yet is a page that
 * says so, never a 500; a database without 0232 (ledger 0366) still renders,
 * with the checkout list read off the file list and no chosen names.
 */
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	armoryNotReady,
	checkoutsFromFiles,
	deviceLastSeen,
	devicesWithLastSeen,
	storageUsed,
	type ArmoryChange,
	type ArmoryCheckout,
	type ArmoryDevice,
	type ArmoryFile,
	type ArmoryHistoryEntry,
	type ArmoryMember,
	type ArmoryProject
} from '$lib/armory/view';
import { armoryStorageConfig } from './storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many feed rows the activity panel shows. */
export const ACTIVITY_ROWS = 40;

export function signedInEmail(claims: App.Claims | null): string | null {
	const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
	return claims && email ? email : null;
}

type Failure = { code?: string; message?: string } | null;

function failed(e: Failure): never {
	if (e?.code === '42501') error(404, 'Not found');
	error(500, 'Armory could not be read.');
}

export async function loadMyProjects(supabase: SupabaseClient): Promise<{ notReady: boolean; projects: ArmoryProject[] }> {
	const { data, error: e } = await supabase.rpc('armory_my_projects');
	if (e) {
		if (armoryNotReady(e)) return { notReady: true, projects: [] };
		failed(e);
	}
	return { notReady: false, projects: (data ?? []) as ArmoryProject[] };
}

/**
 * The caller's own connected computers (RLS: own rows only), each with when
 * it was last heard from in any of their projects' change feeds. A failure
 * reads as none: this is a convenience, never a gate.
 */
export async function loadMyDevices(supabase: SupabaseClient): Promise<ArmoryDevice[]> {
	const devices = await supabase.from('armory_devices').select('id, name, registered_at').order('registered_at', { ascending: false }).limit(50);
	if (devices.error || !devices.data?.length) return [];
	const ids = devices.data.map((d) => d.id as string);
	const feed = await supabase
		.from('armory_change_feed')
		.select('payload, created_at')
		.in('payload->>device_id', ids)
		.order('cursor', { ascending: false })
		.limit(500);
	const seen = deviceLastSeen((feed.data ?? []) as Array<{ payload: unknown; created_at: string }>);
	return devicesWithLastSeen(devices.data as Array<{ id: string; name: string; registered_at: string }>, seen);
}

async function changeFeed(supabase: SupabaseClient, projectId: string) {
	const { data } = await supabase
		.from('armory_change_feed')
		.select('cursor, kind, entity_id, payload, created_at')
		.eq('project_id', projectId)
		.order('cursor', { ascending: false })
		.limit(500);
	const rows = (data ?? []) as ArmoryChange[];
	return {
		deviceSeen: Object.fromEntries(deviceLastSeen(rows)),
		cursor: rows.length > 0 ? Number(rows[0].cursor) : 0,
		activity: rows.slice(0, ACTIVITY_ROWS).map((r) => ({ ...r, cursor: Number(r.cursor) }))
	};
}

async function loadCheckouts(supabase: SupabaseClient, projectId: string, files: ArmoryFile[]): Promise<ArmoryCheckout[]> {
	const { data, error: e } = await supabase.rpc('armory_project_checkouts', { p_project: projectId });
	if (e) {
		if (armoryNotReady(e)) return checkoutsFromFiles(files);
		failed(e);
	}
	return (data ?? []) as ArmoryCheckout[];
}

/** Every stored version and side version of the project's files, read in pages of 1000. */
async function loadStorage(supabase: SupabaseClient, fileIds: string[]): Promise<{ bytes: number; files: number } | null> {
	const rows: Array<{ content_sha256: string; byte_length: number }> = [];
	for (let i = 0; i < fileIds.length; i += 100) {
		const chunk = fileIds.slice(i, i + 100);
		for (const table of ['armory_versions', 'armory_side_versions']) {
			for (let from = 0; ; from += 1000) {
				const page = await supabase
					.from(table)
					.select('id, content_sha256, byte_length')
					.in('file_id', chunk)
					.order('id')
					.range(from, from + 999);
				if (page.error) return null;
				rows.push(...((page.data ?? []) as Array<{ content_sha256: string; byte_length: number }>));
				if ((page.data ?? []).length < 1000) break;
			}
		}
	}
	return storageUsed(rows);
}

export async function loadProject(supabase: SupabaseClient, projectId: string, full = true) {
	if (!UUID.test(projectId)) error(404, 'Not found');
	const mine = await loadMyProjects(supabase);
	if (mine.notReady) return { notReady: true as const };
	const project = mine.projects.find((p) => p.id === projectId.toLowerCase());
	if (!project) error(404, 'Not found');
	const files = await supabase.rpc('armory_project_files', { p_project: project.id });
	if (files.error) failed(files.error);
	const list = (files.data ?? []) as ArmoryFile[];
	const members = await supabase.from('armory_members').select('email, role').eq('project_id', project.id).order('email');
	if (members.error) failed(members.error);
	const sideCounts: Record<string, number> = {};
	if (list.length > 0) {
		const sides = await supabase.from('armory_side_versions').select('file_id').in('file_id', list.map((f) => f.id)).limit(5000);
		for (const r of (sides.data ?? []) as Array<{ file_id: string }>) sideCounts[r.file_id] = (sideCounts[r.file_id] ?? 0) + 1;
	}
	const [feed, checkouts, storage, devices] = await Promise.all([
		changeFeed(supabase, project.id),
		loadCheckouts(supabase, project.id, list),
		full ? loadStorage(supabase, list.map((f) => f.id)) : Promise.resolve(null),
		full ? loadMyDevices(supabase) : Promise.resolve([] as ArmoryDevice[])
	]);
	return {
		notReady: false as const,
		project,
		files: list,
		members: (members.data ?? []) as ArmoryMember[],
		sideCounts,
		deviceSeen: feed.deviceSeen,
		cursor: feed.cursor,
		activity: feed.activity,
		checkouts,
		storage,
		devices,
		storageReady: armoryStorageConfig() !== null,
		now: Date.now()
	};
}

export async function loadFile(supabase: SupabaseClient, projectId: string, fileId: string) {
	if (!UUID.test(fileId)) error(404, 'Not found');
	const base = await loadProject(supabase, projectId, false);
	if (base.notReady) return { notReady: true as const };
	const file = base.files.find((f) => f.id === fileId.toLowerCase());
	if (!file) error(404, 'Not found');
	const history = await supabase.rpc('armory_file_history', { p_file: file.id });
	if (history.error) failed(history.error);
	return {
		notReady: false as const,
		project: base.project,
		file,
		history: (history.data ?? []) as ArmoryHistoryEntry[],
		deviceSeen: base.deviceSeen,
		checkouts: base.checkouts,
		storageReady: base.storageReady,
		now: base.now
	};
}

/**
 * One version or side version of a file, for a download: the caller must be a
 * member (the history RPC refuses otherwise, and that refusal is a 404 here),
 * and the version must belong to that file. Null for anything else.
 */
export async function findVersion(
	supabase: SupabaseClient,
	projectId: string,
	fileId: string,
	versionId: string
): Promise<{ file: { name: string }; entry: ArmoryHistoryEntry } | null> {
	if (!UUID.test(projectId) || !UUID.test(fileId) || !UUID.test(versionId)) return null;
	const file = await supabase
		.from('armory_files')
		.select('name')
		.eq('id', fileId.toLowerCase())
		.eq('project_id', projectId.toLowerCase())
		.maybeSingle();
	if (file.error || !file.data) return null;
	const history = await supabase.rpc('armory_file_history', { p_file: fileId.toLowerCase() });
	if (history.error) return null;
	const entry = ((history.data ?? []) as ArmoryHistoryEntry[]).find(
		(h) => h.id === versionId.toLowerCase() && (h.kind === 'version' || h.kind === 'side_version') && !!h.hash
	);
	return entry ? { file: file.data as { name: string }, entry } : null;
}
