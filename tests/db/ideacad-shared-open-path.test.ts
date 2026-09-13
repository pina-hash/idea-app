// tests/db/ideacad-shared-open-path.test.ts
//
// THE TWO RPCs THE SHARED-OPEN PATH RESTS ON, PUT TO THE REAL DATABASE.
// `ideacad_shared_with_me` and `ideacad_open_shared_document` were applied to
// production with `0205` and had NO CALLER until this bundle, so nothing had
// ever checked the properties a client would have to depend on.
//
// WHY THESE CLAIMS AND NOT OTHERS. The client's whole revocation design rests on
// ONE asymmetry between the two functions, and if it is not real the design is
// wrong rather than imperfect:
//
//   * `ideacad_open_shared_document` RAISES for a caller whose grant is gone. So
//     it cannot be used to ask "do I still have access": a revoked grant and an
//     unreachable network arrive as the same thrown error.
//
//   * `ideacad_shared_with_me` RAISES FOR NEITHER. A revoked grantee simply gets
//     a list with the document missing. So a call that SUCCEEDS is a decision and
//     a call that FAILS is undecided, which is exactly the partition
//     `store.ts`'s `accessWasRevoked` needs.
//
// Both directions are asserted here, because the client picked one function over
// the other on the strength of this difference. `tests/ideacad-shared-open-store.test.ts`
// asserts what the client then does with each answer.
//
// The remaining claims are the payload fields the client reads (`role`,
// `canWrite`) and the refusal a revoked editor's next write actually produces --
// which is the sentence `store.ts` deliberately does NOT parse, checked here so
// the comment saying it is unparseable is true rather than assumed.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSharingFixture, type SharingFixture } from './ideacad-sharing-fixture';

let f: SharingFixture;

beforeAll(async () => {
	f = await buildSharingFixture('sharedopen');
	// The grants this file needs, made through the REAL RPC by the owner.
	await f.call(f.owner, 'public.ideacad_share_document($1::uuid, $2, $3)', [
		f.documentId,
		f.editor.email,
		'editor'
	]);
	await f.call(f.owner, 'public.ideacad_share_document($1::uuid, $2, $3)', [
		f.documentId,
		f.viewer.email,
		'viewer'
	]);
}, 240_000);

afterAll(async () => {
	await f?.db.stop();
});

interface SharedRow {
	documentId: string;
	ownerEmail: string;
	role: string;
	grantedAt: string;
	updatedAt: string;
}

const sharedWithMe = (user: SharingFixture['owner']) =>
	f.call<SharedRow[]>(user, 'public.ideacad_shared_with_me($1::uuid)', [f.itemId]);

describe('ideacad_shared_with_me: the grantee\'s only route to a document id', () => {
	it('gives an editor and a viewer the document, with the role they hold', async () => {
		const forEditor = await sharedWithMe(f.editor);
		expect(forEditor.length).toBe(1);
		expect(forEditor[0].documentId).toBe(f.documentId);
		expect(forEditor[0].ownerEmail).toBe(f.owner.email);
		expect(forEditor[0].role).toBe('editor');

		const forViewer = await sharedWithMe(f.viewer);
		expect(forViewer.length).toBe(1);
		expect(forViewer[0].role).toBe('viewer');

		// EVERY FIELD THE CLIENT READS IS PRESENT. `ideacadSharedRows` maps five,
		// and a null in either timestamp would render an empty line.
		for (const key of ['documentId', 'ownerEmail', 'role', 'grantedAt', 'updatedAt']) {
			expect(forEditor[0][key as keyof SharedRow]).toBeTruthy();
		}
	});

	it('gives a classmate with no grant an EMPTY list, not a refusal', async () => {
		// THE POSITIVE CONTROL IS THE TEST ABOVE, on the same database: the
		// classmate's zero means "no grant" and not "the function is broken".
		const none = await sharedWithMe(f.classmate);
		expect(none).toEqual([]);
	});
});

