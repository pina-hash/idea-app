// tests/maps-rls-mutation-proof.test.ts
//
// THE NEGATIVE CONTROL FOR tests/maps-rls-boundary.test.ts, over EVERY policy
// that file claims to cover rather than over one representative policy.
//
// WHY A PERMISSIVE MUTATION AND NOT A DROP. Dropping a published-only policy
// makes an anonymous caller see NOTHING, so every "a draft is invisible"
// assertion in the boundary file still passes -- vacuously, and looking
// exactly like success. The mutation that reproduces the REAL leak is
// `ALTER POLICY ... USING (true)`, so that is what runs here. Each policy is
// opened, the boundary it guards is measured LEAKING, the original predicate
// is put back, and the boundary is measured CLOSED again.
//
// THE RESTORE IS FROM A COPY, NEVER FROM A FILE. `pg_get_expr` over
// `pg_policy` is read BEFORE the mutation and the restore is built from that
// captured text, then read back and compared to it. CLAUDE.md's mutation rule
// exists because three sessions in one week ran `git checkout --` inside a
// mutation script and silently discarded their own uncommitted work; the same
// hazard here would be re-applying the migration file, which would also repair
// a policy this suite had corrupted for a reason nobody recorded. Nothing in
// `supabase/migrations/` is read, written or re-applied by this file.
//
// THE MUTATION IS PROVEN TO HAVE APPLIED BEFORE ITS RESULT IS READ
// (verification addenda rule 6): a mutation that never landed is
// indistinguishable from one nothing catches, and it is the more likely of the
// two. Every step below asserts the catalog changed, and asserts what it
// changed to.
//
// EVERY PROBE RUNS INSIDE A TRANSACTION THAT IS ROLLED BACK. While a policy is
// open the probe genuinely succeeds -- a leaked DELETE really would delete --
// so a probe that committed would hand the next policy's probe a different
// world. The reads do not need it and do not use it.
//
// NOTHING IS REMOVED FROM THE OUTPUT (addenda rule 14). One of the 31 policies,
// `maps_search_log_public_write`, is ALREADY `with check (true)`: it grants
// rather than restricts, so there is nothing to open and no leak to observe.
// It stays in the census with that stated, rather than being filtered out where
// no later reader could see it had been considered.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QueryFn, TestDb } from './db/harness';
import { publish, seedMapsWorld, startMapsDb, type MapsWorld } from './db/maps-fixture';

let db: TestDb;
let world: MapsWorld;
/** A photo on a published parent and one on a draft parent. */
let photoOnPublished = '';
let photoOnDraft = '';
/** A published item type placed nowhere, so a DELETE probe on it is not refused by a foreign key. */
let disposableType = '';
/** Every line of the proof, for the bundle report. */
const log: string[] = [];

beforeAll(async () => {
	db = await startMapsDb();
	world = await seedMapsWorld(db);
	const mk = async (nodeName: string, key: string) =>
		db.asUser(world.admin.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.maps_photos (node_id, storage_key, caption)
				 values ($1, $2, $3) returning id`,
				[world.node[nodeName], key, 'fixture']
			);
			return rows[0].id;
		});
	photoOnPublished = await mk('Mill Room', 'maps/pub.jpg');
	photoOnDraft = await mk('Prototype Lab', 'maps/draft.jpg');
	disposableType = await db.asUser(world.admin.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.maps_item_types (name) values ('Disposable Type') returning id`
		);
		return rows[0].id;
	});
	// PUBLISHED, deliberately. An UPDATE whose WHERE names a column also has the
	// SELECT policies applied to it, so a DRAFT subject would be invisible to the
	// non-admin and the update probe would report zero rows no matter what the
	// UPDATE policy said -- a probe measuring the read policy while claiming to
	// measure the write one.
	await publish(db, world.admin, 'maps_item_types', disposableType);
	// A pending revision and a log row, so the revisions and log probes have
	// something to leak. An exclusion over an empty table is not a control.
	await db.asUser(world.admin.id, (q) =>
		q(
			`insert into public.maps_revisions (node_id, state, snapshot)
			 values ($1, 'pending', '{"name":"staged"}'::jsonb)`,
			[world.node['Mill Room']]
		)
	);
	await db.asAnon((q) =>
		q(`insert into public.maps_search_log (query, result_count) values ('a miss', 0)`)
	);
}, 180_000);

