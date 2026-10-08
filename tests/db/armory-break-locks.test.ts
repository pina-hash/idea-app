// tests/db/armory-break-locks.test.ts
//
// MIGRATION 0234: armory_break_locks, Force check in for many files in one
// call (Armory 0.3.1, ledger 0374). The chain is every migration through 0233
// (the database production holds before the apply), then projects, members,
// devices, files and checkouts written through the real 0231 to 0233 RPCs,
// then 0234 on top.
//
// What a wrong answer here would look like, and why each is silent:
//   - A STUDENT FORCES A CHECK IN. The batch calls armory_break_lock per file,
//     so the role rule is that function's; a batch that checked the role once,
//     or not at all, would let a student take every file in a project back in
//     one call, and the app would simply show it working.
//   - ONE REFUSAL STOPS THE REST, or a refusal is reported as a success. The
//     app reads `results` to say how many were checked in; a wrong count reads
//     as a plausible sentence.
//   - A REPLAY BREAKS AGAIN. A retried request after a dropped connection must
//     answer the first time and write no second lock_broken row.
//   - ANON CAN CALL IT. A hosted project's default privileges hand every new
//     function to anon unless the migration revokes it by name.

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { WITH_0233, canExecute, catalogFingerprint, overloads, pasteTrap } from './chain-0233';
import { armoryRpc, makeAdmin, person } from './armory-v3-helpers';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FILES_0234 = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith('0234_'));
if (FILES_0234.length !== 1) throw new Error(`expected exactly one 0234 migration, found ${FILES_0234.length}`);
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL_0234 = readFileSync(join(MIGRATIONS_DIR, FILES_0234[0]), 'utf8');

const SIG = 'armory_break_locks(uuid[], uuid, uuid)';
const CALL = 'select public.armory_break_locks($1::uuid[], $2, $3) as r';
/** 0231's refusal text, written out here: a test whose expected value comes from the function cannot fail. */
const NOT_A_LEAD = 'only a mentor or cad_lead may break a lock';

type Result = { file_id: string; ok: boolean; broken?: boolean; code?: string; message?: string };
type Answer = { total: number; succeeded: number; refused: number; results: Result[] };

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser; // the owner, mentor of every project they create
let admin2: SeededUser; // a site admin in NO project
let mentor: SeededUser;
let lead: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;

let A: string; // the lead is a CAD lead here
let B: string; // the lead is not a member here
const dev: Record<string, string> = {};

async function batch(u: SeededUser, files: string[], device: string | null, op = randomUUID()): Promise<Answer> {
	return (await api.one<{ r: Answer }>(u, CALL, [files, device, op])).r;
}
async function held(file: string): Promise<{ holder_email: string; broken_at: string | null; broken_by: string | null } | undefined> {
	return (
		await db.sql<{ holder_email: string; broken_at: string | null; broken_by: string | null }>(
			'select holder_email, broken_at, broken_by from public.armory_locks where file_id = $1',
			[file]
		)
	).rows[0];
}
async function brokenRows(): Promise<number> {
	return (await db.sql<{ n: number }>(`select count(*)::int as n from public.armory_change_feed where kind = 'lock_broken'`)).rows[0].n;
}
async function files(p: string, folder: string, n: number): Promise<string[]> {
	const out: string[] = [];
	for (let i = 0; i < n; i++) out.push(await api.createFile(ana, p, dev.ana, folder, `${folder}-${i}.SLDPRT`));
	return out;
}

