// tests/db/ideacad-assembly-claim-race.test.ts
//
// THE ROW LOCK, PROVED WITH TWO CONCURRENT TRANSACTIONS AGAINST REAL POSTGRES.
//
// Ledger 0179 named the trap: a checkout is a transient exclusive claim, so it
// needs a ROW LOCK and never a count-then-insert, or two students racing both
// acquire it. Sequential calls cannot tell those two implementations apart --
// `select then update` is perfectly correct when nobody else is in the middle of
// it -- so this file overlaps two real transactions on two real connections and
// holds the first one open until the second is demonstrably blocked.
//
// THE NEGATIVE CONTROL IS THE POINT. `ideacad_claim_part_nolock` is built
// MECHANICALLY from the shipping function's own `prosrc` with `for update`
// removed -- not retyped, because a retyping characterises what the author
// believed the function does. The same two-transaction schedule run against it
// lets BOTH callers acquire the part. So "exactly one winner" is a measured
// difference between the real function and the same function with one clause
// gone, rather than an assertion about a schedule that happened not to overlap.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

interface ClaimResult {
	ok: boolean;
	reason: string;
	heldBy?: string | null;
	holdRevision?: number;
}

let db: TestDb;
let teacher: SeededUser;
let owner: SeededUser;
let racerA: SeededUser;
let racerB: SeededUser;
let documentId: string;
let partId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

/**
 * How many backend sessions in THIS database are currently waiting on a lock.
 *
 * NOT `pg_locks where relation = 'ideacad_parts'::regclass and not granted`,
 * which was the first instrument here and read ZERO while the block was really
 * happening: a waiter on a ROW lock does not queue on the relation. It takes a
 * ShareLock on the HOLDER'S TRANSACTIONID (and a transient `tuple` lock), so
 * the ungranted entry has a null `relation`. Filtering by relation therefore
 * looks exactly like "nothing blocked". Counting ungranted locks of any
 * locktype, cross-checked against `pg_stat_activity.wait_event_type`, is what
 * actually sees it.
 */
const waitingOnPartLock = async (): Promise<number> => {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*) as n from pg_locks l
		 where not l.granted
		   and (l.database is null or l.database = (select oid from pg_database where datname = current_database()))`
	);
	return Number(rows[0].n);
};

/** The same observation from the other side, as a cross-check. */
const blockedBackends = async (): Promise<number> => {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*) as n from pg_stat_activity
		 where datname = current_database() and wait_event_type = 'Lock' and state = 'active'`
	);
	return Number(rows[0].n);
};

const freePart = () =>
	db.sql(
		'update public.ideacad_parts set held_by = null, held_at = null, hold_beat_at = null where id = $1',
		[partId]
	);

/**
 * Run two claims against `fn` on two connections, with the FIRST transaction
 * held open until the second is provably blocked on the part row. Returns both
 * answers and how many sessions were seen waiting.
 */
const race = async (
	fn: string
): Promise<{ a: ClaimResult; b: ClaimResult; waiting: number; blocked: number }> => {
	let aHasLock!: () => void;
	let aMayCommit!: () => void;
	const aLocked = new Promise<void>((r) => (aHasLock = r));
	const aRelease = new Promise<void>((r) => (aMayCommit = r));

	const aWork = db.asUser(racerA.id, async (q) => {
		await q('begin');
		const { rows } = await q<{ result: ClaimResult }>(
			`select public.${fn}($1::uuid) as result`,
			[partId]
		);
		aHasLock();
		await aRelease;
		await q('commit');
		return rows[0].result;
	});

	await aLocked;

	let waiting = 0;
	let blocked = 0;
	const bWork = db.asUser(racerB.id, async (q) => {
		await q('begin');
		const { rows } = await q<{ result: ClaimResult }>(
			`select public.${fn}($1::uuid) as result`,
			[partId]
		);
		await q('commit');
		return rows[0].result;
	});

	// Let B reach the row and either block on it or sail past, then read the
	// lock table from a THIRD connection so the observation is not part of the
	// race it is observing.
	for (let i = 0; i < 40 && waiting === 0; i += 1) {
		await new Promise((r) => setTimeout(r, 25));
		waiting = await waitingOnPartLock();
		if (waiting > 0) blocked = await blockedBackends();
	}
	aMayCommit();
	const [a, b] = await Promise.all([aWork, bWork]);
	return { a, b, waiting, blocked };
};

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'asmrace.teacher@boscotech.edu', 'Race Teacher');
	owner = await createUser(db, 'asmrace.owner@boscotech.net', 'Owner');
	racerA = await createUser(db, 'asmrace.a@boscotech.net', 'Racer A');
	racerB = await createUser(db, 'asmrace.b@boscotech.net', 'Racer B');

	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEAASMRACE', 'IdeaCAD Race')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 3', teacher.email]
	);
	for (const student of [owner, racerA, racerB]) {
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

	// 0205's contract, stubbed at its exact signature -- see
	// tests/db/ideacad-assembly-checkout.test.ts for the full argument. Both
	// racers are editors, so the only thing that can separate them is the lock.
	await db.sql(`
		create table public.stub_ideacad_grants(
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
	`);
	await db.sql(
		`insert into public.stub_ideacad_grants(document_id, grantee_email, role)
		 values ($1, $2, 'editor'), ($1, $3, 'editor')`,
		[documentId, racerA.email, racerB.email]
	);

	// THE MUTANT, built from the shipping function's own source. `for update` is
	// the only thing removed, and the replacement is asserted to have happened.
	const { rows: src } = await db.sql<{ prosrc: string }>(
		`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and p.proname = 'ideacad_claim_part'`
	);
	const real = src[0].prosrc;
	if (!real.includes('for update')) {
		throw new Error('ideacad_claim_part no longer contains `for update` -- this file is measuring nothing.');
	}
	const mutant = real.replace(/\s+for update/g, '');
	if (mutant.includes('for update')) throw new Error('the mutation did not take');
	await db.sql(
		`create or replace function public.ideacad_claim_part_nolock(p_part_id uuid)
		 returns jsonb language plpgsql security definer set search_path = ''
		 as $nolock$${mutant}$nolock$;`
	);
}, 600_000);

