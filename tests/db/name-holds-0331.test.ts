// tests/db/name-holds-0331.test.ts
//
// LEDGER 0471 PART 3 (report 3d4d8b76): a tournament entry name, a roster
// name, an entry's tagline and an IDEA Market listing that name a classmate
// are held for an OK, through 0324's one check `_idea_roster_name_hits`.
// Applied over the whole tree short of the file, with an entry, a banner and
// a listing seeded through the REAL RPCs before it, then applied again.
//
// What is held, both directions every time:
//   * a student's text naming a classmate in another class is not shown
//     (a stand-in name, the old tagline, a hidden listing), and the same
//     student's text that names nobody, or only themselves, shows at once;
//   * staff are never held, and rows written before the file are untouched;
//   * the held text is listed only to who may decide it (an admin or a staff
//     host for a tournament, coin staff whose scope reaches the poster for a
//     listing), and a student is answered "does not exist" and changes
//     nothing (mutation proved on the decide gate and on the hold itself);
//   * allowing applies the text or unhides the listing; turning it down
//     leaves the stand-in and closes the listing.
//
// The migration is found by its name and read off disk when the suite
// starts, so a renumbering at landing and a mutation run both read the file.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { SeededUser } from './harness';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILES = ALL.filter((f) => f.endsWith('_tournament_market_name_holds.sql'));
if (FILES.length !== 1) throw new Error(`expected one name holds migration, found ${FILES.length}`);
const FILE = FILES[0];
const NUM = FILE.slice(0, 4);
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const SQL = () => readFileSync(join(DIR, FILE), 'utf8');
const WAITING = 'Name waiting for an OK';
const GONE = 'That held name does not exist.';

let w: CoinWorld;
let host: SeededUser;
let cup = '';
let oldEntry = '';
let oldListing = '';

const entryName = (id: string) => w.scalar<string>(`select display_name v from public.tournament_entries where id = $1`, [id]);
const members = (id: string) => w.db.sql<{ id: string; name: string }>(`select id, name from public.tournament_entry_members where entry_id = $1 order by created_at, id`, [id]).then((r) => r.rows);
const tagline = (id: string) => w.scalar<string | null>(`select tagline v from public.tournament_entry_styles where entry_id = $1`, [id]);
const listing = (id: string) => w.db.sql<Json>(`select hidden_at is not null as hidden, hidden_reason, closed_reason from public.coin_market_listings where id = $1`, [id]).then((r) => r.rows[0]);
const holds = (u: SeededUser) => w.rpc<Json>(u, `public.idea_text_holds_list()`).then((r) => r.holds as Json[]);
const decide = (u: SeededUser, id: string, approve: boolean) => w.rpc<Json>(u, `public.idea_text_hold_decide($1::uuid, $2)`, [id, approve]);
const register = (u: SeededUser, name: string) => w.rpc<string>(u, `public.tournament_register_entry($1::uuid, $2, '', null)`, [cup, name]);
const style = (u: SeededUser, entry: string, line: string) => w.rpc(u, `public.tournament_set_entry_style($1::uuid, null, null, null, null, null, $2)`, [entry, line]);
const post = (u: SeededUser, title: string, text = 'Ask me in class.') =>
	w.rpc<Json>(u, `public.coin_market_post('offer', $1, $2, 2::numeric, 'service', null)`, [title, text]);
const boardIds = async (u: SeededUser) => JSON.stringify(await w.rpc<Json>(u, `public.coin_market_board()`));
const statuses = () => w.db.sql<{ status: string; n: number }>(`select status, count(*)::int n from public.idea_text_holds group by 1 order by 1`).then((r) => r.rows);

beforeAll(async () => {
	w = await startCoinWorld(PRE);
	host = w.teacher;
	// Roster names, as a teacher types them: Cal is in another class from Ana.
	await w.db.sql(`update public.classroom_enrollments set display_name = 'Ng, Calloway' where student_email = $1`, [w.cal.email]);
	await w.db.sql(`update public.classroom_enrollments set display_name = 'Reyes, Anabel' where student_email = $1`, [w.ana.email]);
	await w.db.sql(`update public.classroom_enrollments set display_name = 'Park, Deanna' where student_email = $1`, [w.dee.email]);

	cup = await w.rpc<string>(host, `public.tournament_create('Blade Cup', '', '{"team_size": 1}'::jsonb)`);
	await w.rpc(host, `public.tournament_set_status($1::uuid, 'registration_open')`, [cup]);
	// Written before the file: an entry, its banner and a listing that would be held today.
	oldEntry = await register(w.eve, 'Calloway Chasers');
	await style(w.eve, oldEntry, 'Faster than Calloway');
	const old = await post(w.eve, 'Calloway proof homework help');
	expect(old.ok, JSON.stringify(old)).toBe(true);
	oldListing = String(old.listing_id);

	await w.db.sql(SQL());
	await w.db.sql(SQL());
}, 600_000);
afterAll(async () => { await w?.db.stop(); });