describe('the asymmetry the revocation design rests on', () => {
	it('open_shared_document RAISES after the grant is removed', async () => {
		// Give a third student a grant, then take it away, and ask both functions.
		await f.call(f.owner, 'public.ideacad_share_document($1::uuid, $2, $3)', [
			f.documentId,
			f.classmate.email,
			'editor'
		]);
		const before = await f.call<{ role: string; canWrite: boolean }>(
			f.classmate,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(before.role).toBe('editor');
		expect(before.canWrite).toBe(true);

		await f.call(f.owner, 'public.ideacad_unshare_document($1::uuid, $2)', [
			f.documentId,
			f.classmate.email
		]);

		const raised = await f.refusal(
			f.classmate,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		// IT RAISES, WHICH IS WHY THE CLIENT DOES NOT USE IT TO RE-ASK. The
		// sentence is also the "does not exist" one, so a removed grant and a
		// nonexistent id answer identically and an id cannot be probed.
		expect(raised).toBe('That document does not exist.');
	});

	it('shared_with_me does NOT raise for the same caller: it just omits the row', async () => {
		// THE LOAD-BEARING HALF. The client treats a SUCCESSFUL call as a decision
		// and a FAILED one as undecided; that only works because this function
		// answers rather than raising.
		const after = await sharedWithMe(f.classmate);
		expect(after).toEqual([]);
		// And the other two grantees are untouched, which is the positive control
		// for that empty list.
		expect((await sharedWithMe(f.editor)).length).toBe(1);
		expect((await sharedWithMe(f.viewer)).length).toBe(1);
	});
});

describe('what a revoked editor\'s next write actually says', () => {
	it('refuses, and NOT with the view-only sentence', async () => {
		await f.call(f.owner, 'public.ideacad_share_document($1::uuid, $2, $3)', [
			f.documentId,
			f.classmate.email,
			'editor'
		]);
		// POSITIVE CONTROL: the write lands while the grant is in place.
		const wrote = await f.call<{ ok: boolean }>(
			f.classmate,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 50)',
			[f.conceptId, JSON.stringify({ blade: 'granted' })]
		);
		expect(wrote.ok).toBe(true);

		await f.call(f.owner, 'public.ideacad_unshare_document($1::uuid, $2)', [
			f.documentId,
			f.classmate.email
		]);
		const refused = await f.refusal(
			f.classmate,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 51)',
			[f.conceptId, JSON.stringify({ blade: 'revoked' })]
		);
		// THE MIGRATION SETTLES THE REFUSAL. `_ideacad_can_write_document` is
		// re-asked inside the RPC, so no client decision can widen this.
		expect(refused).toBe('You can only save your own concept.');
		// AND IT IS NOT THE VIEWER SENTENCE, which is the premise of the comment in
		// `store.ts` saying the two cannot be told apart by text: the role is NULL
		// by now, not 'viewer', so the viewer arm is not taken.
		expect(refused).not.toBe('You have view-only access to this document.');
	});

	it('a VIEWER\'s write takes the other arm, which is why text cannot classify either', async () => {
		const refused = await f.refusal(
			f.viewer,
			'public.ideacad_save_concept($1::uuid, $2::jsonb, 60)',
			[f.conceptId, JSON.stringify({ blade: 'viewer' })]
		);
		expect(refused).toBe('You have view-only access to this document.');
	});
});

describe('the instructor path, which is 0201\'s and is NOT rebuilt', () => {
	it('a teacher of record opens the document with no grant at all', async () => {
		// CONFIRMED BY READING AND LEFT ALONE, which is what this prompt asked for.
		// `0201`'s read policies carry `_classroom_manages_item`, so nothing in
		// this bundle grants a teacher anything.
		const opened = await f.call<{ role: string; canWrite: boolean; document: { id: string } }>(
			f.teacher,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(opened.document.id).toBe(f.documentId);
		expect(opened.role).toBe('manager');
		// A MANAGER READS AND DOES NOT WRITE, which `sharing.ts`'s capability table
		// records as a GAP rather than a rule. This asserts today's database.
		expect(opened.canWrite).toBe(false);

		// And the teacher holds no grant, which is the point: the list a grantee
		// reads is empty for them.
		const grants = await f.call<Array<{ granteeEmail: string }>>(
			f.owner,
			'public.ideacad_document_grants($1::uuid)',
			[f.documentId]
		);
		expect(grants.map((g) => g.granteeEmail)).not.toContain(f.teacher.email);
	});

	it('a teacher who does NOT teach the item is refused, identically to a stranger', async () => {
		const other = await f.refusal(
			f.otherTeacher,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		const stranger = await f.refusal(
			f.stranger,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(other).toBe('That document does not exist.');
		// IDENTICAL ANSWERS, so neither can learn the document exists.
		expect(stranger).toBe(other);
	});
});
