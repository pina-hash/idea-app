// tests/db/classroom-team-edits.test.ts
//
// 0225 PART A: A POSTED DRAW CAN BE EDITED BY HAND, AND SAYS IT WAS
// (decision 44). What would fail SILENTLY, and so is asserted here:
//
//   1. THE APPLY OVER A REAL DRAW. The file re-creates `classroom_team_board`
//      and adds two columns to a table that already holds rows. So the chain is
//      booted SHORT of 0225, a draw is saved, posted and styled through the REAL
//      0223 RPCs, and only then is 0225 applied over the top. The seeded draw
//      must read back identical, for a teacher and for a student, apart from the
//      two keys 0225 adds, which must both be null.
//
//   2. THE BOARD IS 0223'S BODY PLUS TWO LINES. A re-created function is where
//      error semantics change quietly, so the body is diffed against 0223's own
//      text, byte for byte, rather than trusted.
//
//   3. WHO MADE THE EDIT IS A MANAGER'S FACT. A student learns that the teams
//      were changed and never by whom; that is asserted in both directions on
//      one draw, and mutation-proved (see the history entry).
//
//   4. THE MOVE'S GATE, every arm in both directions: a manager permitted, and
//      a manager of another class, a student on the team, a student of another
//      class, anon, a target team from another draw, an archived draw and a
//      missing draw refused, each beside a positive control on the same draw.
//
//   5. A CROSS-SET MEMBER ROW IS UNREPRESENTABLE, asserted as the connection
//      owner, where nothing but 0223's composite key can be what refuses.
//
//   6. THE CLIENT SHIPS BEFORE THE APPLY. The move transport answers
//      `unavailable` on PGRST202 alone and the board transport fills in the
//      two missing keys as null, both measured against the real pre-0225
//      database through the PostgREST shim.
//
// WHERE THE EXPECTED VALUES COME FROM: the pre-0225 board is read off the real
// database before the apply, the team assignments are stated in the fixture,
// the refusal sentences are the migration's own words, and the grants are read
// off pg_catalog.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { createTeamTransports, type TeamBoardResult, type TeamMoveResult } from '../../src/lib/classroom/teams';
import { scanFile } from '../../tools/apply-migration.mjs';

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
	// The sweep last of the pre-existing files, then 0223, then (by hand, after
	// the seed) 0225: the real production order, in which both files arrive
	// after the sweep and must revoke for themselves.
	'0137_anon_execute_sweep.sql',
	'0223_classroom_teams.sql'
] as const;

const MIGRATIONS = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const SQL_0225 = readFileSync(`${MIGRATIONS}0225_classroom_team_edits_and_class_themes.sql`, 'utf8');
const SQL_0223 = readFileSync(`${MIGRATIONS}0223_classroom_teams.sql`, 'utf8');

const MOVE_CALL = 'public.classroom_move_team_member($1::uuid, $2, $3::uuid)';
const STYLE_CALL = 'public.classroom_set_team_style($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8)';

interface BoardMember {
	student_email: string;
	display_name: string;
	still_enrolled: boolean;
}
interface BoardTeam {
	id: string;
	team_number: number;
	name: string | null;
	mine: boolean;
	members: BoardMember[];
	[key: string]: unknown;
}
interface BoardSet {
	id: string;
	label: string;
	seed: string;
	showing: boolean;
	edited_at?: string | null;
	edited_by?: string | null;
	teams: BoardTeam[];
	[key: string]: unknown;
}
interface Board {
	ok: boolean;
	manages: boolean;
	sets: BoardSet[];
}
interface MoveAnswer {
	ok: boolean;
	moved: boolean;
	added: boolean;
	team_id: string;
}

let db: TestDb;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let carla: SeededUser;
let dana: SeededUser;
/** Enrolled in this class, on NO team of the seeded draw: the latecomer. */
let erik: SeededUser;
/** Enrolled and then deactivated before the draw was edited, on NO team. */
let fern: SeededUser;
/** Enrolled in a DIFFERENT class entirely. */
let zoe: SeededUser;
let sectionId: string;
let otherSectionId: string;

/** The seeded draw: saved, posted and styled through 0223, before 0225 exists. */
let seededSet: string;
let teamOne: string;
let teamTwo: string;

