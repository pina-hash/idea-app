// tests/db/armory-app-feedback-v2.test.ts
//
// MIGRATION 0235: the Armory app's Send feedback gains what the website's form
// has (praise, What did you try?, an area, a PNG screenshot of the app window)
// and a read of the caller's own notes (ledger 0375). The chain is every
// migration through 0234, then notes written through the DEPLOYED five-argument
// function, then 0235 on top.
//
// What a wrong answer here would look like, and why each is silent:
//   - A 0.3.x APP STOPS SENDING. The five-argument form becomes a wrapper; a
//     changed refusal text, SQLSTATE or order is an app reading the wrong
//     reason. A corpus is put to the deployed body and again after 0235, and
//     compared case for case.
//   - TWO OVERLOADS POSTGREST CANNOT TELL APART. The wide form must have no
//     defaults, or a five-key call binds to both.
//   - A NOTE NAMES SOMEBODY ELSE'S PICTURE. The screenshot key's folder must be
//     the caller's own auth uid, and the object must be in the bucket.
//   - "YOUR FEEDBACK" SHOWS SOMEBODY ELSE'S NOTES, the reviewer's address, or
//     the word spam. It takes no identity parameter.

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
const one = (prefix: string): string => {
	const f = readdirSync(MIGRATIONS_DIR).filter((x) => x.startsWith(prefix));
	if (f.length !== 1) throw new Error(`expected exactly one ${prefix} migration, found ${f.length}`);
	return f[0];
};
const FILE_0234 = one('0234_');
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL_0235 = readFileSync(join(MIGRATIONS_DIR, one('0235_')), 'utf8');

const NARROW = 'select public.armory_submit_app_feedback($1, $2, $3, $4, $5::jsonb) as id';
const WIDE = 'select public.armory_submit_app_feedback($1, $2, $3, $4, $5::jsonb, $6, $7, $8) as id';
const MINE = 'select public.armory_my_app_feedback($1) as r';

type Outcome = { ok: true } | { ok: false; code: string; message: string; detail: unknown };

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;
let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let corpusBefore: Outcome[];

/** Calls the five-argument form a 0.3.x app sends, every interesting shape, in order. */
const CORPUS: Array<[string, string, string, string | null, unknown]> = [
	['bug', 'Sync stops', '0.3.1', 'LAB-PC-07', { view: 'files' }],
	['  IDEA ', 'Dark mode', '0.3.1', null, null],
	['praise', 'Love it', '0.3.1', null, null],
	['complaint', 'x', '0.3.1', null, null],
	['other', '   ', '0.3.1', null, null],
	['other', 'y'.repeat(8001), '0.3.1', null, null],
	['other', 'z', '', null, null],
	['other', 'z', 'v'.repeat(65), null, null],
	['other', 'z', '0.3.1', null, [1, 2]],
	['other', 'z', '0.3.1', 'D'.repeat(200), { pad: 'q'.repeat(140000) }]
];

async function attempt(u: SeededUser, sql: string, params: unknown[]): Promise<Outcome> {
	try {
		await api.one(u, sql, params);
		return { ok: true };
	} catch (e) {
		const err = e as { code: string; message: string; detail?: string };
		return { ok: false, code: err.code, message: err.message, detail: err.detail ? JSON.parse(err.detail) : null };
	}
}
async function runCorpus(u: SeededUser): Promise<Outcome[]> {
	const out: Outcome[] = [];
	for (const [k, b, v, d, c] of CORPUS) out.push(await attempt(u, NARROW, [k, b, v, d, c === null ? null : JSON.stringify(c)]));
	return out;
}
/** Puts an object in the bucket the way Storage would after an upload. */
async function upload(owner: SeededUser, name = `${owner.id}/${randomUUID()}.png`): Promise<string> {
	await db.sql(`insert into storage.objects (bucket_id, name, owner) values ('armory-feedback-shots', $1, $2)`, [name, owner.id]);
	return name;
}
async function rowOf(id: string): Promise<Record<string, unknown>> {
	return (await db.sql('select * from public.armory_app_feedback where id = $1', [id])).rows[0];
}

