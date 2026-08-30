// tests/maps-kind-rules.test.ts
//
// THE CLIENT MIRRORS AGAINST THE DEPLOYED SQL, CASE FOR CASE. The editor
// surfaces 0161's constraints BEFORE the action -- a kind picker that offers
// only legal kinds, an outline form that refuses a two-point polygon before
// the request -- through TypeScript mirrors of `_maps_kind_pair_ok` and
// `_maps_outline_ok`. A mirror is compared against the FUNCTION, never its
// description (verification addenda rule 8): every one of these oracles asks
// Postgres the same question the mirror answers and compares whole results,
// so a drift in either direction reddens.
//
// MUTATION-CHECKED (manually, during this session -- the negative control
// this bundle was asked to include; details in the history entry):
// widening `mapsKindPairOk` to admit a unit inside a building -- the
// permissive direction, which is the dangerous one -- reddened the 36-pair
// oracle AND the allowed-child derivation test below, and the file was
// restored md5-identical and re-run green.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMapsDb, OWNER_EMAIL } from './db/maps-fixture';
import { createUser, type SeededUser, type TestDb } from './db/harness';
import {
	MAPS_KINDS,
	MAPS_ROOT_KINDS,
	mapsAllowedChildKinds,
	mapsAllowedKinds,
	mapsKindPairOk,
	mapsOutlineOk,
	type MapsKind
} from '../src/lib/maps/maps';

let db: TestDb;
let admin: SeededUser;

beforeAll(async () => {
	db = await startMapsDb();
	admin = await createUser(db, OWNER_EMAIL, 'Site Owner');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		OWNER_EMAIL
	]);
});

afterAll(async () => {
	await db?.stop();
});

describe('mapsKindPairOk mirrors _maps_kind_pair_ok', () => {
	it('agrees with the deployed function on all 36 pairs, none of which answers NULL', async () => {
		const rows = await db.sql<{ parent: string; child: string; ok: boolean; is_null: boolean }>(
			`select p.k as parent, c.k as child,
				public._maps_kind_pair_ok(p.k, c.k) as ok,
				public._maps_kind_pair_ok(p.k, c.k) is null as is_null
			 from unnest($1::text[]) p(k) cross join unnest($1::text[]) c(k)
			 order by 1, 2`,
			[[...MAPS_KINDS]]
		);
		expect(rows.rows).toHaveLength(36); // the denominator, so an empty sweep cannot pass
		const disagreements = rows.rows.filter(
			(r) => r.is_null || r.ok !== mapsKindPairOk(r.parent, r.child)
		);
		expect(disagreements).toEqual([]);
		// Positive control: the oracle can see a true and a false.
		expect(rows.rows.find((r) => r.parent === 'unit' && r.child === 'compartment')?.ok).toBe(true);
		expect(rows.rows.find((r) => r.parent === 'building' && r.child === 'unit')?.ok).toBe(false);
	});

	it('derives the same allowed-child sets the SQL truth table implies', async () => {
		for (const parent of MAPS_KINDS) {
			const { rows } = await db.sql<{ child: MapsKind }>(
				`select c.k as child from unnest($1::text[]) c(k)
				 where public._maps_kind_pair_ok($2, c.k) order by 1`,
				[[...MAPS_KINDS], parent]
			);
			expect(mapsAllowedChildKinds(parent).sort(), `children of ${parent}`).toEqual(
				rows.map((r) => r.child).sort()
			);
		}
	});
});

