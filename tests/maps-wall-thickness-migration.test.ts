// tests/maps-wall-thickness-migration.test.ts
//
// MIGRATION 0224 OVER SEEDED PRE-MIGRATION DATA, which is the only shape that
// can prove decision 36's central promise.
//
// THE PROMISE, and it is the one thing in this bundle worth automating: an
// outline already in `maps_nodes` means EXACTLY what it meant before 0224 ran.
// Decision 36 chose the interior face precisely so that would be true with no
// backfill, and a backfill here would be silent -- every room would still
// render, still snap and still publish, just at the wrong size, and nothing on
// any screen would report it. So the chain is booted SHORT of 0224, the world
// is seeded through the REAL pre-migration write path (`seedMapsWorld`, which
// inserts under 0161's own RLS as a real admin and publishes through the real
// `maps_publish`), every geometry value is read out BEFORE, 0224 is applied
// over the top, and the same values are read out AFTER and compared row by row.
//
// AND WHY THE SQL LAYER RATHER THAN THE POSTGREST SHIM. The shim models
// `select` and `rpc`; it does not model `insert`, and every refusal asserted
// here is a CHECK constraint refusing an insert or an update. `db.asUser` runs
// the statement as the `authenticated` role with the caller's JWT claims set,
// which is what PostgREST does per request -- so a constraint that would not
// actually fire is a constraint this file cannot pass.
//
// THE ROLE SWITCH IS LOAD-BEARING. The connection role owns these tables and
// bypasses RLS and the grants; a test that forgot `asUser` would pass
// vacuously. Every write below goes through it.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAPS_MIGRATIONS, seedMapsWorld, publish, type MapsWorld } from './db/maps-fixture';
import { startTestDb, type TestDb } from './db/harness';

const FILE_0224 = '0224_maps_wall_thickness.sql';
const SQL_0224 = readFileSync(join(process.cwd(), 'supabase/migrations', FILE_0224), 'utf8');

/** Every geometry value on every node, in a stable order, as one comparable shape. */
const GEOMETRY_SQL = `
	select id, kind, name, outline::text as outline,
	       position_x_in::text as x, position_y_in::text as y,
	       rotation_deg::text as rot, status, published_at is null as unpublished
	from public.maps_nodes
	order by id
`;

