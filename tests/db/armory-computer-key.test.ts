// tests/db/armory-computer-key.test.ts
//
// MIGRATION 0310 (ledger 0441): one lab computer, one line on the website.
// The chain is every migration before the file, read off disk behind the
// fixture completion (the database production holds before the apply);
// projects, members, devices and heartbeats are written through the REAL
// deployed RPCs; a corpus of calls the deployed Windows app and website make
// is put to the DEPLOYED bodies; then the file goes on top and the same corpus
// runs again.
//
// What a wrong answer here would look like, and why each is silent:
//   - AN ARMORY 0.5.0 COMPUTER STOPS CHECKING IN. The narrow forms stop
//     resolving or answer differently, and the team reads "Last heard from"
//     for a running app with nothing on screen saying why.
//   - A BARE HEARTBEAT ERASES A KEY, so a shared computer splits back into a
//     line per person between beats.
//   - A BAD KEY IS STORED, or refuses a heartbeat it should only ignore.
//   - THE TEAM READ SHOWS SOMEBODY ELSE'S PROJECT'S COMPUTERS, or the raw key,
//     which links a computer across projects. Invisible in normal use: the
//     page simply draws fewer or more lines.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, overloads, pasteTrap } from './chain-0230';
import { migrationFile, migrationSql, treeShortOf } from './chain-0436';
import { armoryRpc, person } from './armory-v3-helpers';

/** This file's number. Renamed in one place if somebody lands a migration first. */
const N = '0310';
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL = migrationSql(N);

const REGISTER2 = 'select public.armory_register_device($1, $2) as r';
const REGISTER3 = 'select public.armory_register_device($1, $2, $3) as r';
const BEAT3 = 'select public.armory_heartbeat($1, $2, $3) as r';
const BEAT4 = 'select public.armory_heartbeat($1, $2, $3, $4) as r';
const TEAM = 'select public.armory_team_status($1) as r';

/** Two real-looking machineIds (16 hex characters, as Armory computes them). */
const LAB06 = '3fa1c0de9b7e2a41';
const LAB06_CLONE = 'b2c4e6f8a0123456';

type Outcome = { ok: true; r: unknown } | { ok: false; code: string; message: string; detail?: string };
type Device = { id: string; name: string; computer?: string | null; last_seen: string | null };
type Member = { email: string; devices: Device[] };

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cy: SeededUser;
let outsider: SeededUser;

let P: string; // Robot 2026: admin, ana, ben, cy
let Q: string; // Practice: admin, ana, outsider
let anaLab: string; // registered and beating before the file
let benLab: string;
let anaHome: string;
let teamBefore: Member[];
let corpusBefore: Outcome[];

async function attempt(u: SeededUser, sql: string, params: unknown[]): Promise<Outcome> {
	try {
		const row = await api.one<{ r: unknown }>(u, sql, params);
		return { ok: true, r: row.r };
	} catch (e) {
		const err = e as { code: string; message: string; detail?: string };
		return { ok: false, code: err.code, message: err.message, detail: err.detail };
	}
}
async function keyOf(device: string): Promise<string | null> {
	return (await db.sql<{ k: string | null }>('select computer_key as k from public.armory_devices where id = $1', [device])).rows[0].k;
}
async function seenOf(device: string): Promise<string> {
	return (await db.sql<{ s: string }>('select last_seen::text as s from public.armory_devices where id = $1', [device])).rows[0].s;
}
/** Lets the 20-second quiet window pass for one device, as a minute of real time would. */
async function age(device: string): Promise<void> {
	await db.sql(`update public.armory_devices set last_seen = now() - interval '1 minute' where id = $1`, [device]);
}
async function team(u: SeededUser, project: string): Promise<Member[]> {
	return (await api.one<{ r: Member[] }>(u, TEAM, [project])).r;
}
const devicesOf = (members: Member[]): Device[] => members.flatMap((m) => m.devices);