describe(`${NUM} applies`, () => {
	it('through the real apply tool: the scanner finds nothing, and a planted top-level insert is found (control)', async () => {
		const { scanFile } = await import('../../tools/apply-migration.mjs');
		expect(scanFile(SQL()).findings).toEqual([]);
		expect(scanFile(`insert into public.idea_text_holds (kind) values ('x');`).findings).toHaveLength(1);
	});
	it('leaves rows written before it exactly as they were', async () => {
		expect(await entryName(oldEntry)).toBe('Calloway Chasers');
		expect(await tagline(oldEntry)).toBe('Faster than Calloway');
		expect(await listing(oldListing)).toMatchObject({ hidden: false });
		expect(await statuses()).toEqual([]);
	});
	it('opens the list and the decision to signed-in callers, the helpers and the table to nobody', async () => {
		const acl = (await w.db.sql<{ fn: string; anon: boolean; authed: boolean }>(`
			select p.proname fn, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authed
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname like any (array['idea\\_text\\_hold%', '\\_idea\\_text\\_hold%']) order by 1`)).rows;
		expect(acl.map((r) => r.fn)).toEqual(['_idea_text_hold_exempt', '_idea_text_hold_may_decide', '_idea_text_hold_put', '_idea_text_hold_trigger', 'idea_text_hold_decide', 'idea_text_holds_list']);
		expect(acl.filter((r) => r.anon)).toEqual([]);
		expect(acl.filter((r) => r.authed).map((r) => r.fn)).toEqual(['idea_text_hold_decide', 'idea_text_holds_list']);
		expect(await w.refusal(w.db.asUser(w.ana.id, (q) => q(`select * from public.idea_text_holds`)))).toContain('permission denied');
	});
});

describe('a tournament entry', () => {
	let held = '', fine = '', own = '';
	beforeAll(async () => {
		held = await register(w.ana, 'Calloway Stinks');
		fine = await register(w.ben, 'Moss Bosses');
		own = await register(w.dee, 'Deanna Racing');
	});
	it("holds a name that names a classmate, entry and roster name alike, and shows a stand-in", async () => {
		expect(await entryName(held)).toBe(WAITING);
		expect((await members(held)).map((m) => m.name)).toEqual([WAITING]);
		const mine = (await holds(w.owner)).filter((h) => h.text === 'Calloway Stinks');
		expect(mine.map((h) => h.kind).sort()).toEqual(['tournament_entry', 'tournament_member']);
		expect(mine[0]).toMatchObject({ hits: ['Calloway'], where: 'Tournament: Blade Cup', by: 'Anabel' });
	});
	it('positive controls: a name that names nobody, or only the writer, shows at once', async () => {
		expect(await entryName(fine)).toBe('Moss Bosses');
		expect(await entryName(own)).toBe('Deanna Racing');
		expect((await members(own)).map((m) => m.name)).toEqual(['Deanna Racing']);
		const texts = (await holds(w.owner)).map((h) => h.text);
		expect(texts).not.toContain('Moss Bosses');
		expect(texts).not.toContain('Deanna Racing');
	});
	it('holds an edit to a tagline and keeps the old one; a tagline naming nobody lands', async () => {
		await style(w.ana, held, 'Calloway is slow');
		expect(await tagline(held)).toBeNull();
		await style(w.ana, held, 'Loud and fast');
		expect(await tagline(held)).toBe('Loud and fast');
		await style(w.ana, held, 'Beat Calloway');
		expect(await tagline(held)).toBe('Loud and fast');
		// The earlier held tagline was replaced by the accepted one, so only the latest waits.
		const lines = (await holds(w.owner)).filter((h) => h.kind === 'tournament_tagline');
		expect(lines.map((h) => h.text)).toEqual(['Beat Calloway']);
		// And a row from before the file is checked when it is edited.
		await style(w.eve, oldEntry, 'Calloway again');
		expect(await tagline(oldEntry)).toBe('Faster than Calloway');
	});
	it('never holds staff', async () => {
		const added = await w.rpc<string>(host, `public.tournament_host_add_entry($1::uuid, 'Calloway Fan Club', '', null, null)`, [cup]);
		expect(await entryName(added)).toBe('Calloway Fan Club');
		expect((await holds(w.owner)).map((h) => h.text)).not.toContain('Calloway Fan Club');
	});
	it('lists it to an admin and a staff host, never to a student, and a student cannot decide it', async () => {
		const forOwner = (await holds(w.owner)).filter((h) => String(h.kind).startsWith('tournament')).map((h) => h.id).sort();
		expect(forOwner.length).toBe(4);
		expect((await holds(host)).filter((h) => String(h.kind).startsWith('tournament')).map((h) => h.id).sort()).toEqual(forOwner);
		expect((await holds(w.cosso)).filter((h) => String(h.kind).startsWith('tournament')).map((h) => h.id).sort()).toEqual(forOwner);
		expect(await holds(w.ana)).toEqual([]);
		expect(await holds(w.eve)).toEqual([]);
		const before = await statuses();
		expect(await w.refusal(decide(w.ana, String(forOwner[0]), true))).toBe(GONE);
		expect(await w.refusal(decide(w.eve, String(forOwner[0]), false))).toBe(GONE);
		expect(await statuses()).toEqual(before);
	});
	it('allowing applies the text; turning it down leaves the stand-in', async () => {
		const list = await holds(w.owner);
		const entry = list.find((h) => h.kind === 'tournament_entry' && h.text === 'Calloway Stinks')!;
		const member = list.find((h) => h.kind === 'tournament_member' && h.text === 'Calloway Stinks')!;
		const line = list.find((h) => h.kind === 'tournament_tagline' && h.text === 'Beat Calloway')!;
		expect(await decide(w.owner, String(entry.id), true)).toMatchObject({ ok: true, status: 'approved' });
		expect(await decide(host, String(line.id), true)).toMatchObject({ ok: true, status: 'approved' });
		expect(await decide(w.owner, String(member.id), false)).toMatchObject({ ok: true, status: 'rejected' });
		expect(await entryName(held)).toBe('Calloway Stinks');
		expect(await tagline(held)).toBe('Beat Calloway');
		expect((await members(held)).map((m) => m.name)).toEqual([WAITING]);
		expect(await decide(w.owner, String(entry.id), false)).toMatchObject({ ok: false, reason: 'decided' });
	});
});

