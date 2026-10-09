// tests/armory-page-loads-ladder.test.ts
//
// THE ARMORY PAGES ON A DATABASE WITH AND WITHOUT 0233, through the REAL loads
// in src/routes/armory/+page.server.ts and src/routes/armory/[project]/+page.server.ts
// with the caller's Supabase client faked.
//
// Why this is a test and not a harness: migrate.yml and the Vercel deploy both
// fire on a push to main, in no fixed order, so "the site is live and 0233 is
// not" is a real state for minutes at a time. A load that 500s there takes the
// whole Armory down for everybody, and nothing in a /dev harness (which never
// loads) would show it. So both directions are held:
//   - WITHOUT 0233 every new read answers PGRST202 (and a select naming a
//     heartbeat column 42703): the pages still load, `v033Ready` and
//     `teamReady` are false (which removes the new controls), the team comes
//     from the members table, storage and side counts from the paged reads,
//     the devices from the narrow select, and no admin cleanup read is made;
//   - WITH 0233 the counts come from the server: storage and side counts are
//     NOT read row by row (the 1000-row cap is out of the path), the team
//     carries names, the heartbeat counts as hearing from a computer, and only
//     a site admin's index asks for the cleanup count.
// And NO LOAD READS THE URL: the project page's views live in `?view=`, so the
// event handed in here has a `url` that throws when touched.

import { beforeEach, describe, expect, test } from 'vitest';

const { load: projectLoad } = await import('../src/routes/armory/[project]/+page.server');
const { load: indexLoad } = await import('../src/routes/armory/+page.server');

const PROJECT = '6b1f6c1e-0000-4000-8000-000000000004';
const OTHER = '6b1f6c1e-0000-4000-8000-000000000005';
const ME = 'apina@boscotech.edu';
const NOW = Date.UTC(2026, 9, 7, 18, 0, 0);
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

type Failure = { code: string; message: string };
interface World {
	v033: boolean;
	/** 0236's armory_can_take_back: absent (undefined), or the server's answer. */
	canTakeBack?: boolean | 'error';
	/** Projects the caller is a member of (role) or, for an admin, not (role null). */
	projects: Array<{ id: string; name: string; role: string | null }>;
	admin: boolean;
	rpcs: string[];
	tables: Array<{ table: string; columns: string }>;
}
let w: World;

const NOT_THERE: Failure = { code: 'PGRST202', message: 'Could not find the function' };
const NO_COLUMN: Failure = { code: '42703', message: 'column armory_devices.last_seen does not exist' };
const V033_RPCS = new Set(['armory_project_summaries', 'armory_team_status', 'armory_orphans_count', 'armory_people_search', 'armory_purge_preview']);

function files(withSides: boolean) {
	return ['a', 'b', 'c'].map((c, i) => ({
		id: `6b1f6c1e-0000-4000-8000-00000000010${i}`,
		folder: 'Drive',
		name: `Part ${c}.SLDPRT`,
		deleted: false,
		created_at: iso(600),
		current: null,
		lock: null,
		...(withSides ? { side_versions: i } : {})
	}));
}

function rpc(name: string, args: Record<string, unknown>): { data: unknown; error: Failure | null } {
	w.rpcs.push(name);
	if (!w.v033 && V033_RPCS.has(name)) return { data: null, error: NOT_THERE };
	switch (name) {
		case 'armory_project_summaries': {
			const rows = w.projects
				.filter((p) => p.role !== null || w.admin)
				.filter((p) => !args.p_project || p.id === args.p_project)
				.map((p) => ({ ...p, season: null, archived: false, files: 3, removed: 0, checked_out: 0, mine: 0, members: 2, versions: 9, side_versions: 3, bytes: 4096, stored: 7, last_change_at: iso(5) }));
			return { data: rows, error: null };
		}
		case 'armory_my_projects':
			return { data: w.projects.filter((p) => p.role !== null).map((p) => ({ ...p, season: null })), error: null };
		case 'armory_project_files':
			return { data: files(w.v033), error: null };
		case 'armory_project_checkouts':
			return { data: [], error: null };
		case 'armory_team_status':
			return {
				data: [
					{ email: ME, role: 'mentor', name: 'Mr. Pina', avatar: 'preset:hex', avatar_url: null, pathway: 'IDEA', has_account: true, devices_total: 1, devices: [{ id: 'd-1', name: 'Room 214 desk', last_seen: iso(1), app_version: '0.3.0', state: 'idle' }], checkouts: [] },
					{ email: 'ana.reyes@boscotech.net', role: 'student', name: 'Ana Reyes', avatar: null, avatar_url: null, pathway: 'ACE', has_account: true, devices_total: 0, devices: [], checkouts: [] }
				],
				error: null
			};
		case 'armory_can_take_back':
			if (w.canTakeBack === undefined) return { data: null, error: NOT_THERE };
			if (w.canTakeBack === 'error') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
			return { data: w.canTakeBack, error: null };
		case 'armory_orphans_count':
			return w.admin ? { data: 12, error: null } : { data: null, error: { code: '42501', message: 'only a site admin may clean up Armory storage' } };
		default:
			return { data: null, error: NOT_THERE };
	}
}