let boardBeforeTeacher: Board;
let boardBeforeStudent: Board;
let moveBeforeApply: TeamMoveResult;
let transportBoardBeforeApply: TeamBoardResult;

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** The refusal sentence, or null where the call succeeded. */
async function refusal(userId: string, call: string, params: unknown[]): Promise<string | null> {
	try {
		await rpc(userId, call, params);
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

async function saveSet(label: string, teams: readonly (readonly string[])[]): Promise<string> {
	return rpc<string>(
		teacher.id,
		'public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb)',
		[
			sectionId,
			label,
			4242,
			'count',
			teams.length,
			JSON.stringify(teams.map((members, i) => ({ team_number: i + 1, members })))
		]
	);
}

const board = (userId: string) =>
	rpc<Board>(userId, 'public.classroom_team_board($1::uuid)', [sectionId]);

const setOf = (b: Board, id: string) => b.sets.find((s) => s.id === id);

/** Which team each address is on, for one set, read off a board. */
function assignment(set: BoardSet): Record<string, number> {
	return Object.fromEntries(
		set.teams.flatMap((t) => t.members.map((m) => [m.student_email, t.team_number] as const))
	);
}

/** A set with the two keys 0225 adds taken back out, for the before/after comparison. */
function withoutMark(set: BoardSet): BoardSet {
	const { edited_at: _a, edited_by: _b, ...rest } = set;
	return rest as BoardSet;
}

function pasteTrap(sql: string): string[] {
	const found: string[] = [];
	const tags = new Map<string, number>();
	sql.split('\n').forEach((line, i) => {
		const at = line.indexOf('--');
		const code = at === -1 ? line : line.slice(0, at);
		const comment = at === -1 ? '' : line.slice(at);
		if (comment.includes('$')) found.push(`line ${i + 1}: a dollar sign in a comment`);
		for (const tag of code.match(/\$[A-Za-z_]*\$/g) ?? []) tags.set(tag, (tags.get(tag) ?? 0) + 1);
	});
	for (const [tag, n] of tags) if (n % 2 !== 0) found.push(`${tag} appears ${n} time(s)`);
	return found;
}

/** One function's body out of a migration file: the text between its dollar tags. */
function functionBody(sql: string, header: string, tag: string): string {
	const start = sql.indexOf(header);
	if (start < 0) throw new Error(`no ${header} in the file`);
	const open = sql.indexOf(`as ${tag}`, start);
	const close = sql.indexOf(`${tag};`, open + tag.length + 3);
	if (open < 0 || close < 0) throw new Error(`no ${tag} body after ${header}`);
	return sql.slice(open + 3 + tag.length, close);
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);

	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Otto Ther');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cruz');
	dana = await createUser(db, 'dana@boscotech.net', 'Dana Diaz');
	erik = await createUser(db, 'erik@boscotech.net', 'Erik Estrada');
	fern = await createUser(db, 'fern@boscotech.net', 'Fern Flores');
	zoe = await createUser(db, 'zoe@boscotech.net', 'Zoe Zamora');

	const courseId = (
		await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	sectionId = (
		await rpc<{ section_id: string }>(teacher.id, 'public.classroom_upsert_section($1::uuid, $2, $3)', [
			courseId,
			'Period 3',
			'Block C'
		])
	).section_id;
	otherSectionId = (
		await rpc<{ section_id: string }>(
			otherTeacher.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 9', 'Block A']
		)
	).section_id;

	for (const [u, name] of [
		[alice, 'Alice Alvarez'],
		[bruno, 'Bruno Barros'],
		[carla, 'Carla Cruz'],
		[dana, 'Dana Diaz'],
		[erik, 'Erik Estrada'],
		[fern, 'Fern Flores']
	] as const) {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionId,
			u.email,
			name,
			true
		]);
	}
	await rpc(otherTeacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		otherSectionId,
		zoe.email,
		'Zoe Zamora',
		true
	]);

	// THE PRE-0225 WORLD, every row written by the real RPC that writes it: a
	// draw saved, posted to the class, and decorated by one of its members.
	seededSet = await saveSet('Lab pairs', [
		[alice.email, carla.email],
		[bruno.email, dana.email]
	]);
	await rpc(teacher.id, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [seededSet, null]);
	const seeded = setOf(await board(teacher.id), seededSet)!;
	teamOne = seeded.teams.find((t) => t.team_number === 1)!.id;
	teamTwo = seeded.teams.find((t) => t.team_number === 2)!.id;
	await rpc(alice.id, STYLE_CALL, [
		teamOne,
		'The Gearboxes',
		'#3f8f5f',
		'solid',
		JSON.stringify('#102015'),
		null,
		null,
		'Built to last'
	]);
	// Fern leaves the class after the draw was saved, and was never on it.
	await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		sectionId,
		fern.email,
		'Fern Flores',
		false
	]);

	boardBeforeTeacher = await board(teacher.id);
	boardBeforeStudent = await board(alice.id);

	// The client, shipped before the apply: measured against the real pre-0225
	// database through the PostgREST shim.
	const fks = await loadForeignKeys(db);
	const before = createTeamTransports(createPostgrestShim(db, fks, teacher.id) as never);
	moveBeforeApply = await before.move!(seededSet, erik.email, teamOne);
	transportBoardBeforeApply = await before.board(sectionId);

	// THE APPLY, exactly as the SQL editor or apply-migration would send it.
	await db.sql(SQL_0225);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('0225 is appliable the way it would be applied', () => {
	test('apply-migration would send it: nothing refused, nothing warned', () => {
		const scan = scanFile(SQL_0225);
		expect(scan.findings).toEqual([]);
		expect(scan.statements).toBeGreaterThan(20);
	});

	test('it carries no paste trap, and the check finds one when one is planted', () => {
		expect(pasteTrap(SQL_0225)).toEqual([]);
		// POSITIVE CONTROLS: the instrument does see a trap when there is one.
		expect(pasteTrap('select 1; -- a $tag$ in a comment\n')).toHaveLength(1);
		expect(pasteTrap('create function f() as $x$ select 1;\n')).toHaveLength(1);
	});
});

