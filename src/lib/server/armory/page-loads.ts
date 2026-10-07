/**
 * What the /armory pages read, run as the signed-in caller on
 * `locals.supabase`: RLS and the RPCs' own membership checks are the boundary,
 * and a project or file the caller cannot see answers 404, the same as one
 * that does not exist. A database without the Armory schema yet is a page that
 * says so, never a 500; a database without 0232 (ledger 0366) still renders,
 * with the checkout list read off the file list and no chosen names.
 *
 * AND A DATABASE WITHOUT 0233 STILL RENDERS. Every 0233 read has its own rung:
 * `armory_project_summaries` falls back to `armory_my_projects` (no counts, no
 * admin reach), `armory_team_status` to the `armory_members` table (no names,
 * pictures or presence), and a select naming a heartbeat column retries without
 * it on 42703. `v033Ready` says the summaries rung answered, which is also what
 * licenses the page to send `p_device: null` to `armory_break_lock` (the
 * contract's widening lands in the same file).
 *
 * NO LOAD HERE READS THE URL. The project page's views live in `?view=` and are
 * the component's to read, so pressing a tab reruns none of this.
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
	type ArmoryProject,
	type ArmoryProjectSummary
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
 * The projects with their counts (0233 `armory_project_summaries`): every
 * project the caller is a member of, and every project for a site admin, with
 * `role` null where the admin is not a member. On a database without it, the
 * caller's own projects with no counts (`ready` false).
 *
 * NOT FOR THE SETUP PAGE: its "Your projects" step is the projects a computer
 * syncs, which is `armory_my_projects` and membership only.
 */
export async function loadSummaries(
	supabase: SupabaseClient
): Promise<{ notReady: boolean; ready: boolean; projects: ArmoryProjectSummary[] }> {
	const { data, error: e } = await supabase.rpc('armory_project_summaries');
	if (e) {
		if (!armoryNotReady(e)) failed(e);
		const mine = await loadMyProjects(supabase);
		return { notReady: mine.notReady, ready: false, projects: mine.projects };
	}
	return { notReady: false, ready: true, projects: (Array.isArray(data) ? data : []) as ArmoryProjectSummary[] };
}

/** The admin's pending storage cleanup (0233); null for anyone else and on any failure. */
export async function loadOrphanCount(supabase: SupabaseClient): Promise<number | null> {
	const { data, error: e } = await supabase.rpc('armory_orphans_count');
	if (e) return null;
	const n = Number(data);
	return Number.isFinite(n) ? n : null;
}

/**
 * The caller's own connected computers (RLS: own rows only), each with when
 * it was last heard from in any of their projects' change feeds. A failure
 * reads as none: this is a convenience, never a gate.
 */
export async function loadMyDevices(supabase: SupabaseClient): Promise<ArmoryDevice[]> {
	const read = (columns: string) =>
		supabase.from('armory_devices').select(columns).order('registered_at', { ascending: false }).limit(50);
	// The 0233 heartbeat columns, then the narrow select on a database without them.
	let devices = await read('id, name, registered_at, last_seen, app_version, state');
	if (devices.error?.code === '42703') devices = await read('id, name, registered_at');
	if (devices.error || !devices.data?.length) return [];
	const rows = devices.data as unknown as Array<{ id: string; name: string; registered_at: string; last_seen?: string | null }>;
	const ids = rows.map((d) => d.id);
	const feed = await supabase
		.from('armory_change_feed')
		.select('payload, created_at')
		.in('payload->>device_id', ids)
		.order('cursor', { ascending: false })
		.limit(500);
	const seen = deviceLastSeen((feed.data ?? []) as Array<{ payload: unknown; created_at: string }>);
	return devicesWithLastSeen(rows, seen);
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

/**
 * Side versions per file. A per-file `side_versions` key on the file list, when
 * the server sends one, is the whole answer; otherwise the side-version rows
 * are read in chunks of 100 file ids (a URL carries about 37 bytes per id) and
 * pages of 1000 rows (PostgREST caps a response at 1000 WITHOUT an error, and
 * the old single read at `.limit(5000)` was silently short past it).
 */
async function loadSideCounts(supabase: SupabaseClient, files: ArmoryFile[]): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	const keyed = files.every((f) => typeof (f as { side_versions?: unknown }).side_versions === 'number');
	if (keyed) {
		for (const f of files) {
			const n = (f as unknown as { side_versions: number }).side_versions;
			if (n > 0) counts[f.id] = n;
		}
		return counts;
	}
	for (let i = 0; i < files.length; i += 100) {
		const chunk = files.slice(i, i + 100).map((f) => f.id);
		for (let from = 0; ; from += 1000) {
			const page = await supabase.from('armory_side_versions').select('id, file_id').in('file_id', chunk).order('id').range(from, from + 999);
			if (page.error) return counts;
			const rows = (page.data ?? []) as Array<{ file_id: string }>;
			for (const r of rows) counts[r.file_id] = (counts[r.file_id] ?? 0) + 1;
			if (rows.length < 1000) break;
		}
	}
	return counts;
}