afterAll(async () => {
	if (log.length) writeFileSync(join(tmpdir(), 'maps-mutation-proof.txt'), log.join('\n'));
	await db?.stop();
});

interface PolicyExpr {
	qual: string | null;
	withCheck: string | null;
}

async function policyExpr(table: string, policy: string): Promise<PolicyExpr> {
	const { rows } = await db.sql<{ qual: string | null; wc: string | null }>(
		`select pg_get_expr(p.polqual, p.polrelid) as qual,
		        pg_get_expr(p.polwithcheck, p.polrelid) as wc
		   from pg_policy p
		  where p.polname = $2 and p.polrelid = ('public.' || $1)::regclass`,
		[table, policy]
	);
	if (rows.length !== 1) throw new Error(`${table}.${policy}: expected one policy row, got ${rows.length}`);
	return { qual: rows[0].qual, withCheck: rows[0].wc };
}

function alterSql(table: string, policy: string, expr: PolicyExpr): string {
	let sql = `alter policy ${policy} on public.${table}`;
	if (expr.qual !== null) sql += ` using (${expr.qual})`;
	if (expr.withCheck !== null) sql += ` with check (${expr.withCheck})`;
	return sql;
}

/** The same policy with every clause it HAS replaced by `true`. */
function permissive(expr: PolicyExpr): PolicyExpr {
	return {
		qual: expr.qual === null ? null : 'true',
		withCheck: expr.withCheck === null ? null : 'true'
	};
}

/** A probe whose writes are rolled back, so a leak cannot outlive its measurement. */
async function inRolledBackTx(actor: Actor, fn: (q: QueryFn) => Promise<boolean>): Promise<boolean> {
	return as(actor, async (q) => {
		await q('begin');
		try {
			return await fn(q);
		} finally {
			await q('rollback').catch(() => {});
		}
	});
}

/** True when the statement LANDED -- which, for a write probe, is the leak. */
async function landed(q: QueryFn, sql: string, params: unknown[] = []): Promise<boolean> {
	try {
		const r = await q(sql, params);
		return (r.rowCount ?? 0) > 0;
	} catch {
		return false;
	}
}

/**
 * EVERY PROBE IS PARAMETRISED BY ACTOR, so the SAME statement can be run as the
 * admin as a control. That is not decoration: two delete probes in the first
 * draft of this file returned `false` under a fully-opened policy, because
 * `on delete restrict` from a child row refused them and `landed()` swallowed
 * the error -- a probe that could not succeed under any policy, standing behind
 * a boundary assertion and proving nothing (addenda rule 6, and rule 29 for the
 * fix). The control runs before every mutation and must be TRUE, so a `false`
 * from the non-privileged actor can only mean "the policy refused it".
 */
type Actor = { kind: 'anon' } | { kind: 'user'; id: string };
const ANON: Actor = { kind: 'anon' };
const nonAdmin = (): Actor => ({ kind: 'user', id: world.nonAdmin.id });
const admin = (): Actor => ({ kind: 'user', id: world.admin.id });

function as<T>(actor: Actor, fn: (q: QueryFn) => Promise<T>): Promise<T> {
	return actor.kind === 'anon' ? db.asAnon(fn) : db.asUser(actor.id, fn);
}

const sees = (table: string, id: string) => (actor: Actor) => async (): Promise<boolean> =>
	as(actor, async (q) =>
		((await q(`select id from public.${table} where id = $1`, [id])).rowCount ?? 0) > 0
	);

const seesAny = (table: string) => (actor: Actor) => async (): Promise<boolean> =>
	as(actor, async (q) => ((await q(`select id from public.${table} limit 1`)).rowCount ?? 0) > 0);

const updates = (table: string, id: string) => (actor: Actor) => async (): Promise<boolean> =>
	inRolledBackTx(actor, (q) =>
		landed(q, `update public.${table} set updated_at = now() where id = $1`, [id])
	);

const deletes = (table: string, id: string) => (actor: Actor) => async (): Promise<boolean> =>
	inRolledBackTx(actor, (q) => landed(q, `delete from public.${table} where id = $1`, [id]));

