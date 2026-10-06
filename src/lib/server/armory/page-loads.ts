/**
 * What the /armory pages read, run as the signed-in caller on
 * `locals.supabase`: RLS and the RPCs' own membership checks are the boundary,
 * and a project or file the caller cannot see answers 404, the same as one
 * that does not exist. A database without the Armory schema yet (the proposed
 * migration is not applied) is a page that says so, never a 500.
 */
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { armoryNotReady, deviceLastSeen, type ArmoryFile, type ArmoryHistoryEntry, type ArmoryMember, type ArmoryProject } from '$lib/armory/view';
import { armoryStorageConfig } from './storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function changeFeed(supabase: SupabaseClient, projectId: string) {
	const { data } = await supabase
		.from('armory_change_feed')
		.select('cursor, payload, created_at')
		.eq('project_id', projectId)
		.order('cursor', { ascending: false })
		.limit(500);
	const rows = (data ?? []) as Array<{ cursor: number; payload: unknown; created_at: string }>;
	return {
		deviceSeen: Object.fromEntries(deviceLastSeen(rows)),
		cursor: rows.length > 0 ? Number(rows[0].cursor) : 0
	};
}

export async function loadProject(supabase: SupabaseClient, projectId: string) {
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
	const feed = await changeFeed(supabase, project.id);
	return {
		notReady: false as const,
		project,
		files: list,
		members: (members.data ?? []) as ArmoryMember[],
		sideCounts,
		deviceSeen: feed.deviceSeen,
		cursor: feed.cursor,
		storageReady: armoryStorageConfig() !== null,
		now: Date.now()
	};
}

export async function loadFile(supabase: SupabaseClient, projectId: string, fileId: string) {
	if (!UUID.test(fileId)) error(404, 'Not found');
	const base = await loadProject(supabase, projectId);
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
		now: base.now
	};
}