// ===========================================================================
describe('the seeded draw survives the apply unchanged', () => {
	test('a teacher reads back the identical board, plus an unedited mark on every set', async () => {
		const after = await board(teacher.id);
		expect(after.sets.length).toBe(boardBeforeTeacher.sets.length);
		expect(after.sets.map(withoutMark)).toEqual(boardBeforeTeacher.sets);
		for (const s of after.sets) {
			expect(s).toHaveProperty('edited_at', null);
			expect(s).toHaveProperty('edited_by', null);
		}
		// The keys are genuinely new: the pre-0225 board did not carry them.
		expect(boardBeforeTeacher.sets[0]).not.toHaveProperty('edited_at');
	});

	test('a student reads back the identical board too, style and membership included', async () => {
		const after = await board(alice.id);
		expect(after.sets.map(withoutMark)).toEqual(boardBeforeStudent.sets);
		const s = setOf(after, seededSet)!;
		expect(s.teams.find((t) => t.id === teamOne)!.name).toBe('The Gearboxes');
		expect(s).toHaveProperty('edited_at', null);
	});

	test("the re-created board is 0223's body byte for byte, plus exactly the two projected lines", () => {
		const header = 'create or replace function public.classroom_team_board(p_section_id uuid)';
		const was = functionBody(SQL_0223, header, '$teams$');
		const now = functionBody(SQL_0225, header, '$teams$');
		const added = [
			'\t\t\ts.edited_at,\n',
			'\t\t\tcase when v_manages then s.edited_by end as edited_by,\n'
		];
		for (const line of added) expect(now).toContain(line);
		expect(added.reduce((text, line) => text.replace(line, ''), now)).toBe(was);
		// POSITIVE CONTROL: the two bodies really differ, so equality above is
		// not two reads of one string.
		expect(now).not.toBe(was);
	});
});

// ===========================================================================
describe('the client, shipped before the apply', () => {
	test('the move transport answers unavailable on PGRST202, and nothing else', () => {
		expect(moveBeforeApply).toEqual({ ok: false, reason: 'unavailable' });
	});

	test('the board transport fills the two missing keys in as null', () => {
		expect(transportBoardBeforeApply.ok).toBe(true);
		if (!transportBoardBeforeApply.ok) return;
		const s = transportBoardBeforeApply.sets.find((x) => x.id === seededSet)!;
		expect(s).toHaveProperty('edited_at', null);
		expect(s).toHaveProperty('edited_by', null);
	});
});