const inserts = (sql: string, params: unknown[] = []) => (actor: Actor) => async (): Promise<boolean> =>
	inRolledBackTx(actor, (q) => landed(q, sql, params));

/**
 * WHY THE REVISION WRITE POLICIES NEED A FOUR-STATE PROOF, and a correction
 * this file made to itself: the first draft asserted this of the UPDATE and
 * claimed the DELETE was an asymmetry that leaked without it. Measured, that
 * was wrong -- the DELETE only appeared to leak because the UPDATE entry ahead
 * of it was failing and the loop never reached it. Both sit behind the read
 * policy, and the claim is now the measurement rather than the inference.
 */
const REVISION_SECOND_LAYER =
	'maps_revisions has NO public-read policy at all -- unlike the four content tables, whose ' +
	'published rows anyone may read -- so a non-admin can never see a revision row by any path. ' +
	'PostgreSQL applies the SELECT policies to an UPDATE or DELETE whose WHERE names a column, so ' +
	'opening the write policy alone changes nothing: the rows are not there to be written. That is ' +
	'the second layer working, not the probe being broken, and the four states below measure the ' +
	'difference. The INSERT policy needs none of this, because an INSERT has no WHERE and no rows ' +
	'to read, which is why it leaks on its own.';

interface CensusEntry {
	table: string;
	policy: string;
	/** What this policy guards, in words, for the report. */
	guards: string;
	/** True means the boundary is OPEN. Must be false with the policy as shipped. */
	probe: () => Promise<boolean>;
	/**
	 * The SAME operation as an ADMIN. Must be true before any mutation runs:
	 * it is what proves the probe statement can succeed at all, so a `false`
	 * from `probe` means the policy refused it rather than that a foreign key,
	 * a constraint or a typo did.
	 */
	control: () => Promise<boolean>;
	/** Set where the policy cannot be opened because it is already permissive. */
	alreadyPermissive?: string;
	/**
	 * A SECOND policy that also has to be opened before this one's leak is
	 * observable, plus why. Where it is set the proof runs four states rather
	 * than two, so the redundancy is measured rather than assumed -- CLAUDE.md:
	 * "Defense in depth means a mutation test can stay green while one layer is
	 * opened. Do not remove a redundant check because a test did not notice:
	 * verify by opening BOTH and confirming only that reddens the denial
	 * assertions."
	 */
	alsoOpen?: { policy: string; why: string };
}

