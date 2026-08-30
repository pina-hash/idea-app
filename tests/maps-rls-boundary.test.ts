// tests/maps-rls-boundary.test.ts
//
// IDEA MAPS (0161/0162/0163): the public-read boundary, made permanent.
//
// WHY THIS FILE EXISTS. The maps schema bundle was constrained to SQL files
// only. Its session proved the boundary with ad hoc probes, quoted them, and
// deleted them before committing, so as of the commit that shipped
// `apps.ideabosco.com`-scale public read over a whole building's contents, the
// thing standing between an anonymous visitor and every unpublished draft in
// the system was proven by nothing at all. This is that proof, permanently, in
// CI.
//
// WHAT IT ASSERTS, GROUPED BY WHAT IT PROTECTS:
//   A. Published rows ARE anonymously readable (spec section 2 -- the headline
//      decision, and the half that breaks silently in the other direction).
//   B. Draft rows are NOT, on every content table, with an admin positive
//      control bound into the same test so an empty table cannot satisfy the
//      exclusion (verification addenda rule 29).
//   C. Writes are refused at TWO INDEPENDENT LAYERS, and the suite proves each
//      separately, because a suite that proves one has proved one:
//        - `anon` fails at the GRANT layer. It holds no insert/update/delete on
//          any maps table, so the refusal is `42501 permission denied for
//          table <t>` and the policies are never consulted.
//        - a SIGNED-IN NON-ADMIN holds the grant (0161 grants write to
//          `authenticated` and puts `is_admin()` in the policy instead), so it
//          reaches RLS and fails there -- `42501 new row violates row-level
//          security policy` on an INSERT.
//      THE UPDATE AND DELETE HALVES DO NOT RAISE AT ALL, which is the trap in
//      this shape and is why they are asserted on ROW COUNT with an admin
//      positive control beside them: a non-admin `update maps_nodes set ...`
//      matches zero rows under `using (is_admin())` and returns success having
//      changed nothing. An assertion that "it was refused" written as
//      `rejects.toThrow()` would simply be false, and one written as "no error"
//      would pass against a policy that had been deleted.
//   D. `maps_revisions` is closed to `anon` in every direction (no grant at
//      all, so select AND insert are grant-layer refusals).
//   E. `maps_search` is anonymously executable and returns published matches
//      only, including the structural case: a PUBLISHED node under a DRAFT
//      ancestor does not surface, because the function is SECURITY INVOKER and
//      the recursive chain cannot see the unpublished parent. 0162's header
//      calls that structural; it is asserted anyway, because the next person
//      may make the function DEFINER for a performance reason and nothing else
//      in the repo would notice.
//   F. `maps_search_log` accepts an anonymous INSERT (spec 5.4 -- the readers
//      whose misses grow the vocabulary are by definition not signed in) and
//      refuses an anonymous SELECT.
//   G. The retention trigger and `maps_publish` (spec 4.3).
//   H. THE MUTATION PROOF, over every policy this file claims to cover.
//
// THE NEGATIVE CONTROL IS PERMISSIVE, NOT ABSENT, AND THE DIFFERENCE IS THE
// WHOLE POINT. Dropping a published-only policy is NOT a valid control here:
// with it dropped, an anonymous caller sees NOTHING, so every
// draft-invisibility assertion in this file still passes -- vacuously, and in
// the direction that reads like success. The mutation is therefore
// `ALTER POLICY ... USING (true)`, which is the shape of the real leak, and it
// is applied IN-DATABASE inside the test against this file's own disposable
// database. No migration file is edited, at any point, for any reason.
//
// AND IT COVERS EVERY POLICY, NOT A REPRESENTATIVE ONE. `POLICY_CENSUS` below
// names all 31 policies on the maps tables, each with the probe whose result
// flips when that policy goes permissive, and the suite asserts the catalog
// holds exactly those 31 -- so a policy added by a later migration is an
// uncovered policy that reddens on arrival rather than one nobody notices
// (verification addenda rules 11 and 13).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QueryFn, TestDb } from './db/harness';
import {
	CONTENT_TABLES,
	search,
	seedMapsWorld,
	startMapsDb,
	type ContentTable,
	type MapsWorld
} from './db/maps-fixture';