// ===========================================================================
describe('the grant surface, read off the catalog', () => {
	test('anon executes neither the move nor the board; authenticated executes both', async () => {
		const { rows } = await db.sql<{ sig: string; a: boolean; au: boolean }>(
			`select sig,
			        has_function_privilege('anon', 'public.' || sig, 'execute') as a,
			        has_function_privilege('authenticated', 'public.' || sig, 'execute') as au
			   from unnest($1::text[]) as sig`,
			[['classroom_move_team_member(uuid, text, uuid)', 'classroom_team_board(uuid)']]
		);
		expect(rows.filter((r) => r.a)).toEqual([]);
		expect(rows.filter((r) => r.au)).toHaveLength(2);
	});

	test('anon is refused the move at the grant, before any body runs', async () => {
		const err = await db.asAnon(async (q) => {
			try {
				await q(`select ${MOVE_CALL}`, [seededSet, erik.email, teamOne]);
				return null;
			} catch (e) {
				return (e as Error).message;
			}
		});
		expect(err).toMatch(/permission denied/i);
	});
});

// ===========================================================================
describe('a teacher moves a student, and the draw says it was edited', () => {
	test('a move changes the one member row, stamps the set, and keeps the seed', async () => {
		const before = setOf(await board(teacher.id), seededSet)!;
		expect(assignment(before)[alice.email]).toBe(1);

		const r = await rpc<MoveAnswer>(teacher.id, MOVE_CALL, [seededSet, alice.email, teamTwo]);
		expect(r).toEqual({ ok: true, moved: true, added: false, team_id: teamTwo });

		const after = setOf(await board(teacher.id), seededSet)!;
		expect(assignment(after)).toEqual({
			[alice.email]: 2,
			[carla.email]: 1,
			[bruno.email]: 2,
			[dana.email]: 2
		});
		expect(after.seed).toBe(before.seed);
		expect(after.edited_at).not.toBeNull();
		expect(after.edited_by).toBe(teacher.email);
	});

	test('a student sees that the teams were edited and never who edited them', async () => {
		const s = setOf(await board(alice.id), seededSet)!;
		// Both directions on one draw: the fact is there, the address is not.
		expect(s.edited_at).not.toBeNull();
		expect(s.edited_by).toBeNull();
		// POSITIVE CONTROL: the same draw, read by its manager, does name them.
		expect(setOf(await board(teacher.id), seededSet)!.edited_by).toBe(teacher.email);
	});

	test('moving a student onto the team they are already on changes nothing and stamps nothing', async () => {
		const fresh = await saveSet('Untouched', [[alice.email, bruno.email], [carla.email, dana.email]]);
		const b = setOf(await board(teacher.id), fresh)!;
		const theirTeam = b.teams.find((t) => t.team_number === 1)!.id;
		const r = await rpc<MoveAnswer>(teacher.id, MOVE_CALL, [fresh, alice.email, theirTeam]);
		expect(r).toEqual({ ok: true, moved: false, added: false, team_id: theirTeam });
		const after = setOf(await board(teacher.id), fresh)!;
		expect({ at: after.edited_at, by: after.edited_by }).toEqual({ at: null, by: null });
		// POSITIVE CONTROL: a real move on the same draw does stamp it.
		const other = b.teams.find((t) => t.team_number === 2)!.id;
		await rpc(teacher.id, MOVE_CALL, [fresh, alice.email, other]);
		expect(setOf(await board(teacher.id), fresh)!.edited_at).not.toBeNull();
	});

	test('a latecomer with a live enrollment is ADDED to a team', async () => {
		const r = await rpc<MoveAnswer>(teacher.id, MOVE_CALL, [seededSet, erik.email, teamOne]);
		expect(r).toEqual({ ok: true, moved: false, added: true, team_id: teamOne });
		const s = setOf(await board(teacher.id), seededSet)!;
		expect(assignment(s)[erik.email]).toBe(1);
		expect(s.teams.find((t) => t.id === teamOne)!.members.find((m) => m.student_email === erik.email))
			.toEqual({ student_email: erik.email, display_name: 'Erik Estrada', still_enrolled: true });
	});

	test('the address is normalized, so a mixed-case paste moves the same student', async () => {
		const r = await rpc<MoveAnswer>(teacher.id, MOVE_CALL, [seededSet, '  ERIK@BoscoTech.net ', teamTwo]);
		expect(r).toEqual({ ok: true, moved: true, added: false, team_id: teamTwo });
		expect(assignment(setOf(await board(teacher.id), seededSet)!)[erik.email]).toBe(2);
	});

	test('a student who has LEFT the class can still be moved, because they are still on the draw', async () => {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionId,
			carla.email,
			'Carla Cruz',
			false
		]);
		try {
			const r = await rpc<MoveAnswer>(teacher.id, MOVE_CALL, [seededSet, carla.email, teamTwo]);
			expect(r).toMatchObject({ ok: true, moved: true });
			const row = setOf(await board(teacher.id), seededSet)!
				.teams.flatMap((t) => t.members)
				.find((m) => m.student_email === carla.email)!;
			expect(row.still_enrolled).toBe(false);
		} finally {
			await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
				sectionId,
				carla.email,
				'Carla Cruz',
				true
			]);
		}
	});

	test('a rename by the teacher changes the name and does NOT mark the draw edited', async () => {
		const fresh = await saveSet('Rename only', [[alice.email, bruno.email]]);
		const team = setOf(await board(teacher.id), fresh)!.teams[0].id;
		await rpc(teacher.id, STYLE_CALL, [team, 'Renamed', null, null, null, null, null, null]);
		const s = setOf(await board(teacher.id), fresh)!;
		expect(s.teams[0].name).toBe('Renamed');
		expect(s.edited_at).toBeNull();
	});
});

