// tests/db/profile-avatar-holds.test.ts
//
// TURNING OFF A PROFILE PICTURE (ledger 0392, migration 0267). The chain is
// booted SHORT of 0267, pictures are set the way a student sets one (a direct
// update of their own row, exactly as the profile menu does), and 0267 is
// applied over the top.
//
// Silent-regression guarantees, each with a planted control:
//   - only a site admin can hide, restore, list or read a hold; a teacher who is
//     not an admin and a student get the same answer as an unknown address,
//     and anon cannot call at all;
//   - hiding clears BOTH picture columns, so every surface falls to initials;
//   - while held, the student cannot put a picture back (a preset, an upload
//     or the Google photo), and can still change their other fields;
//   - a restore puts back exactly the two values that were there;
//   - a released hold is kept, never deleted.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = '0267_profile_avatar_holds.sql';
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0267')];

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;

const rpc = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

async function picture(u: SeededUser): Promise<{ avatar: string | null; avatar_url: string | null }> {
	const { rows } = await db.sql<{ avatar: string | null; avatar_url: string | null }>(
		`select avatar, avatar_url from public.profiles where id = $1`,
		[u.id]
	);
	return rows[0];
}
/** The student's own write, as the profile menu makes it. */
const selfUpdate = (u: SeededUser, set: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q(`update public.profiles set ${set} where id = $${params.length + 1}`, [...params, u.id])).rowCount);

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	// THE WORLD BEFORE 0267: Ana uploaded a picture over her Google photo; Ben
	// has the Google photo only.
	await db.sql(`update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/ana' where id = $1`, [ana.id]);
	await db.sql(`update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/ben' where id = $1`, [ben.id]);
	expect(await selfUpdate(ana, `avatar = $1`, [`upload:${ana.id}/avatar-1.png`])).toBe(1);
	await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0267 applies over real pictures', () => {
	test('re-applies cleanly', async () => {
		await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
	});

	test('control: before any hold, a student changes their own picture freely', async () => {
		expect(await selfUpdate(ben, `avatar = 'preset:gear'`)).toBe(1);
		expect((await picture(ben)).avatar).toBe('preset:gear');
		expect(await selfUpdate(ben, `avatar = null`)).toBe(1);
	});
});

describe('only an admin moderates, and a refusal names nobody', () => {
	test('a teacher who is not an admin and a student are refused like an unknown address', async () => {
		for (const u of [teacher, ben]) {
			expect(await rpc(u, `public.profile_avatar_hide($1, 'x')`, [ana.email])).toEqual({ ok: false, reason: 'not_admin' });
			expect(await rpc(u, `public.profile_avatar_restore($1)`, [ana.email])).toEqual({ ok: false, reason: 'not_admin' });
			expect(await rpc(u, `public.profile_avatar_hold_status($1)`, [ana.email])).toBeNull();
			expect(await rpc(u, `public.profile_avatar_holds()`)).toBeNull();
		}
		expect(await rpc(teacher, `public.profile_avatar_hide($1)`, ['nobody@boscotech.net'])).toEqual({ ok: false, reason: 'not_admin' });
		expect(await picture(ana)).toEqual({ avatar: `upload:${ana.id}/avatar-1.png`, avatar_url: 'https://lh3.googleusercontent.com/a/ana' });
	});

	test('anon cannot call any of them, and no client role reads the table', async () => {
		const { rows } = await db.sql<{ fn: string; anon: boolean; auth: boolean }>(`
			select p.oid::regprocedure::text fn, has_function_privilege('anon', p.oid, 'execute') anon,
			       has_function_privilege('authenticated', p.oid, 'execute') auth
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and (p.proname like 'profile_avatar_%' or p.proname in ('_profile_avatar_held', 'enforce_avatar_hold'))
			order by 1`);
		expect(rows.length).toBe(7);
		expect(rows.filter((r) => r.anon)).toEqual([]);
		expect(rows.filter((r) => r.auth).map((r) => r.fn).sort()).toEqual(
			[
				'profile_avatar_hide(text,text)',
				'profile_avatar_hold_status(text)',
				'profile_avatar_holds()',
				'profile_avatar_my_hold()',
				'profile_avatar_restore(text)'
			].sort()
		);
		const msg = await refusal(db.asUser(ben.id, (q) => q(`select * from public.profile_avatar_holds`)));
		expect(msg).toMatch(/permission denied/);
	});
});

