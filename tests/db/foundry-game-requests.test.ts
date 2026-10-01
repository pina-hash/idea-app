// tests/db/foundry-game-requests.test.ts
//
// 0230 PART B3: THE GAME REQUEST BOARD (report b2ba6d74; a board only, a free-
// text offer, transactions off the site). What would fail SILENTLY:
//
//   1. NO ADDRESS ON THE BOARD. Every signed-in student reads it, so an email
//      in the payload is a school directory, and nothing on screen shows it if
//      the client happens not to render the key. The payload is swept for '@'
//      with the requester's own profile row (which does hold the address) as
//      the positive control that the join reached it, and the projected name
//      as the proof it read the right row.
//   2. A HIDDEN REQUEST is absent for another student and present, marked, for
//      the admin and for its author; and nobody else is even told a request
//      was hidden.
//   3. THE LIMITS: three open, two minutes between posts, each beside the post
//      that is let through.
//   4. CLOSING somebody else's request answers exactly as an invented id does.
//   5. NO COIN: none of the four bodies names one.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { PRE_0230, SQL_0230, canExecute, catalogFingerprint, overloads, refusal, tablePrivileges } from './chain-0230';

const LIST = 'select public.foundry_game_requests($1::boolean) as r';
const LIST_DEFAULT = 'select public.foundry_game_requests() as r';
const POST = 'select public.foundry_game_request_post($1, $2, $3) as r';
const CLOSE = 'select public.foundry_game_request_close($1::uuid, $2) as r';
const HIDE = 'select public.foundry_game_request_set_hidden($1::uuid, $2::boolean) as r';
const FAKE = '00000000-0000-4000-8000-000000000000';

const FNS = [
	'foundry_game_requests(boolean)',
	'foundry_game_request_post(text, text, text)',
	'foundry_game_request_close(uuid, text)',
	'foundry_game_request_set_hidden(uuid, boolean)'
] as const;

type Json = Record<string, any>;

let db: TestDb;
let admin: SeededUser;
let ria: SeededUser;
let sol: SeededUser;
let tad: SeededUser;
let visitor: SeededUser;
let maker: SeededUser;
let liveSlug: string;

async function call<T = Json>(u: SeededUser, sql: string, args: unknown[] = []): Promise<T> {
	return db.asUser(u.id, async (q) => (await q<{ r: T }>(sql, args)).rows[0].r);
}
const board = (u: SeededUser, closed = false) => call<Json[]>(u, LIST, [closed]);
const post = (u: SeededUser, title: string, body: string, offer: string | null = null) => call<Json>(u, POST, [title, body, offer]);
/** The two-minute gap is real; a fixture that posts twice moves the last post back. */
async function age(u: SeededUser) {
	await db.sql(`update public.foundry_game_requests set created_at = created_at - interval '5 minutes' where requester = $1`, [u.id]);
}