beforeAll(async () => {
	db = await startTestDb([...WITH_0233, FILE_0234]);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	await makeAdmin(db, 'tech@boscotech.edu');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben@boscotech.net', 'Ben Ortiz');

	// AGAINST THE DEPLOYED 0233 BODY.
	corpusBefore = await runCorpus(ben);
	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL_0235);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('0235 as a file', () => {
	test('the apply scan and the paste trap pass; the planted controls do not', () => {
		const scan = scanFile(SQL_0235);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.armory_app_feedback (email) values ('x');").findings).toHaveLength(1);
		expect(pasteTrap(SQL_0235)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL_0235);
		expect(first?.[1]).toBe('public.armory_my_app_feedback');
		const earlier = readdirSync(MIGRATIONS_DIR).filter((f) => f < '0235').map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
		expect(earlier.some((t) => t.includes('armory_my_app_feedback'))).toBe(false);
		// Positive control: the same scan finds a name an earlier file does carry.
		expect(earlier.some((t) => t.includes('armory_submit_app_feedback'))).toBe(true);
	});

	test('a second paste changes no catalog object', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL_0235);
		expect(await catalogFingerprint(db)).toEqual(after);
	});
});

describe('the grants and the overloads', () => {
	test('two submit overloads, the wide one with no defaults; anon calls none of the four', async () => {
		expect(await overloads(db, 'armory_submit_app_feedback')).toBe(2);
		const { rows } = await db.sql<{ sig: string; d: number }>(
			`select p.oid::regprocedure::text as sig, p.pronargdefaults as d from pg_proc p
			 where p.proname = 'armory_submit_app_feedback' order by p.pronargs`
		);
		expect(rows.map((r) => r.d)).toEqual([0, 0]);
		for (const sig of [
			'armory_submit_app_feedback(text, text, text, text, jsonb, text, text, text)',
			'armory_submit_app_feedback(text, text, text, text, jsonb)',
			'armory_my_app_feedback(integer)',
			'armory_app_feedback_admin_list(integer)'
		]) {
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(true);
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
		}
	});

	test('the bucket is private, 2 MiB, PNG only, with an own-folder insert and an admin read', async () => {
		const { rows } = await db.sql(`select public, file_size_limit::int as lim, allowed_mime_types from storage.buckets where id = 'armory-feedback-shots'`);
		expect(rows[0]).toEqual({ public: false, lim: 2097152, allowed_mime_types: ['image/png'] });
		const pol = await db.sql<{ policyname: string; cmd: string; roles: string[] }>(
			`select policyname, cmd, roles::text[] as roles from pg_policies where schemaname = 'storage' and policyname like 'armory feedback shots%' order by 1`
		);
		expect(pol.rows.map((p) => [p.policyname, p.cmd, p.roles])).toEqual([
			['armory feedback shots admin read', 'SELECT', ['authenticated']],
			['armory feedback shots insert own folder', 'INSERT', ['authenticated']]
		]);
	});
});

// ===========================================================================
describe('a 0.3.x app reads the same answers', () => {
	test('the five-argument corpus answers case for case as it did before 0235', async () => {
		const after = await runCorpus(ben);
		expect(after).toHaveLength(CORPUS.length);
		expect(after).toEqual(corpusBefore);
		// Positive controls: the corpus holds both answers, and praise is still refused here.
		expect(after.filter((o) => o.ok).length).toBe(2);
		expect(after[2]).toMatchObject({ ok: false, code: '22023', message: 'The kind of note is bug, idea or other.' });
	});
});

