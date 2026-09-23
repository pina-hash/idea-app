// tests/classroom-class-teams.test.ts
//
// POSTED TEAMS ON THE CLASS PAGE (ledger 0297, package LIVE), driven for real.
//
// The People tab's "Post to the class" told a teacher the whole class could
// see a draw while no student surface rendered one. The class page now reads
// the posted sets through `loadPostedTeams`, and two things about that read
// would fail SILENTLY:
//
//   1. AUDIENCE. A draw that is saved but not posted must not reach a
//      student's class page. The database decides that (0223's posting
//      window); this asserts the read the page makes honours it, both ways on
//      one fixture: a posted set present, an unposted set absent.
//   2. WHAT IT CARRIES. `classroom_team_board` names every member by ADDRESS,
//      because the teacher's People tab needs it. The class page needs names.
//      So the projection drops every address, and that is asserted against a
//      POSITIVE CONTROL: the raw board, for the same student, does carry them.
//
// HOW: the shipping `loadPostedTeams`, handed the PostgREST shim for a real
// student, against real Postgres with the real 0223 applied, seeded through the
// real RPCs the People tab calls.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { loadPostedTeams, postedTeamSets } from '../src/lib/classroom/class-teams';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql',
	'0137_anon_execute_sweep.sql',
	'0223_classroom_teams.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let teacher: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let carla: SeededUser;
let dana: SeededUser;
let sectionId: string;
let postedId: string;
let draftId: string;

async function rpc<T = unknown>(userId: string, call: string, params: unknown[]): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function saveSet(label: string, teams: readonly (readonly string[])[]): Promise<string> {
	return rpc<string>(
		teacher.id,
		'public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb)',
		[sectionId, label, 4242, 'count', teams.length, JSON.stringify(teams.map((members, i) => ({ team_number: i + 1, members })))]
	);
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cruz');
	dana = await createUser(db, 'dana@boscotech.net', 'Dana Diaz');
	const courseId = (
		await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', ['IDEA100', 'Intro'])
	).course_id;
	sectionId = (
		await rpc<{ section_id: string }>(teacher.id, 'public.classroom_upsert_section($1::uuid, $2, $3)', [
			courseId,
			'Period 3',
			'Block C'
		])
	).section_id;
	for (const [u, name] of [
		[alice, 'Alice Alvarez'],
		[bruno, 'Bruno Barros'],
		[carla, 'Carla Cruz'],
		[dana, 'Dana Diaz']
	] as const) {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [sectionId, u.email, name, true]);
	}
	postedId = await saveSet('Lab pairs', [
		[alice.email, bruno.email],
		[carla.email, dana.email]
	]);
	draftId = await saveSet('Draft groups', [
		[alice.email, carla.email],
		[bruno.email, dana.email]
	]);
	await rpc(teacher.id, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [postedId, null]);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('the class page reads the posted draw, as names', () => {
	it('a student gets the posted set and not the draft, with their own team marked', async () => {
		const sets = await loadPostedTeams(createPostgrestShim(db, fks, alice.id) as never, sectionId);
		expect(sets.map((s) => s.id)).toEqual([postedId]);
		expect(sets.some((s) => s.id === draftId)).toBe(false);
		const [set] = sets;
		expect(set.label).toBe('Lab pairs');
		const mine = set.teams.filter((t) => t.mine);
		expect(mine).toHaveLength(1);
		expect(mine[0].members.sort()).toEqual(['Alice Alvarez', 'Bruno Barros']);
	});

	it('no address reaches the class page, and the raw board it came from does carry them', async () => {
		const sets = await loadPostedTeams(createPostgrestShim(db, fks, alice.id) as never, sectionId);
		const json = JSON.stringify(sets);
		expect(json).not.toContain('@');
		expect(json).not.toContain('style_updated_by');
		// POSITIVE CONTROL: the same student, the same RPC, before the projection.
		const raw = await rpc<unknown>(alice.id, 'public.classroom_team_board($1::uuid)', [sectionId]);
		expect(JSON.stringify(raw)).toContain('alice@boscotech.net');
	});

	it('a teacher sees the same posted board a student sees, and no draft', async () => {
		const sets = await loadPostedTeams(createPostgrestShim(db, fks, teacher.id) as never, sectionId);
		expect(sets.map((s) => s.id)).toEqual([postedId]);
		expect(sets[0].teams.some((t) => t.mine)).toBe(false);
	});

	it('taking the draw down takes it off the class page', async () => {
		await rpc(teacher.id, 'public.classroom_unpost_team_set($1::uuid)', [postedId]);
		try {
			expect(await loadPostedTeams(createPostgrestShim(db, fks, alice.id) as never, sectionId)).toEqual([]);
		} finally {
			await rpc(teacher.id, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [postedId, null]);
		}
	});

	it('a read that fails, or a deployment before the teams feature, is an empty list', async () => {
		const failing = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'missing' } }) };
		expect(await loadPostedTeams(failing as never, sectionId)).toEqual([]);
		const throwing = {
			rpc: async () => {
				throw new Error('network');
			}
		};
		expect(await loadPostedTeams(throwing as never, sectionId)).toEqual([]);
		expect(postedTeamSets([])).toEqual([]);
	});
});

describe('the class page mounts it for everyone', () => {
	it('the section layout reads it and the class page renders it', () => {
		const server = readFileSync(new URL('../src/routes/classroom/[sectionId]/+layout.server.ts', import.meta.url), 'utf8');
		const page = readFileSync(new URL('../src/routes/classroom/[sectionId]/+layout.svelte', import.meta.url), 'utf8');
		expect(server).toMatch(/loadPostedTeams\(supabase, params\.sectionId\)/);
		expect(server).toMatch(/teams: await teamsRead/);
		// Not behind canManage: the class sees it, and so does the teacher.
		expect(page).toMatch(/\{#if data\.teams\?\.length\}\s*<ClassTeams sets=\{data\.teams\} \/>/);
	});
});