describe('an IDEA Market listing', () => {
	let held = '', fine = '', turned = '';
	beforeAll(async () => {
		held = String((await post(w.ana, 'Calloway homework help')).listing_id);
		fine = String((await post(w.ana, 'Laser cutting help')).listing_id);
		turned = String((await post(w.ana, 'Tutoring', 'Better than Calloway at math')).listing_id);
	});
	it('posts a listing naming a classmate hidden, with the reason its poster reads, and a listing naming nobody shown', async () => {
		expect(await listing(held)).toMatchObject({ hidden: true, hidden_reason: "Waiting for a teacher's OK because it names a classmate." });
		expect(await listing(turned)).toMatchObject({ hidden: true });
		expect(await listing(fine)).toMatchObject({ hidden: false });
		const board = await boardIds(w.ben);
		expect(board).toContain(fine);
		expect(board).not.toContain(held);
		expect(board).not.toContain(turned);
	});
	it('lists it to coin staff whose scope reaches the poster, and to no one else', async () => {
		const owner = (await holds(w.owner)).filter((h) => h.kind === 'market_listing');
		expect(owner.map((h) => h.text).sort()).toEqual(['Calloway homework help\nAsk me in class.', 'Tutoring\nBetter than Calloway at math']);
		expect(owner[0]).toMatchObject({ where: 'IDEA Market', field: 'listing', hits: ['Calloway'] });
		// The teacher of record of Ana's class reaches her; Mr. Cosso's class does not.
		expect((await holds(w.teacher)).filter((h) => h.kind === 'market_listing')).toHaveLength(2);
		expect((await holds(w.cosso)).filter((h) => h.kind === 'market_listing')).toHaveLength(0);
		expect(await w.refusal(decide(w.cosso, String(owner[0].id), true))).toBe(GONE);
		expect(await listing(held)).toMatchObject({ hidden: true });
	});
	it('allowing shows the listing; turning it down closes it as removed', async () => {
		const list = (await holds(w.teacher)).filter((h) => h.kind === 'market_listing');
		const a = list.find((h) => String(h.text).startsWith('Calloway homework'))!;
		const b = list.find((h) => String(h.text).startsWith('Tutoring'))!;
		expect(await decide(w.teacher, String(a.id), true)).toMatchObject({ ok: true });
		expect(await decide(w.owner, String(b.id), false)).toMatchObject({ ok: true });
		expect(await listing(held)).toMatchObject({ hidden: false, hidden_reason: null });
		expect(await listing(turned)).toMatchObject({ hidden: true, closed_reason: 'removed' });
		expect(await boardIds(w.ben)).toContain(held);
		expect(await boardIds(w.ben)).not.toContain(turned);
	});
});

describe('the one check', () => {
	it("is 0324's function, called and never restated", () => {
		const sql = SQL();
		expect(sql.match(/_idea_roster_name_hits\(/g)?.length).toBeGreaterThanOrEqual(1);
		expect(sql).not.toMatch(/regexp_split_to_table/);
		expect(sql).not.toMatch(/create or replace function public\._idea_roster_name_hits/);
	});
});

describe('every hold, by what became of it', () => {
	it('three allowed, two turned down, one replaced by an accepted tagline, one still waiting', async () => {
		expect(await statuses()).toEqual([
			{ status: 'approved', n: 3 },
			{ status: 'held', n: 1 },
			{ status: 'rejected', n: 2 },
			{ status: 'superseded', n: 1 }
		]);
	});
});
