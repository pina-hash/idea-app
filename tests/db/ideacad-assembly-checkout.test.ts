// tests/db/ideacad-assembly-checkout.test.ts
//
// THE FOUR PROPERTIES 0207 HAS TO GET RIGHT, each in both directions:
//
//   1. A second holder is REFUSED while a part is held.
//   2. The assembly OWNER can FORCE a reassignment at any time -- and the
//      displaced holder can find out, which is the half a UI needs.
//   3. A released part is IMMEDIATELY claimable, with no window to wait out.
//   4. A holder who never releases does not lock the part forever.
//
// WHY THERE IS A STUB IN HERE, AND EXACTLY WHAT IT STANDS FOR. 0207's claim
// gate delegates to `_ideacad_can_write_document(uuid)`, which is 0205's --
// ledger 0179's lane, on `claude/great-bell-ppysbn`, not landed and not this
// bundle's file to ship. Under 0201 alone only the document's own student can
// write it, so "one person at a time" would have nobody to refuse and every
// property below would pass vacuously. So this file PLANTS a function with
// 0205's exact signature and semantics -- read off that file directly:
// `_ideacad_document_role` answers 'owner' for the document's student and
// otherwise the `role` column of its grant row, and `_ideacad_can_write_document`
// is `role in ('owner','editor')`. The stub reads a test-local grants table of
// the same shape.
//
// SO WHAT IS PROVED HERE IS 0207's LOGIC OVER 0205's CONTRACT, not 0205 itself.
// `tests/db/ideacad-assembly-claim-ladder.test.ts` is the other half: it proves
// the ladder actually consults that function when it is present and degrades to
// owner-only when it is absent, in both directions, so the stub cannot be the
// only reason anything passes.
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
	partId?: string;
	heldBy?: string | null;
	previousHolder?: string | null;
	holdRevision?: number;
	holdBeatAt?: string | null;
}

interface AssemblyPart {
	id: string;
	position: number;
	name: string;
	heldBy: string | null;
	holdRevision: number;
	holdLive: boolean;
	holdIsMine: boolean;
	conceptCount: number;
	activeConceptId: string | null;
}

interface Assembly {
	documentId: string;
	viewer: string;
	isOwner: boolean;
	canWrite: boolean;
	holdWindowSeconds: number;
	holdRevisionTotal: string | number;
	parts: AssemblyPart[];
}

let db: TestDb;
let teacher: SeededUser;
let owner: SeededUser;
let mate: SeededUser;
let other: SeededUser;
let bystander: SeededUser;
let itemId: string;
let documentId: string;
let partA: string;
let partB: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

const claim = (user: SeededUser, partId: string) =>
	call<ClaimResult>(user, 'public.ideacad_claim_part($1::uuid)', [partId]);
const release = (user: SeededUser, partId: string) =>
	call<ClaimResult>(user, 'public.ideacad_release_part($1::uuid)', [partId]);
const beat = (user: SeededUser, partId: string, revision: number) =>
	call<ClaimResult>(user, 'public.ideacad_beat_part($1::uuid, $2)', [partId, revision]);
const assign = (user: SeededUser, partId: string, email: string | null) =>
	call<ClaimResult>(user, 'public.ideacad_assign_part($1::uuid, $2)', [partId, email]);
const assembly = (user: SeededUser) =>
	call<Assembly>(user, 'public.ideacad_assembly($1::uuid)', [documentId]);

const holdRow = async (partId: string) => {
	const { rows } = await db.sql<{
		held_by: string | null;
		held_at: string | null;
		hold_beat_at: string | null;
		hold_revision: number;
	}>('select held_by, held_at, hold_beat_at, hold_revision from public.ideacad_parts where id = $1', [
		partId
	]);
	return rows[0];
};