describe('the wide form', () => {
	test('praise, what was tried, an area and a screenshot land on the row', async () => {
		const shot = await upload(ana);
		const { id } = await api.one<{ id: string }>(ana, WIDE, [' Praise ', 'The new tree is great', '0.3.2', 'LAB-PC-07', '{}', '  Opened the Files view  ', ' Files ', shot]);
		expect(await rowOf(id)).toMatchObject({
			email: ana.email,
			kind: 'praise',
			tried: 'Opened the Files view',
			area: 'Files',
			screenshot_path: shot,
			device_name: 'LAB-PC-07'
		});
		// Blank new fields are stored as nothing.
		const bare = await api.one<{ id: string }>(ana, WIDE, ['bug', 'b', '0.3.2', null, null, '   ', '', null]);
		expect(await rowOf(bare.id)).toMatchObject({ tried: null, area: null, screenshot_path: null });
	});

	test('each new limit refuses 22023 with its reason and field', async () => {
		const cases: Array<[unknown[], Record<string, unknown>]> = [
			[['complaint', 'b', '0.3.2', null, null, null, null, null], { reason: 'kind', field: 'kind' }],
			[['bug', 'b', '0.3.2', null, null, 't'.repeat(1001), null, null], { reason: 'too_long', field: 'tried', limit: 1000, size: 1001 }],
			[['bug', 'b', '0.3.2', null, null, null, 'a'.repeat(121), null], { reason: 'too_long', field: 'area', limit: 120, size: 121 }]
		];
		for (const [params, detail] of cases) {
			const o = await attempt(ana, WIDE, params);
			expect(o).toMatchObject({ ok: false, code: '22023', detail });
		}
		expect((await attempt(ana, WIDE, ['complaint', 'b', '0.3.2', null, null, null, null, null]) as { message: string }).message).toBe(
			'The kind of note is bug, idea, praise or other.'
		);
	});

	test("a screenshot must be the caller's own, uploaded, PNG, and on one note only", async () => {
		const bens = await upload(ben);
		const missing = `${ana.id}/${randomUUID()}.png`;
		const jpeg = `${ana.id}/${randomUUID()}.jpg`;
		const shouty = `${ana.id.toUpperCase()}/${randomUUID()}.png`;
		for (const [path, reason] of [
			[bens, 'bad_path'],
			[jpeg, 'bad_path'],
			[shouty, 'bad_path'],
			['../etc/passwd', 'bad_path'],
			[missing, 'not_found']
		]) {
			const o = await attempt(ana, WIDE, ['bug', 'b', '0.3.2', null, null, null, null, path]);
			expect(o, path).toMatchObject({ ok: false, code: '22023', detail: { reason, field: 'screenshot' } });
		}
		// An object in ANOTHER bucket under the right name is not this bucket's.
		await db.sql(`insert into storage.objects (bucket_id, name, owner) values ('feedback-media', $1, $2)`, [missing, ana.id]);
		expect(await attempt(ana, WIDE, ['bug', 'b', '0.3.2', null, null, null, null, missing])).toMatchObject({ detail: { reason: 'not_found' } });
		// Used once; the second note is refused.
		const shot = await upload(ana);
		expect(await attempt(ana, WIDE, ['bug', 'b', '0.3.2', null, null, null, null, shot])).toEqual({ ok: true });
		expect(await attempt(ana, WIDE, ['bug', 'c', '0.3.2', null, null, null, null, shot])).toMatchObject({ detail: { reason: 'in_use' } });
		// Ben may attach his own.
		expect(await attempt(ben, WIDE, ['bug', 'b', '0.3.2', null, null, null, null, bens])).toEqual({ ok: true });
	});

	test('both forms share the one hourly limit of 20', async () => {
		const kai = await person(db, 'kai@boscotech.net', 'Kai');
		for (let i = 0; i < 10; i++) await api.one(kai, NARROW, ['idea', `n${i}`, '0.3.1', null, null]);
		for (let i = 0; i < 10; i++) await api.one(kai, WIDE, ['idea', `w${i}`, '0.3.2', null, null, null, null, null]);
		for (const [sql, params] of [
			[NARROW, ['idea', 'x', '0.3.1', null, null]],
			[WIDE, ['idea', 'x', '0.3.2', null, null, null, null, null]]
		] as Array<[string, unknown[]]>) {
			const o = await attempt(kai, sql, params);
			expect(o).toMatchObject({ ok: false, code: 'PT429', detail: { reason: 'rate_limited', limit: 20, window_seconds: 3600 } });
		}
	});
});