// ===========================================================================
describe('who may move a student: a teacher of THIS class, and nobody else', () => {
	test('a teacher of another class is refused, and nothing moves', async () => {
		const before = assignment(setOf(await board(teacher.id), seededSet)!);
		expect(await refusal(otherTeacher.id, MOVE_CALL, [seededSet, bruno.email, teamOne])).toBe(
			'Only a teacher of this class can change its teams.'
		);
		expect(assignment(setOf(await board(teacher.id), seededSet)!)).toEqual(before);
	});

	test('a student on the team is refused', async () => {
		expect(await refusal(bruno.id, MOVE_CALL, [seededSet, bruno.email, teamOne])).toBe(
			'Only a teacher of this class can change its teams.'
		);
	});

	test('a student of another class is refused', async () => {
		expect(await refusal(zoe.id, MOVE_CALL, [seededSet, zoe.email, teamOne])).toBe(
			'Only a teacher of this class can change its teams.'
		);
	});

	test('a caller with no account row is refused as signed out', async () => {
		expect(
			await refusal('00000000-0000-4000-8000-000000000000', MOVE_CALL, [seededSet, bruno.email, teamOne])
		).toBe('You must be signed in to change teams.');
	});

	test('the POSITIVE CONTROL for every refusal above: the teacher makes the same move', async () => {
		const r = await rpc<MoveAnswer>(teacher.id, MOVE_CALL, [seededSet, bruno.email, teamOne]);
		expect(r).toMatchObject({ ok: true, moved: true });
		expect(assignment(setOf(await board(teacher.id), seededSet)!)[bruno.email]).toBe(1);
	});

	test('a student who is not enrolled in this class cannot be added', async () => {
		expect(await refusal(teacher.id, MOVE_CALL, [seededSet, zoe.email, teamOne])).toBe(
			'That student is not enrolled in this class.'
		);
		expect(await refusal(teacher.id, MOVE_CALL, [seededSet, 'ghost@boscotech.net', teamOne])).toBe(
			'That student is not enrolled in this class.'
		);
		// An INACTIVE enrollment is not a live one: Fern left before the edit.
		expect(await refusal(teacher.id, MOVE_CALL, [seededSet, fern.email, teamOne])).toBe(
			'That student is not enrolled in this class.'
		);
		const members = setOf(await board(teacher.id), seededSet)!.teams.flatMap((t) =>
			t.members.map((m) => m.student_email)
		);
		expect(members).not.toContain(zoe.email);
		expect(members).not.toContain(fern.email);
	});

	test('a target team from another draw is refused by the RPC, and the member stays put', async () => {
		const other = await saveSet('Another draw', [[alice.email], [bruno.email]]);
		const foreignTeam = setOf(await board(teacher.id), other)!.teams[0].id;
		const before = assignment(setOf(await board(teacher.id), seededSet)!);
		expect(await refusal(teacher.id, MOVE_CALL, [seededSet, dana.email, foreignTeam])).toBe(
			'That team is not part of this draw.'
		);
		expect(assignment(setOf(await board(teacher.id), seededSet)!)).toEqual(before);
	});

	test('an archived draw and a draw that does not exist answer the same sentence', async () => {
		const retired = await saveSet('Retired', [[alice.email], [bruno.email]]);
		const team = setOf(await board(teacher.id), retired)!.teams[1].id;
		await rpc(teacher.id, 'public.classroom_archive_team_set($1::uuid)', [retired]);
		expect(await refusal(teacher.id, MOVE_CALL, [retired, alice.email, team])).toBe('Team set not found.');
		expect(
			await refusal(teacher.id, MOVE_CALL, ['00000000-0000-4000-8000-00000000abcd', alice.email, team])
		).toBe('Team set not found.');
	});
});