describe('a hold', () => {
	test('an admin hides Ana: both columns clear, and an address with no account is said so', async () => {
		expect(await rpc(admin, `public.profile_avatar_hide($1, $2)`, ['nobody@boscotech.net', 'x'])).toEqual({ ok: false, reason: 'no_account' });
		expect(await rpc(admin, `public.profile_avatar_hide($1, $2)`, ['  ANA@boscotech.net ', 'Not school appropriate.'])).toEqual({
			ok: true,
			had_picture: true
		});
		expect(await picture(ana)).toEqual({ avatar: null, avatar_url: null });
		expect(await rpc(admin, `public.profile_avatar_hide($1)`, [ana.email])).toEqual({ ok: false, reason: 'already_hidden' });
		const status = await rpc<Json>(admin, `public.profile_avatar_hold_status($1)`, [ana.email]);
		expect(status).toMatchObject({ account: true, hidden: true, hidden_by: admin.email, reason: 'Not school appropriate.' });
		expect(await rpc<Json>(admin, `public.profile_avatar_hold_status($1)`, [ben.email])).toMatchObject({ account: true, hidden: false });
		const list = await rpc<Json[]>(admin, `public.profile_avatar_holds()`);
		expect(list.map((r) => r.email)).toEqual([ana.email]);
		expect(await rpc(ana, `public.profile_avatar_my_hold()`)).toMatchObject({ held: true });
		expect(await rpc(ben, `public.profile_avatar_my_hold()`)).toMatchObject({ held: false });
	});

	test('while held, Ana cannot put any picture back, and can still change her name', async () => {
		for (const set of [`avatar = 'preset:gear'`, `avatar = 'upload:${ana.id}/avatar-2.png'`, `avatar_url = 'https://evil.example/x.png'`]) {
			const msg = await refusal(selfUpdate(ana, set));
			expect(msg, set).toMatch(/turned off by a site admin/);
		}
		expect(await picture(ana)).toEqual({ avatar: null, avatar_url: null });
		expect(await selfUpdate(ana, `display_name = 'Ana R.'`)).toBe(1);
		// Control: Ben, who is not held, still can.
		expect(await selfUpdate(ben, `avatar = 'preset:gear'`)).toBe(1);
	});

	test('a restore puts back exactly what was there, unlocks, and keeps the released hold', async () => {
		expect(await rpc(admin, `public.profile_avatar_restore($1)`, [ben.email])).toEqual({ ok: false, reason: 'not_hidden' });
		expect(await rpc(admin, `public.profile_avatar_restore($1)`, [ana.email])).toEqual({ ok: true });
		expect(await picture(ana)).toEqual({ avatar: `upload:${ana.id}/avatar-1.png`, avatar_url: 'https://lh3.googleusercontent.com/a/ana' });
		expect(await rpc<Json[]>(admin, `public.profile_avatar_holds()`)).toEqual([]);
		const { rows } = await db.sql<{ n: string; released: string }>(
			`select count(*)::text n, count(released_at)::text released from public.profile_avatar_holds where user_id = $1`,
			[ana.id]
		);
		expect(rows[0]).toEqual({ n: '1', released: '1' });
		expect(await selfUpdate(ana, `avatar = 'preset:gear'`)).toBe(1);
		// A second hold is possible once the first is released.
		expect(await rpc(admin, `public.profile_avatar_hide($1)`, [ana.email])).toMatchObject({ ok: true });
		expect(await rpc(admin, `public.profile_avatar_restore($1)`, [ana.email])).toEqual({ ok: true });
		expect((await picture(ana)).avatar).toBe('preset:gear');
	});
});