function census(): CensusEntry[] {
	const draft = {
		maps_nodes: world.node['Prototype Lab'],
		maps_item_types: world.type['Prototype Widget'],
		maps_items: world.item['Unreleased Gadget'],
		maps_stock: world.stock['Hex Key Set@Bench Cabinet']
	} as const;
	// THE UPDATE AND DELETE SUBJECTS ARE LEAVES ON PURPOSE. `on delete restrict`
	// from a child node, item or stock row refuses a delete before any policy is
	// consulted, so a delete probe aimed at a room could never leak and would be
	// a dead probe wearing a green tick. `Drawer 2` has no children and holds
	// nothing; `disposableType` is placed nowhere.
	const writeSubject = {
		maps_nodes: () => world.node['Drawer 2'],
		maps_item_types: () => disposableType,
		maps_items: () => world.item['Bridgeport Mill'],
		maps_stock: () => world.stock['Digital Micrometer@Bench Cabinet']
	} as const;
	const insertSql: Record<string, () => [string, unknown[]]> = {
		maps_nodes: () => [
			`insert into public.maps_nodes (parent_id, kind, name) values (null, 'site', 'Leaked Site')`,
			[]
		],
		maps_item_types: () => [`insert into public.maps_item_types (name) values ('Leaked Type')`, []],
		maps_items: () => [
			`insert into public.maps_items (node_id, name) values ($1, 'Leaked Item')`,
			[world.node['Mill Room']]
		],
		maps_stock: () => [
			`insert into public.maps_stock (item_type_id, node_id, qty) values ($1, $2, 9)`,
			[world.type['Digital Micrometer'], world.node['Machine Shop']]
		]
	};

	const out: CensusEntry[] = [];

	for (const table of ['maps_nodes', 'maps_item_types', 'maps_items', 'maps_stock'] as const) {
		const seeDraft = sees(table, draft[table]);
		out.push({
			table,
			policy: `${table}_public_read`,
			guards: `an ANONYMOUS reader must not see a DRAFT ${table} row`,
			probe: seeDraft(ANON),
			control: seeDraft(admin())
		});
		out.push({
			table,
			policy: `${table}_admin_read`,
			guards: `a signed-in NON-ADMIN must not see a DRAFT ${table} row`,
			probe: seeDraft(nonAdmin()),
			control: seeDraft(admin())
		});
		const [sql, params] = insertSql[table]();
		const ins = inserts(sql, params);
		out.push({
			table,
			policy: `${table}_admin_insert`,
			guards: `a signed-in NON-ADMIN must not INSERT into ${table}`,
			probe: ins(nonAdmin()),
			control: ins(admin())
		});
		const upd = updates(table, writeSubject[table]());
		out.push({
			table,
			policy: `${table}_admin_update`,
			guards: `a signed-in NON-ADMIN must not UPDATE a ${table} row`,
			probe: upd(nonAdmin()),
			control: upd(admin())
		});
		const del = deletes(table, writeSubject[table]());
		out.push({
			table,
			policy: `${table}_admin_delete`,
			guards: `a signed-in NON-ADMIN must not DELETE a ${table} row`,
			probe: del(nonAdmin()),
			control: del(admin())
		});
	}

	const seePhotoOnDraft = sees('maps_photos', photoOnDraft);
	out.push({
		table: 'maps_photos',
		policy: 'maps_photos_public_read',
		guards: 'an ANONYMOUS reader must not see a photo whose parent object is a DRAFT',
		probe: seePhotoOnDraft(ANON),
		control: seePhotoOnDraft(admin())
	});
	out.push({
		table: 'maps_photos',
		policy: 'maps_photos_admin_read',
		guards: 'a signed-in NON-ADMIN must not see a photo on a DRAFT parent',
		probe: seePhotoOnDraft(nonAdmin()),
		control: seePhotoOnDraft(admin())
	});
	const insPhoto = inserts(
		`insert into public.maps_photos (node_id, storage_key) values ($1, 'maps/leaked.jpg')`,
		[world.node['Mill Room']]
	);
	out.push({
		table: 'maps_photos',
		policy: 'maps_photos_admin_insert',
		guards: 'a signed-in NON-ADMIN must not attach a photo',
		probe: insPhoto(nonAdmin()),
		control: insPhoto(admin())
	});
	const updPhoto = updates('maps_photos', photoOnPublished);
	out.push({
		table: 'maps_photos',
		policy: 'maps_photos_admin_update',
		guards: 'a signed-in NON-ADMIN must not edit a photo row',
		probe: updPhoto(nonAdmin()),
		control: updPhoto(admin())
	});
	const delPhoto = deletes('maps_photos', photoOnPublished);
	out.push({
		table: 'maps_photos',
		policy: 'maps_photos_admin_delete',
		guards: 'a signed-in NON-ADMIN must not remove a photo row',
		probe: delPhoto(nonAdmin()),
		control: delPhoto(admin())
	});

	const seeRevisions = seesAny('maps_revisions');
	out.push({
		table: 'maps_revisions',
		policy: 'maps_revisions_admin_read',
		guards: 'a signed-in NON-ADMIN must not read the revision history',
		probe: seeRevisions(nonAdmin()),
		control: seeRevisions(admin())
	});
	const insRev = inserts(
		`insert into public.maps_revisions (node_id, state, snapshot)
		 values ($1, 'pending', '{"name":"leaked"}'::jsonb)`,
		[world.node['Machine Shop']]
	);
	out.push({
		table: 'maps_revisions',
		policy: 'maps_revisions_admin_insert',
		guards: 'a signed-in NON-ADMIN must not stage a pending revision',
		probe: insRev(nonAdmin()),
		control: insRev(admin())
	});
	// SCOPED TO THE PENDING ROW. The policy admits `state = 'pending'` only, so
	// an admin control over the whole table would be refused by the retained
	// rows and would look exactly like a policy that works.
	const updRev = (actor: Actor) => () =>
		inRolledBackTx(actor, (q) =>
			landed(q, `update public.maps_revisions set snapshot = '{"name":"leaked"}'::jsonb
			           where state = 'pending'`)
		);
	out.push({
		table: 'maps_revisions',
		policy: 'maps_revisions_admin_update',
		guards: 'a signed-in NON-ADMIN must not edit a staged revision',
		probe: updRev(nonAdmin()),
		control: updRev(admin()),
		alsoOpen: { policy: 'maps_revisions_admin_read', why: REVISION_SECOND_LAYER }
	});
	const delRev = (actor: Actor) => () =>
		inRolledBackTx(actor, (q) =>
			landed(q, `delete from public.maps_revisions where state = 'pending'`)
		);
	out.push({
		table: 'maps_revisions',
		policy: 'maps_revisions_admin_delete',
		guards: 'a signed-in NON-ADMIN must not discard a staged revision',
		probe: delRev(nonAdmin()),
		control: delRev(admin()),
		alsoOpen: { policy: 'maps_revisions_admin_read', why: REVISION_SECOND_LAYER }
	});

	const seeLog = seesAny('maps_search_log');
	out.push({
		table: 'maps_search_log',
		policy: 'maps_search_log_admin_read',
		guards: 'a signed-in NON-ADMIN must not read what people searched for',
		probe: seeLog(nonAdmin()),
		control: seeLog(admin())
	});
	out.push({
		table: 'maps_search_log',
		policy: 'maps_search_log_public_write',
		guards: 'the deliberate anonymous INSERT of spec 5.4',
		probe: async () => true,
		control: async () => true,
		alreadyPermissive:
			'`with check (true)` as shipped. This policy GRANTS the anonymous write rather than ' +
			'restricting anything, so there is no predicate to open and no leak a mutation could ' +
			'produce. What bounds it is the GRANT (insert only, no select/update/delete for anon), ' +
			'which tests/maps-rls-boundary.test.ts asserts directly.'
	});

	return out;
}