/** Free every part and leave the hold generation where it is. */
const resetHolds = async () => {
	await db.sql(
		'update public.ideacad_parts set held_by = null, held_at = null, hold_beat_at = null where document_id = $1',
		[documentId]
	);
};

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'asmco.teacher@boscotech.edu', 'Asm Teacher');
	owner = await createUser(db, 'asmco.owner@boscotech.net', 'Owner');
	mate = await createUser(db, 'asmco.mate@boscotech.net', 'Mate');
	other = await createUser(db, 'asmco.other@boscotech.net', 'Other');
	bystander = await createUser(db, 'asmco.bystander@boscotech.net', 'Bystander');

	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEAASMCO', 'IdeaCAD Checkout')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 2', teacher.email]
	);
	for (const student of [owner, mate, other, bystander]) {
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
	itemId = item.item_id;
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		itemId,
		JSON.stringify({ defaultFeatures: { blade: 'seed' } })
	]);

	const opened = await call<{ document: { id: string } }>(
		owner,
		'public.ideacad_open_document($1::uuid)',
		[itemId]
	);
	documentId = opened.document.id;

	// THE STUB. 0205's two predicates, at 0205's exact signatures, over a
	// test-local grants table of 0205's shape. Named `stub_` so nothing here can
	// be mistaken for the real table.
	await db.sql(`
		create table public.stub_ideacad_grants(
			document_id uuid not null,
			grantee_email text not null,
			role text not null check (role in ('viewer', 'editor')),
			primary key (document_id, grantee_email)
		);
		create or replace function public._ideacad_document_role(p_document_id uuid)
		returns text language sql stable security definer set search_path = '' as $role$
			select case
				when v.email = '' then null
				when exists (select 1 from public.ideacad_documents d
					where d.id = p_document_id and d.student_email = v.email) then 'owner'
				else (select g.role from public.stub_ideacad_grants g
					where g.document_id = p_document_id and g.grantee_email = v.email)
			end
			from (select public.current_user_email() as email) v;
		$role$;
		create or replace function public._ideacad_can_write_document(p_document_id uuid)
		returns boolean language sql stable security definer set search_path = '' as $w$
			select coalesce(public._ideacad_document_role(p_document_id) in ('owner', 'editor'), false);
		$w$;
		create or replace function public._ideacad_can_read_document(p_document_id uuid)
		returns boolean language sql stable security definer set search_path = '' as $r$
			select public._ideacad_document_role(p_document_id) is not null
				or exists (select 1 from public.ideacad_documents d
					where d.id = p_document_id and public._classroom_manages_item(d.item_id));
		$r$;
	`);
	await db.sql(
		`insert into public.stub_ideacad_grants(document_id, grantee_email, role)
		 values ($1, $2, 'editor'), ($1, $3, 'editor')`,
		[documentId, mate.email, other.email]
	);

	// A two-part assembly, which is the thing 0207 exists to make possible.
	const added = await call<{ partId: string }>(
		owner,
		"public.ideacad_add_part($1::uuid, 'Hex shank', $2::jsonb)",
		[documentId, JSON.stringify({ shank: 'stock' })]
	);
	partB = added.partId;
	const { rows } = await db.sql<{ id: string }>(
		'select id from public.ideacad_parts where document_id = $1 and id <> $2',
		[documentId, partB]
	);
	partA = rows[0].id;
}, 600_000);

afterAll(async () => db?.stop());

describe('the assembly exists and is a real part list', () => {
	it('reads as two ordered parts, each carrying its own feature tree', async () => {
		const view = await assembly(owner);
		expect(view.parts).toHaveLength(2);
		expect(view.parts.map((p) => p.position)).toEqual([1, 2]);
		expect(view.parts.map((p) => p.name)).toEqual(['Part 1', 'Hex shank']);
		expect(view.parts.every((p) => p.conceptCount === 1)).toBe(true);
		expect(view.parts.every((p) => p.activeConceptId !== null)).toBe(true);
		// Each part's concepts are its own, not the assembly's pooled.
		const { rows } = await db.sql<{ part_id: string; n: string }>(
			`select part_id, count(*) as n from public.ideacad_concepts
			 where document_id = $1 group by part_id order by part_id`,
			[documentId]
		);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
	});

	it('states the hold window rather than making a client guess it', async () => {
		const view = await assembly(owner);
		expect(view.holdWindowSeconds).toBe(600);
	});

	it('is readable by a teammate and by the teacher, and not by a bystander', async () => {
		await expect(assembly(mate)).resolves.toMatchObject({ canWrite: true, isOwner: false });
		await expect(assembly(teacher)).resolves.toMatchObject({ canWrite: false, isOwner: false });
		await expect(assembly(bystander)).rejects.toThrow(/cannot open this assembly/);
	});
});

