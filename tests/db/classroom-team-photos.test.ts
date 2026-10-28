// tests/db/classroom-team-photos.test.ts
//
// LEDGER 0456, MIGRATION 0316: A TEAM'S PICTURES SHOW TO THE WHOLE TEAM, AND
// TEAMMATES ARE NAMED BY FIRST NAME.
//
// The production case, replayed: the chain short of 0316, a team post with a
// role picture and an individual picture uploaded through the real file RPC
// BEFORE the fix, then 0316 applied over that data. Held, both directions
// counted, mutation-proven in the permissive direction (the policy's helper
// answering true for any file reddens the "another team sees nothing" counts):
//   - a teammate reads the row and the storage object of a role picture;
//   - a student on another team, in another section, or on no team reads
//     neither, and nobody but the uploader reads an individual picture;
//   - a role picture is written only by the role's owner;
//   - every teammate's progress counts the team's shared answers and pictures;
//   - a "Last, First" roster name reads as the given name, and two members
//     sharing one read "First L.".

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0436';
import { postSet, rpcOf, seedUnit4, teamManifest, documentFor, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';

const ADD_FILE =
	'public.classroom_add_submission_file($1::uuid, null, $2, $3, 10::bigint, $4, null, $5)';

/** The fixture's manifest with a picture in the Drive role and one of the student's own. */
function photoManifest() {
	const m = teamManifest() as ReturnType<typeof teamManifest> & { modules: Record<string, unknown>[] };
	const modules = m.modules.map((mod) => {
		const blocks = [...((mod.blocks as Record<string, unknown>[]) ?? [])];
		if (mod.id === 'drive-req') blocks.push({ id: 'drive-sketch', field: 'driveSketch', type: 'image' });
		if (mod.id === 'mine') blocks.push({ id: 'my-sketch', field: 'mySketch', type: 'image', optional: true });
		return { ...mod, blocks };
	});
	return { ...m, modules } as ReturnType<typeof teamManifest>;
}

describe('0316 team photos and names', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let outsider: SeededUser;
	let roleFile: string;
	let roleKey: string;
	let ownFile: string;
	let ownKey: string;

	const visibleRows = (u: SeededUser, ids: string[]) =>
		db.asUser(u.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				'select id from public.classroom_submission_files where id = any ($1::uuid[])',
				[ids]
			);
			return rows.map((r) => r.id).sort();
		});
	const readsObject = (u: SeededUser, key: string) =>
		db.asUser(u.id, async (q) => {
			// The storage policy's own predicate, asked as the caller (the stub
			// grants no select on storage.objects; the policy is this call).
			const { rows } = await q<{ ok: boolean }>('select public.classroom_can_read_submission_object($1) as ok', [key]);
			return rows[0].ok ? 1 : 0;
		});

	async function upload(u: SeededUser, block: string): Promise<{ id: string; key: string; out: Record<string, unknown> }> {
		const opened = await rpc<{ submission_id: string }>(u, 'public.classroom_open_submission($1::uuid)', [f.item]);
		const key = `${opened.submission_id}/${crypto.randomUUID()}`;
		await db.sql(`insert into storage.objects (bucket_id, name) values ('submission-files', $1)`, [key]);
		const out = await rpc<Record<string, unknown>>(u, ADD_FILE, [f.item, 'sketch.png', 'image/png', block, key]);
		return { id: String(out.file_id ?? ''), key, out };
	}

	beforeAll(async () => {
		db = await startTestDb(treeShortOf('0316'));
		f = await seedUnit4(db);
		({ rpc } = rpcOf(db));
		await db.sql(`insert into storage.buckets (id, name, public) values ('submission-files', 'submission-files', false) on conflict do nothing`);
		const m = photoManifest();
		await rpc(f.admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
			f.item,
			documentFor(m),
			JSON.stringify(m),
			'plan.html'
		]);
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
		// Ana (team A1) owns Drive; the plan's own setter, as the page does it.
		await rpc(f.a[0], 'public.classroom_team_set_role($1::uuid, $2, $3)', [f.teamA1, 'drive', f.a[0].email]);
		// PRE-MIGRATION DATA: the role picture and Ana's own picture, through the real RPC.
		const role = await upload(f.a[0], 'drive-sketch');
		const own = await upload(f.a[0], 'my-sketch');
		roleFile = role.id;
		roleKey = role.key;
		ownFile = own.id;
		ownKey = own.key;
		// A student enrolled in Block 2 and on no team.
		outsider = await createUser(db, 'zed.nobody@boscotech.net', 'Zed Nobody');
		await enrollStudent(db, { as: f.admin, sectionId: f.sectionA, email: outsider.email, displayName: 'Nobody, Zed' });
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('before 0316 a teammate sees neither the row nor the bytes (the bug, measured)', async () => {
		expect(await visibleRows(f.a[1], [roleFile, ownFile])).toEqual([]);
		expect(await readsObject(f.a[1], roleKey)).toBe(0);
		expect(await visibleRows(f.a[0], [roleFile, ownFile])).toEqual([roleFile, ownFile].sort());
	});

	it('is safe to paste, applies over the stored pictures and re-applies', async () => {
		expect(pasteTrap(migrationSql('0316'))).toEqual([]);
		await db.sql(migrationSql('0316'));
		await db.sql(migrationSql('0316'));
	});

	it('a teammate reads a role picture, row and bytes; never an individual one', async () => {
		for (const mate of [f.a[1], f.a[2], f.a[3]]) {
			expect(await visibleRows(mate, [roleFile, ownFile])).toEqual([roleFile]);
			expect(await readsObject(mate, roleKey)).toBe(1);
			expect(await readsObject(mate, ownKey)).toBe(0);
		}
		// The uploader still reads both, and the teacher both.
		expect(await visibleRows(f.a[0], [roleFile, ownFile])).toEqual([roleFile, ownFile].sort());
		expect(await visibleRows(f.admin, [roleFile, ownFile])).toEqual([roleFile, ownFile].sort());
	});

	it('another team, another section and a student on no team see nothing', async () => {
		for (const other of [f.a[4], f.a[5], f.a[6], f.b[0], outsider]) {
			expect(await visibleRows(other, [roleFile, ownFile])).toEqual([]);
			expect(await readsObject(other, roleKey)).toBe(0);
		}
	});

	it('classroom_team_files lists the team picture for the team only, named by first name', async () => {
		const mine = await rpc<{ files: { id: string; block_id: string; by: string; mine: boolean }[] }>(
			f.a[1],
			'public.classroom_team_files($1::uuid)',
			[f.item]
		);
		expect(mine.files).toEqual([expect.objectContaining({ id: roleFile, block_id: 'drive-sketch', by: 'Ana', mine: false })]);
		const theirs = await rpc<{ files: unknown[] }>(f.a[4], 'public.classroom_team_files($1::uuid)', [f.item]);
		expect(theirs.files).toEqual([]);
		const none = await rpc<{ files: unknown[] }>(outsider, 'public.classroom_team_files($1::uuid)', [f.item]);
		expect(none.files).toEqual([]);
	});

	it('a role picture is written only by the role owner', async () => {
		const ben = await upload(f.a[1], 'drive-sketch');
		expect(ben.out).toMatchObject({ ok: false, reason: 'not_owner', by: 'Ana' });
		const unowned = await upload(f.a[1], 'frame-text').catch((e: Error) => ({ out: { error: e.message } }));
		expect(JSON.stringify(unowned.out)).toMatch(/not an image zone/);
		const own = await upload(f.a[1], 'my-sketch');
		expect(own.out).toMatchObject({ ok: true });
	});

	it('every teammate counts the team box and the role picture in their progress', async () => {
		await rpc(f.a[0], 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [f.item, 'goal', JSON.stringify({ text: 'Far' })]);
		type P = { teams: { members: { me: boolean; answered: string[]; images: string[] }[] }[] };
		const read = async (u: SeededUser) => (await rpc<P>(u, 'public.classroom_team_progress($1::uuid)', [f.item])).teams[0].members;
		const views = await Promise.all([f.a[0], f.a[1], f.a[2]].map(read));
		for (const members of views) {
			for (const m of members) {
				expect(m.answered).toContain('goal');
				expect(m.images).toContain('drive-sketch');
			}
		}
		// An individual picture stays its uploader's in the count.
		const ana = views[1].find((m) => !m.me && m.images.includes('my-sketch'));
		expect(ana?.images).toContain('my-sketch');
		expect(views[2].filter((m) => m.images.includes('my-sketch')).length).toBe(2);
	});

	it('names: "Last, First" reads as the given name; a shared first name reads "First L."', async () => {
		const morales1 = await createUser(db, 'luis.morales@boscotech.net', 'Luis Morales');
		const morales2 = await createUser(db, 'luis.ortega@boscotech.net', 'Luis Ortega');
		const chav = await createUser(db, 'ana.chavarria@boscotech.net', 'Ana Chavarria');
		for (const [u, name] of [
			[morales1, 'Morales, Luis'],
			[morales2, 'Ortega, Luis Angel'],
			[chav, 'Chavarria, Ana']
		] as const) {
			await enrollStudent(db, { as: f.teacher, sectionId: f.sectionB, email: u.email, displayName: name });
		}
		for (const u of [morales1, morales2, chav]) {
			await db.sql(
				'insert into public.classroom_team_members (team_set_id, team_id, student_email) values ($1, $2, $3) on conflict do nothing',
				[f.setB, f.teamB1, u.email]
			);
		}
		const d = await rpc<{ members: { name: string }[] }>(chav, 'public.classroom_team_document($1::uuid)', [f.item]);
		const names = d.members.map((m) => m.name);
		expect(names).toContain('Ana');
		expect(names).toContain('Luis M.');
		expect(names).toContain('Luis O.');
		expect(names.some((n) => n.endsWith(','))).toBe(false);
	});
});