beforeAll(async () => {
	db = await startTestDb(WITH_0233);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	mentor = await person(db, 'mentor@boscotech.edu', 'Mo Mentor');
	lead = await person(db, 'lead@boscotech.net', 'Lea Diaz');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben@boscotech.net', 'Ben Ortiz');
	outsider = await person(db, 'zed@boscotech.net', 'Zed Ziegler');

	A = await api.project(admin, 'Robot 2026');
	B = await api.project(admin, 'Practice Bot');
	await api.member(admin, A, mentor.email, 'mentor');
	await api.member(admin, A, lead.email, 'cad_lead');
	for (const p of [A, B]) {
		await api.member(admin, p, ana.email, 'student');
		await api.member(admin, p, ben.email, 'student');
	}
	dev.lead = await api.device(lead, 'Lead PC');
	dev.ana = await api.device(ana, 'Lab PC 3');
	dev.ben = await api.device(ben, 'Ben laptop');
	dev.outsider = await api.device(outsider, 'Zed PC');

	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL_0234);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('0234 as a file', () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL_0234);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scan.statements).toBeGreaterThanOrEqual(4);
		expect(scanFile("insert into public.armory_locks (file_id) values ('x');").findings).toHaveLength(1);
		expect(pasteTrap(SQL_0234)).toEqual([]);
		expect(pasteTrap('select 1; -- costs a $ here')).toHaveLength(1);
	});

	test('the first object it creates is the function, for the deploy probe', () => {
		expect(/^create or replace function public\.armory_break_locks\(/m.exec(SQL_0234)?.index).toBe(SQL_0234.indexOf('create '));
	});

	test('a second paste changes no catalog object, and the first changed only what it named', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL_0234);
		expect(await catalogFingerprint(db)).toEqual(after);
	});
});

describe('the grant, read off the catalog', () => {
	test('one overload, no defaults, authenticated may call it and anon may not', async () => {
		expect(await overloads(db, 'armory_break_locks')).toBe(1);
		const { rows } = await db.sql<{ d: number; s: boolean }>(
			`select pronargdefaults as d, prosecdef as s from pg_proc where oid = 'public.armory_break_locks(uuid[], uuid, uuid)'::regprocedure`
		);
		expect(rows[0]).toEqual({ d: 0, s: true });
		expect(await canExecute(db, 'authenticated', SIG)).toBe(true);
		expect(await canExecute(db, 'anon', SIG)).toBe(false);
		// Positive control: the same probe answers true for a function anon does hold.
		const { rows: anonOk } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') limit 1`
		);
		expect(anonOk).toHaveLength(1);
		// The single-file function it calls is unchanged.
		expect(await overloads(db, 'armory_break_lock')).toBe(1);
	});
});

// ===========================================================================
describe('success', () => {
	test('a CAD lead from the website checks in three files at once, each with its own lock_broken row', async () => {
		const [f1, f2, f3] = await files(A, 'Ok', 3);
		expect(await api.lock(ana, f1, dev.ana)).toBe(true);
		expect(await api.lock(ben, f2, dev.ben)).toBe(true);
		expect(await api.lock(ana, f3, dev.ana)).toBe(true);
		const before = await brokenRows();

		const r = await batch(lead, [f3, f1, f2, f1, null as unknown as string], null);
		expect([r.total, r.succeeded, r.refused]).toEqual([3, 3, 0]);
		// Files in id order, repeats and nulls dropped.
		expect(r.results.map((x) => x.file_id)).toEqual([f1, f2, f3].sort());
		expect(r.results.every((x) => x.ok === true && x.broken === true && x.code === undefined)).toBe(true);
		for (const f of [f1, f2, f3]) expect((await held(f))?.broken_by).toBe(lead.email);
		expect((await brokenRows()) - before).toBe(3);

		// The change row is armory_break_lock's, keys and values.
		const feed = await db.sql<{ entity_id: string; payload: Record<string, unknown> }>(
			`select entity_id, payload from public.armory_change_feed where kind = 'lock_broken' and entity_id = any($1::uuid[])`,
			[[f1, f2]]
		);
		const byFile = new Map(feed.rows.map((x) => [x.entity_id, x.payload]));
		expect(byFile.get(f1)).toEqual({ by: lead.email, former_holder: ana.email, former_device_id: dev.ana });
		expect(byFile.get(f2)).toEqual({ by: lead.email, former_holder: ben.email, former_device_id: dev.ben });
	});

	test('a CAD lead may name their own computer; a computer that is not theirs refuses the whole call', async () => {
		const [f] = await files(A, 'Dev', 1);
		expect(await api.lock(ana, f, dev.ana)).toBe(true);
		const e = await api.fails(lead, CALL, [[f], dev.ben, randomUUID()]);
		expect([e.code, e.message]).toEqual(['P0001', 'device is not registered to caller']);
		expect((await held(f))?.broken_at).toBeNull();
		const r = await batch(lead, [f], dev.lead);
		expect(r.results[0]).toMatchObject({ ok: true, broken: true });
	});
});