// ===========================================================================
describe('one student, one team of one draw: a key, with RLS out of the way', () => {
	test('a member row naming a team of ANOTHER draw is unrepresentable, as the connection owner', async () => {
		const other = await saveSet('Key check', [[alice.email], [bruno.email]]);
		const foreignTeam = setOf(await board(teacher.id), other)!.teams[0].id;
		// Insert: dana into seededSet but onto a team that belongs to `other`.
		await expect(
			db.sql(
				`insert into public.classroom_team_members (team_set_id, team_id, student_email)
				 values ($1, $2, $3)`,
				[seededSet, foreignTeam, 'nobody@boscotech.net']
			)
		).rejects.toThrow(/classroom_team_members_team_fk|foreign key/i);
		// Update: an existing member's team repointed across draws.
		await expect(
			db.sql(
				`update public.classroom_team_members set team_id = $1
				  where team_set_id = $2 and student_email = $3`,
				[foreignTeam, seededSet, dana.email]
			)
		).rejects.toThrow(/classroom_team_members_team_fk|foreign key/i);
		// POSITIVE CONTROL: the same statement onto a team of the SAME draw lands.
		const r = await db.sql(
			`update public.classroom_team_members set team_id = $1
			  where team_set_id = $2 and student_email = $3`,
			[teamOne, seededSet, dana.email]
		);
		expect(r.rowCount).toBe(1);
	});
});

// ===========================================================================
describe('the move transport, through the PostgREST shim, after the apply', () => {
	test('a teacher moves a student, and a refusal comes back in the database\'s own words', async () => {
		const fks = await loadForeignKeys(db);
		const t = createTeamTransports(createPostgrestShim(db, fks, teacher.id) as never);
		expect(await t.move!(seededSet, dana.email, teamTwo)).toEqual({ ok: true, moved: true, added: false });
		expect(await t.move!(seededSet, dana.email, teamTwo)).toEqual({ ok: true, moved: false, added: false });
		const refused = await t.move!(seededSet, zoe.email, teamTwo);
		expect(refused).toEqual({
			ok: false,
			reason: 'error',
			message: 'That student is not enrolled in this class.'
		});
		const asStudent = createTeamTransports(createPostgrestShim(db, fks, alice.id) as never);
		const denied = await asStudent.move!(seededSet, dana.email, teamOne);
		// A refusal is NOT `unavailable`: only PGRST202 degrades.
		expect(denied).toEqual({
			ok: false,
			reason: 'error',
			message: 'Only a teacher of this class can change its teams.'
		});
	});

	test('the board transport carries the mark to a manager, and to a student without the address', async () => {
		const fks = await loadForeignKeys(db);
		const mgr = await createTeamTransports(createPostgrestShim(db, fks, teacher.id) as never).board(sectionId);
		const stu = await createTeamTransports(createPostgrestShim(db, fks, alice.id) as never).board(sectionId);
		expect(mgr.ok && stu.ok).toBe(true);
		if (!mgr.ok || !stu.ok) return;
		const m = mgr.sets.find((s) => s.id === seededSet)!;
		const s = stu.sets.find((x) => x.id === seededSet)!;
		expect(m.edited_by).toBe(teacher.email);
		expect(s.edited_at).toBe(m.edited_at);
		expect(s.edited_by).toBeNull();
	});
});

// ===========================================================================
describe('a second paste changes nothing', () => {
	test('the file re-applies over edited draws: every board reads back identical, marks included, one of everything', async () => {
		const teacherBefore = await board(teacher.id);
		const studentBefore = await board(alice.id);
		expect(setOf(teacherBefore, seededSet)!.edited_at).not.toBeNull();

		await db.sql(SQL_0225);

		expect(await board(teacher.id)).toEqual(teacherBefore);
		expect(await board(alice.id)).toEqual(studentBefore);
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*)::text as n from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
			  where p.proname = any($1::text[])
			  group by p.proname order by p.proname`,
			[['classroom_move_team_member', 'classroom_team_board']]
		);
		expect(rows).toEqual([
			{ proname: 'classroom_move_team_member', n: '1' },
			{ proname: 'classroom_team_board', n: '1' }
		]);
		const c = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint where conname = 'classroom_team_sets_edited_mark'`
		);
		expect(c.rows[0].n).toBe('1');
	});
});