describe('the root rule and the re-kind child check, against the real trigger', () => {
	it('admits at the root exactly the kinds mapsAllowedChildKinds(null) offers', async () => {
		// The oracle is the TRIGGER itself: one real insert attempt per kind.
		for (const kind of MAPS_KINDS) {
			const attempt = db.asUser(admin.id, async (q) => {
				const { rows } = await q<{ id: string }>(
					`insert into public.maps_nodes (parent_id, kind, name)
					 values (null, $1, $2) returning id`,
					[kind, `Root probe ${kind}`]
				);
				// Keep the tree clean for the later cases.
				await q(`delete from public.maps_nodes where id = $1`, [rows[0].id]);
			});
			if (MAPS_ROOT_KINDS.includes(kind)) {
				await expect(attempt, `${kind} at the root`).resolves.toBeUndefined();
				expect(mapsAllowedChildKinds(null)).toContain(kind);
			} else {
				await expect(attempt, `${kind} at the root`).rejects.toThrow(/needs a parent/);
				expect(mapsAllowedChildKinds(null)).not.toContain(kind);
			}
		}
	});

	it('refuses a re-kind that would strand children, exactly where mapsAllowedKinds stops offering it', async () => {
		// site > building > room: changing the building to an outdoor_zone is
		// legal under its parent and ILLEGAL over its child, which is the one
		// case only the second half of the trigger catches.
		const { site, building } = await db.asUser(admin.id, async (q) => {
			const s = await q<{ id: string }>(
				`insert into public.maps_nodes (parent_id, kind, name) values (null, 'site', 'Campus') returning id`
			);
			const b = await q<{ id: string }>(
				`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'building', 'Annex') returning id`,
				[s.rows[0].id]
			);
			await q(
				`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'room', 'Room 1') returning id`,
				[b.rows[0].id]
			);
			return { site: s.rows[0].id, building: b.rows[0].id };
		});

		// The mirror the kind picker reads: under a site, over a room child.
		const offered = mapsAllowedKinds('site', ['room']);
		expect(offered).toEqual(['building']);
		expect(offered).not.toContain('outdoor_zone');

		// The trigger agrees, in both directions.
		await expect(
			db.asUser(admin.id, (q) =>
				q(`update public.maps_nodes set kind = 'outdoor_zone' where id = $1`, [building])
			)
		).rejects.toThrow(/could not sit inside one/);
		await expect(
			db.asUser(admin.id, (q) =>
				q(`update public.maps_nodes set name = 'Annex East' where id = $1`, [building])
			)
		).resolves.toBeDefined();

		await db.asUser(admin.id, async (q) => {
			await q(`delete from public.maps_nodes where parent_id = $1`, [building]);
			await q(`delete from public.maps_nodes where id = $1`, [building]);
			await q(`delete from public.maps_nodes where id = $1`, [site]);
		});
	});
});

describe('mapsOutlineOk mirrors _maps_outline_ok', () => {
	/** The corpus: every branch of the shape question, both verdicts. */
	const CORPUS: { label: string; outline: unknown }[] = [
		{ label: 'valid rect', outline: { kind: 'rect', w: 120, h: 96 } },
		{ label: 'rect with fractional inches', outline: { kind: 'rect', w: 0.75, h: 28.5 } },
		{ label: 'rect zero width', outline: { kind: 'rect', w: 0, h: 10 } },
		{ label: 'rect negative height', outline: { kind: 'rect', w: 10, h: -3 } },
		{ label: 'rect missing h', outline: { kind: 'rect', w: 10 } },
		{ label: 'rect string width', outline: { kind: 'rect', w: '10', h: 4 } },
		{
			label: 'valid triangle',
			outline: { kind: 'polygon', points: [[0, 0], [10, 0], [10, 10]] }
		},
		{ label: 'two-point polygon', outline: { kind: 'polygon', points: [[0, 0], [10, 0]] } },
		{
			label: 'point with three coordinates',
			outline: { kind: 'polygon', points: [[0, 0], [10, 0], [10, 10, 3]] }
		},
		{
			label: 'point with a string coordinate',
			outline: { kind: 'polygon', points: [[0, 0], [10, 0], ['10', 10]] }
		},
		{ label: 'polygon with no points key', outline: { kind: 'polygon' } },
		{ label: 'unknown kind', outline: { kind: 'blob', w: 10, h: 10 } },
		{ label: 'no kind at all', outline: { w: 10, h: 10 } },
		{ label: 'an array', outline: [1, 2, 3] },
		{ label: 'a bare number', outline: 12 }
	];

	it(`agrees with the deployed function on all ${CORPUS.length} corpus shapes, none of which answers NULL`, async () => {
		expect(CORPUS.length).toBe(15); // the denominator
		for (const { label, outline } of CORPUS) {
			const { rows } = await db.sql<{ ok: boolean; is_null: boolean }>(
				`select public._maps_outline_ok($1::jsonb) as ok,
					public._maps_outline_ok($1::jsonb) is null as is_null`,
				[JSON.stringify(outline)]
			);
			expect(rows[0].is_null, `${label}: SQL answered NULL`).toBe(false);
			expect(mapsOutlineOk(outline), label).toBe(rows[0].ok);
		}
		// Positive control on the corpus itself: it holds both verdicts.
		expect(CORPUS.some(({ outline }) => mapsOutlineOk(outline))).toBe(true);
		expect(CORPUS.some(({ outline }) => !mapsOutlineOk(outline))).toBe(true);
	});
});
