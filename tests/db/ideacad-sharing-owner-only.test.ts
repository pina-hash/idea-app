/**
 * 0205, property 4: ONLY THE OWNER GRANTS.
 *
 * A grantee cannot re-share, at EITHER role. Mr. Pina did not say this; it is
 * this bundle's default, and docs/decisions/entries/24-* records it as ours
 * rather than his.
 *
 * THE EDITOR IS THE CASE THAT MATTERS. A viewer being unable to re-share is
 * nearly self-evident; an EDITOR can write every part of the document, so "can
 * write" sliding into "can re-share" is the plausible mistake -- and it is the
 * one with an unbounded blast radius, because a chain of editors makes the set
 * of people who can read a student's work independent of anything the owner
 * did.
 *
 * Also here: the shape of the grant table, because "one row per (document,
 * grantee)" is what makes a person holding both roles unrepresentable rather
 * than resolved by an ordering somebody has to remember.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSharingFixture, type SharingFixture } from './ideacad-sharing-fixture';

let f: SharingFixture;

beforeAll(async () => {
	f = await buildSharingFixture('owneronly');
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'editor')", [
		f.documentId,
		f.editor.email
	]);
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
		f.documentId,
		f.viewer.email
	]);
}, 600_000);

afterAll(async () => f?.db?.stop());

const grantsOn = async (documentId: string) =>
	(
		await f.db.sql<{ grantee_email: string; role: string }>(
			'select grantee_email, role from public.ideacad_grants where document_id = $1 order by grantee_email',
			[documentId]
		)
	).rows;

describe('0205: a grantee cannot re-share', () => {
	it('CONTROL: the editor really can write, so what follows is not a dead account', async () => {
		const saved = await f.call<{ ok: boolean }>(
			f.editor,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 50)',
			[f.conceptId, JSON.stringify({ blade: 'editor really can write' })]
		);
		expect(saved.ok).toBe(true);
	});

	it('refuses the EDITOR granting a third student, at either role', async () => {
		for (const role of ['viewer', 'editor']) {
			const message = await f.refusal(
				f.editor,
				`public.ideacad_share_document($1::uuid, $2, '${role}')`,
				[f.documentId, f.classmate.email]
			);
			expect(message).toContain('your own document');
		}
		// The half a refusal message does not prove.
		expect(await grantsOn(f.documentId)).toEqual([
			{ grantee_email: f.editor.email, role: 'editor' },
			{ grantee_email: f.viewer.email, role: 'viewer' }
		]);
	});

	it('refuses the VIEWER granting a third student, at either role', async () => {
		for (const role of ['viewer', 'editor']) {
			const message = await f.refusal(
				f.viewer,
				`public.ideacad_share_document($1::uuid, $2, '${role}')`,
				[f.documentId, f.classmate.email]
			);
			expect(message).toContain('your own document');
		}
		expect(await grantsOn(f.documentId)).toHaveLength(2);
	});

	it('refuses an editor UNSHARING anybody, including themselves', async () => {
		for (const target of [f.viewer.email, f.editor.email]) {
			const message = await f.refusal(f.editor, 'public.ideacad_unshare_document($1::uuid, $2)', [
				f.documentId,
				target
			]);
			expect(message).toContain('your own document');
		}
		expect(await grantsOn(f.documentId)).toHaveLength(2);
	});

	it('refuses an editor PROMOTING THEMSELVES from editor to anything, by any route', async () => {
		// Through the RPC...
		const viaRpc = await f.refusal(
			f.editor,
			"public.ideacad_share_document($1::uuid, $2, 'editor')",
			[f.documentId, f.editor.email]
		);
		expect(viaRpc).toContain('your own document');
		// ...and directly at the table, which is the route the RPC gate does not
		// cover and the grants in section 6 of the migration do.
		const viaTable = await f.db.asUser(f.editor.id, async (q) => {
			try {
				await q('update public.ideacad_grants set granted_by = $1 where document_id = $2', [
					f.editor.email,
					f.documentId
				]);
				return '';
			} catch (error) {
				return (error as Error).message;
			}
		});
		expect(viaTable).not.toBe('');
	});

	it('CONTROL: the OWNER can do every one of those things', async () => {
		// Without this, ten refusals above are equally consistent with sharing
		// being broken for everybody.
		const added = await f.call<{ grantee_email: string; role: string }>(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'viewer')",
			[f.documentId, f.classmate.email]
		);
		expect(added).toMatchObject({ grantee_email: f.classmate.email, role: 'viewer' });

		const removed = await f.call<{ ok: boolean; removed: number }>(
			f.owner,
			'public.ideacad_unshare_document($1::uuid, $2)',
			[f.documentId, f.classmate.email]
		);
		expect(removed).toEqual({ ok: true, removed: 1 });
		expect(await grantsOn(f.documentId)).toHaveLength(2);
	});
});

describe('0205: the grant row shape', () => {
	it('is one row per (document, grantee), so re-sharing CHANGES the role', async () => {
		await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
			f.documentId,
			f.editor.email
		]);
		const after = await grantsOn(f.documentId);
		// Two rows still, not three: the editor's row was updated, not joined by a
		// second one saying something different about the same person.
		expect(after).toEqual([
			{ grantee_email: f.editor.email, role: 'viewer' },
			{ grantee_email: f.viewer.email, role: 'viewer' }
		]);

		// And the demotion took effect on the write gate, not only on the row.
		const refused = await f.refusal(
			f.editor,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 60)',
			[f.conceptId, JSON.stringify({ blade: 'demoted' })]
		);
		expect(refused).toContain('view-only access');

		await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'editor')", [
			f.documentId,
			f.editor.email
		]);
	});

	it('makes "both roles at once" unrepresentable at the key, not at a predicate', async () => {
		// Asserted as the connection owner, with RLS and the grants out of the
		// way entirely, so nothing but the primary key itself can be what refuses.
		let message = '';
		try {
			await f.db.sql(
				"insert into public.ideacad_grants(document_id, grantee_email, role, granted_by) values ($1::uuid, $2, 'editor', $3)",
				[f.documentId, f.viewer.email, f.owner.email]
			);
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('duplicate key');
	});

	it('refuses a role that is neither viewer nor editor, at the RPC and at the constraint', async () => {
		const viaRpc = await f.refusal(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'admin')",
			[f.documentId, f.classmate.email]
		);
		expect(viaRpc).toContain('viewer or as an editor');

		let constraint = '';
		try {
			await f.db.sql(
				"insert into public.ideacad_grants(document_id, grantee_email, role, granted_by) values ($1::uuid, $2, 'admin', $3)",
				[f.documentId, f.classmate.email, f.owner.email]
			);
		} catch (error) {
			constraint = (error as Error).message;
		}
		expect(constraint).toContain('ideacad_grants_role_check');
	});

	it('stores the grantee address in one normalized spelling, so one person is one grant', async () => {
		await f.call(f.owner, 'public.ideacad_unshare_document($1::uuid, $2)', [
			f.documentId,
			f.viewer.email
		]);
		const mixed = f.viewer.email.toUpperCase();
		const row = await f.call<{ grantee_email: string }>(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'viewer')",
			[f.documentId, `  ${mixed}  `]
		);
		expect(row.grantee_email).toBe(f.viewer.email);
		// And it is the SAME row the normalized spelling reaches, not a second one.
		const again = await f.call<{ grantee_email: string; role: string }>(
			f.owner,
			"public.ideacad_share_document($1::uuid, $2, 'editor')",
			[f.documentId, f.viewer.email]
		);
		expect(again.role).toBe('editor');
		expect(
			(await grantsOn(f.documentId)).filter((g) => g.grantee_email === f.viewer.email)
		).toHaveLength(1);
	});

	it('records who granted it, and the owner cannot forge that field', async () => {
		const list = await f.call<Array<{ granteeEmail: string; grantedBy: string }>>(
			f.owner,
			'public.ideacad_document_grants($1::uuid)',
			[f.documentId]
		);
		// granted_by comes from current_user_email() inside the definer, so there
		// is no parameter through which it could say somebody else.
		for (const entry of list) expect(entry.grantedBy).toBe(f.owner.email);
		expect(list.length).toBeGreaterThan(0);
	});

	it('drops every grant with the document, so a deleted document leaves no grant behind', async () => {
		const before = await grantsOn(f.documentId);
		expect(before.length).toBeGreaterThan(0);
		await f.db.sql('delete from public.ideacad_documents where id = $1', [f.documentId]);
		expect(await grantsOn(f.documentId)).toEqual([]);
	});
});

describe('0205: unsharing is what actually removes access', () => {
	let documentId: string;
	let conceptId: string;

	beforeAll(async () => {
		// The previous block deleted the fixture document, so this one opens a
		// fresh document for a different owner rather than depending on it.
		const opened = await f.call<{ document: { id: string }; concepts: Array<{ id: string }> }>(
			f.classmate,
			'public.ideacad_open_document($1::uuid)',
			[f.itemId]
		);
		documentId = opened.document.id;
		conceptId = opened.concepts[0].id;
		await f.call(f.classmate, "public.ideacad_share_document($1::uuid, $2, 'editor')", [
			documentId,
			f.editor.email
		]);
	});

	it('lets the editor write, then refuses them the moment the grant is removed', async () => {
		const before = await f.call<{ ok: boolean }>(
			f.editor,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 10)',
			[conceptId, JSON.stringify({ blade: 'while granted' })]
		);
		expect(before.ok).toBe(true);

		await f.call(f.classmate, 'public.ideacad_unshare_document($1::uuid, $2)', [
			documentId,
			f.editor.email
		]);

		const after = await f.refusal(
			f.editor,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 11)',
			[conceptId, JSON.stringify({ blade: 'after revoke' })]
		);
		expect(after).toContain('your own concept');
		// Not the view-only sentence: an ex-grantee is a stranger again, and must
		// not be told the document is merely read-only to them.
		expect(after).not.toContain('view-only');

		// And the read is gone too, not just the write.
		const rows = await f.db.asUser(f.editor.id, async (q) =>
			(await q('select id from public.ideacad_documents where id = $1', [documentId])).rowCount
		);
		expect(rows).toBe(0);
	});

	it('is idempotent: removing a grant that is not there is not an error', async () => {
		const again = await f.call<{ ok: boolean; removed: number }>(
			f.classmate,
			'public.ideacad_unshare_document($1::uuid, $2)',
			[documentId, f.editor.email]
		);
		expect(again).toEqual({ ok: true, removed: 0 });
	});
});