describe('property 1: a second holder is REFUSED while a part is held', () => {
	beforeAll(resetHolds);

	it('refuses the second claimant, names who has it, and changes nothing', async () => {
		const first = await claim(mate, partA);
		expect(first).toMatchObject({ ok: true, reason: 'claimed', heldBy: mate.email });
		const revisionAfterFirst = first.holdRevision;

		const second = await claim(other, partA);
		expect(second).toMatchObject({ ok: false, reason: 'held', heldBy: mate.email });

		// The refusal is inert: the holder and the generation are untouched.
		const row = await holdRow(partA);
		expect(row.held_by).toBe(mate.email);
		expect(row.hold_revision).toBe(revisionAfterFirst);
	});

	it('POSITIVE CONTROL: the same caller, on the other part, succeeds', async () => {
		await expect(claim(other, partB)).resolves.toMatchObject({
			ok: true,
			reason: 'claimed',
			heldBy: other.email
		});
	});

	it('lets the holder resume their own live hold without moving the generation', async () => {
		const before = await holdRow(partA);
		const again = await claim(mate, partA);
		expect(again).toMatchObject({ ok: true, reason: 'resumed', heldBy: mate.email });
		const after = await holdRow(partA);
		expect(after.hold_revision).toBe(before.hold_revision);
		expect(new Date(after.hold_beat_at as string).getTime()).toBeGreaterThanOrEqual(
			new Date(before.hold_beat_at as string).getTime()
		);
	});

	it('shows each viewer which holds are theirs', async () => {
		const mateView = await assembly(mate);
		expect(mateView.parts.find((p) => p.id === partA)).toMatchObject({
			holdIsMine: true,
			holdLive: true
		});
		expect(mateView.parts.find((p) => p.id === partB)?.holdIsMine).toBe(false);
		const otherView = await assembly(other);
		expect(otherView.parts.find((p) => p.id === partA)?.holdIsMine).toBe(false);
		expect(otherView.parts.find((p) => p.id === partB)?.holdIsMine).toBe(true);
	});
});