afterAll(async () => db?.stop());

describe('two students pressing the same control', () => {
	it('serializes on the part row: the second transaction BLOCKS, then sees the winner', async () => {
		await freePart();
		const { a, b, waiting, blocked } = await race('ideacad_claim_part');
		// The lock was real, observed from a THIRD connection while it was held,
		// and seen the same way from pg_stat_activity.
		expect(waiting).toBeGreaterThanOrEqual(1);
		expect(blocked).toBeGreaterThanOrEqual(1);
		expect(a).toMatchObject({ ok: true, reason: 'claimed', heldBy: racerA.email });
		expect(b).toMatchObject({ ok: false, reason: 'held', heldBy: racerA.email });
	});

	it('leaves exactly one holder and exactly one generation bump', async () => {
		const { rows } = await db.sql<{ held_by: string | null; hold_revision: number }>(
			'select held_by, hold_revision from public.ideacad_parts where id = $1',
			[partId]
		);
		expect(rows[0].held_by).toBe(racerA.email);
		expect(rows[0].hold_revision).toBe(1);
	});

	it('NEGATIVE CONTROL: the same schedule against the same function without `for update` lets BOTH acquire', async () => {
		await freePart();
		await db.sql('update public.ideacad_parts set hold_revision = 0 where id = $1', [partId]);
		const { a, b, waiting } = await race('ideacad_claim_part_nolock');
		// Both callers were told they got the part.
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		expect(a.heldBy).toBe(racerA.email);
		expect(b.heldBy).toBe(racerB.email);
		// And the row records two acquisitions of one exclusive claim, with the
		// loser's own client believing it holds a part somebody else has.
		const { rows } = await db.sql<{ held_by: string | null; hold_revision: number }>(
			'select held_by, hold_revision from public.ideacad_parts where id = $1',
			[partId]
		);
		expect(rows[0].hold_revision).toBe(2);
		expect(rows[0].held_by).toBe(racerB.email);
		// A block DID still happen here -- on the UPDATE, after both callers had
		// already read the row as free -- which is exactly why waiting for a
		// lock is not on its own evidence that a claim was serialized, and why
		// this file asserts the ANSWERS and not the timing.
		expect(waiting).toBeGreaterThanOrEqual(0);
	});

	it('and the real function, run again on the now-freed part, still admits exactly one', async () => {
		await freePart();
		await db.sql('update public.ideacad_parts set hold_revision = 0 where id = $1', [partId]);
		const { a, b } = await race('ideacad_claim_part');
		expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
		const { rows } = await db.sql<{ hold_revision: number }>(
			'select hold_revision from public.ideacad_parts where id = $1',
			[partId]
		);
		expect(rows[0].hold_revision).toBe(1);
	});
});

describe('every hold-changing function takes the same lock on the same row', () => {
	it('claim, beat, release and assign all open with `for update` on ideacad_parts', async () => {
		const { rows } = await db.sql<{ proname: string; locks: boolean }>(
			`select p.proname,
			        p.prosrc ~ 'from public\\.ideacad_parts where id = p_part_id for update' as locks
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in
			   ('ideacad_claim_part','ideacad_beat_part','ideacad_release_part','ideacad_assign_part')
			 order by p.proname`
		);
		expect(rows).toHaveLength(4);
		expect(rows.filter((r) => !r.locks)).toEqual([]);
		// POSITIVE CONTROL: the same instrument reads FALSE for a function that
		// genuinely does not take the lock, so "all four" is not vacuous.
		const { rows: control } = await db.sql<{ locks: boolean }>(
			`select p.prosrc ~ 'from public\\.ideacad_parts where id = p_part_id for update' as locks
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'ideacad_claim_part_nolock'`
		);
		expect(control[0].locks).toBe(false);
	});
});