describe('IDEA Maps: the RLS mutation proof', () => {
	it('the census covers every policy on every maps table, with none left over', async () => {
		// THE DENOMINATOR (addenda rules 11 and 13). A policy a later migration
		// adds is an UNCOVERED policy, and this is what makes that loud instead
		// of silent. Identities, not a count (rule 17).
		const { rows } = await db.sql<{ tbl: string; pol: string }>(
			`select c.relname as tbl, p.polname as pol
			   from pg_policy p join pg_class c on c.oid = p.polrelid
			  where c.relnamespace = 'public'::regnamespace and c.relname like 'maps%'
			  order by c.relname, p.polname`
		);
		const inCatalog = rows.map((r) => `${r.tbl}.${r.pol}`).sort();
		const covered = census()
			.map((e) => `${e.table}.${e.policy}`)
			.sort();
		expect(covered, 'every policy in the catalog has a census entry, and vice versa').toEqual(
			inCatalog
		);
		expect(inCatalog.length).toBe(31);
		log.push(`CENSUS: ${inCatalog.length} policies on maps tables, ${covered.length} covered.`);
	});

	for (const entry of [
		'maps_nodes',
		'maps_item_types',
		'maps_items',
		'maps_stock',
		'maps_photos',
		'maps_revisions',
		'maps_search_log'
	]) {
		it(`${entry}: every policy opens, leaks, and is restored`, async () => {
			const mine = census().filter((e) => e.table === entry);
			expect(mine.length, `${entry} must have census entries`).toBeGreaterThan(0);

			for (const e of mine) {
				const original = await policyExpr(e.table, e.policy);

				if (e.alreadyPermissive) {
					log.push(
						`\n${e.table}.${e.policy}\n  guards : ${e.guards}\n  NOT MUTATED: ${e.alreadyPermissive}`
					);
					expect(original.withCheck ?? original.qual).toBe('true');
					continue;
				}

				// 0. THE PROBE CAN SUCCEED AT ALL. Without this a probe blocked by a
				//    foreign key, a constraint or a typo reports "refused" under every
				//    policy, including a deleted one.
				const control = await e.control();
				expect(
					control,
					`${e.policy}: the admin control failed, so this probe cannot distinguish a ` +
						`refusal from an impossibility and proves nothing about the policy`
				).toBe(true);

				// 1. BEFORE: the boundary is closed as shipped.
				const before = await e.probe();
				expect(before, `${e.policy}: as shipped, ${e.guards}`).toBe(false);

				// 2. The predicate we are about to replace really is a predicate.
				expect(
					original.qual ?? original.withCheck,
					`${e.policy}: nothing captured to restore from`
				).toBeTruthy();
				expect(
					[original.qual, original.withCheck].some((x) => x !== null && x !== 'true'),
					`${e.policy}: already permissive; opening it would be a no-op`
				).toBe(true);

				// 3. MUTATE, permissively, and PROVE IT APPLIED before reading any
				//    result off it (addenda rule 6).
				await db.sql(alterSql(e.table, e.policy, permissive(original)));
				const mutated = await policyExpr(e.table, e.policy);
				expect(mutated, `${e.policy}: the mutation did not change the catalog`).not.toEqual(
					original
				);
				expect(mutated).toEqual(permissive(original));

				// 4. AFTER: the boundary is open. This is the assertion in
				//    maps-rls-boundary.test.ts failing.
				const leakedAlone = await e.probe();
				let secondLayerNote = '';

				if (e.alsoOpen) {
					// THE FOUR-STATE PROOF. This policy sits behind another, so opening
					// it alone must NOT leak -- and then opening both must.
					expect(
						leakedAlone,
						`${e.policy}: leaked with only itself opened, but it is declared as sitting ` +
							`behind ${e.alsoOpen.policy}. One of the two claims is wrong.`
					).toBe(false);

					const secondOriginal = await policyExpr(e.table, e.alsoOpen.policy);
					await db.sql(alterSql(e.table, e.alsoOpen.policy, permissive(secondOriginal)));
					expect(await policyExpr(e.table, e.alsoOpen.policy)).toEqual(permissive(secondOriginal));

					const leakedBoth = await e.probe();
					expect(
						leakedBoth,
						`${e.policy}: opened together with ${e.alsoOpen.policy} and the boundary STILL ` +
							`held -- the probe is not measuring this policy at all`
					).toBe(true);

					// And the other direction: the second layer alone does not leak
					// either, which is what says THIS policy is load-bearing rather
					// than redundant.
					await db.sql(alterSql(e.table, e.policy, original));
					expect(await policyExpr(e.table, e.policy)).toEqual(original);
					const leakedSecondOnly = await e.probe();
					expect(
						leakedSecondOnly,
						`${e.policy}: with only ${e.alsoOpen.policy} opened the boundary leaked, so ` +
							`this policy is not carrying anything`
					).toBe(false);

					await db.sql(alterSql(e.table, e.alsoOpen.policy, secondOriginal));
					expect(await policyExpr(e.table, e.alsoOpen.policy)).toEqual(secondOriginal);
					secondLayerNote =
						`\n  SECOND LAYER: ${e.alsoOpen.policy}. ${e.alsoOpen.why}\n` +
						`  this alone : leaked=false   both opened: leaked=true   other alone: leaked=false`;
				} else {
					expect(
						leakedAlone,
						`${e.policy}: opened to (true) and the boundary still held -- the probe is not ` +
							`measuring this policy, so the boundary test it stands behind proves nothing`
					).toBe(true);
				}

				// 5. RESTORE from the captured copy, and read it back.
				await db.sql(alterSql(e.table, e.policy, original));
				const restored = await policyExpr(e.table, e.policy);
				expect(restored, `${e.policy}: restore is not identical to the capture`).toEqual(original);

				// 6. GREEN AGAIN.
				const after = await e.probe();
				expect(after, `${e.policy}: closed again after the restore`).toBe(false);

				log.push(
					`\n${e.table}.${e.policy}\n` +
						`  guards  : ${e.guards}\n` +
						`  control : admin performs the same operation = true\n` +
						`  before  : leaked=false  (predicate ${JSON.stringify(original)})\n` +
						`  mutated : ${alterSql(e.table, e.policy, permissive(original))}\n` +
						`  after   : leaked=${e.alsoOpen ? 'false (see SECOND LAYER)' : 'true'}` +
						secondLayerNote +
						`\n  restored: predicate identical to capture, leaked=false`
				);
			}
		}, 180_000);
	}
});