describe('property 2: the assembly OWNER can force a reassignment at any time', () => {
	beforeAll(async () => {
		await resetHolds();
		await claim(mate, partA);
	});

	it('takes a live hold off one teammate and gives it to another, and reports both', async () => {
		const before = await holdRow(partA);
		expect(before.held_by).toBe(mate.email);

		const forced = await assign(owner, partA, other.email);
		expect(forced).toMatchObject({
			ok: true,
			reason: 'assigned',
			heldBy: other.email,
			previousHolder: mate.email
		});
		const after = await holdRow(partA);
		expect(after.held_by).toBe(other.email);
		// The generation MOVED, which is what a client watches.
		expect(after.hold_revision).toBe(before.hold_revision + 1);
	});

	it('TELLS THE DISPLACED HOLDER: their next heartbeat answers `lost` and names the new holder', async () => {
		const row = await holdRow(partA);
		const stale = await beat(mate, partA, row.hold_revision - 1);
		expect(stale).toMatchObject({ ok: false, reason: 'lost', heldBy: other.email });
		// POSITIVE CONTROL: the real holder's heartbeat, at the current
		// generation, is accepted -- so `lost` is not what this function always
		// says.
		await expect(beat(other, partA, row.hold_revision)).resolves.toMatchObject({
			ok: true,
			reason: 'beating'
		});
	});

	it('clears a part with a null email, and reports unchanged when nothing moved', async () => {
		const cleared = await assign(owner, partA, null);
		expect(cleared).toMatchObject({ ok: true, reason: 'cleared', previousHolder: other.email });
		expect((await holdRow(partA)).held_by).toBeNull();
		const again = await assign(owner, partA, null);
		expect(again).toMatchObject({ ok: true, reason: 'unchanged' });
		// An unchanged assignment must not move the generation, or every holder
		// on the assembly would be told they lost their part.
		const first = await holdRow(partA);
		await assign(owner, partA, null);
		expect((await holdRow(partA)).hold_revision).toBe(first.hold_revision);
	});

	it('normalises the email it is handed, so A@x and a@x are one person', async () => {
		await assign(owner, partA, `  ${mate.email.toUpperCase()}  `);
		expect((await holdRow(partA)).held_by).toBe(mate.email);
		await expect(beat(mate, partA, (await holdRow(partA)).hold_revision)).resolves.toMatchObject({
			ok: true
		});
	});

	it('is the OWNER\'s alone: a teammate, the teacher and a bystander are all refused', async () => {
		for (const person of [mate, other, teacher, bystander]) {
			await expect(assign(person, partA, other.email)).rejects.toThrow(/Only the owner/);
		}
		// And the structure controls with it.
		await expect(
			call(mate, "public.ideacad_add_part($1::uuid, 'Sneaky', '{}'::jsonb)", [documentId])
		).rejects.toThrow(/Only the owner/);
		await expect(
			call(mate, "public.ideacad_update_part_meta($1::uuid, 'Renamed', 1)", [partA])
		).rejects.toThrow(/Only the owner/);
		// POSITIVE CONTROL: the owner can do both.
		await expect(
			call(owner, "public.ideacad_update_part_meta($1::uuid, 'Blade', 1)", [partA])
		).resolves.toMatchObject({ ok: true, name: 'Blade' });
	});
});

describe('property 3: a released part is immediately claimable', () => {
	beforeAll(resetHolds);

	it('hands the part straight to the next claimant with no window to wait out', async () => {
		await claim(mate, partA);
		const released = await release(mate, partA);
		expect(released).toMatchObject({ ok: true, reason: 'released' });
		expect((await holdRow(partA)).held_by).toBeNull();

		const taken = await claim(other, partA);
		expect(taken).toMatchObject({ ok: true, reason: 'claimed', heldBy: other.email });
	});

	it('lets the OWNER release somebody else\'s hold, and refuses a third party', async () => {
		await resetHolds();
		await claim(mate, partA);
		const nope = await release(other, partA);
		expect(nope).toMatchObject({ ok: false, reason: 'not_yours', heldBy: mate.email });
		expect((await holdRow(partA)).held_by).toBe(mate.email);
		const yes = await release(owner, partA);
		expect(yes).toMatchObject({ ok: true, reason: 'released' });
	});

	it('answers already_free rather than failing on a double release', async () => {
		await expect(release(owner, partA)).resolves.toMatchObject({
			ok: true,
			reason: 'already_free'
		});
	});
});