/** Calls the deployed app and website make that refuse or only read, so the corpus can run twice. */
function corpus(): Array<[SeededUser, string, () => unknown[]]> {
	return [
		[ana, REGISTER2, () => ['   ', randomUUID()]],
		[ana, REGISTER2, () => [null, randomUUID()]],
		[ana, BEAT3, () => [anaLab, 'x'.repeat(41), 'idle']],
		[ana, BEAT3, () => [anaLab, '0.5.0', 'two words']],
		[ana, BEAT3, () => [benLab, '0.5.0', 'idle']],
		[outsider, BEAT3, () => [randomUUID(), '0.5.0', 'idle']],
		[outsider, TEAM, () => [P]],
		[ana, TEAM, () => [randomUUID()]]
	];
}
async function runCorpus(): Promise<Outcome[]> {
	const out: Outcome[] = [];
	for (const [u, sql, args] of corpus()) out.push(await attempt(u, sql, args()));
	return out;
}

beforeAll(async () => {
	db = await startTestDb(treeShortOf(N));
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben.okafor@boscotech.net', 'Ben Okafor');
	cy = await person(db, 'cy.lee@boscotech.net', 'Cy Lee');
	outsider = await person(db, 'zed@boscotech.net', 'Zed Ziegler');

	// THROUGH THE DEPLOYED RPCs: create, add, register (two arguments), heartbeat (three).
	P = await api.project(admin, 'Robot 2026');
	Q = await api.project(admin, 'Practice');
	for (const u of [ana, ben, cy]) await api.member(admin, P, u.email, 'student');
	await api.member(admin, Q, ana.email, 'student');
	await api.member(admin, Q, outsider.email, 'student');
	anaLab = await api.device(ana, 'IDEA-06');
	benLab = await api.device(ben, 'IDEA-06');
	anaHome = await api.device(ana, 'Ana laptop');
	for (const [u, d] of [[ana, anaLab], [ben, benLab], [ana, anaHome]] as const) {
		expect(await attempt(u, BEAT3, [d, '0.5.0', 'idle'])).toEqual({ ok: true, r: '' });
	}
	const file = await api.createFile(ana, P, anaLab, 'Drive', 'Gearbox.SLDPRT');
	expect(await api.lock(ana, file, anaLab)).toBe(true);

	teamBefore = await team(admin, P);
	corpusBefore = await runCorpus();
	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe(`${N} as a file`, () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.armory_devices (owner_email, name) values ('a', 'b');").findings).toHaveLength(1);
		expect(scanFile('alter table public.armory_devices drop column computer_key;').findings).toHaveLength(1);
		expect(pasteTrap(SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL);
		expect(first?.[1]).toBe('public._armory_computer_key');
		expect(migrationFile(N)).toBe(`${N}_armory_computer_key.sql`);
		const earlier = treeShortOf(N)
			.slice(1)
			.map((f) => migrationSql(f.slice(0, 4)));
		expect(earlier.some((t) => t.includes('_armory_computer_key'))).toBe(false);
		// Positive control: the same scan finds a name an earlier file does carry.
		expect(earlier.some((t) => t.includes('armory_heartbeat'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toEqual(after);
	});
});

describe('the pairs and the grants, read off the catalog', () => {
	test('two forms each of register and heartbeat, none with a default', async () => {
		expect(await overloads(db, 'armory_register_device')).toBe(2);
		expect(await overloads(db, 'armory_heartbeat')).toBe(2);
		const { rows } = await db.sql<{ sig: string; d: number }>(
			`select p.oid::regprocedure::text as sig, p.pronargdefaults::int as d from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in ('armory_register_device', 'armory_heartbeat') order by 1`
		);
		expect(rows).toEqual([
			{ sig: 'armory_heartbeat(uuid,text,text)', d: 0 },
			{ sig: 'armory_heartbeat(uuid,text,text,text)', d: 0 },
			{ sig: 'armory_register_device(text,uuid)', d: 0 },
			{ sig: 'armory_register_device(text,uuid,text)', d: 0 }
		]);
	});

	test('authenticated calls all five, anon none; nobody calls the key rule', async () => {
		const sigs = [
			'armory_register_device(text, uuid)',
			'armory_register_device(text, uuid, text)',
			'armory_heartbeat(uuid, text, text)',
			'armory_heartbeat(uuid, text, text, text)',
			'armory_team_status(uuid)'
		];
		for (const sig of sigs) {
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(true);
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
		}
		expect(await canExecute(db, 'authenticated', '_armory_computer_key(text)')).toBe(false);
		expect(await canExecute(db, 'anon', '_armory_computer_key(text)')).toBe(false);
	});
});

describe('every deployed call answers as before', () => {
	test('the corpus is identical, case for case, and it is not all one answer', async () => {
		const after = await runCorpus();
		expect(after).toEqual(corpusBefore);
		expect(after).toHaveLength(8);
		const codes = after.filter((o) => !o.ok).map((o) => (o as { code: string }).code);
		// Two blank names (P0001), a long version and a bad state (22023), two foreign devices (P0001), two team refusals (42501).
		expect(codes.sort()).toEqual(['22023', '22023', '42501', '42501', 'P0001', 'P0001', 'P0001', 'P0001']);
		expect(after.filter((o) => !o.ok && o.message === 'device name is required')).toHaveLength(2);
		expect(after.filter((o) => !o.ok && o.message === 'device is not registered to caller')).toHaveLength(2);
	});

	test('the team read lists the same devices and only adds a null "computer" to each', async () => {
		const after = await team(admin, P);
		const strip = (ms: Member[]) => ms.map((m) => ({ ...m, devices: m.devices.map(({ computer: _c, ...d }) => d) }));
		expect(strip(after)).toEqual(teamBefore);
		const devices = devicesOf(after);
		expect(devices).toHaveLength(3);
		expect(devices.every((d) => 'computer' in d && d.computer === null)).toBe(true);
		expect(devicesOf(teamBefore).some((d) => 'computer' in d)).toBe(false);
	});
});

describe('the old arities still work', () => {
	test('a two-argument register makes a device with no key, and a replay answers the same device', async () => {
		const op = randomUUID();
		const r = await attempt(cy, REGISTER2, ['IDEA-06', op]);
		expect(r.ok).toBe(true);
		const id = (r as { r: string }).r;
		expect(await keyOf(id)).toBeNull();
		expect(await attempt(cy, REGISTER2, ['IDEA-06', op])).toEqual({ ok: true, r: id });
		// The same operation through the wide form replays too, rather than registering twice.
		expect(await attempt(cy, REGISTER3, ['IDEA-06', op, LAB06])).toEqual({ ok: true, r: id });
		expect(await keyOf(id)).toBeNull();
	});

	test('a three-argument heartbeat stamps last_seen and never erases a stored key', async () => {
		await age(anaLab);
		const before = await seenOf(anaLab);
		expect(await attempt(ana, BEAT3, [anaLab, '0.5.0', 'syncing'])).toEqual({ ok: true, r: '' });
		expect(await seenOf(anaLab)).not.toBe(before);
		expect(await keyOf(anaLab)).toBeNull();

		await age(anaLab);
		expect(await attempt(ana, BEAT4, [anaLab, '0.5.1', 'idle', LAB06])).toEqual({ ok: true, r: '' });
		expect(await keyOf(anaLab)).toBe(LAB06);
		await age(anaLab);
		expect(await attempt(ana, BEAT3, [anaLab, '0.5.0', 'idle'])).toEqual({ ok: true, r: '' });
		expect(await keyOf(anaLab)).toBe(LAB06);
	});
});

describe('the new argument', () => {
	test('a four-argument heartbeat stores the key on a device registered before the file', async () => {
		expect(await keyOf(benLab)).toBeNull();
		expect(await attempt(ben, BEAT4, [benLab, '0.5.1', 'idle', LAB06_CLONE])).toEqual({ ok: true, r: '' });
		expect(await keyOf(benLab)).toBe(LAB06_CLONE);
	});

	test('a changed key is written even inside the 20-second quiet window; a null or bad one keeps it', async () => {
		const d = (await attempt(cy, REGISTER3, ['Cy laptop', randomUUID(), 'aaaa1111bbbb2222'])) as { r: string };
		expect(await keyOf(d.r)).toBe('aaaa1111bbbb2222');
		expect(await attempt(cy, BEAT4, [d.r, '0.5.1', 'idle', 'cccc3333dddd4444'])).toEqual({ ok: true, r: '' });
		expect(await keyOf(d.r)).toBe('cccc3333dddd4444');
		for (const keep of [null, '', 'has space', 'é'.repeat(4), 'x'.repeat(65)]) {
			expect(await attempt(cy, BEAT4, [d.r, '0.5.1', 'idle', keep])).toEqual({ ok: true, r: '' });
			expect(await keyOf(d.r), String(keep)).toBe('cccc3333dddd4444');
		}
	});

	test('a bad key is stored as null and refuses nothing; the longest good one is kept', async () => {
		for (const bad of ['', '   ', 'has space', 'semi;colon', 'dot.ted', 'é', 'x'.repeat(65)]) {
			const r = await attempt(cy, REGISTER3, ['Lab PC 9', randomUUID(), bad]);
			expect(r.ok, bad).toBe(true);
			expect(await keyOf((r as { r: string }).r), bad).toBeNull();
		}
		const good = 'A-z_0'.padEnd(64, '9');
		const r = (await attempt(cy, REGISTER3, ['Lab PC 9', randomUUID(), good])) as { r: string };
		expect(await keyOf(r.r)).toBe(good);
		// The wide forms keep every 0231 and 0233 refusal.
		expect(await attempt(cy, REGISTER3, ['  ', randomUUID(), LAB06])).toMatchObject({ ok: false, code: 'P0001', message: 'device name is required' });
		expect(await attempt(cy, BEAT4, [anaLab, '0.5.1', 'idle', LAB06])).toMatchObject({ ok: false, message: 'device is not registered to caller' });
		expect(await attempt(cy, BEAT4, [r.r, 'x'.repeat(41), 'idle', LAB06])).toMatchObject({ ok: false, code: '22023' });
		// Positive control: the column itself refuses what the rule refuses.
		await expect(db.sql(`update public.armory_devices set computer_key = 'has space' where id = $1`, [r.r])).rejects.toThrow(/check/i);
	});
});

describe('who sees which computer', () => {
	test('one computer reads one token in a project, two clones read two, and the raw key is never returned', async () => {
		// Cy signs in on Ana's lab computer: the same key, his own device.
		const cyLab = (await attempt(cy, REGISTER3, ['IDEA-06', randomUUID(), LAB06])) as { r: string };
		await attempt(cy, BEAT4, [cyLab.r, '0.5.1', 'idle', LAB06]);
		const devices = devicesOf(await team(admin, P));
		const tokenOf = (id: string) => devices.find((d) => d.id === id)?.computer;
		expect(tokenOf(anaLab)).toMatch(/^[0-9a-f]{12}$/);
		expect(tokenOf(cyLab.r)).toBe(tokenOf(anaLab));
		expect(tokenOf(benLab)).toMatch(/^[0-9a-f]{12}$/);
		expect(tokenOf(benLab)).not.toBe(tokenOf(anaLab));
		expect(tokenOf(anaHome)).toBeNull();
		const text = JSON.stringify(devices);
		expect(text).not.toContain(LAB06);
		expect(text).not.toContain(LAB06_CLONE);
		// The same computer reads a different token in another project.
		const inQ = devicesOf(await team(admin, Q)).find((d) => d.id === anaLab)?.computer;
		expect(inQ).toMatch(/^[0-9a-f]{12}$/);
		expect(inQ).not.toBe(tokenOf(anaLab));
	});

	test('an outsider is refused the team read of a project they are not in, and reads their own project', async () => {
		expect(await attempt(outsider, TEAM, [P])).toMatchObject({ ok: false, code: '42501', message: 'not a project member' });
		const q = await team(outsider, Q);
		expect(q.map((m) => m.email).sort()).toEqual([admin.email, ana.email, outsider.email].sort());
		// Ana's devices in Q are the ones the read listed before the file: no project's devices widen.
		const anaInQ = q.find((m) => m.email === ana.email)!.devices.map((d) => d.id).sort();
		expect(anaInQ).toEqual([anaLab, anaHome].sort());
		expect(devicesOf(q).some((d) => d.id === benLab)).toBe(false);
	});

	test('the device rows stay own-row: a student reads only their own keys', async () => {
		const own = await api.rows<{ id: string; computer_key: string | null }>(ben, 'select id, computer_key from public.armory_devices');
		expect(own.map((r) => r.id)).toEqual([benLab]);
		expect(own[0].computer_key).toBe(LAB06_CLONE);
		const anaRows = await api.rows<{ id: string }>(ana, 'select id from public.armory_devices order by id');
		expect(anaRows.map((r) => r.id).sort()).toEqual([anaLab, anaHome].sort());
	});
});