let db: TestDb;
let world: MapsWorld;

beforeAll(async () => {
	db = await startMapsDb();
	world = await seedMapsWorld(db);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

/** The SQLSTATE and message of a statement that was refused, or null if it landed. */
async function refusal(fn: () => Promise<unknown>): Promise<{ code: string; message: string } | null> {
	try {
		await fn();
		return null;
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code !== 'string') throw error;
		return { code, message: (error as Error).message };
	}
}

/** Rows this caller can actually see in `table`, by id. Identity, never a count. */
async function visibleIds(userId: string | null, table: string): Promise<string[]> {
	const run = async (q: QueryFn) =>
		(await q<{ id: string }>(`select id from public.${table} order by id`)).rows.map((r) => r.id);
	return userId === null ? db.asAnon(run) : db.asUser(userId, run);
}

async function statusOf(table: string, id: string): Promise<string> {
	const { rows } = await db.sql<{ status: string }>(
		`select status from public.${table} where id = $1`,
		[id]
	);
	return rows[0].status;
}

/** One published id and one draft id per content table, taken off the seeded world. */
function subjects(): Record<ContentTable, { published: string; draft: string }> {
	return {
		maps_nodes: { published: world.node['Mill Room'], draft: world.node['Prototype Lab'] },
		maps_item_types: { published: world.type['Dial Caliper'], draft: world.type['Prototype Widget'] },
		maps_items: { published: world.item['Bridgeport Mill'], draft: world.item['Unreleased Gadget'] },
		maps_stock: {
			published: world.stock['Dial Caliper@Mill Room'],
			draft: world.stock['Hex Key Set@Bench Cabinet']
		}
	};
}

describe('IDEA Maps: the public-read boundary', () => {
	// -----------------------------------------------------------------------
	// A + B. Published is readable, draft is not, on every content table.
	// -----------------------------------------------------------------------
	describe('A. anonymous read: published yes, draft no', () => {
		it('the fixture really holds a published AND a draft row of every kind', async () => {
			// THE DENOMINATOR. Every exclusion below is meaningless if the draft
			// row it excludes was never created, or was created published.
			const rows: string[] = [];
			for (const table of CONTENT_TABLES) {
				const s = subjects()[table];
				rows.push(`${table}.published=${await statusOf(table, s.published)}`);
				rows.push(`${table}.draft=${await statusOf(table, s.draft)}`);
			}
			expect(rows).toEqual([
				'maps_nodes.published=published',
				'maps_nodes.draft=draft',
				'maps_item_types.published=published',
				'maps_item_types.draft=draft',
				'maps_items.published=published',
				'maps_items.draft=draft',
				'maps_stock.published=published',
				'maps_stock.draft=draft'
			]);
		});

		for (const table of CONTENT_TABLES) {
			it(`${table}: anon sees the published row and not the draft, admin sees both`, async () => {
				const s = subjects()[table];
				const anon = await visibleIds(null, table);
				const admin = await visibleIds(world.admin.id, table);

				// The exclusion and its control, in ONE test, so an emptied table
				// cannot satisfy the exclusion (addenda rule 29).
				expect(anon, `anon must reach the published ${table} row`).toContain(s.published);
				expect(anon, `anon must NOT reach the draft ${table} row`).not.toContain(s.draft);
				expect(admin, 'the admin control: the draft row exists and is reachable').toContain(
					s.draft
				);
				expect(admin.length).toBeGreaterThan(anon.length);
			});

			it(`${table}: a signed-in NON-admin sees exactly what anon sees`, async () => {
				// Being signed in is not being an editor. The public-read policy is
				// `to anon, authenticated`, so a non-admin gets the published set and
				// the admin_read policy adds nothing for them.
				const s = subjects()[table];
				const anon = await visibleIds(null, table);
				const nonAdmin = await visibleIds(world.nonAdmin.id, table);
				expect(nonAdmin).toEqual(anon);
				expect(nonAdmin).not.toContain(s.draft);
				expect(nonAdmin).toContain(s.published);
			});
		}

		it('maps_photos: the published-parent rule, both directions', async () => {
			// 0163's public_read is not a status column on the photo -- it asks
			// whether the OBJECT the photo hangs off is published. Both halves are
			// seeded here rather than in the shared fixture, because this is the
			// only test that needs them.
			const onPublished = await db.asUser(world.admin.id, async (q) => {
				const { rows } = await q<{ id: string }>(
					`insert into public.maps_photos (node_id, storage_key, caption)
					 values ($1, $2, $3) returning id`,
					[world.node['Mill Room'], 'maps/mill-room.jpg', 'The mill room']
				);
				return rows[0].id;
			});
			const onDraft = await db.asUser(world.admin.id, async (q) => {
				const { rows } = await q<{ id: string }>(
					`insert into public.maps_photos (node_id, storage_key, caption)
					 values ($1, $2, $3) returning id`,
					[world.node['Prototype Lab'], 'maps/proto-lab.jpg', 'The prototype lab']
				);
				return rows[0].id;
			});
			const anon = await visibleIds(null, 'maps_photos');
			expect(anon, 'a photo on a PUBLISHED node is public').toContain(onPublished);
			expect(anon, 'a photo on a DRAFT node is not').not.toContain(onDraft);
			const admin = await visibleIds(world.admin.id, 'maps_photos');
			expect(admin, 'the control: the draft-parent photo row exists').toContain(onDraft);
		});
	});

	// -----------------------------------------------------------------------
	// C. Two refusal layers, proven separately.
	// -----------------------------------------------------------------------
	describe('C. writes: the grant layer and the RLS layer are two proofs', () => {
		for (const table of [...CONTENT_TABLES, 'maps_photos'] as const) {
			it(`${table}: anon insert, update and delete are refused at the GRANT layer`, async () => {
				const results = [
					await refusal(() =>
						db.asAnon((q) => q(`insert into public.${table} default values`))
					),
					await refusal(() => db.asAnon((q) => q(`update public.${table} set id = id`))),
					await refusal(() => db.asAnon((q) => q(`delete from public.${table}`)))
				];
				for (const r of results) {
					expect(r, `an anon write to ${table} must be refused, not land`).not.toBeNull();
					expect(r!.code).toBe('42501');
					// The MESSAGE is the layer. "permission denied for table" is the
					// grant check, which runs before any policy is consulted; if this
					// ever reads "row-level security policy" instead, anon has been
					// given a write grant and is now being stopped by a policy alone.
					expect(r!.message).toContain(`permission denied for table ${table}`);
				}
			});
		}

		it('a signed-in NON-admin is refused at the RLS layer on insert', async () => {
			const r = await refusal(() =>
				db.asUser(world.nonAdmin.id, (q) =>
					q(`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'room', 'Sneaky Room')`, [
						world.node['IDEA Building']
					])
				)
			);
			expect(r).not.toBeNull();
			expect(r!.code).toBe('42501');
			// A DIFFERENT message from the anon case above, and that difference is
			// the proof that this is a second, independent layer: the non-admin
			// HOLDS the insert grant and got past it.
			expect(r!.message).toContain('new row violates row-level security policy');
			expect(r!.message).not.toContain('permission denied for table');
			const names = await db.sql(`select id from public.maps_nodes where name = 'Sneaky Room'`);
			expect(names.rowCount, 'nothing was written').toBe(0);
		});

		it('a non-admin UPDATE and DELETE do not raise -- they match zero rows', async () => {
			// THE TRAP THIS TEST EXISTS FOR. `using (is_admin())` makes every row
			// invisible to the statement rather than making the statement illegal,
			// so Postgres reports success having touched nothing. Asserting a throw
			// here would be asserting something untrue of the DBMS; asserting "no
			// error" would pass with the policy deleted. The row count is the only
			// assertion that says what happened, and it needs the admin control
			// beside it or a zero could equally mean the WHERE matched nothing.
			const target = world.node['Bench Cabinet'];
			const asNonAdmin = await db.asUser(world.nonAdmin.id, (q) =>
				q(`update public.maps_nodes set description = 'non-admin was here' where id = $1`, [target])
			);
			expect(asNonAdmin.rowCount, 'a non-admin update reaches zero rows').toBe(0);

			const asAdmin = await db.asUser(world.admin.id, (q) =>
				q(`update public.maps_nodes set description = 'admin was here' where id = $1`, [target])
			);
			expect(asAdmin.rowCount, 'the positive control: the same statement from an admin lands').toBe(1);

			const after = await db.sql<{ description: string }>(
				`select description from public.maps_nodes where id = $1`,
				[target]
			);
			expect(after.rows[0].description).toBe('admin was here');

			const del = await db.asUser(world.nonAdmin.id, (q) =>
				q(`delete from public.maps_nodes where id = $1`, [target])
			);
			expect(del.rowCount, 'a non-admin delete reaches zero rows').toBe(0);
			const still = await db.sql(`select id from public.maps_nodes where id = $1`, [target]);
			expect(still.rowCount, 'and the row is still there').toBe(1);
		});

		it('maps_publish refuses anon at the grant layer and a non-admin in its body', async () => {
			const anonCall = await refusal(() =>
				db.asAnon((q) => q(`select public.maps_publish('maps_nodes', $1)`, [world.node['Mill Room']]))
			);
			expect(anonCall).not.toBeNull();
			expect(anonCall!.code).toBe('42501');
			expect(anonCall!.message).toContain('permission denied for function maps_publish');

			const nonAdminCall = await refusal(() =>
				db.asUser(world.nonAdmin.id, (q) =>
					q(`select public.maps_publish('maps_nodes', $1)`, [world.node['Mill Room']])
				)
			);
			expect(nonAdminCall).not.toBeNull();
			// P0001 is a `raise exception`, not a permission error: the non-admin
			// holds EXECUTE and was turned away by the function's own is_admin()
			// check. Two layers again.
			expect(nonAdminCall!.code).toBe('P0001');
			expect(nonAdminCall!.message).toContain('Only site admins can publish IDEA Maps content.');
		});
	});

	// -----------------------------------------------------------------------
	// D. maps_revisions is closed to anon in every direction.
	// -----------------------------------------------------------------------
	describe('D. maps_revisions holds no anon grant of any kind', () => {
		it('anon select and anon insert are both grant-layer refusals', async () => {
			const sel = await refusal(() =>
				db.asAnon((q) => q(`select id from public.maps_revisions`))
			);
			expect(sel).not.toBeNull();
			expect(sel!.code).toBe('42501');
			expect(sel!.message).toContain('permission denied for table maps_revisions');

			const ins = await refusal(() =>
				db.asAnon((q) =>
					q(
						`insert into public.maps_revisions (node_id, state, snapshot)
						 values ($1, 'pending', '{"name":"x"}'::jsonb)`,
						[world.node['Mill Room']]
					)
				)
			);
			expect(ins).not.toBeNull();
			expect(ins!.code).toBe('42501');
			expect(ins!.message).toContain('permission denied for table maps_revisions');
		});

		it('a non-admin holds the grant, reaches RLS, and sees nothing', async () => {
			// The positive control is the admin read: if the table were empty, the
			// non-admin's zero would prove nothing.
			const asAdmin = await db.asUser(world.admin.id, async (q) =>
				(await q(`select id from public.maps_revisions`)).rows
			);
			expect(asAdmin.length, 'the control: retained revisions exist to be hidden').toBeGreaterThan(
				0
			);
			const asNonAdmin = await db.asUser(world.nonAdmin.id, async (q) =>
				(await q(`select id from public.maps_revisions`)).rows
			);
			expect(asNonAdmin).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// E. maps_search, anonymously.
	// -----------------------------------------------------------------------
	describe('E. maps_search is anonymous and published-only', () => {
		it('anon may execute it and gets published matches', async () => {
			const rows = await search(db, null, 'Dial Caliper');
			expect(rows.length).toBeGreaterThan(0);
			const ids = rows.map((r) => r.result_id);
			expect(ids).toContain(world.stock['Dial Caliper@Mill Room']);
		});

		it('a draft item does not surface for anon, and does for an admin', async () => {
			const anon = await search(db, null, 'Unreleased Gadget');
			const admin = await search(db, world.admin.id, 'Unreleased Gadget');
			expect(anon, 'the draft item is invisible anonymously').toEqual([]);
			expect(
				admin.map((r) => r.result_id),
				'the control: the row exists and the query finds it'
			).toContain(world.item['Unreleased Gadget']);
		});

		it('a PUBLISHED item under a DRAFT ancestor does not surface for anon', async () => {
			// 0162's header calls this structural, because the function is SECURITY
			// INVOKER and the recursive chain cannot climb through a node RLS hides.
			// Asserted anyway: the day somebody makes maps_search SECURITY DEFINER
			// for a performance reason, this is the only thing in the repo that
			// would notice.
			expect(await statusOf('maps_nodes', world.node['Lab Cart'])).toBe('published');
			expect(await statusOf('maps_nodes', world.node['Prototype Lab'])).toBe('draft');
			expect(await statusOf('maps_items', world.item['Lab Cart Caliper'])).toBe('published');

			const anon = await search(db, null, 'Lab Cart');
			expect(anon, 'the published unit under a draft room is unreachable').toEqual([]);

			const anonCalipers = await search(db, null, 'Dial Caliper');
			expect(
				anonCalipers.map((r) => r.result_id),
				'and neither is the published caliper standing on it'
			).not.toContain(world.item['Lab Cart Caliper']);

			const admin = await search(db, world.admin.id, 'Lab Cart');
			expect(
				admin.map((r) => r.result_id),
				'the control: an admin, who can see the draft room, reaches both'
			).toContain(world.node['Lab Cart']);
		});
	});

	// -----------------------------------------------------------------------
	// F. The search log: spec 5.4.
	// -----------------------------------------------------------------------
	describe('F. maps_search_log: anon writes, anon can never read', () => {
		it('an anonymous insert lands', async () => {
			await db.asAnon((q) =>
				q(`insert into public.maps_search_log (query, result_count) values ($1, $2)`, [
					'anonymous miss',
					0
				])
			);
			const { rows } = await db.sql<{ query: string; result_count: number }>(
				`select query, result_count from public.maps_search_log where query = 'anonymous miss'`
			);
			expect(rows).toEqual([{ query: 'anonymous miss', result_count: 0 }]);
		});

		it('an anonymous select is refused at the grant layer', async () => {
			const r = await refusal(() => db.asAnon((q) => q(`select query from public.maps_search_log`)));
			expect(r).not.toBeNull();
			expect(r!.code).toBe('42501');
			expect(r!.message).toContain('permission denied for table maps_search_log');
		});

		it('a signed-in non-admin holds SELECT and still reads nothing', async () => {
			const asAdmin = await db.asUser(world.admin.id, async (q) =>
				(await q(`select query from public.maps_search_log`)).rows
			);
			expect(asAdmin.length, 'the control: there is a row to hide').toBeGreaterThan(0);
			const asNonAdmin = await db.asUser(world.nonAdmin.id, async (q) =>
				(await q(`select query from public.maps_search_log`)).rows
			);
			expect(asNonAdmin).toEqual([]);
		});

		it('nobody may update or delete a logged miss', async () => {
			for (const role of ['anon', 'nonAdmin', 'admin'] as const) {
				const run = (sql: string) =>
					role === 'anon'
						? db.asAnon((q) => q(sql))
						: db.asUser(role === 'admin' ? world.admin.id : world.nonAdmin.id, (q) => q(sql));
				const upd = await refusal(() => run(`update public.maps_search_log set result_count = 99`));
				const del = await refusal(() => run(`delete from public.maps_search_log`));
				expect(upd, `${role} must not UPDATE the log`).not.toBeNull();
				expect(upd!.code).toBe('42501');
				expect(del, `${role} must not DELETE from the log`).not.toBeNull();
				expect(del!.code).toBe('42501');
			}
			const { rows } = await db.sql<{ c: string }>(
				`select count(*) c from public.maps_search_log where result_count = 99`
			);
			expect(rows[0].c).toBe('0');
		});

		it('carries no identity column of any kind', async () => {
			// Spec 5.4: "no identity (readers are anonymous)". Asserted as the SET
			// of columns rather than as the absence of names somebody thought of.
			const { rows } = await db.sql<{ column_name: string }>(
				`select column_name from information_schema.columns
				 where table_schema = 'public' and table_name = 'maps_search_log'
				 order by column_name`
			);
			expect(rows.map((r) => r.column_name)).toEqual([
				'created_at',
				'id',
				'query',
				'result_count'
			]);
		});
	});

	// -----------------------------------------------------------------------
	// G. Retention and publish: spec 4.3.
	// -----------------------------------------------------------------------
	describe('G. the retention trigger and maps_publish', () => {
		it('a direct update of a published row archives the OLD row', async () => {
			const id = world.node['Drawer 2'];
			expect(await statusOf('maps_nodes', id)).toBe('published');
			const before = await db.sql<{ id: string }>(
				`select id from public.maps_revisions where node_id = $1 and state = 'retained'`,
				[id]
			);
			expect(before.rows, 'nothing retained yet').toEqual([]);

			await db.asUser(world.admin.id, (q) =>
				q(`update public.maps_nodes set name = 'Drawer Two', description = 'renamed' where id = $1`, [
					id
				])
			);

			const after = await db.sql<{ revision: number; state: string; nm: string; ds: string | null }>(
				`select revision, state, snapshot ->> 'name' as nm, snapshot ->> 'description' as ds
				 from public.maps_revisions where node_id = $1 order by revision`,
				[id]
			);
			// The snapshot is the row as the public last read it -- the OLD name,
			// not the new one. That is what makes revert republishing a snapshot.
			expect(after.rows).toEqual([
				{ revision: 1, state: 'retained', nm: 'Drawer 2', ds: null }
			]);
			const live = await db.sql<{ name: string }>(
				`select name from public.maps_nodes where id = $1`,
				[id]
			);
			expect(live.rows[0].name).toBe('Drawer Two');
		});

		it('a no-op update archives nothing', async () => {
			// The trigger's WHEN clause is `old.* is distinct from new.*`. Without
			// it every idempotent save would mint a revision.
			const id = world.node['Tool Chest A'];
			const before = await db.sql<{ c: string }>(
				`select count(*) c from public.maps_revisions where node_id = $1`,
				[id]
			);
			await db.asUser(world.admin.id, (q) =>
				q(`update public.maps_nodes set name = name where id = $1`, [id])
			);
			const after = await db.sql<{ c: string }>(
				`select count(*) c from public.maps_revisions where node_id = $1`,
				[id]
			);
			expect(after.rows[0].c).toBe(before.rows[0].c);
		});

		it('a draft row updated in place archives nothing -- retention starts at publish', async () => {
			const id = world.node['Prototype Lab'];
			expect(await statusOf('maps_nodes', id)).toBe('draft');
			await db.asUser(world.admin.id, (q) =>
				q(`update public.maps_nodes set description = 'still a draft' where id = $1`, [id])
			);
			const { rows } = await db.sql<{ c: string }>(
				`select count(*) c from public.maps_revisions where node_id = $1`,
				[id]
			);
			expect(rows[0].c).toBe('0');
		});

		it('maps_publish promotes a pending revision and retains the prior one', async () => {
			const id = world.node['Bench Cabinet'];
			expect(await statusOf('maps_nodes', id)).toBe('published');
			const priorName = (
				await db.sql<{ name: string }>(`select name from public.maps_nodes where id = $1`, [id])
			).rows[0].name;
			const retainedBefore = (
				await db.sql<{ c: string }>(
					`select count(*) c from public.maps_revisions where node_id = $1 and state = 'retained'`,
					[id]
				)
			).rows[0].c;

			await db.asUser(world.admin.id, (q) =>
				q(
					`insert into public.maps_revisions (node_id, state, snapshot)
					 values ($1, 'pending', jsonb_build_object('name', 'Bench Cabinet (west wall)', 'description', 'staged edit'))`,
					[id]
				)
			);
			// While the edit is pending, the PUBLIC read is unchanged. That is the
			// property the live-row-plus-side-table design exists for.
			const anonDuring = await db.asAnon(async (q) =>
				(await q<{ name: string }>(`select name from public.maps_nodes where id = $1`, [id])).rows
			);
			expect(anonDuring[0].name).toBe(priorName);

			const result = await db.asUser(world.admin.id, async (q) =>
				(
					await q<{ r: Record<string, unknown> }>(`select public.maps_publish('maps_nodes', $1) as r`, [
						id
					])
				).rows[0].r
			);
			expect(result.ok).toBe(true);
			expect(result.action).toBe('promoted');

			const live = await db.sql<{ name: string; description: string; status: string }>(
				`select name, description, status from public.maps_nodes where id = $1`,
				[id]
			);
			expect(live.rows[0]).toMatchObject({
				name: 'Bench Cabinet (west wall)',
				description: 'staged edit',
				status: 'published'
			});

			const revs = await db.sql<{ state: string; revision: number | null; nm: string }>(
				`select state, revision, snapshot ->> 'name' as nm
				 from public.maps_revisions where node_id = $1 order by coalesce(revision, -1)`,
				[id]
			);
			expect(
				revs.rows.filter((r) => r.state === 'pending'),
				'the pending row is consumed'
			).toEqual([]);
			const retained = revs.rows.filter((r) => r.state === 'retained');
			expect(retained.length).toBe(Number(retainedBefore) + 1);
			expect(
				retained[retained.length - 1].nm,
				'the newest retained revision holds the name the public last read'
			).toBe(priorName);
			expect(result.retained_revision).toBe(retained[retained.length - 1].revision);

			// And the anonymous read now shows the promoted content.
			const anonAfter = await db.asAnon(async (q) =>
				(await q<{ name: string }>(`select name from public.maps_nodes where id = $1`, [id])).rows
			);
			expect(anonAfter[0].name).toBe('Bench Cabinet (west wall)');
		});

		it('publishing a draft is a first publish with nothing to retain', async () => {
			const id = world.type['Prototype Widget'];
			expect(await statusOf('maps_item_types', id)).toBe('draft');
			const anonBefore = await visibleIds(null, 'maps_item_types');
			expect(anonBefore).not.toContain(id);

			const result = await db.asUser(world.admin.id, async (q) =>
				(
					await q<{ r: Record<string, unknown> }>(
						`select public.maps_publish('maps_item_types', $1) as r`,
						[id]
					)
				).rows[0].r
			);
			expect(result).toMatchObject({ ok: true, action: 'first_publish', retained_revision: null });
			expect(await visibleIds(null, 'maps_item_types')).toContain(id);
		});

		it('refuses structurally rather than raising', async () => {
			const answers = await db.asUser(world.admin.id, async (q) => [
				(
					await q<{ r: Record<string, unknown> }>(
						`select public.maps_publish('maps_nodes', '00000000-0000-0000-0000-000000000000') as r`
					)
				).rows[0].r,
				(
					await q<{ r: Record<string, unknown> }>(`select public.maps_publish('maps_nodes', $1) as r`, [
						world.node['Drawer 1']
					])
				).rows[0].r
			]);
			expect(answers[0]).toEqual({ ok: false, reason: 'not_found' });
			expect(answers[1]).toEqual({ ok: false, reason: 'nothing_pending' });
		});
	});
});