describe('mixed results', () => {
	test('held, free, another project and an unknown id: one refusal never stops the rest', async () => {
		const [held1, free1] = await files(A, 'Mix', 2);
		const [elsewhere] = await files(B, 'Mix', 1);
		const unknown = randomUUID();
		expect(await api.lock(ana, held1, dev.ana)).toBe(true);
		expect(await api.lock(ben, elsewhere, dev.ben)).toBe(true);
		const before = await brokenRows();

		const r = await batch(lead, [held1, free1, elsewhere, unknown], null);
		expect([r.total, r.succeeded, r.refused]).toEqual([4, 2, 2]);
		const by = new Map(r.results.map((x) => [x.file_id, x]));
		expect(by.get(held1)).toEqual({ file_id: held1, ok: true, broken: true });
		// Nobody held it any more: ok, and nothing broken.
		expect(by.get(free1)).toEqual({ file_id: free1, ok: true, broken: false });
		// The lead is not in B, and an unknown file has no project: armory_break_lock's own refusal, per file.
		for (const f of [elsewhere, unknown]) expect(by.get(f)).toEqual({ file_id: f, ok: false, code: 'P0001', message: NOT_A_LEAD });
		expect((await held(elsewhere))?.broken_at).toBeNull();
		expect((await brokenRows()) - before).toBe(1);
		// The count adds up.
		expect(r.succeeded + r.refused).toBe(r.total);
	});

	test('each file answers exactly what armory_break_lock answers for it', async () => {
		const [x, y] = await files(A, 'Parity', 2);
		const [z] = await files(B, 'Parity', 1);
		expect(await api.lock(ana, x, dev.ana)).toBe(true);
		const r = await batch(lead, [x, y, z], null);
		for (const res of r.results) {
			// The single call, now, for the same caller and file.
			let single: Result;
			try {
				const ok = (await api.one<{ ok: boolean }>(lead, 'select public.armory_break_lock($1, null, $2) as ok', [res.file_id, randomUUID()])).ok;
				single = { file_id: res.file_id, ok: true, broken: ok };
			} catch (e) {
				const err = e as { code: string; message: string };
				single = { file_id: res.file_id, ok: false, code: err.code, message: err.message };
			}
			// x was broken by the batch, so the single call now finds nobody holding it.
			expect(single).toEqual(res.file_id === x ? { ...res, broken: false } : res);
		}
	});
});

describe('the count limit', () => {
	test('an empty batch, nulls only, and 501 files are refused 22023 with the count', async () => {
		for (const [ids, total] of [
			[[], 0],
			[[null], 0],
			[Array.from({ length: 501 }, () => randomUUID()), 501]
		] as Array<[unknown[], number]>) {
			const e = await api.fails(lead, CALL, [ids, null, randomUUID()]);
			expect([e.code, JSON.parse(e.detail!)]).toEqual(['22023', { reason: 'count', total, limit: 500 }]);
		}
		// Positive control: 500 distinct files is a legal batch (every one unknown, so every one refused).
		const r = await batch(lead, Array.from({ length: 500 }, () => randomUUID()), null);
		expect([r.total, r.refused]).toEqual([500, 500]);
	}, 120_000);
});