function tableRows(table: string, columns: string): { data: unknown; error: Failure | null } {
	w.tables.push({ table, columns });
	if (table === 'armory_devices') {
		if (!w.v033 && /last_seen/.test(columns)) return { data: null, error: NO_COLUMN };
		return { data: [{ id: 'd-1', name: 'Room 214 desk', registered_at: iso(60 * 24), ...(w.v033 ? { last_seen: iso(1), app_version: '0.3.0', state: 'idle' } : {}) }], error: null };
	}
	if (table === 'armory_members') return { data: [{ email: ME, role: 'mentor' }, { email: 'ana.reyes@boscotech.net', role: 'student' }], error: null };
	if (table === 'armory_change_feed') return { data: [], error: null };
	if (table === 'armory_versions' || table === 'armory_side_versions') {
		return { data: [{ id: 'v-1', file_id: files(false)[0].id, content_sha256: 'a'.repeat(64), byte_length: 100 }], error: null };
	}
	return { data: [], error: null };
}

/** A PostgREST-shaped chain that records the table and the select, and answers when awaited. */
function from(table: string) {
	let columns = '';
	const chain = {
		select(c: string) {
			columns = c;
			return chain;
		},
		order: () => chain,
		limit: () => chain,
		eq: () => chain,
		in: () => chain,
		range: () => chain,
		maybeSingle: () => Promise.resolve(tableRows(table, columns)),
		then<T>(resolve: (v: { data: unknown; error: Failure | null }) => T, reject?: (e: unknown) => T) {
			return Promise.resolve(tableRows(table, columns)).then(resolve, reject);
		}
	};
	return chain;
}

const supabase = () => ({ rpc: async (name: string, args: Record<string, unknown> = {}) => rpc(name, args), from });

/** An event whose url throws: a load that reads it would rerun on every tab press. */
function withUrlTrap<T extends object>(event: T): T {
	return Object.defineProperty(event, 'url', {
		get() {
			throw new Error('an Armory load read the url');
		}
	});
}

function projectEvent(id = PROJECT) {
	return withUrlTrap({
		locals: { supabase: supabase(), claims: { sub: 'u-1', email: ME } },
		params: { project: id },
		depends: () => {}
	}) as never;
}
function indexEvent() {
	return withUrlTrap({
		locals: { supabase: supabase(), claims: { sub: 'u-1', email: ME } },
		parent: async () => ({ isAdmin: w.admin })
	}) as never;
}

type ProjectData = {
	notReady: boolean;
	view: null | {
		v033Ready: boolean;
		teamReady: boolean;
		members: Array<{ email: string; role: string; name?: string }>;
		storage: { bytes: number; files: number } | null;
		sideCounts: Record<string, number>;
		devices: Array<{ id: string; last_seen: number }>;
		deviceSeen: Record<string, number>;
		project: { id: string; role: string | null };
		canTakeBack?: boolean | null;
	};
};

beforeEach(() => {
	w = { v033: true, projects: [{ id: PROJECT, name: 'Robot 2026', role: 'mentor' }], admin: false, rpcs: [], tables: [] };
});