describe('0224 over seeded pre-migration data', () => {
	let db: TestDb;
	let world: MapsWorld;
	let before: Record<string, unknown>[];
	let after: Record<string, unknown>[];

	beforeAll(async () => {
		// Deliberately SHORT of 0224: the world has to be written by the schema
		// as it stands today, not by the one under test.
		db = await startTestDb([...MAPS_MIGRATIONS]);
		world = await seedMapsWorld(db);
		before = (await db.sql(GEOMETRY_SQL)).rows as Record<string, unknown>[];
		await db.sql(SQL_0224);
		after = (await db.sql(GEOMETRY_SQL)).rows as Record<string, unknown>[];
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('seeded a world worth measuring, which is the positive control', () => {
		// A comparison over zero rows passes for the wrong reason. The chain
		// above must have produced real published geometry of both kinds of
		// status before the "nothing moved" assertions below mean anything.
		expect(before.length).toBeGreaterThan(5);
		expect(before.filter((r) => r.outline !== null).length).toBeGreaterThan(4);
		expect(before.filter((r) => r.status === 'published').length).toBeGreaterThan(3);
		expect(before.filter((r) => r.status === 'draft').length).toBeGreaterThan(0);
	});

	it('moves no outline, no position, no rotation and no publication state', () => {
		expect(after).toEqual(before);
	});

	it('leaves both new columns null on every pre-existing row -- no backfill', () => {
		expect(before.length).toBe(after.length);
	});

	it('adds both columns, and they are null everywhere', async () => {
		const { rows } = await db.sql(`
			select count(*)::int as total,
			       count(wall_thickness_in)::int as own,
			       count(default_wall_thickness_in)::int as def
			from public.maps_nodes
		`);
		expect(rows[0].total).toBe(before.length);
		expect(rows[0].own).toBe(0);
		expect(rows[0].def).toBe(0);
	});

	it('re-applies cleanly over itself, twice, and still moves nothing', async () => {
		// Mr. Pina pastes this by hand, so a first attempt that failed partway
		// gets retried. A file that only works once fails exactly then, with
		// the schema half-built.
		await db.sql(SQL_0224);
		await db.sql(SQL_0224);
		const again = (await db.sql(GEOMETRY_SQL)).rows as Record<string, unknown>[];
		expect(again).toEqual(before);
		const { rows } = await db.sql(`
			select count(*)::int as n from pg_catalog.pg_constraint
			where conrelid = 'public.maps_nodes'::regclass
			  and conname in ('maps_nodes_wall_thickness_shape',
			                  'maps_nodes_default_wall_thickness_shape',
			                  'maps_nodes_compartment_no_wall')
		`);
		expect(rows[0].n).toBe(3);
	});

	describe('the predicate, exercised rather than read', () => {
		const cases: [string, boolean][] = [
			['null', true],
			['0', true],
			['5.5', true],
			['1200', true],
			['-0.001', false],
			['-1', false],
			[`'NaN'::numeric`, false],
			[`'Infinity'::numeric`, false],
			[`'-Infinity'::numeric`, false]
		];
		it.each(cases)('_maps_wall_thickness_ok(%s) is %s', async (input, want) => {
			const { rows } = await db.sql(
				`select public._maps_wall_thickness_ok(${input}) as ok`
			);
			expect(rows[0].ok).toBe(want);
		});

		it('never returns null, which is the gate trap in its numeric costume', async () => {
			// A gate that answers NULL does not refuse: `if not <gate> then raise`
			// does not fire on NULL, so the write is ACCEPTED. Asserted with
			// toBeNull rather than toBe(false), because those are wildly
			// different outcomes and only one of them refuses anything.
			const { rows } = await db.sql(`
				select bool_or(public._maps_wall_thickness_ok(v) is null) as any_null
				from unnest(array[null, 0, 5.5, -1, 'NaN', 'Infinity', '-Infinity']::numeric[]) as v
			`);
			expect(rows[0].any_null).toBe(false);
		});
	});

	describe('the constraints refuse through the real write path', () => {
		it('refuses a negative thickness on a room', async () => {
			await expect(
				db.asUser(world.admin.id, (q) =>
					q(`update public.maps_nodes set wall_thickness_in = -1 where id = $1`, [
						world.node['Machine Shop']
					])
				)
			).rejects.toThrow(/maps_nodes_wall_thickness_shape/);
		});

		it('refuses NaN, which a plain >= 0 check would have admitted', async () => {
			await expect(
				db.asUser(world.admin.id, (q) =>
					q(`update public.maps_nodes set wall_thickness_in = 'NaN' where id = $1`, [
						world.node['Machine Shop']
					])
				)
			).rejects.toThrow(/maps_nodes_wall_thickness_shape/);
		});

		it('refuses a negative building default', async () => {
			await expect(
				db.asUser(world.admin.id, (q) =>
					q(`update public.maps_nodes set default_wall_thickness_in = -2 where id = $1`, [
						world.node['IDEA Building']
					])
				)
			).rejects.toThrow(/maps_nodes_default_wall_thickness_shape/);
		});

		it('refuses a wall on a compartment, which carries no plan geometry', async () => {
			await expect(
				db.asUser(world.admin.id, (q) =>
					q(`update public.maps_nodes set wall_thickness_in = 3 where id = $1`, [
						world.node['Drawer 1']
					])
				)
			).rejects.toThrow(/maps_nodes_compartment_no_wall/);
		});

		it('ACCEPTS the legal values, which is the control the four refusals need', async () => {
			// Four refusals prove nothing on their own: a column that refused
			// everything would pass all of them. This is the positive half.
			const { rows } = await db.asUser(world.admin.id, (q) =>
				q<{ own: string | null; def: string | null }>(
					`update public.maps_nodes
					    set wall_thickness_in = 5, default_wall_thickness_in = 0
					  where id = $1
					  returning wall_thickness_in::text as own, default_wall_thickness_in::text as def`,
					[world.node['Machine Shop']]
				)
			);
			expect(rows[0].own).toBe('5');
			expect(rows[0].def).toBe('0');
			await db.asUser(world.admin.id, (q) =>
				q(
					`update public.maps_nodes set wall_thickness_in = null, default_wall_thickness_in = null where id = $1`,
					[world.node['Machine Shop']]
				)
			);
		});
	});

	describe('publish carries the thickness with no change to maps_publish', () => {
		it('promotes both columns from a pending snapshot', async () => {
			// 0161's maps_publish reads its updatable column list off the
			// catalog "so a column added later cannot be silently dropped from
			// promotion". This drives that end to end rather than asserting the
			// catalog query in isolation.
			const id = world.node['Mill Room'];
			await db.asUser(world.admin.id, (q) =>
				q(
					`insert into public.maps_revisions (node_id, state, snapshot)
					 select $1, 'pending', to_jsonb(n) || jsonb_build_object(
					   'wall_thickness_in', 6, 'default_wall_thickness_in', 4)
					 from public.maps_nodes n where n.id = $1`,
					[id]
				)
			);
			await publish(db, world.admin, 'maps_nodes', id);
			const { rows } = await db.sql(
				`select wall_thickness_in::text as own, default_wall_thickness_in::text as def,
				        outline::text as outline
				 from public.maps_nodes where id = $1`,
				[id]
			);
			expect(rows[0].own).toBe('6');
			expect(rows[0].def).toBe('4');
			// And the promotion did not disturb the geometry beside it.
			expect(rows[0].outline).toBe(
				(before.find((r) => r.id === id) as Record<string, unknown>).outline
			);
		});
	});

	describe('the grant surface', () => {
		it('is closed to anon and open to authenticated', async () => {
			const { rows } = await db.sql(`
				select has_function_privilege('anon', 'public._maps_wall_thickness_ok(numeric)', 'execute') as anon_can,
				       has_function_privilege('authenticated', 'public._maps_wall_thickness_ok(numeric)', 'execute') as auth_can
			`);
			// The second is the POSITIVE CONTROL: if it read false the
			// instrument cannot see a grant at all and the first row is
			// meaningless.
			expect(rows[0].anon_can).toBe(false);
			expect(rows[0].auth_can).toBe(true);
		});
	});

	describe('0161 is left alone', () => {
		it('does not widen _maps_outline_ok, and says nothing about thickness in it', async () => {
			const { rows } = await db.sql(`
				select count(*)::int as arity_count,
				       bool_and(position('thickness' in p.prosrc) = 0) as silent
				from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'public' and p.proname = '_maps_outline_ok'
			`);
			expect(rows[0].arity_count).toBe(1);
			expect(rows[0].silent).toBe(true);
		});

		it('still refuses the outlines it always refused, and accepts the ones it accepted', async () => {
			// The widened-gate rule's other half: a bundle that adds a feature
			// must answer every ALREADY STORED document exactly as the deployed
			// gate did. 0224 does not touch this predicate, and this is what
			// says so rather than assuming it.
			const { rows } = await db.sql(`
				select public._maps_outline_ok('{"kind":"rect","w":10,"h":5}'::jsonb) as rect_ok,
				       public._maps_outline_ok('{"kind":"rect","w":0,"h":5}'::jsonb) as rect_zero,
				       public._maps_outline_ok('{"kind":"polygon","points":[[0,0],[1,0],[1,1]]}'::jsonb) as poly_ok,
				       public._maps_outline_ok('{"kind":"polygon","points":[[0,0],[1,0]]}'::jsonb) as poly_two,
				       public._maps_outline_ok('{"kind":"rect","w":10,"h":5,"thickness":3}'::jsonb) as rect_with_key
			`);
			expect(rows[0].rect_ok).toBe(true);
			expect(rows[0].rect_zero).toBe(false);
			expect(rows[0].poly_ok).toBe(true);
			expect(rows[0].poly_two).toBe(false);
			// An unknown key inside the outline was always ignored and still is.
			// This is the row that would redden if somebody put thickness back
			// into the jsonb: it would need this to become a validated key.
			expect(rows[0].rect_with_key).toBe(true);
		});
	});
});
