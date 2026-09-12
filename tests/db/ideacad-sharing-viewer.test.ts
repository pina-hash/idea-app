/**
 * 0205, property 1: A VIEWER CAN READ AND CANNOT WRITE.
 *
 * BOTH HALVES, because a test that only proves the read is half a test: a
 * viewer who can also write is the feature failing in the direction that
 * matters, and it fails SILENTLY -- the read works, the surface looks right,
 * and nothing reports that view-only is not view-only.
 *
 * EVERY ASSERTION HERE HAS A POSITIVE CONTROL ON THE SAME FIXTURE. The read
 * half is measured against the same reads run by the CLASSMATE, who differs
 * from the viewer in exactly one respect (no grant), so a read that came back
 * for everyone cannot pass as a grant working. The write half is measured
 * against the same seven writes run by the EDITOR, so seven refusals cannot
 * pass as the write gate working when it is actually refusing everyone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildSharingFixture,
	markerHits,
	writeAttempts,
	type SharingFixture
} from './ideacad-sharing-fixture';

let f: SharingFixture;

// Distinct payloads, so "did this caller's write land" is answerable from the
// table rather than inferred from a revision number a later delete can hide.
const VIEWER_MARK = 'viewer-must-not-land';
const EDITOR_MARK = 'editor-may-land';

beforeAll(async () => {
	f = await buildSharingFixture('viewer');
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
		f.documentId,
		f.viewer.email
	]);
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'editor')", [
		f.documentId,
		f.editor.email
	]);
}, 600_000);

afterAll(async () => f?.db?.stop());

describe('0205: a viewer reads', () => {
	it('reads the document row, the concepts and the prediction through RLS', async () => {
		await f.call(f.owner, "public.ideacad_set_prediction($1::uuid, $2::uuid, 'my pick')", [
			f.documentId,
			f.conceptId
		]);

		const seen = await f.db.asUser(f.viewer.id, async (q) => ({
			documents: (await q('select id from public.ideacad_documents where id = $1', [f.documentId]))
				.rowCount,
			concepts: (
				await q('select id from public.ideacad_concepts where document_id = $1', [f.documentId])
			).rowCount,
			predictions: (
				await q('select document_id from public.ideacad_predictions where document_id = $1', [
					f.documentId
				])
			).rowCount
		}));

		// The control: the same three reads by a classmate in the SAME section
		// with no grant. If these were also 1/1/1 the grant would be proving
		// nothing, because the rows would be readable by anyone enrolled.
		const control = await f.db.asUser(f.classmate.id, async (q) => ({
			documents: (await q('select id from public.ideacad_documents where id = $1', [f.documentId]))
				.rowCount,
			concepts: (
				await q('select id from public.ideacad_concepts where document_id = $1', [f.documentId])
			).rowCount,
			predictions: (
				await q('select document_id from public.ideacad_predictions where document_id = $1', [
					f.documentId
				])
			).rowCount
		}));

		expect(seen).toEqual({ documents: 1, concepts: 1, predictions: 1 });
		expect(control).toEqual({ documents: 0, concepts: 0, predictions: 0 });
	});

	it('opens the shared document and is told, in the payload, that it cannot write', async () => {
		const opened = await f.call<{
			document: { id: string; student_email: string };
			concepts: Array<{ id: string }>;
			role: string;
			canWrite: boolean;
			config: unknown;
		}>(f.viewer, 'public.ideacad_open_shared_document($1::uuid)', [f.documentId]);

		expect(opened.document.id).toBe(f.documentId);
		expect(opened.document.student_email).toBe(f.owner.email);
		expect(opened.concepts).toHaveLength(1);
		expect(opened.role).toBe('viewer');
		expect(opened.canWrite).toBe(false);
		// The editor config travels with it, or a client has nothing to render
		// the feature tree against.
		expect(opened.config).toEqual({ defaultFeatures: { blade: 'seed' } });
	});

	it('sees its own grant row and NOT the other grantee on the same document', async () => {
		const rows = await f.db.asUser(f.viewer.id, async (q) =>
			(
				await q<{ grantee_email: string; role: string }>(
					'select grantee_email, role from public.ideacad_grants where document_id = $1 order by grantee_email',
					[f.documentId]
				)
			).rows
		);
		// Two grants exist on this document (viewer and editor); the viewer sees
		// one. The owner's own read is the positive control that there really are
		// two rows to have leaked.
		const ownerSees = await f.call<Array<{ granteeEmail: string }>>(
			f.owner,
			'public.ideacad_document_grants($1::uuid)',
			[f.documentId]
		);
		expect(ownerSees).toHaveLength(2);
		expect(rows).toEqual([{ grantee_email: f.viewer.email, role: 'viewer' }]);
	});

	it('finds the document through shared_with_me, which is its only way to learn the id', async () => {
		const mine = await f.call<
			Array<{ documentId: string; ownerEmail: string; role: string }>
		>(f.viewer, 'public.ideacad_shared_with_me($1::uuid)', [f.itemId]);
		expect(mine).toEqual([
			expect.objectContaining({
				documentId: f.documentId,
				ownerEmail: f.owner.email,
				role: 'viewer'
			})
		]);

		// The control: a classmate with no grant gets an empty list, not an error
		// and not somebody else's document.
		const none = await f.call<unknown[]>(f.classmate, 'public.ideacad_shared_with_me($1::uuid)', [
			f.itemId
		]);
		expect(none).toEqual([]);
	});
});

describe('0205: a viewer cannot write', () => {
	it('is refused by all seven write RPCs, each naming view-only access', async () => {
		const attempts = writeAttempts(f.documentId, f.conceptId, VIEWER_MARK);
		const results: Array<{ label: string; message: string }> = [];
		for (const attempt of attempts) {
			results.push({
				label: attempt.label,
				message: await f.refusal(f.viewer, attempt.expression, attempt.params)
			});
		}

		expect(results).toHaveLength(7);
		// Every one refused...
		expect(results.filter((r) => r.message !== '')).toHaveLength(7);
		// ...and every one said WHY, rather than answering the owner's sentence,
		// which would read to a viewer as a bug in the page.
		for (const result of results) {
			expect(result.message).toContain('view-only access');
		}
	});

	it('CONTROL: the same seven writes by the EDITOR grantee all succeed', async () => {
		// Without this, seven refusals above are equally consistent with a write
		// gate that refuses everybody, which is the feature broken the other way.
		const results: Array<{ label: string; message: string }> = [];
		for (const attempt of writeAttempts(f.documentId, f.conceptId, EDITOR_MARK)) {
			results.push({
				label: attempt.label,
				message: await f.refusal(f.editor, attempt.expression, attempt.params)
			});
		}
		const refused = results.filter((r) => r.message !== '');
		expect(refused.map((r) => `${r.label}: ${r.message}`)).toEqual([]);
		expect(results).toHaveLength(7);
	});

	it('and the viewer wrote NOTHING anywhere, against an editor that wrote in three places', async () => {
		// Read as the connection owner, across feature trees, concept names and
		// prediction rationales, INCLUDING soft-deleted rows -- so this is not
		// "the RPC returned an error" but "the bytes are not in the table".
		const viewerBytes = await markerHits(f, VIEWER_MARK);
		// The control. Seven refusals and zero viewer bytes are also exactly what
		// a write path that is broken for everybody looks like.
		const editorBytes = await markerHits(f, EDITOR_MARK);
		expect(viewerBytes).toBe(0);
		expect(editorBytes).toBeGreaterThanOrEqual(3);
	});

	it('cannot reach the grant table directly, in either direction', async () => {
		const insert = await f.refusal(
			f.viewer,
			"(insert into public.ideacad_grants(document_id, grantee_email, role, granted_by) values ($1::uuid, 'x@boscotech.net', 'editor', 'x@boscotech.net'))::text",
			[f.documentId]
		);
		const promote = await f.db.asUser(f.viewer.id, async (q) => {
			try {
				await q("update public.ideacad_grants set role = 'editor' where grantee_email = $1", [
					f.viewer.email
				]);
				return '';
			} catch (error) {
				return (error as Error).message;
			}
		});
		expect(insert).not.toBe('');
		expect(promote).not.toBe('');
		// And the role is still viewer, which is the assertion that matters: a
		// refusal message is not proof that nothing changed.
		const role = await f.db.sql<{ role: string }>(
			'select role from public.ideacad_grants where document_id = $1 and grantee_email = $2',
			[f.documentId, f.viewer.email]
		);
		expect(role.rows[0].role).toBe('viewer');
	});
});
