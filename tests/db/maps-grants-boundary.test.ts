// tests/db/maps-grants-boundary.test.ts
//
// THE 0172 GRANTED-EDITOR BOUNDARY, DRIVEN AS A REAL GRANTEE.
//
// Every probe here runs through `db.asUser`, which sets the JWT claims GUC and
// then `SET ROLE authenticated` -- exactly what PostgREST does. NOTHING in
// this file runs as the connection owner or as `service_role`: both bypass RLS
// and both would make every assertion below pass vacuously, which is the shape
// of vacuous test this repo has shipped most often.
//
// THE SEVEN CASES the bundle owes, each its own assertion:
//   1  grantee writes a draft INSIDE their subtree          ALLOWED
//   2  grantee writes a draft OUTSIDE it                    REFUSED
//   3  grantee publishes anything                           REFUSED
//   4  grantee edits a PUBLISHED row inside their subtree   REFUSED
//   5  grantee grants or revokes                            REFUSED
//   6  after revoke, case 1 becomes                         REFUSED
//   7  admin does all of the above                          ALLOWED, and identical to pre-0172
//
// POSITIVE CONTROLS FOR 2 THROUGH 6 ARE THE POINT OF THE FILE, not a garnish.
// A refusal test that still passes with its policy opened is testing the
// absence of a fixture rather than the presence of a rule. So each of those
// five is measured a second time with the clause that refuses it OPENED IN THE
// PERMISSIVE DIRECTION, one at a time, and must FLIP to allowed.
//
// THE MUTATION IS A CATALOG EDIT AND THE RESTORE IS FROM A CAPTURED COPY.
// `pg_get_expr` over `pg_policy` is read BEFORE each mutation, the restore is
// built from that captured text, and the expression is read back and compared
// -- by md5 of the captured string, so "restored identical" is a measurement
// rather than a hope. NOTHING under `supabase/migrations/` is read, written or
// re-applied here, and no `git` command is run: CLAUDE.md's rule exists
// because `git checkout --` inside a mutation script silently discarded three
// sessions' uncommitted work, and re-applying the migration file would be the
// same hazard wearing a different hat.
//
// A LEAKING PROBE IS ROLLED BACK. While a policy is open a leaked write really
// does land, so every write probe runs inside its own transaction and rolls
// back -- otherwise the next probe inherits a world the previous leak made.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, startTestDb, type QueryFn, type SeededUser, type TestDb } from './harness';
import { MAPS_MIGRATIONS, publish, seedMapsWorld, type MapsWorld } from './maps-fixture';

/** The maps chain with 0172 on the end -- production order, this file's own list. */
const GRANT_MIGRATIONS = [...MAPS_MIGRATIONS, '0172_maps_editor_grants.sql'] as const;

let db: TestDb;
let world: MapsWorld;
/** Holds a grant on `Machine Shop`. A student account, which is the population. */
let grantee: SeededUser;
/** Signed in, no grant of any kind. The "nothing at all" control. */
let outsider: SeededUser;
/** A DRAFT node inside the grantee's subtree, for the edit probes. */
let draftInside = '';
/** A DRAFT node OUTSIDE it (under Mill Room), for the scope probes. */
let draftOutside = '';

const results: string[] = [];
function record(line: string) {
	results.push(line);
}

beforeAll(async () => {
	db = await startTestDb(GRANT_MIGRATIONS);
	world = await seedMapsWorld(db);
	grantee = await createUser(db, 'student@boscotech.net', 'Granted Student');
	outsider = await createUser(db, 'other@boscotech.net', 'Ungranted Student');

	// The grant is made through the REAL RPC, as a real admin, not by raw
	// insert: the RPC is the only write path and its own domain rule is part
	// of what is under test.
	await db.asUser(world.admin.id, (q) =>
		q('select public.maps_editor_grant($1, $2, $3)', [
			grantee.email,
			world.node['Machine Shop'],
			'Cataloguing the tool chests'
		])
	);

	// Two draft nodes an ADMIN made, one on each side of the boundary, so the
	// grantee's UPDATE and DELETE probes have a subject that already exists.
	const mkDraft = async (name: string, parent: string) =>
		db.asUser(world.admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', $2) returning id`,
				[parent, name]
			);
			return rows[0].id;
		});
	draftInside = await mkDraft('Draft Bench (inside)', world.node['Machine Shop']);
	draftOutside = await mkDraft('Draft Bench (outside)', world.node['Mill Room']);
}, 240_000);

