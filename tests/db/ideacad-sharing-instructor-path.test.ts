/**
 * 0205, property 3: THE INSTRUCTOR PATH IS UNCHANGED.
 *
 * `_classroom_manages_item` still admits a TEACHER OF RECORD with no grant, and
 * a teacher of a DIFFERENT SECTION still gets nothing. Ledger 0152 proved that
 * shape for presence; this follows it.
 *
 * WHY IT NEEDS PROVING AT ALL, given that 0205 only ADDS a disjunct: because
 * 0205 rewrote all three read policies, and a policy is retyped rather than
 * patched. The two existing disjuncts are supposed to be reproduced verbatim,
 * and "supposed to" is exactly the claim worth measuring. The failure mode is
 * silent in the dangerous direction too -- a teacher-of-record term dropped by
 * accident would look like the sharing feature working, because every student
 * case would still pass.
 *
 * THE SECOND HALF IS THE ONE THAT CAN GO VACUOUS. A teacher who sees nothing is
 * also what a completely broken read looks like, so every absence assertion
 * about the other teacher is paired with the same read by the teacher of record.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSharingFixture, writeAttempts, type SharingFixture } from './ideacad-sharing-fixture';

let f: SharingFixture;

beforeAll(async () => {
	f = await buildSharingFixture('instructor');
	await f.call(f.owner, "public.ideacad_set_prediction($1::uuid, $2::uuid, 'my pick')", [
		f.documentId,
		f.conceptId
	]);
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
		f.documentId,
		f.viewer.email
	]);
}, 600_000);

afterAll(async () => f?.db?.stop());

const reads = [
	{ label: 'ideacad_documents', sql: 'select id from public.ideacad_documents where id = $1' },
	{ label: 'ideacad_concepts', sql: 'select id from public.ideacad_concepts where document_id = $1' },
	{
		label: 'ideacad_predictions',
		sql: 'select document_id from public.ideacad_predictions where document_id = $1'
	},
	{ label: 'ideacad_grants', sql: 'select grantee_email from public.ideacad_grants where document_id = $1' }
];

describe('0205: a teacher of record reads everything, with no grant', () => {
	it('holds no grant row of any kind', async () => {
		// The premise of the whole property: what follows is not a grant working.
		const rows = await f.db.sql(
			'select 1 from public.ideacad_grants where grantee_email = $1',
			[f.teacher.email]
		);
		expect(rows.rowCount).toBe(0);
	});

	it('reads the document, the concepts, the prediction and the grant list', async () => {
		const counts = await f.db.asUser(f.teacher.id, async (q) => {
			const out: Record<string, number | null> = {};
			for (const read of reads) out[read.label] = (await q(read.sql, [f.documentId])).rowCount;
			return out;
		});
		expect(counts).toEqual({
			ideacad_documents: 1,
			ideacad_concepts: 1,
			ideacad_predictions: 1,
			ideacad_grants: 1
		});
	});

	it('still gets the roster, which 0205 did not touch, with the student’s document on it', async () => {
		const roster = await f.call<
			Array<{ studentEmail: string; document: { id: string } | null; concepts: unknown[] }>
		>(f.teacher, 'public.ideacad_roster($1::uuid)', [f.itemId]);
		const row = roster.find((r) => r.studentEmail === f.owner.email);
		expect(row?.document?.id).toBe(f.documentId);
		expect(row?.concepts).toHaveLength(1);
		// The roster is the ENROLLED population, so sharing did not add anybody to
		// it and the four section-A students are all that is there.
		expect(roster.map((r) => r.studentEmail).sort()).toEqual(
			[f.owner.email, f.viewer.email, f.editor.email, f.classmate.email].sort()
		);
	});

	it('reads the grant list through the RPC as well as through the table', async () => {
		const list = await f.call<Array<{ granteeEmail: string; role: string }>>(
			f.teacher,
			'public.ideacad_document_grants($1::uuid)',
			[f.documentId]
		);
		expect(list).toEqual([
			expect.objectContaining({ granteeEmail: f.viewer.email, role: 'viewer' })
		]);
	});

	it('can open a student document read-only, and is told its role is manager', async () => {
		const opened = await f.call<{ role: string; canWrite: boolean; concepts: unknown[] }>(
			f.teacher,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(opened.role).toBe('manager');
		expect(opened.concepts).toHaveLength(1);
		// WRITE IS STILL FALSE FOR A TEACHER, and this is the assertion that
		// records the gap rather than hiding it. Mr. Pina's decision 24 says
		// teachers edit everything; 0201 gave them read only, 0205 does not change
		// it, and docs/decisions/entries/24-* says so in words. When teacher edit
		// ships, THIS expectation is what has to be deliberately inverted.
		expect(opened.canWrite).toBe(false);
	});

	it('is still refused by all seven student write RPCs, exactly as under 0201', async () => {
		const results: Array<{ label: string; message: string }> = [];
		for (const attempt of writeAttempts(f.documentId, f.conceptId, 'teacher-must-not-land')) {
			results.push({
				label: attempt.label,
				message: await f.refusal(f.teacher, attempt.expression, attempt.params)
			});
		}
		expect(results).toHaveLength(7);
		expect(results.filter((r) => r.message !== '')).toHaveLength(7);
		// And not through the view-only branch: a teacher is not a viewer, they
		// are simply not on the student write path at all.
		for (const result of results) expect(result.message).not.toContain('view-only');
	});

	it('cannot share a student’s document with anybody: only the owner grants', async () => {
		const message = await f.refusal(
			f.teacher,
			"public.ideacad_share_document($1::uuid, $2, 'viewer')",
			[f.documentId, f.editor.email]
		);
		expect(message).toContain('your own document');
		const rows = await f.db.sql(
			'select 1 from public.ideacad_grants where document_id = $1 and grantee_email = $2',
			[f.documentId, f.editor.email]
		);
		expect(rows.rowCount).toBe(0);
	});
});

describe('0205: a teacher of a DIFFERENT section gets nothing', () => {
	it('is a real teacher of a real section, which is the premise', async () => {
		// Otherwise every absence below is consistent with a broken fixture.
		const manages = await f.call<boolean>(
			f.otherTeacher,
			'public.classroom_manages_section($1::uuid)',
			[f.sectionB]
		);
		const notThis = await f.call<boolean>(
			f.otherTeacher,
			'public.classroom_manages_section($1::uuid)',
			[f.sectionA]
		);
		expect(manages).toBe(true);
		expect(notThis).toBe(false);
	});

	it('reads zero rows from all four tables, against 1/1/1/1 for the teacher of record', async () => {
		const theirs = await f.db.asUser(f.otherTeacher.id, async (q) => {
			const out: Record<string, number | null> = {};
			for (const read of reads) out[read.label] = (await q(read.sql, [f.documentId])).rowCount;
			return out;
		});
		const control = await f.db.asUser(f.teacher.id, async (q) => {
			const out: Record<string, number | null> = {};
			for (const read of reads) out[read.label] = (await q(read.sql, [f.documentId])).rowCount;
			return out;
		});
		expect(theirs).toEqual({
			ideacad_documents: 0,
			ideacad_concepts: 0,
			ideacad_predictions: 0,
			ideacad_grants: 0
		});
		expect(control).toEqual({
			ideacad_documents: 1,
			ideacad_concepts: 1,
			ideacad_predictions: 1,
			ideacad_grants: 1
		});
	});

	it('is refused by the roster, the grant list and the shared open', async () => {
		expect(await f.refusal(f.otherTeacher, 'public.ideacad_roster($1::uuid)', [f.itemId])).toContain(
			'teacher for this class'
		);
		expect(
			await f.refusal(f.otherTeacher, 'public.ideacad_document_grants($1::uuid)', [f.documentId])
		).not.toBe('');
		expect(
			await f.refusal(f.otherTeacher, 'public.ideacad_open_shared_document($1::uuid)', [
				f.documentId
			])
		).not.toBe('');
	});

	it('answers a real document id exactly as it answers a nonexistent one', async () => {
		const real = await f.refusal(f.otherTeacher, 'public.ideacad_open_shared_document($1::uuid)', [
			f.documentId
		]);
		const fake = await f.refusal(
			f.otherTeacher,
			"public.ideacad_open_shared_document('00000000-0000-0000-0000-000000000000'::uuid)"
		);
		expect(real).toBe(fake);
	});

	it('cannot be granted access either, because they are not enrolled', async () => {
		const message = await f.refusal(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'editor')",
			[f.documentId, f.otherTeacher.email]
		);
		expect(message).toContain('classmate in this class');
	});
});

describe('0205: the manager term is the one 0201 wrote, not a copy', () => {
	it('reaches _classroom_manages_item through the delegation chain, from every policy', async () => {
		// The manager term sits one level down now: a policy calls a SECURITY
		// DEFINER predicate (which is what stops the policies recursing) and the
		// predicate calls _classroom_manages_item. So the assertion follows the
		// chain rather than looking for the name in the policy text -- and the
		// chain is the stronger claim, because it also pins that the predicate a
		// policy names is one of the two that carry the term.
		const policies = await f.db.sql<{ tablename: string; qual: string }>(
			`select tablename, qual from pg_policies
			 where schemaname = 'public'
			   and tablename in ('ideacad_documents','ideacad_concepts','ideacad_predictions','ideacad_grants')
			 order by tablename`
		);
		expect(policies.rows).toHaveLength(4);
		for (const row of policies.rows) {
			expect(row.qual).toMatch(/_ideacad_(can_read_document|manages_document)\(/);
		}

		const predicates = await f.db.sql<{ proname: string; prosrc: string }>(
			`select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('_ideacad_can_read_document', '_ideacad_manages_document')
			 order by 1`
		);
		expect(predicates.rows.map((r) => r.proname)).toEqual([
			'_ideacad_can_read_document',
			'_ideacad_manages_document'
		]);
		for (const row of predicates.rows) {
			expect(row.prosrc).toContain('_classroom_manages_item');
			// The instructor path must not have been re-derived from postings and
			// sections inside a sharing predicate, which is how it would drift
			// from the function every other classroom surface asks.
			expect(row.prosrc).not.toContain('classroom_postings');
		}
		// And neither policy re-derives it either.
		for (const row of policies.rows) {
			expect(row.qual).not.toContain('classroom_postings');
		}
	});

	it('and the two policy-named predicates hold authenticated EXECUTE, or every read breaks', async () => {
		// A function named in an RLS policy is evaluated as the QUERYING role.
		// Without the grant the read fails with "permission denied for function"
		// rather than returning the caller's own rows -- 0109's lesson, and the
		// reason these two are the only private ideacad helpers that hold it.
		const { rows } = await f.db.sql<{ proname: string; authed: boolean }>(
			`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as authed
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like '\\_ideacad%' order by 1`
		);
		expect(rows).toHaveLength(4);
		expect(rows.filter((r) => r.authed).map((r) => r.proname)).toEqual([
			'_ideacad_can_read_document',
			'_ideacad_manages_document'
		]);
	});

	it('and the three pre-0205 policy names are gone rather than sitting alongside', async () => {
		const { rows } = await f.db.sql<{ policyname: string }>(
			`select policyname from pg_policies
			 where schemaname = 'public' and policyname like 'owners and managers read ideacad%'`
		);
		expect(rows).toEqual([]);
	});
});