/**
 * The team, linked to site accounts (0233 `armory_team_status`): names,
 * pictures, pathways, computers with their heartbeat, and each member's
 * checkouts. On a database without it, the `armory_members` table (`ready`
 * false), and the page says what it cannot show.
 */
export async function loadTeam(supabase: SupabaseClient, projectId: string): Promise<{ ready: boolean; members: ArmoryMember[] }> {
	const team = await supabase.rpc('armory_team_status', { p_project: projectId });
	if (!team.error) return { ready: true, members: (Array.isArray(team.data) ? team.data : []) as ArmoryMember[] };
	if (!armoryNotReady(team.error)) failed(team.error);
	const members = await supabase.from('armory_members').select('email, role').eq('project_id', projectId).order('email');
	if (members.error) failed(members.error);
	return { ready: false, members: (members.data ?? []) as ArmoryMember[] };
}

/** The heartbeat (0233) counts as hearing from a computer, beside the change feed. */
function mergeHeartbeats(seen: Record<string, number>, team: readonly ArmoryMember[]): Record<string, number> {
	const out = { ...seen };
	for (const m of team) {
		for (const d of m.devices ?? []) {
			const at = d.last_seen ? Date.parse(d.last_seen) : Number.NaN;
			if (!Number.isNaN(at) && !(out[d.id] >= at)) out[d.id] = at;
		}
	}
	return out;
}

export async function loadProject(supabase: SupabaseClient, projectId: string, full = true) {
	if (!UUID.test(projectId)) error(404, 'Not found');
	const summaries = await loadSummaries(supabase);
	if (summaries.notReady) return { notReady: true as const };
	const project = summaries.projects.find((p) => p.id === projectId.toLowerCase());
	if (!project) error(404, 'Not found');
	const files = await supabase.rpc('armory_project_files', { p_project: project.id });
	if (files.error) failed(files.error);
	const list = (files.data ?? []) as ArmoryFile[];
	const [team, feed, checkouts, sideCounts, devices] = await Promise.all([
		full ? loadTeam(supabase, project.id) : Promise.resolve({ ready: summaries.ready, members: [] as ArmoryMember[] }),
		changeFeed(supabase, project.id),
		loadCheckouts(supabase, project.id, list),
		full ? loadSideCounts(supabase, list) : Promise.resolve({} as Record<string, number>),
		full ? loadMyDevices(supabase) : Promise.resolve([] as ArmoryDevice[])
	]);
	// Storage from the summary when the server counts it; the paged read is only the pre-0233 rung.
	const counted = summaries.ready && typeof project.bytes === 'number' && typeof project.stored === 'number';
	const storage = !full
		? null
		: counted
			? { bytes: Number(project.bytes), files: Number(project.stored) }
			: await loadStorage(supabase, list.map((f) => f.id));
	return {
		notReady: false as const,
		project: project as ArmoryProjectSummary,
		files: list,
		members: team.members,
		teamReady: team.ready,
		v033Ready: summaries.ready,
		sideCounts,
		deviceSeen: mergeHeartbeats(feed.deviceSeen, team.members),
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