// ===========================================================================
describe('your feedback', () => {
	test("the caller's own notes, newest first, with status; never another person's, the reviewer or the context", async () => {
		const lena = await person(db, 'lena@boscotech.net', 'Lena');
		const ids: string[] = [];
		for (const body of ['first', 'second', 'third']) {
			ids.push((await api.one<{ id: string }>(lena, WIDE, ['idea', body, '0.3.2', 'LAB-PC-07', '{"secret":"x"}', null, 'Team', null])).id);
			await db.sql(`update public.armory_app_feedback set created_at = created_at - interval '1 second' * $2 where id = $1`, [ids.at(-1), 10 - ids.length]);
		}
		await api.one(admin, `select public.armory_app_feedback_set_status($1, 'resolved')`, [ids[0]]);
		await api.one(admin, `select public.armory_app_feedback_set_status($1, 'spam')`, [ids[1]]);

		const mine = (await api.one<{ r: Array<Record<string, unknown>> }>(lena, MINE, [null])).r;
		expect(mine.map((m) => m.body)).toEqual(['third', 'second', 'first']);
		expect(mine.map((m) => m.status)).toEqual(['new', 'closed', 'resolved']);
		expect(mine[2].reviewed_at).not.toBeNull();
		expect(mine[0]).toMatchObject({ kind: 'idea', area: 'Team', has_screenshot: false, app_version: '0.3.2', device_name: 'LAB-PC-07' });
		for (const m of mine) {
			expect(Object.keys(m).sort()).toEqual(
				['app_version', 'area', 'body', 'created_at', 'device_name', 'has_screenshot', 'id', 'kind', 'reviewed_at', 'status', 'tried'].sort()
			);
		}
		expect(JSON.stringify(mine)).not.toContain('secret');
		expect(JSON.stringify(mine)).not.toContain('apina@');
		expect(JSON.stringify(mine)).not.toContain('spam');
		// Another person sees none of them; the positive control is their own.
		const bens = (await api.one<{ r: Array<{ id: string }> }>(ben, MINE, [200])).r;
		expect(bens.some((b) => ids.includes(b.id))).toBe(false);
		expect(bens.length).toBeGreaterThan(0);
	});

	test('the limit is clamped from 1 to 200, and with no session it is refused', async () => {
		expect((await api.one<{ r: unknown[] }>(ana, MINE, [1])).r).toHaveLength(1);
		expect((await api.one<{ r: unknown[] }>(ana, MINE, [-5])).r).toHaveLength(1);
		expect((await api.one<{ r: unknown[] }>(ana, MINE, [100000])).r.length).toBeGreaterThan(1);
		await expect(db.sql(`set role anon; select public.armory_my_app_feedback(5)`)).rejects.toThrow(/permission denied/);
		await db.sql('reset role');
	});
});

describe('the console', () => {
	test("the admin list carries what was tried, the area and the screenshot key; a student still can't read it", async () => {
		const list = (await api.one<{ r: Array<Record<string, unknown>> }>(admin, 'select public.armory_app_feedback_admin_list(500) as r')).r;
		const praised = list.find((r) => r.kind === 'praise');
		expect(praised).toMatchObject({ tried: 'Opened the Files view', area: 'Files' });
		expect(String(praised?.screenshot_path)).toMatch(new RegExp(`^${ana.id}/`));
		expect((await attempt(ana, 'select public.armory_app_feedback_admin_list(5)', [])) as Outcome).toMatchObject({ ok: false, code: '42501' });
	});
});
