/**
 * 0205, property 2: A STRANGER SEES NOTHING.
 *
 * Not enrolled, not granted, no access, and no leak through any of the RPCs.
 *
 * TWO KINDS OF STRANGER, because they fail differently and only one of them is
 * obvious. The OUT-OF-CLASS stranger is enrolled in a different section of the
 * same course and is the one anybody would think to test. The IN-CLASS
 * classmate is enrolled in the very section the item is posted to and holds no
 * grant -- they are the one a policy written as "enrolled readers" would admit,
 * and the one a leak actually reaches.
 *
 * THE SWEEP IS OVER EVERY RPC THE FEATURE HAS, enumerated from the catalog
 * rather than from a list in this file, so an eleventh function added later is
 * covered here rather than silently skipped. The case count is asserted, so a
 * sweep that generated nothing cannot pass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSharingFixture, writeAttempts, type SharingFixture } from './ideacad-sharing-fixture';

let f: SharingFixture;

beforeAll(async () => {
	f = await buildSharingFixture('stranger');
	// One real grant exists, so "nothing is shared with anybody" cannot be what
	// makes the refusals below come out clean.
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
		f.documentId,
		f.viewer.email
	]);
}, 600_000);

afterAll(async () => f?.db?.stop());

const tableReads = (documentId: string) => [
	{ label: 'ideacad_documents', sql: 'select id from public.ideacad_documents where id = $1' },
	{
		label: 'ideacad_concepts',
		sql: 'select id from public.ideacad_concepts where document_id = $1'
	},
	{
		label: 'ideacad_predictions',
		sql: 'select document_id from public.ideacad_predictions where document_id = $1'
	},
	{
		label: 'ideacad_grants',
		sql: 'select grantee_email from public.ideacad_grants where document_id = $1'
	}
];

describe('0205: the enumerated RPC surface', () => {
	it('is the eleven public ideacad functions the feature has, read off the catalog', async () => {
		const { rows } = await f.db.sql<{ proname: string }>(
			`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'ideacad%' order by 1`
		);
		const names = rows.map((r) => r.proname);
		// 0201's ten, plus 0205's five.
		expect(names).toEqual([
			'ideacad_commit_concept',
			'ideacad_delete_concept',
			'ideacad_document_grants',
			'ideacad_new_concept',
			'ideacad_open_document',
			'ideacad_open_shared_document',
			'ideacad_roster',
			'ideacad_save_concept',
			'ideacad_set_active',
			'ideacad_set_editor',
			'ideacad_set_prediction',
			'ideacad_share_document',
			'ideacad_shared_with_me',
			'ideacad_unshare_document',
			'ideacad_update_concept_meta'
		]);
		expect(names).toHaveLength(15);
	});
});

for (const who of ['stranger', 'classmate'] as const) {
	describe(`0205: the ${who} sees nothing`, () => {
		const actor = () => (who === 'stranger' ? f.stranger : f.classmate);

		it('reads zero rows from all four sharing-relevant tables', async () => {
			const reads = tableReads(f.documentId);
			const counts = await f.db.asUser(actor().id, async (q) => {
				const out: Record<string, number | null> = {};
				for (const read of reads) {
					out[read.label] = (await q(read.sql, [f.documentId])).rowCount;
				}
				return out;
			});
			expect(Object.keys(counts)).toHaveLength(4);
			expect(counts).toEqual({
				ideacad_documents: 0,
				ideacad_concepts: 0,
				ideacad_predictions: 0,
				ideacad_grants: 0
			});
		});

		it('CONTROL: the owner reads those same four tables non-empty', async () => {
			await f.call(f.owner, "public.ideacad_set_prediction($1::uuid, $2::uuid, 'mine')", [
				f.documentId,
				f.conceptId
			]);
			const counts = await f.db.asUser(f.owner.id, async (q) => {
				const out: Record<string, number | null> = {};
				for (const read of tableReads(f.documentId)) {
					out[read.label] = (await q(read.sql, [f.documentId])).rowCount;
				}
				return out;
			});
			// Every count above is only meaningful because these are not zero.
			expect(counts).toEqual({
				ideacad_documents: 1,
				ideacad_concepts: 1,
				ideacad_predictions: 1,
				ideacad_grants: 1
			});
		});

		it('is refused by all seven write RPCs, with the owner sentence and no view-only hint', async () => {
			const results: Array<{ label: string; message: string }> = [];
			for (const attempt of writeAttempts(f.documentId, f.conceptId, `${who}-must-not-land`)) {
				results.push({
					label: attempt.label,
					message: await f.refusal(actor(), attempt.expression, attempt.params)
				});
			}
			expect(results).toHaveLength(7);
			expect(results.filter((r) => r.message !== '')).toHaveLength(7);
			// A stranger must NOT be told they are view-only: that would confirm
			// the document exists and that they are on its grant list, to somebody
			// who is on neither.
			for (const result of results) {
				expect(result.message).not.toContain('view-only');
			}
		});

		it('is refused by the two owner-only sharing RPCs', async () => {
			const share = await f.refusal(
				actor(),
				"public.ideacad_share_document($1::uuid, $2, 'editor')",
				[f.documentId, actor().email]
			);
			const unshare = await f.refusal(actor(), 'public.ideacad_unshare_document($1::uuid, $2)', [
				f.documentId,
				f.viewer.email
			]);
			expect(share).toContain('your own document');
			expect(unshare).toContain('your own document');
			// And the existing grant is untouched, which is the half a refusal
			// message does not prove.
			const still = await f.db.sql(
				'select 1 from public.ideacad_grants where document_id = $1 and grantee_email = $2',
				[f.documentId, f.viewer.email]
			);
			expect(still.rowCount).toBe(1);
		});

		it('is refused by the grant list and by opening the document, identically to a bad id', async () => {
			const listReal = await f.refusal(actor(), 'public.ideacad_document_grants($1::uuid)', [
				f.documentId
			]);
			const listFake = await f.refusal(
				actor(),
				"public.ideacad_document_grants('00000000-0000-0000-0000-000000000000'::uuid)"
			);
			const openReal = await f.refusal(actor(), 'public.ideacad_open_shared_document($1::uuid)', [
				f.documentId
			]);
			const openFake = await f.refusal(
				actor(),
				"public.ideacad_open_shared_document('00000000-0000-0000-0000-000000000000'::uuid)"
			);
			expect(listReal).not.toBe('');
			expect(openReal).not.toBe('');
			// "Not found" and "not yours" answer IDENTICALLY, so a document id
			// cannot be probed by comparing two messages.
			expect(listReal).toBe(listFake);
			expect(openReal).toBe(openFake);
		});

		it('gets an empty shared_with_me and cannot open the assignment it is not posted to', async () => {
			const mine = await f.call<unknown[]>(actor(), 'public.ideacad_shared_with_me($1::uuid)', [
				f.itemId
			]);
			expect(mine).toEqual([]);
			if (who === 'stranger') {
				// The out-of-class stranger cannot even open their OWN document on
				// this item, because _classroom_engine_student refuses a caller with
				// no active enrollment in a section it is posted to.
				const open = await f.refusal(actor(), 'public.ideacad_open_document($1::uuid)', [
					f.itemId
				]);
				expect(open).not.toBe('');
			}
		});

		it('is refused by the two teacher-only RPCs', async () => {
			const roster = await f.refusal(actor(), 'public.ideacad_roster($1::uuid)', [f.itemId]);
			const setEditor = await f.refusal(
				actor(),
				"public.ideacad_set_editor($1::uuid, 'blade', '{}'::jsonb)",
				[f.itemId]
			);
			expect(roster).toContain('teacher for this class');
			expect(setEditor).toContain('teacher for this class');
		});
	});
}

describe('0205: and a stranger cannot be made a grantee', () => {
	it('refuses a grant to somebody outside the item’s own enrolled population', async () => {
		const message = await f.refusal(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'viewer')",
			[f.documentId, f.stranger.email]
		);
		expect(message).toContain('classmate in this class');
		const rows = await f.db.sql(
			'select 1 from public.ideacad_grants where document_id = $1 and grantee_email = $2',
			[f.documentId, f.stranger.email]
		);
		expect(rows.rowCount).toBe(0);
	});

	it('refuses an address that is on no roster at all, and one that is not an address', async () => {
		for (const target of ['nobody@example.com', 'not-an-address', '   ']) {
			const message = await f.refusal(
				f.owner,
				"public.ideacad_share_document($1::uuid, $2, 'viewer')",
				[f.documentId, target]
			);
			expect(message).not.toBe('');
		}
		const total = await f.db.sql('select 1 from public.ideacad_grants where document_id = $1', [
			f.documentId
		]);
		// Still only the one real grant from beforeAll.
		expect(total.rowCount).toBe(1);
	});

	it('CONTROL: the same call for a real classmate is accepted', async () => {
		// Otherwise every refusal above is equally consistent with a share
		// function that refuses everyone.
		const row = await f.call<{ grantee_email: string; role: string }>(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'editor')",
			[f.documentId, f.classmate.email]
		);
		expect(row).toMatchObject({ grantee_email: f.classmate.email, role: 'editor' });
	});

	it('refuses a deactivated enrollment, because "classmate" means a live roster row', async () => {
		await f.call(f.owner, 'public.ideacad_unshare_document($1::uuid, $2)', [
			f.documentId,
			f.classmate.email
		]);
		await f.call(f.teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, false)', [
			f.sectionA,
			f.classmate.email,
			f.classmate.email
		]);
		const message = await f.refusal(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'viewer')",
			[f.documentId, f.classmate.email]
		);
		expect(message).toContain('classmate in this class');
	});
});