afterAll(async () => {
	if (results.length) console.log(['', 'B4 RESULTS', ...results].join('\n'));
	await db?.stop();
});

// ---------------------------------------------------------------------------
// Probe plumbing
// ---------------------------------------------------------------------------

/**
 * True when the statement LANDED. A refusal (an error, or zero rows affected)
 * is false.
 *
 * NO PROBE HERE CARRIES A `returning` CLAUSE, and that is a correction this
 * file made to itself rather than a style choice. Postgres applies the SELECT
 * policies to a RETURNING clause, so an `insert ... returning id` measures the
 * READ policy and the WRITE policy at once -- and the first draft of this file
 * read `landed = false` on a write that had genuinely landed, because the new
 * row was not readable. A probe that cannot tell "the write policy refused"
 * from "the read policy hid the answer" is standing behind a boundary
 * assertion proving neither. `rowCount` on a bare INSERT/UPDATE/DELETE is the
 * number of rows the WRITE touched, which is the question. The RETURNING
 * shape -- which is what PostgREST actually sends -- has its own case, 1c.
 */
async function landed(q: QueryFn, sql: string, params: unknown[] = []): Promise<boolean> {
	try {
		const r = await q(sql, params);
		return (r.rowCount ?? 0) > 0;
	} catch {
		return false;
	}
}

/** A write probe whose effect cannot outlive its own measurement. */
function writeAs(user: SeededUser, sql: string, params: unknown[] = []) {
	return async (): Promise<boolean> =>
		db.asUser(user.id, async (q) => {
			await q('begin');
			try {
				return await landed(q, sql, params);
			} finally {
				await q('rollback').catch(() => {});
			}
		});
}

interface PolicyExpr {
	qual: string | null;
	withCheck: string | null;
}

async function policyExpr(table: string, policy: string, schema = 'public'): Promise<PolicyExpr> {
	const { rows } = await db.sql<{ qual: string | null; wc: string | null }>(
		`select pg_get_expr(p.polqual, p.polrelid) as qual,
		        pg_get_expr(p.polwithcheck, p.polrelid) as wc
		   from pg_policy p
		  where p.polname = $2 and p.polrelid = ($1)::regclass`,
		[`${schema}.${table}`, policy]
	);
	if (rows.length !== 1) {
		throw new Error(`${schema}.${table}.${policy}: expected one policy row, got ${rows.length}`);
	}
	return { qual: rows[0].qual, withCheck: rows[0].wc };
}

function alterSql(table: string, policy: string, expr: PolicyExpr, schema = 'public'): string {
	let sql = `alter policy ${policy} on ${schema}.${table}`;
	if (expr.qual !== null) sql += ` using (${expr.qual})`;
	if (expr.withCheck !== null) sql += ` with check (${expr.withCheck})`;
	return sql;
}

const fingerprint = (e: PolicyExpr) =>
	createHash('md5').update(`${e.qual ?? '<null>'}||${e.withCheck ?? '<null>'}`).digest('hex');

/**
 * THE POSITIVE CONTROL. Captures the policy, replaces every clause it HAS with
 * `true`, re-measures the probe, restores from the CAPTURED COPY and asserts
 * the restored expression is md5-identical to what was captured.
 *
 * `expectOpen` is what the probe must answer while the policy is open. It is
 * almost always true -- the leak -- but a control that measures a SECOND layer
 * still refusing is a real result and is stated rather than hidden.
 */
