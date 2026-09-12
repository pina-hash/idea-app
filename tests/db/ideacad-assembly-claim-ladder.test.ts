// tests/db/ideacad-assembly-claim-ladder.test.ts
//
// THE LADDER ONTO 0205, MEASURED IN BOTH DIRECTIONS ON ONE DATABASE.
//
// 0207 is pasted THIRD, after 0205 (ledger 0179) and 0206 (ledger 0181), so in
// production `_ideacad_can_write_document(uuid)` is there. But a deployment
// sitting between two hand-applied migrations is a real state, so
// `_ideacad_part_writer` is written as a select ladder: it asks
// `to_regprocedure` whether 0205's predicate exists, calls it when it does, and
// degrades to owner-only when it does not.
//
// THIS FILE IS THE OTHER HALF OF tests/db/ideacad-assembly-checkout.test.ts,
// which plants that predicate and would pass whether or not 0207 ever consulted
// it. Here the SAME database answers both ways: first with 0207 alone (a
// classmate is refused), then with the predicate created (the same classmate is
// admitted), then with it dropped again (refused once more). A ladder that
// ignored its wide rung would fail the middle case; a ladder that FAILED without
// it -- a plain call to a function that does not exist -- would fail the first
// and last, so neither direction can pass vacuously.
//
// WHAT IS NOT PROVED HERE: 0205 itself. The predicate created below carries
// 0205's verified signature and semantics; it is not 0205's file, which this
// bundle does not own.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

let db: TestDb;
let teacher: SeededUser;
let owner: SeededUser;
let mate: SeededUser;
let documentId: string;
let partId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

/**
 * `_ideacad_part_writer` is a PRIVATE predicate: nothing names it in a policy,
 * so `authenticated` deliberately holds no EXECUTE on it and a client cannot
 * call it at all (pinned below). It is asked here as `service_role`, which does
 * hold it, with the caller's own claims set -- so the answer is still about that
 * person, through the same `current_user_email()` the RPCs use.
 */
const writerSays = (user: SeededUser) =>
	db.asServiceRole(async (q) => {
		const { rows } = await q<{ result: boolean }>(
			'select public._ideacad_part_writer($1::uuid) as result',
			[documentId]
		);
		return rows[0].result;
	}, user.id);

const CREATE_0205_PREDICATES = `
	create table if not exists public.stub_ideacad_grants(
		document_id uuid not null, grantee_email text not null,
		role text not null check (role in ('viewer','editor')),
		primary key (document_id, grantee_email));
	create or replace function public._ideacad_can_write_document(p_document_id uuid)
	returns boolean language sql stable security definer set search_path = '' as $w$
		select exists (select 1 from public.ideacad_documents d
			where d.id = p_document_id and d.student_email = public.current_user_email())
		or exists (select 1 from public.stub_ideacad_grants g
			where g.document_id = p_document_id
				and g.grantee_email = public.current_user_email() and g.role = 'editor');
	$w$;
	create or replace function public._ideacad_can_read_document(p_document_id uuid)
	returns boolean language sql stable security definer set search_path = '' as $r$
		select public._ideacad_can_write_document(p_document_id)
			or exists (select 1 from public.stub_ideacad_grants g
				where g.document_id = p_document_id
					and g.grantee_email = public.current_user_email());
	$r$;
`;

const DROP_0205_PREDICATES = `
	drop function if exists public._ideacad_can_write_document(uuid);
	drop function if exists public._ideacad_can_read_document(uuid);
`;

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'asmlad.teacher@boscotech.edu', 'Ladder Teacher');
	owner = await createUser(db, 'asmlad.owner@boscotech.net', 'Owner');
	mate = await createUser(db, 'asmlad.mate@boscotech.net', 'Mate');

	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEAASMLAD', 'IdeaCAD Ladder')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 4', teacher.email]
	);
	for (const student of [owner, mate]) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			section.section_id,
			student.email,
			student.email
		]);
	}
	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[section.section_id]]
	);
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		item.item_id,
		JSON.stringify({ defaultFeatures: { blade: 'seed' } })
	]);
	const opened = await call<{ document: { id: string } }>(
		owner,
		'public.ideacad_open_document($1::uuid)',
		[item.item_id]
	);
	documentId = opened.document.id;
	const { rows } = await db.sql<{ id: string }>(
		'select id from public.ideacad_parts where document_id = $1',
		[documentId]
	);
	partId = rows[0].id;
}, 600_000);

afterAll(async () => db?.stop());