beforeAll(async () => {
	db = await startTestDb(PRE_0230);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	ria = await createUser(db, 'ria@boscotech.net', 'Ria Requester');
	sol = await createUser(db, 'sol@boscotech.net', 'Sol Student');
	tad = await createUser(db, 'tad@boscotech.net', 'Tad Limits');
	visitor = await createUser(db, 'someone@gmail.com', 'Vis Itor');
	maker = await createUser(db, 'maker@boscotech.net', 'Mae Ker');
	await db.sql(`update public.profiles set display_name = 'RiaMakesGames' where id = $1`, [ria.id]);

	// A published app, through the real pre-0230 RPCs, to fulfil a request with.
	liveSlug = 'cookie-press';
	const appId = await db.asUser(maker.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(`select public.foundry_create_app($1, $2, $3, null, null) as r`, [
			liveSlug,
			'Cookie Press',
			'Plain HTML.'
		]);
		return rows[0].r.app_id;
	});
	const versionId = await db.asUser(maker.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(`select public.foundry_create_version($1::uuid, $2) as r`, [
			appId,
			`uploads/${appId}/v1.zip`
		]);
		return rows[0].r.version_id;
	});
	await db.asUser(maker.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [versionId]));
	await db.asUser(admin.id, (q) => q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId]));
	// And one that is only a draft, which no request may name.
	await db.asUser(maker.id, (q) =>
		q(`select public.foundry_create_app($1, $2, $3, null, null)`, ['draft-only', 'A draft', 'Plain HTML.'])
	);

	await db.sql(SQL_0230);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('posting', () => {
	test('what a student can type is refused with a reason', async () => {
		expect(await post(visitor, 'A game', 'Please make it.')).toEqual({ ok: false, reason: 'not_eligible' });
		expect(await post(ria, '  \n ', 'body')).toEqual({ ok: false, reason: 'blank', field: 'title' });
		expect(await post(ria, 'Title', '\t\n')).toEqual({ ok: false, reason: 'blank', field: 'body' });
		expect(await post(ria, 't'.repeat(81), 'body')).toEqual({ ok: false, reason: 'too_long', field: 'title', limit: 80 });
		expect(await post(ria, 'Title', 'b'.repeat(1001))).toEqual({ ok: false, reason: 'too_long', field: 'body', limit: 1000 });
		expect(await post(ria, 'Title', 'body', 'o'.repeat(121))).toEqual({ ok: false, reason: 'too_long', field: 'offer', limit: 120 });
		expect((await db.sql(`select count(*)::int as n from public.foundry_game_requests`)).rows[0].n).toBe(0);
	});

	test('a request lands trimmed, and the free-text offer round-trips', async () => {
		const r = await post(ria, '  A typing racer  ', ' Two players, one keyboard.\nSpeed counts. ', '  Five cookies  ');
		expect(r).toMatchObject({ ok: true });
		const { rows } = await db.sql(`select title, body, offer, status from public.foundry_game_requests where id = $1`, [r.id]);
		expect(rows[0]).toEqual({ title: 'A typing racer', body: 'Two players, one keyboard.\nSpeed counts.', offer: 'Five cookies', status: 'open' });
		const mine = (await board(ria)).find((x) => x.id === r.id)!;
		expect(mine.offer).toBe('Five cookies');
	});

	test('an empty offer is stored as none', async () => {
		await age(ria);
		const r = await post(ria, 'A puzzle', 'Something with blocks.', '   ');
		const { rows } = await db.sql(`select offer from public.foundry_game_requests where id = $1`, [r.id]);
		expect(rows[0].offer).toBeNull();
	});

	test('two minutes between posts, and three open at once', async () => {
		expect(await post(tad, 'One', 'First.')).toMatchObject({ ok: true });
		const soon = await post(tad, 'Two', 'Second.');
		expect(soon).toMatchObject({ ok: false, reason: 'too_soon' });
		expect(soon.retry_after_seconds).toBeGreaterThan(100);
		expect(soon.retry_after_seconds).toBeLessThanOrEqual(120);
		await age(tad);
		expect(await post(tad, 'Two', 'Second.')).toMatchObject({ ok: true });
		await age(tad);
		expect(await post(tad, 'Three', 'Third.')).toMatchObject({ ok: true });
		await age(tad);
		expect(await post(tad, 'Four', 'Fourth.')).toEqual({ ok: false, reason: 'too_many_open', limit: 3 });
		// POSITIVE CONTROL: closing one frees a slot.
		const first = (await board(tad)).find((x) => x.title === 'One')!;
		expect(await call(tad, CLOSE, [first.id, null])).toEqual({ ok: true, already: false });
		expect(await post(tad, 'Four', 'Fourth.')).toMatchObject({ ok: true });
	});

	test('while the whole Foundry is off, nobody can post', async () => {
		await call(admin, 'select public.foundry_set_site_open(false, null)');
		await age(sol);
		expect(await post(sol, 'A game', 'Please.')).toEqual({ ok: false, reason: 'foundry_off' });
		await call(admin, 'select public.foundry_set_site_open(true, null)');
	});
});

// ===========================================================================
describe('the board', () => {
	test('no address anywhere in it, though the requester row holds one; the chosen name is what shows', async () => {
		for (const u of [sol, ria, admin]) {
			const b = await board(u, true);
			expect(b.length).toBeGreaterThan(0);
			expect(JSON.stringify(b)).not.toContain('@');
		}
		const { rows } = await db.sql(`select email from public.profiles where id = $1`, [ria.id]);
		expect(rows[0].email).toContain('@');
		const row = (await board(sol)).find((x) => x.owner === ria.id)!;
		expect(row).toMatchObject({ owner_display_name: 'RiaMakesGames', owner_full_name: 'Ria Requester', mine: false });
		expect(Object.keys(row)).not.toContain('requester');
	});

	test('a request is the reader\'s own only when it is', async () => {
		expect((await board(ria)).filter((x) => x.mine).every((x) => x.owner === ria.id)).toBe(true);
		expect((await board(ria)).some((x) => x.mine)).toBe(true);
	});

	test('open first, closed only when asked for', async () => {
		const open = await call<Json[]>(sol, LIST_DEFAULT);
		expect(open.every((x) => x.status === 'open')).toBe(true);
		const all = await board(sol, true);
		expect(all.some((x) => x.status === 'closed')).toBe(true);
		const firstClosed = all.findIndex((x) => x.status === 'closed');
		expect(all.slice(firstClosed).every((x) => x.status === 'closed')).toBe(true);
	});

	test('a hidden request: gone for another student, present and marked for its author and an admin', async () => {
		await age(sol);
		const r = await post(sol, 'Something rude', 'Hide me.');
		expect(await call(sol, HIDE, [r.id, true]).catch((e) => (e as Error).message)).toBe(
			'Only a site administrator can hide a game request.'
		);
		expect(await call(admin, HIDE, [r.id, true])).toEqual({ ok: true, hidden: true });

		expect((await board(ria, true)).map((x) => x.id)).not.toContain(r.id);
		const author = (await board(sol)).find((x) => x.id === r.id)!;
		expect(author).toMatchObject({ hidden: true, mine: true });
		const office = (await board(admin)).find((x) => x.id === r.id)!;
		expect(office).toMatchObject({ hidden: true, mine: false });
		// Nobody else is even told a request can be hidden: the key is absent.
		for (const x of await board(ria, true)) {
			if (!x.mine) expect(Object.keys(x)).not.toContain('hidden');
		}
		// POSITIVE CONTROL: shown again, it is back for everybody.
		expect(await call(admin, HIDE, [r.id, false])).toEqual({ ok: true, hidden: false });
		expect((await board(ria)).map((x) => x.id)).toContain(r.id);
		const { rows } = await db.sql(`select hidden_at, hidden_by from public.foundry_game_requests where id = $1`, [r.id]);
		expect(rows[0]).toEqual({ hidden_at: null, hidden_by: null });
		expect(await call(admin, HIDE, [FAKE, true])).toEqual({ ok: false, reason: 'not_found' });
		expect(await refusal(() => call(admin, HIDE, [r.id, null]))).toBe('Hidden or shown? That has to be one or the other.');
	});
});