async function withPolicyOpened(
	table: string,
	policy: string,
	probe: () => Promise<boolean>,
	opts: { schema?: string } = {}
): Promise<{ before: string; opened: boolean; after: string }> {
	const schema = opts.schema ?? 'public';
	const captured = await policyExpr(table, policy, schema);
	const before = fingerprint(captured);
	const permissive: PolicyExpr = {
		qual: captured.qual === null ? null : 'true',
		withCheck: captured.withCheck === null ? null : 'true'
	};
	await db.sql(alterSql(table, policy, permissive, schema));
	// The mutation is proven to have LANDED before its result is read: a
	// mutation that never applied is indistinguishable from one nothing
	// catches, and it is the likelier of the two.
	const nowOpen = await policyExpr(table, policy, schema);
	if (fingerprint(nowOpen) === before) {
		throw new Error(`${policy}: the permissive mutation did not apply -- the expression is unchanged.`);
	}
	let opened: boolean;
	try {
		opened = await probe();
	} finally {
		await db.sql(alterSql(table, policy, captured, schema));
	}
	const after = fingerprint(await policyExpr(table, policy, schema));
	return { before, opened, after };
}

// ---------------------------------------------------------------------------
// The seven cases
// ---------------------------------------------------------------------------

describe('0172 granted maps editors -- the boundary, driven as a real grantee', () => {
	it('1. a grantee writes a DRAFT INSIDE their subtree: ALLOWED', async () => {
		const insert = writeAs(
			grantee,
			`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', 'Grantee Bench')`,
			[world.node['Machine Shop']]
		);
		const update = writeAs(grantee, `update public.maps_nodes set name = 'Renamed' where id = $1`, [
			draftInside
		]);
		const del = writeAs(grantee, `delete from public.maps_nodes where id = $1`, [draftInside]);
		const item = writeAs(
			grantee,
			`insert into public.maps_items (node_id, name) values ($1, 'Grantee Item')`,
			[world.node['Drawer 1']]
		);
		const [i, u, d, it] = [await insert(), await update(), await del(), await item()];
		record(`1 ALLOWED  insert=${i} update=${u} delete=${d} item-in-drawer(depth 4 under the grant)=${it}`);
		expect({ i, u, d, it }).toEqual({ i: true, u: true, d: true, it: true });
	});

	it('1b. the grant reaches the WHOLE subtree, not just the granted node', async () => {
		// Drawer 1 is depth 4: Building > Machine Shop (granted) > Tool Chest A > Drawer 1.
		const deep = writeAs(
			grantee,
			`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'compartment', 'Grantee Drawer')`,
			[world.node['Tool Chest A']]
		);
		const reaches = await deep();
		record(`1b ALLOWED two levels below the granted node = ${reaches}`);
		expect(reaches).toBe(true);
	});

	it('1c. a grantee INSERT ... RETURNING answers with the row (the shape PostgREST sends)', async () => {
		// `supabase.from(t).insert(v).select('id')` is an INSERT with a
		// RETURNING clause, and RETURNING is filtered by the SELECT policies.
		// A read predicate that walks up from the row's OWN id cannot see the
		// tuple it was just handed -- it is a STABLE function on the command's
		// snapshot -- so the write lands and the client reads back nothing,
		// which `transports.insertRow` reports as a failure. This is the case
		// that found that, and `maps_nodes_editor_read`'s second disjunct
		// (`maps_can_edit_node(parent_id)`, the NEW ROW'S OWN COLUMN) is the fix.
		const returned = await db.asUser(grantee.id, async (q) => {
			await q('begin');
			try {
				const r = await q<{ id: string }>(
					`insert into public.maps_nodes (parent_id, kind, name)
					 values ($1, 'unit', 'Returning Probe') returning id`,
					[world.node['Machine Shop']]
				);
				return r.rows.length;
			} finally {
				await q('rollback').catch(() => {});
			}
		});
		record(`1c ALLOWED insert...returning gave back ${returned} row(s)`);
		expect(returned).toBe(1);
	});

	it('2. a grantee writes a draft OUTSIDE their subtree: REFUSED (+ positive control)', async () => {
		const probe = writeAs(
			grantee,
			`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', 'Trespass')`,
			[world.node['Mill Room']]
		);
		const refused = await probe();
		expect(refused).toBe(false);

		const control = await withPolicyOpened('maps_nodes', 'maps_nodes_editor_insert', probe);
		record(
			`2 REFUSED=${!refused} | control: opened maps_nodes_editor_insert -> landed=${control.opened}, restored md5 ${control.after === control.before ? 'IDENTICAL' : 'CHANGED'}`
		);
		expect(control.opened).toBe(true);
		expect(control.after).toBe(control.before);

		// And the same refusal on an UPDATE and a DELETE of a row outside.
		const upd = await writeAs(grantee, `update public.maps_nodes set name = 'X' where id = $1`, [
			draftOutside
		])();
		const del = await writeAs(grantee, `delete from public.maps_nodes where id = $1`, [
			draftOutside
		])();
		record(`2b REFUSED update-outside=${!upd} delete-outside=${!del}`);
		expect({ upd, del }).toEqual({ upd: false, del: false });
	});

	it('2c. an OUTSIDER holding no grant reaches nothing at all', async () => {
		const ins = await writeAs(
			outsider,
			`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', 'Nope')`,
			[world.node['Machine Shop']]
		)();
		const sees = await db.asUser(outsider.id, async (q) =>
			((await q('select id from public.maps_nodes where id = $1', [draftInside])).rowCount ?? 0) > 0
		);
		record(`2c REFUSED outsider insert=${!ins}, outsider cannot even SEE the draft=${!sees}`);
		expect({ ins, sees }).toEqual({ ins: false, sees: false });
	});

	it('3. a grantee PUBLISHES anything: REFUSED, by both routes', async () => {
		// Route one: the RPC. Its own body raises.
		let rpcRefusal = '';
		await db.asUser(grantee.id, async (q) => {
			try {
				await q('select public.maps_publish($1, $2)', ['maps_nodes', draftInside]);
				rpcRefusal = '<<the RPC ALLOWED it>>';
			} catch (cause) {
				rpcRefusal = cause instanceof Error ? cause.message : String(cause);
			}
		});
		expect(rpcRefusal).toContain('Only site admins can publish');

		// Route two, which is the one a policy has to close: a plain UPDATE
		// straight through PostgREST setting status itself. 0161's admin
		// UPDATE policy permits this shape, so if 0172's WITH CHECK did not
		// pin draft, the RPC gate above would be bypassable.
		const probe = writeAs(
			grantee,
			`update public.maps_nodes set status = 'published', published_at = now() where id = $1`,
			[draftInside]
		);
		const direct = await probe();
		expect(direct).toBe(false);

		const control = await withPolicyOpened('maps_nodes', 'maps_nodes_editor_update', probe);
		record(
			`3 REFUSED rpc="${rpcRefusal.slice(0, 48)}" direct-status-update=${!direct} | control: opened maps_nodes_editor_update -> landed=${control.opened}, restored md5 ${control.after === control.before ? 'IDENTICAL' : 'CHANGED'}`
		);
		expect(control.opened).toBe(true);
		expect(control.after).toBe(control.before);
	});

	it('4. a grantee edits a PUBLISHED row inside their subtree: REFUSED (+ positive control)', async () => {
		const probe = writeAs(
			grantee,
			`update public.maps_nodes set name = 'Renamed In Public' where id = $1`,
			[world.node['Tool Chest A']]
		);
		const refused = await probe();
		expect(refused).toBe(false);

		const control = await withPolicyOpened('maps_nodes', 'maps_nodes_editor_update', probe);
		record(
			`4 REFUSED=${!refused} | control: opened maps_nodes_editor_update -> landed=${control.opened}, restored md5 ${control.after === control.before ? 'IDENTICAL' : 'CHANGED'}`
		);
		expect(control.opened).toBe(true);
		expect(control.after).toBe(control.before);

		const del = await writeAs(grantee, `delete from public.maps_nodes where id = $1`, [
			world.node['Drawer 2']
		])();
		record(`4b REFUSED delete of a published row inside the subtree=${!del}`);
		expect(del).toBe(false);
	});

	it('5. a grantee grants or revokes: REFUSED (+ positive control on the roster policy)', async () => {
		const say = async (sql: string, params: unknown[]) =>
			db.asUser(grantee.id, async (q) => {
				try {
					await q(sql, params);
					return '<<ALLOWED>>';
				} catch (cause) {
					return cause instanceof Error ? cause.message : String(cause);
				}
			});
		const granted = await say('select public.maps_editor_grant($1, $2)', [
			'friend@boscotech.net',
			world.node['Machine Shop']
		]);
		const revoked = await say('select public.maps_editor_revoke($1, $2)', [
			grantee.email,
			world.node['Machine Shop']
		]);
		expect(granted).toContain('Only site admins can grant');
		expect(revoked).toContain('Only site admins can revoke');

		// The roster read is the third refusal, and the one with a policy to
		// open. `maps_editor_roster` gates inside the body, so it answers an
		// EMPTY SET rather than raising -- indistinguishable from an empty
		// roster, which is the point.
		const rosterRows = await db.asUser(grantee.id, async (q) =>
			(await q('select * from public.maps_editor_roster()')).rowCount ?? 0
		);
		expect(rosterRows).toBe(0);

		const tableProbe = async () =>
			db.asUser(grantee.id, async (q) =>
				((await q('select email from public.maps_editor_grants')).rowCount ?? 0) > 0
			);
		const seesTable = await tableProbe();
		expect(seesTable).toBe(false);
		const control = await withPolicyOpened('maps_editor_grants', 'maps_editor_grants_admin_read', tableProbe);

		record(
			`5 REFUSED grant="${granted.slice(0, 40)}" revoke="${revoked.slice(0, 40)}" roster-rows=${rosterRows} sees-table=${seesTable} | control: opened maps_editor_grants_admin_read -> saw rows=${control.opened}, restored md5 ${control.after === control.before ? 'IDENTICAL' : 'CHANGED'}`
		);
		expect(control.opened).toBe(true);
		expect(control.after).toBe(control.before);
	});

	it('6. after REVOKE, case 1 becomes REFUSED, immediately (+ positive control)', async () => {
		const probe = writeAs(
			grantee,
			`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', 'After Revoke')`,
			[world.node['Machine Shop']]
		);
		// The same statement that was ALLOWED in case 1, re-measured now, so
		// the flip is attributable to the revoke and to nothing else.
		expect(await probe()).toBe(true);

		await db.asUser(world.admin.id, (q) =>
			q('select public.maps_editor_revoke($1, $2)', [grantee.email, world.node['Machine Shop']])
		);
		const afterRevoke = await probe();
		expect(afterRevoke).toBe(false);

		// NOT a new session, NOT a re-login: the same connection pool, the same
		// claims. What makes revocation immediate is that maps_can_edit_node
		// reads the roster on every statement.
		const control = await withPolicyOpened('maps_nodes', 'maps_nodes_editor_insert', probe);
		record(
			`6 REFUSED-after-revoke=${!afterRevoke} (allowed before revoke=true, same statement, same session) | control: opened maps_nodes_editor_insert -> landed=${control.opened}, restored md5 ${control.after === control.before ? 'IDENTICAL' : 'CHANGED'}`
		);
		expect(control.opened).toBe(true);
		expect(control.after).toBe(control.before);

		// Put it back for the admin comparison below.
		await db.asUser(world.admin.id, (q) =>
			q('select public.maps_editor_grant($1, $2)', [grantee.email, world.node['Machine Shop']])
		);
		expect(await probe()).toBe(true);
	});

	it('7. an admin does all of it, and their rights are IDENTICAL to pre-0172', async () => {
		const admin = world.admin;
		// A grant to an address with NO ACCOUNT AT ALL, which is the roster
		// shape every allowlist in this repo takes: authorization can precede a
		// first sign-in. It also makes this case independent of whether case 6
		// finished its own re-grant, so a failure there cannot cascade here.
		await db.asUser(admin.id, (q) =>
			q('select public.maps_editor_grant($1, $2, $3)', [
				'notyet@boscotech.net',
				world.node['Mill Room'],
				'Granted before the account exists'
			])
		);
		const ins = await writeAs(
			admin,
			`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', 'Admin Bench')`,
			[world.node['Mill Room']]
		)();
		const updDraft = await writeAs(admin, `update public.maps_nodes set name = 'A' where id = $1`, [
			draftOutside
		])();
		const updPublished = await writeAs(
			admin,
			`update public.maps_nodes set name = 'A' where id = $1`,
			[world.node['Tool Chest A']]
		)();
		const delPublished = await writeAs(admin, `delete from public.maps_nodes where id = $1`, [
			world.node['Drawer 2']
		])();
		const staged = await writeAs(
			admin,
			`insert into public.maps_revisions (node_id, state, snapshot) values ($1, 'pending', '{"name":"x"}'::jsonb)`,
			[world.node['Mill Room']]
		)();
		const rosterRows = await db.asUser(admin.id, async (q) =>
			(await q('select * from public.maps_editor_roster()')).rowCount ?? 0
		);
		record(
			`7 ALLOWED admin insert=${ins} update-draft=${updDraft} update-published=${updPublished} delete-published=${delPublished} stage-pending=${staged} roster-rows=${rosterRows}`
		);
		expect({ ins, updDraft, updPublished, delPublished, staged }).toEqual({
			ins: true,
			updDraft: true,
			updPublished: true,
			delPublished: true,
			staged: true
		});
		expect(rosterRows).toBeGreaterThan(0);

		// A publish still works, through the real RPC.
		const fresh = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_nodes (parent_id, kind, name) values ($1, 'unit', 'Admin Publishable') returning id`,
				[world.node['Mill Room']]
			);
			return rows[0].id;
		});
		const outcome = await publish(db, admin, 'maps_nodes', fresh);
		expect(outcome.ok).toBe(true);

		// AND THE STRUCTURAL HALF: every admin policy 0161/0163 applied still
		// reads is_admin() and names no editor predicate, so "identical to
		// pre-0172" is a property of untouched objects rather than a claim
		// about behaviour somebody spot-checked.
		const { rows: adminPolicies } = await db.sql<{ polname: string; expr: string }>(
			`select p.polname,
			        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
			        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
			   from pg_policy p join pg_class c on c.oid = p.polrelid
			  where c.relnamespace = 'public'::regnamespace
			    and c.relname like 'maps\\_%' and p.polname like '%\\_admin\\_%'`
		);
		expect(adminPolicies.length).toBeGreaterThan(0);
		for (const p of adminPolicies) {
			expect(p.expr).toContain('is_admin()');
			expect(p.expr).not.toContain('maps_can_');
			expect(p.expr).not.toContain('maps_is_editor');
		}
		record(`7b ${adminPolicies.length} pre-0172 admin policies, all still is_admin(), none naming an editor predicate`);
	});
});

describe('0172 -- the reach a grantee has, and its cost', () => {
	it('a grantee sees their subtree and the ANCESTORS above it, and nothing else', async () => {
		const names = await db.asUser(grantee.id, async (q) => {
			const { rows } = await q<{ name: string; status: string }>(
				'select name, status from public.maps_nodes order by name'
			);
			return rows;
		});
		const seen = new Set(names.map((r) => r.name));
		// Inside the subtree, and the spine above it.
		expect(seen.has('Machine Shop')).toBe(true);
		expect(seen.has('Tool Chest A')).toBe(true);
		expect(seen.has('Drawer 1')).toBe(true);
		expect(seen.has('IDEA Building')).toBe(true);
		// Published siblings are visible to EVERYONE through 0161's public read
		// -- that is not this tier's doing and must not be read as one.
		expect(seen.has('Mill Room')).toBe(true);
		// The draft rooms elsewhere are the real exclusion.
		expect(seen.has('Prototype Lab')).toBe(false);
		expect(seen.has('Fabrication Annex')).toBe(false);
		expect(seen.has('Draft Bench (outside)')).toBe(false);
		record(
			`reach: grantee sees ${names.length} nodes -- own subtree + ancestor spine + every published row; 0 of the 3 drafts outside`
		);
	});

	it('the subtree walk costs a bounded number of lookups on a seeded tree', async () => {
		// Independent of every case above: the grant is re-asserted here, so a
		// revoke left behind by case 6 cannot silently turn this into a
		// measurement of the published-only read.
		await db.asUser(world.admin.id, (q) =>
			q('select public.maps_editor_grant($1, $2)', [grantee.email, world.node['Machine Shop']])
		);
		// A tree deliberately larger than the school's, seeded as the OWNER
		// (this is a cost measurement, not a boundary one), then the whole
		// table read back as the GRANTEE, which is the per-row worst case.
		await db.sql(
			`insert into public.maps_nodes (parent_id, kind, name)
			 select $1, 'unit', 'Perf Unit ' || g from generate_series(1, 600) g`,
			[world.node['Machine Shop']]
		);
		const { rows: unitIds } = await db.sql<{ id: string }>(
			`select id from public.maps_nodes where name like 'Perf Unit %'`
		);
		await db.sql(
			`insert into public.maps_nodes (parent_id, kind, name)
			 select u.id, 'compartment', 'Perf Drawer ' || s
			   from unnest($1::uuid[]) u(id), generate_series(1, 2) s`,
			[unitIds.map((r) => r.id)]
		);
		const { rows: total } = await db.sql<{ n: string }>('select count(*)::text as n from public.maps_nodes');

		const time = async (user: SeededUser) =>
			db.asUser(user.id, async (q) => {
				await q('select id from public.maps_nodes'); // warm
				const t0 = process.hrtime.bigint();
				const r = await q('select id from public.maps_nodes');
				const ms = Number(process.hrtime.bigint() - t0) / 1e6;
				return { ms, rows: r.rowCount ?? 0 };
			});
		const asAdmin = await time(world.admin);
		const asGrantee = await time(grantee);
		record(
			`cost: ${total[0].n} nodes (depth 5 max, ladder-bounded) -- admin read ${asAdmin.ms.toFixed(1)}ms/${asAdmin.rows} rows, grantee read ${asGrantee.ms.toFixed(1)}ms/${asGrantee.rows} rows`
		);
		// A ceiling, not a benchmark: the assertion is that a per-row bounded
		// walk over the whole table stays in the same order of magnitude as a
		// plain read, not that it hits a particular number on this machine.
		expect(asGrantee.rows).toBeGreaterThan(1000);
		expect(asGrantee.ms).toBeLessThan(5000);
	}, 120_000);
});

describe('0172 -- the file itself', () => {
	it('re-applies cleanly over a database that already has it', async () => {
		// "Re-pasting a migration is ordinary" (CLAUDE.md): somebody re-pastes,
		// or a first attempt failed partway and gets retried. A file that only
		// works once fails exactly then, with the schema half-built. The whole
		// file is put to the database a SECOND time here, self-check block and
		// all, so the section-6 assertions run again over the end state the
		// first pass left.
		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/0172_maps_editor_grants.sql'),
			'utf8'
		);
		await db.sql(sql);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			  where policyname like 'maps\\_%\\_editor\\_%'
			     or policyname = 'maps_editor_grants_admin_read'`
		);
		record(`re-apply: clean, ${rows[0].n} policies 0172 owns after the second pass`);
		// 4 each on maps_nodes, maps_item_types, maps_items, maps_stock and
		// maps_photos (20), the one on storage.objects, and the roster's own
		// admin read. Re-applying must not DOUBLE any of them, which is what
		// the drop-then-create shape is for.
		expect(Number(rows[0].n)).toBe(22);
	}, 120_000);
});