describe('replay', () => {
	test('the same operation answers the first time and breaks nothing more', async () => {
		const [f1, f2] = await files(A, 'Replay', 2);
		expect(await api.lock(ana, f1, dev.ana)).toBe(true);
		const op = randomUUID();
		const first = await batch(lead, [f1, f2], null, op);
		expect(first.results.map((x) => x.broken)).toEqual(
			[f1, f2].sort().map((f) => f === f1)
		);
		// Ana checks f1 out again; a replay must not take it from her a second time.
		expect(await api.lock(ana, f1, dev.ana)).toBe(true);
		const before = await brokenRows();
		const again = await batch(lead, [f1, f2], null, op);
		expect(again).toEqual(first);
		expect(await brokenRows()).toBe(before);
		expect((await held(f1))).toMatchObject({ holder_email: ana.email, broken_at: null });
		// The control: a fresh operation does break it.
		expect((await batch(lead, [f1], null)).results[0]).toMatchObject({ ok: true, broken: true });
	});

	test('a null operation id is refused before anything is touched', async () => {
		const [f] = await files(A, 'NoOp', 1);
		expect(await api.lock(ana, f, dev.ana)).toBe(true);
		const e = await api.fails(lead, CALL, [[f], null, null]);
		expect([e.code, e.message]).toEqual(['P0001', 'operation id is required']);
		expect((await held(f))?.broken_at).toBeNull();
	});

	test('an operation id another RPC used is refused, as for every Armory write', async () => {
		const [f] = await files(A, 'Reuse', 1);
		const op = randomUUID();
		await api.one(lead, 'select public.armory_break_lock($1, null, $2)', [f, op]);
		const e = await api.fails(lead, CALL, [[f], null, op]);
		expect(e.message).toBe('operation id was already used by another caller or RPC');
	});
});

describe('who may', () => {
	test('a student and an outsider are refused per file, with the same text and SQLSTATE, and nothing is broken', async () => {
		const [f1, f2] = await files(A, 'Student', 2);
		expect(await api.lock(ana, f1, dev.ana)).toBe(true);
		expect(await api.lock(ana, f2, dev.ana)).toBe(true);
		const before = await brokenRows();
		for (const [u, d] of [
			[ben, dev.ben],
			[ana, null],
			[outsider, dev.outsider]
		] as Array<[SeededUser, string | null]>) {
			const r = await batch(u, [f1, f2], d);
			expect([r.total, r.succeeded, r.refused]).toEqual([2, 0, 2]);
			for (const res of r.results) expect(res).toEqual({ file_id: res.file_id, ok: false, code: 'P0001', message: NOT_A_LEAD });
		}
		expect(await brokenRows()).toBe(before);
		for (const f of [f1, f2]) expect(await held(f)).toMatchObject({ holder_email: ana.email, broken_at: null });
	});

	test('a site admin in no project, with no computer, may; so may a mentor', async () => {
		const [f1, f2] = await files(B, 'Admin', 2);
		expect(await api.lock(ana, f1, dev.ana)).toBe(true);
		expect(await api.lock(ben, f2, dev.ben)).toBe(true);
		const unknown = randomUUID();
		const r = await batch(admin2, [f1, f2, unknown], null);
		expect([r.total, r.succeeded, r.refused]).toEqual([3, 3, 0]);
		// An id that names no file: armory_break_lock's answer to a site admin, nothing held.
		expect(r.results.find((x) => x.file_id === unknown)).toEqual({ file_id: unknown, ok: true, broken: false });
		for (const f of [f1, f2]) expect((await held(f))?.broken_by).toBe(admin2.email);
		const feed = await db.sql<{ payload: Record<string, unknown> }>(
			`select payload from public.armory_change_feed where kind = 'lock_broken' and entity_id = $1`,
			[f2]
		);
		expect(feed.rows[0].payload).toEqual({ by: admin2.email, former_holder: ben.email, former_device_id: dev.ben });

		const [g] = await files(A, 'Mentor', 1);
		expect(await api.lock(ben, g, dev.ben)).toBe(true);
		expect((await batch(mentor, [g], null)).results[0]).toEqual({ file_id: g, ok: true, broken: true });
	});

	test('with no session the role cannot call it at all', async () => {
		await expect(db.sql(`set role anon; select public.armory_break_locks(array[gen_random_uuid()], null, gen_random_uuid())`)).rejects.toThrow(
			/permission denied/
		);
		await db.sql('reset role');
	});
});