describe('rung 2 (0207 alone, as the chain in this repo stands): owner only', () => {
	it('has no 0205 predicate to consult', async () => {
		const { rows } = await db.sql<{ present: boolean }>(
			`select to_regprocedure('public._ideacad_can_write_document(uuid)') is not null as present`
		);
		expect(rows[0].present).toBe(false);
	});

	it('is not reachable by a client at all, which is why the cases below ask it as service_role', async () => {
		await expect(
			call(owner, 'public._ideacad_part_writer($1::uuid)', [documentId])
		).rejects.toThrow(/permission denied for function _ideacad_part_writer/);
		const { rows } = await db.sql<{ authed: boolean; svc: boolean; anon: boolean }>(
			`select has_function_privilege('authenticated', 'public._ideacad_part_writer(uuid)', 'execute') as authed,
			        has_function_privilege('service_role', 'public._ideacad_part_writer(uuid)', 'execute') as svc,
			        has_function_privilege('anon', 'public._ideacad_part_writer(uuid)', 'execute') as anon`
		);
		expect(rows[0]).toEqual({ authed: false, svc: true, anon: false });
	});

	it('answers TRUE for the owner and FALSE for a classmate', async () => {
		expect(await writerSays(owner)).toBe(true);
		expect(await writerSays(mate)).toBe(false);
	});

	it('refuses the classmate a claim, and admits the owner -- so the degraded rung is not simply shut', async () => {
		await expect(call(mate, 'public.ideacad_claim_part($1::uuid)', [partId])).rejects.toThrow(
			/not on this assembly/
		);
		await expect(
			call<{ ok: boolean }>(owner, 'public.ideacad_claim_part($1::uuid)', [partId])
		).resolves.toMatchObject({ ok: true });
		await db.sql(
			'update public.ideacad_parts set held_by = null, held_at = null, hold_beat_at = null where id = $1',
			[partId]
		);
	});

	it('and the read ladder degrades the same way: the classmate cannot open the assembly', async () => {
		await expect(call(mate, 'public.ideacad_assembly($1::uuid)', [documentId])).rejects.toThrow(
			/cannot open this assembly/
		);
		// The teacher still reads it, because that rung is 0201's and needs no
		// 0205 at all.
		await expect(
			call(teacher, 'public.ideacad_assembly($1::uuid)', [documentId])
		).resolves.toBeTruthy();
	});
});

describe('rung 1 (0205 present, which is production after the second paste)', () => {
	beforeAll(async () => {
		await db.sql(CREATE_0205_PREDICATES);
		await db.sql(
			`insert into public.stub_ideacad_grants(document_id, grantee_email, role)
			 values ($1, $2, 'editor') on conflict do nothing`,
			[documentId, mate.email]
		);
	});

	it('now consults it: the same classmate answers TRUE with no change to 0207', async () => {
		expect(await writerSays(mate)).toBe(true);
		expect(await writerSays(owner)).toBe(true);
	});

	it('admits the classmate to a claim, and to the assembly read', async () => {
		await expect(
			call<{ ok: boolean; heldBy: string }>(mate, 'public.ideacad_claim_part($1::uuid)', [partId])
		).resolves.toMatchObject({ ok: true, heldBy: mate.email });
		await expect(
			call<{ canWrite: boolean }>(mate, 'public.ideacad_assembly($1::uuid)', [documentId])
		).resolves.toMatchObject({ canWrite: true, isOwner: false });
	});

	it('is a GRANT and not a blanket widening: a viewer is admitted to read and refused the claim', async () => {
		const viewer = await createUser(db, 'asmlad.viewer@boscotech.net', 'Viewer');
		await db.sql(
			`insert into public.stub_ideacad_grants(document_id, grantee_email, role)
			 values ($1, $2, 'viewer') on conflict do nothing`,
			[documentId, viewer.email]
		);
		expect(await writerSays(viewer)).toBe(false);
		await expect(
			call<{ canWrite: boolean }>(viewer, 'public.ideacad_assembly($1::uuid)', [documentId])
		).resolves.toMatchObject({ canWrite: false });
		await expect(call(viewer, 'public.ideacad_claim_part($1::uuid)', [partId])).rejects.toThrow(
			/not on this assembly/
		);
	});

	it('still keeps the OWNER-only controls owner-only: 0205 widens editing, never structure', async () => {
		await expect(assignAs(mate)).rejects.toThrow(/Only the owner/);
		await expect(
			call(mate, "public.ideacad_add_part($1::uuid, 'Not yours', '{}'::jsonb)", [documentId])
		).rejects.toThrow(/Only the owner/);
	});
});

describe('back to rung 2: dropping the predicate degrades again rather than breaking', () => {
	beforeAll(async () => {
		await db.sql(
			'update public.ideacad_parts set held_by = null, held_at = null, hold_beat_at = null where id = $1',
			[partId]
		);
		await db.sql(DROP_0205_PREDICATES);
	});

	it('answers FALSE for the classmate again, with nothing raised', async () => {
		expect(await writerSays(mate)).toBe(false);
		expect(await writerSays(owner)).toBe(true);
	});

	it('does not throw a missing-function error at the caller', async () => {
		await expect(call(mate, 'public.ideacad_claim_part($1::uuid)', [partId])).rejects.toThrow(
			/not on this assembly/
		);
		await expect(
			call<{ ok: boolean }>(owner, 'public.ideacad_claim_part($1::uuid)', [partId])
		).resolves.toMatchObject({ ok: true });
	});
});

function assignAs(user: SeededUser) {
	return call(user, 'public.ideacad_assign_part($1::uuid, $2)', [partId, user.email]);
}