describe('property 4: a holder who never releases does not lock the part forever', () => {
	beforeAll(resetHolds);

	it('refuses a takeover INSIDE the window -- the control that makes the next case mean something', async () => {
		await claim(mate, partA);
		await db.sql(
			`update public.ideacad_parts set hold_beat_at = now() - interval '9 minutes' where id = $1`,
			[partA]
		);
		const view = await assembly(other);
		expect(view.parts.find((p) => p.id === partA)?.holdLive).toBe(true);
		await expect(claim(other, partA)).resolves.toMatchObject({
			ok: false,
			reason: 'held',
			heldBy: mate.email
		});
	});

	it('lets the next claimant TAKE OVER once the hold has lapsed', async () => {
		const before = await holdRow(partA);
		await db.sql(
			`update public.ideacad_parts set hold_beat_at = now() - interval '11 minutes' where id = $1`,
			[partA]
		);
		const view = await assembly(other);
		expect(view.parts.find((p) => p.id === partA)?.holdLive).toBe(false);
		const taken = await claim(other, partA);
		expect(taken).toMatchObject({ ok: true, reason: 'takeover', heldBy: other.email });
		expect((await holdRow(partA)).hold_revision).toBe(before.hold_revision + 1);
	});

	it('tells the lapsed holder rather than quietly reviving their hold', async () => {
		await resetHolds();
		const mine = await claim(mate, partA);
		await db.sql(
			`update public.ideacad_parts set hold_beat_at = now() - interval '11 minutes' where id = $1`,
			[partA]
		);
		// Still recorded as theirs, at the same generation -- and still refused,
		// because anybody could have taken it in the meantime.
		await expect(beat(mate, partA, mine.holdRevision as number)).resolves.toMatchObject({
			ok: false,
			reason: 'lapsed',
			heldBy: mate.email
		});
		// A fresh claim is how they get it back, and it mints a new generation.
		const again = await claim(mate, partA);
		expect(again).toMatchObject({ ok: true, reason: 'takeover' });
		expect(again.holdRevision).toBe((mine.holdRevision as number) + 1);
	});

	it('holds the window in ONE place, so the claim and the beat cannot disagree', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = '_ideacad_hold_window'`
		);
		expect(Number(rows[0].n)).toBe(1);
		const sources = await db.sql<{ proname: string }>(
			`select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
			   and p.proname in ('ideacad_claim_part','ideacad_beat_part','ideacad_assembly')
			   and p.prosrc like '%_ideacad_hold_window()%'`
		);
		expect(sources.rows.map((r) => r.proname).sort()).toEqual([
			'ideacad_assembly',
			'ideacad_beat_part',
			'ideacad_claim_part'
		]);
		// And nothing spells the number out a second time.
		const literals = await db.sql<{ proname: string }>(
			`select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname ~ '^_?ideacad'
			   and p.proname <> '_ideacad_hold_window'
			   and p.prosrc ~ 'interval\\s*''10 minutes'''`
		);
		expect(literals.rows).toEqual([]);
	});
});

describe('a stranger to the assembly reaches nothing', () => {
	it('cannot claim, and the refusal is a raise rather than a readable no', async () => {
		await expect(claim(bystander, partA)).rejects.toThrow(/not on this assembly/);
		await expect(
			call(bystander, "public.ideacad_new_part_concept($1::uuid, 'Mine now', '{}'::jsonb)", [partA])
		).rejects.toThrow(/assembly you can edit/);
	});

	it('cannot read a part row directly either: the policy, not the RPC, is the boundary', async () => {
		const seen = await db.asUser(bystander.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				'select count(*) as n from public.ideacad_parts where document_id = $1',
				[documentId]
			);
			return Number(rows[0].n);
		});
		expect(seen).toBe(0);
		// POSITIVE CONTROL on the same select, same statement, different caller.
		const mateSees = await db.asUser(mate.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				'select count(*) as n from public.ideacad_parts where document_id = $1',
				[documentId]
			);
			return Number(rows[0].n);
		});
		expect(mateSees).toBe(2);
	});

	it('reaches nothing as anon, on the table or on any of the fourteen functions 0207 creates', async () => {
		const anonRows = await db.asAnon(async (q) => {
			const { rows } = await q<{ n: string }>('select count(*) as n from public.ideacad_parts');
			return rows;
		}).catch(() => null);
		// Either the grant refuses the select outright or the policy returns
		// nothing; both are correct and the test must not require one of them.
		if (anonRows) expect(Number(anonRows[0].n)).toBe(0);

		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname in (
			   'ideacad_assembly','ideacad_add_part','ideacad_update_part_meta',
			   'ideacad_new_part_concept','ideacad_set_part_active','ideacad_claim_part',
			   'ideacad_beat_part','ideacad_release_part','ideacad_assign_part',
			   '_ideacad_hold_window','_ideacad_part_owner','_ideacad_part_writer','_ideacad_part_reader',
			   '_ideacad_concept_part_default')
			   and has_function_privilege('anon', p.oid, 'execute')`
		);
		expect(rows).toEqual([]);
		// POSITIVE CONTROL: the same read CAN see an anon grant when there is one.
		const { rows: control } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') as ok`
		);
		expect(control[0].ok).toBe(true);
	});
});