// ===========================================================================
describe('closing', () => {
	test("somebody else's request answers exactly as an invented one", async () => {
		const ria1 = (await board(ria)).find((x) => x.mine)!;
		const theirs = await call(sol, CLOSE, [ria1.id, null]);
		const nobody = await call(sol, CLOSE, [FAKE, null]);
		expect(theirs).toEqual({ ok: false, reason: 'not_found' });
		expect(nobody).toEqual(theirs);
		expect((await board(ria)).find((x) => x.id === ria1.id)!.status).toBe('open');
	});

	test('the author closes with the published app that fulfilled it, and the board names it', async () => {
		const target = (await board(ria)).find((x) => x.mine && x.title === 'A typing racer')!;
		expect(await call(ria, CLOSE, [target.id, 'no-such-app'])).toEqual({ ok: false, reason: 'no_such_app' });
		expect(await call(ria, CLOSE, [target.id, 'draft-only'])).toEqual({ ok: false, reason: 'no_such_app' });
		expect(await call(ria, CLOSE, [target.id, `  ${liveSlug.toUpperCase()} `])).toEqual({ ok: true, already: false });
		expect(await call(ria, CLOSE, [target.id, null])).toEqual({ ok: true, already: true });
		const closed = (await board(sol, true)).find((x) => x.id === target.id)!;
		expect(closed).toMatchObject({ status: 'closed', fulfilled: { slug: liveSlug, title: 'Cookie Press' } });
		expect(closed.closed_at).toBeTruthy();
	});

	test('an admin may close anybody\'s', async () => {
		const target = (await board(admin)).find((x) => x.owner === ria.id && x.status === 'open')!;
		expect(await call(admin, CLOSE, [target.id, null])).toEqual({ ok: true, already: false });
	});
});

// ===========================================================================
describe('the grants, the bodies, and a second paste', () => {
	test('the table gives nothing to anybody; every read and write is a function', async () => {
		const { rows } = await db.sql(
			`select relrowsecurity as rls, (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'foundry_game_requests') as policies
			 from pg_class where oid = 'public.foundry_game_requests'::regclass`
		);
		expect(rows[0]).toEqual({ rls: true, policies: 0 });
		for (const role of ['anon', 'authenticated', 'service_role']) {
			expect(await tablePrivileges(db, role, 'foundry_game_requests'), role).toEqual([]);
		}
		for (const fn of FNS) {
			expect(await overloads(db, fn.split('(')[0]), fn).toBe(1);
			expect(await canExecute(db, 'anon', fn), fn).toBe(false);
			expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		}
		expect(await refusal(() => db.sql(LIST_DEFAULT))).toBe('You must be signed in.');
	});

	test('none of the four bodies names a coin, and the sweep can see a word when it is there', async () => {
		const { rows } = await db.sql<{ proname: string; prosrc: string }>(
			`select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = any($1::text[])`,
			[FNS.map((f) => f.split('(')[0])]
		);
		expect(rows).toHaveLength(4);
		for (const r of rows) expect(r.prosrc.toLowerCase(), r.proname).not.toContain('coin');
		// POSITIVE CONTROL: the same read of a coin function does find it.
		const { rows: coin } = await db.sql(`select prosrc from pg_proc where proname = 'coin_log_transaction'`);
		expect(String(coin[0].prosrc).toLowerCase()).toContain('coin');
	});

	test('re-applying 0230 leaves every request where it was', async () => {
		const before = await board(admin, true);
		const fp = await catalogFingerprint(db);
		await db.sql(SQL_0230);
		expect(await board(admin, true)).toEqual(before);
		expect(await catalogFingerprint(db)).toBe(fp);
	});
});