describe('the project page without 0233 still loads, with the new controls switched off', () => {
	test('every 0233 read degrades to its older rung and nothing throws', async () => {
		w.v033 = false;
		const data = (await projectLoad(projectEvent())) as ProjectData;
		expect(data.notReady).toBe(false);
		const v = data.view!;
		expect(v.v033Ready).toBe(false);
		expect(v.teamReady).toBe(false);
		// The team from the members table: addresses and roles, no names.
		expect(v.members).toEqual([{ email: ME, role: 'mentor' }, { email: 'ana.reyes@boscotech.net', role: 'student' }]);
		// Storage and side counts from the paged reads (the pre-0233 rung).
		expect(w.tables.some((t) => t.table === 'armory_versions')).toBe(true);
		expect(w.tables.some((t) => t.table === 'armory_side_versions')).toBe(true);
		expect(v.storage).toEqual({ bytes: 100, files: 1 });
		// The device select named a heartbeat column, got 42703, and retried narrow.
		const deviceSelects = w.tables.filter((t) => t.table === 'armory_devices').map((t) => t.columns);
		expect(deviceSelects).toEqual(['id, name, registered_at, last_seen, app_version, state', 'id, name, registered_at']);
		expect(v.devices.map((d) => d.id)).toEqual(['d-1']);
		// It asked for the new reads once each and fell back; it never asked for a search or a preview.
		expect(w.rpcs).toContain('armory_project_summaries');
		expect(w.rpcs).toContain('armory_my_projects');
		expect(w.rpcs).toContain('armory_team_status');
		expect(w.rpcs).not.toContain('armory_people_search');
		expect(w.rpcs).not.toContain('armory_purge_preview');
	});

	test('a project the caller is not in is still a 404, on the older rung too', async () => {
		w.v033 = false;
		await expect(projectLoad(projectEvent(OTHER))).rejects.toMatchObject({ status: 404 });
	});

	test('the index loads the caller\'s own projects with no counts and makes no cleanup read, even for an admin', async () => {
		w.v033 = false;
		w.admin = true;
		w.projects.push({ id: OTHER, name: 'Somebody else', role: null });
		const data = (await indexLoad(indexEvent())) as { summaryReady: boolean; projects: Array<{ id: string }>; orphans: number | null; notReady: boolean };
		expect(data.notReady).toBe(false);
		expect(data.summaryReady).toBe(false);
		// armory_my_projects is membership only: no other project appears for the admin.
		expect(data.projects.map((p) => p.id)).toEqual([PROJECT]);
		expect(data.orphans).toBeNull();
		expect(w.rpcs).not.toContain('armory_orphans_count');
	});
});

describe('the project page with 0233 takes its counts and its team from the server', () => {
	test('names, the heartbeat and the counts arrive, and no version row is read', async () => {
		const data = (await projectLoad(projectEvent())) as ProjectData;
		const v = data.view!;
		expect(v.v033Ready).toBe(true);
		expect(v.teamReady).toBe(true);
		expect(v.members.map((m) => m.name)).toEqual(['Mr. Pina', 'Ana Reyes']);
		// Storage from the summary row, side counts from the per-file key: no row-by-row read at all.
		expect(v.storage).toEqual({ bytes: 4096, files: 7 });
		expect(w.tables.filter((t) => t.table === 'armory_versions' || t.table === 'armory_side_versions')).toEqual([]);
		const ids = files(false).map((f) => f.id);
		expect(v.sideCounts).toEqual({ [ids[1]]: 1, [ids[2]]: 2 });
		// The heartbeat counts as hearing from the computer.
		expect(v.deviceSeen['d-1']).toBe(Date.parse(iso(1)));
		// One device select, the wide one.
		expect(w.tables.filter((t) => t.table === 'armory_devices').map((t) => t.columns)).toEqual(['id, name, registered_at, last_seen, app_version, state']);
	});

	test('a site admin who is not a member opens the project with no role (and a non-admin gets the 404)', async () => {
		w.projects = [{ id: OTHER, name: 'Somebody else', role: null }];
		await expect(projectLoad(projectEvent(OTHER))).rejects.toMatchObject({ status: 404 });
		w.admin = true;
		const data = (await projectLoad(projectEvent(OTHER))) as ProjectData;
		expect(data.view!.project).toMatchObject({ id: OTHER, role: null });
	});

	test('only a site admin\'s index asks for the cleanup count', async () => {
		const student = (await indexLoad(indexEvent())) as { orphans: number | null; summaryReady: boolean };
		expect(student.summaryReady).toBe(true);
		expect(student.orphans).toBeNull();
		expect(w.rpcs).not.toContain('armory_orphans_count');
		w.rpcs = [];
		w.admin = true;
		w.projects.push({ id: OTHER, name: 'Somebody else', role: null });
		const admin = (await indexLoad(indexEvent())) as { orphans: number | null; projects: Array<{ id: string; role: string | null }> };
		expect(admin.orphans).toBe(12);
		expect(admin.projects.map((p) => [p.id, p.role])).toEqual([
			[PROJECT, 'mentor'],
			[OTHER, null]
		]);
	});
});

describe('0236: the server answers who may force a check in and remove an empty file', () => {
	test('without 0236 the answer is null (the page keeps its older rule and offers no Remove); with it, the server\'s own', async () => {
		let v = ((await projectLoad(projectEvent())) as ProjectData).view!;
		expect(v.canTakeBack).toBeNull();
		expect(w.rpcs).toContain('armory_can_take_back');
		for (const answer of [true, false] as const) {
			w.canTakeBack = answer;
			v = ((await projectLoad(projectEvent())) as ProjectData).view!;
			expect(v.canTakeBack).toBe(answer);
		}
		// A failed read is null, never a page error and never a guess.
		w.canTakeBack = 'error';
		v = ((await projectLoad(projectEvent())) as ProjectData).view!;
		expect(v.canTakeBack).toBeNull();
	});
});
