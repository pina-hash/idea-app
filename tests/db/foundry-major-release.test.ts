// tests/db/foundry-major-release.test.ts
//
// 0233 PART foundry-major: AN ADMIN MARKS ONE APP A MAJOR RELEASE (report
// 927b1c69). What would fail SILENTLY, and so is asserted here:
//
//   1. THE TWO RE-PROJECTED READS ANSWER EVERY DEPLOYED CALL AS BEFORE, plus
//      one key. foundry_list_apps is dropped and re-created (it returns a
//      table) and foundry_get_app replaced, both from 0173's text patched
//      rather than retyped; a body that drifted on the way past would change
//      what every gallery, author page and review queue reads with nothing on
//      screen to say so. So a CORPUS is put to the deployed functions first,
//      0233 is applied over the same seeded database, and the corpus is put
//      again and compared with the one new key taken out.
//   2. ONLY AN ADMIN WRITES IT. The owner and a stranger are refused and the
//      row does not move, read as the connection owner so nothing but the
//      function itself can be what refused. A PERMISSIVE mutation of the gate
//      reddens this (see the bottom of this header).
//   3. THE ACTOR NEVER LEAVES. major_release_by is set on the row and appears
//      in no payload for any caller.
//   4. IT IS NOT AN EDIT: updated_at does not move, so "Recently updated" and
//      the list's own order are untouched by curation.
//   5. THE OWNER CANNOT REACH IT through the metadata RPC or a direct update.
//   6. A SECOND PASTE keeps every flag and changes nothing in the catalog this
//      part owns.
//
// SEEDED THROUGH THE REAL PRE-0233 RPCs on the whole tree short of 0233
// (chain-0233), which is the database production holds before the apply.
//
// MUTATION PROOF (run by hand, recorded in the round's history notes): the
// line `if not public.is_admin() then` directly above the refusal
// 'Only a site administrator can make an app a major release.' was replaced
// with `if false then` in the migration on disk, this file alone was run, the
// summary line was read over stdout and stderr, and the file was restored from
// an in-memory copy and md5-checked.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	PRE_0233,
	PRE_0233_COUNT,
	SQL_0233,
	canExecute,
	catalogFingerprint,
	keysDeep,
	overloads,
	pasteTrap,
	part0233,
	refusal
} from './chain-0233';

const LIST = 'select * from public.foundry_list_apps($1::uuid, $2::boolean, $3::boolean)';
const GET = 'select public.foundry_get_app($1, $2::boolean, $3::boolean) as r';
const SET = 'select public.foundry_set_app_major($1::uuid, $2::boolean) as r';
const ADMIN_ONLY = 'Only a site administrator can make an app a major release.';
const FAKE = '00000000-0000-4000-8000-000000000000';

type Json = Record<string, unknown>;

let db: TestDb;
let admin: SeededUser;
let maker: SeededUser;
let stranger: SeededUser;

const app: Record<string, { app: string; version: string; slug: string }> = {};

async function publishApp(as: SeededUser, slug: string) {
	const appId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, `App ${slug}`, 'Plain HTML and a bit of JavaScript.', 'A test app.']
		);
		return rows[0].r.app_id;
	});
	const versionId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `uploads/${appId}/v1.zip`]
		);
		return rows[0].r.version_id;
	});
	await db.asUser(as.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [versionId]));
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId])
	);
	return { app: appId, version: versionId, slug };
}

/** Who reads, and with which flags. The admin case is the review console's load. */
type ReadCase = [string, () => SeededUser, () => string | null, boolean, boolean];
const LIST_CASES: ReadCase[] = [
	['a stranger, the gallery', () => stranger, () => null, false, false],
	['the maker, their own page', () => maker, () => maker.id, false, true],
	['a stranger, the maker author page', () => stranger, () => maker.id, false, false],
	['the admin, the review console', () => admin, () => null, true, true]
];

async function listAs(u: SeededUser, owner: string | null, hidden: boolean, unpublished: boolean) {
	return db.asUser(u.id, async (q) => (await q<Json>(LIST, [owner, hidden, unpublished])).rows);
}
async function getAs(u: SeededUser, slug: string, hidden: boolean, unpublished: boolean) {
	return db.asUser(u.id, async (q) => (await q<{ r: Json | null }>(GET, [slug, hidden, unpublished])).rows[0].r);
}
async function setMajor(u: SeededUser, appId: string, major: boolean | null): Promise<Json> {
	return db.asUser(u.id, async (q) => (await q<{ r: Json }>(SET, [appId, major])).rows[0].r);
}
/** The row as stored, read as the connection owner: no RLS, no grant in the way. */
async function stored(appId: string) {
	const { rows } = await db.sql<{
		major_release_at: Date | null;
		major_release_by: string | null;
		updated_at: Date;
		hidden_at: Date | null;
	}>(
		`select major_release_at, major_release_by, updated_at, hidden_at from public.student_apps where id = $1`,
		[appId]
	);
	return rows[0];
}
function without(row: Json | null, key: string): Json | null {
	if (!row) return row;
	const out = { ...row };
	delete out[key];
	return out;
}
/** Only the catalog lines this part owns, so another part's re-paste is not asserted here. */
async function ownFingerprint(): Promise<string> {
	return (await catalogFingerprint(db))
		.split('\n')
		.filter((l) => /foundry_list_apps|foundry_get_app|foundry_set_app_major|student_apps\b/.test(l))
		.join('\n');
}

const listBefore = new Map<string, Json[]>();
const getBefore = new Map<string, Json | null>();
let updatedBefore: Date;

beforeAll(async () => {
	db = await startTestDb(PRE_0233);

	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	maker = await createUser(db, 'maker@boscotech.net', 'Mae Ker');
	stranger = await createUser(db, 'stranger@boscotech.net', 'Stran Ger');

	app.p = await publishApp(maker, 'major-p');
	app.h = await publishApp(maker, 'major-h');
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_set_app_hidden($1::uuid, true, 'Under discussion.')`, [app.h.app])
	);
	const draft = await db.asUser(maker.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, null) as r`,
			['major-u', 'A draft', 'Plain HTML.']
		);
		return rows[0].r.app_id;
	});
	app.u = { app: draft, version: '', slug: 'major-u' };

	// THE CORPUS, PUT TO THE DEPLOYED FUNCTIONS.
	for (const [name, who, owner, hidden, unpublished] of LIST_CASES) {
		listBefore.set(name, await listAs(who(), owner(), hidden, unpublished));
		for (const slug of ['major-p', 'major-h', 'major-u']) {
			getBefore.set(`${name} ${slug}`, await getAs(who(), slug, hidden, unpublished));
		}
	}
	// The column does not exist yet, so this reads updated_at alone.
	updatedBefore = (
		await db.sql<{ updated_at: Date }>(`select updated_at from public.student_apps where id = $1`, [app.p.app])
	).rows[0].updated_at;

	await db.sql(SQL_0233);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('the chain was the whole tree short of 0233, and this part is in the file', () => {
		expect(PRE_0233_COUNT).toBeGreaterThan(200);
		// The two files this part patches from and lands after are both in it.
		expect(PRE_0233.some((f) => f.startsWith('0173_'))).toBe(true);
		expect(PRE_0233.some((f) => f.startsWith('0232_'))).toBe(true);
		expect(part0233('foundry-major')).not.toBeNull();
	});

	test('the paste trap is clean on this part, and the instrument bites on a planted case', () => {
		const own = part0233('foundry-major')!;
		expect(pasteTrap(own)).toEqual([]);
		expect(pasteTrap(`${own}\n-- a stray $fm$ in a comment`).length).toBeGreaterThan(0);
	});

	test('the apply scanner refuses nothing in this part, and refuses a planted top-level insert', () => {
		const own = part0233('foundry-major')!;
		expect(scanFile(own).findings).toEqual([]);
		const planted = scanFile(`${own}\ninsert into public.student_apps (id) values (gen_random_uuid());\n`);
		expect(planted.findings.length).toBeGreaterThan(0);
	});
});

// ===========================================================================
describe('the deployed corpus, case for case', () => {
	test('the corpus was not empty, and held every state', () => {
		expect(listBefore.size).toBe(4);
		expect(getBefore.size).toBe(12);
		// Positive controls on the corpus itself: the gallery sees P, the admin
		// sees all three, nobody's deployed row carried the new key.
		expect(listBefore.get('a stranger, the gallery')!.map((r) => r.slug)).toEqual(['major-p']);
		expect(listBefore.get('the admin, the review console')!.map((r) => r.slug).sort()).toEqual([
			'major-h',
			'major-p',
			'major-u'
		]);
		for (const rows of listBefore.values()) for (const r of rows) expect(r).not.toHaveProperty('major_release_at');
		expect(getBefore.get('a stranger, the gallery major-p')).not.toHaveProperty('major_release_at');
	});

	test.each(LIST_CASES)('foundry_list_apps, %s: the same rows, plus the key at null', async (name, who, owner, h, u) => {
		const after = await listAs(who(), owner(), h, u);
		const before = listBefore.get(name)!;
		expect(after.map((r) => without(r, 'major_release_at'))).toEqual(before);
		expect(after.length).toBeGreaterThan(0);
		for (const r of after) expect(r).toHaveProperty('major_release_at', null);
	});

	test.each(LIST_CASES)('foundry_get_app, %s: the same payloads, plus the key at null', async (name, who, _o, h, u) => {
		let found = 0;
		for (const slug of ['major-p', 'major-h', 'major-u']) {
			const after = await getAs(who(), slug, h, u);
			expect(without(after, 'major_release_at')).toEqual(getBefore.get(`${name} ${slug}`));
			if (after) {
				found++;
				expect(after).toHaveProperty('major_release_at', null);
			}
		}
		expect(found).toBeGreaterThan(0);
	});
});

// ===========================================================================
describe('the catalog', () => {
	test('one function each; the list keeps its arguments and defaults; the write has no defaults', async () => {
		expect(await overloads(db, 'foundry_list_apps')).toBe(1);
		expect(await overloads(db, 'foundry_get_app')).toBe(1);
		expect(await overloads(db, 'foundry_set_app_major')).toBe(1);
		const { rows } = await db.sql<{ name: string; args: string; defaults: number }>(
			`select p.proname as name, pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
				p.pronargdefaults::int as defaults
			 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in ('foundry_list_apps', 'foundry_set_app_major')
			 order by 1`
		);
		expect(rows).toEqual([
			{
				name: 'foundry_list_apps',
				args: 'p_owner uuid, p_include_hidden boolean, p_include_unpublished boolean',
				defaults: 3
			},
			{ name: 'foundry_set_app_major', args: 'p_app_id uuid, p_major boolean', defaults: 0 }
		]);
	});

	test('anon executes none of the three; authenticated executes all three', async () => {
		for (const sig of [
			'foundry_set_app_major(uuid, boolean)',
			'foundry_list_apps(uuid, boolean, boolean)',
			'foundry_get_app(text, boolean, boolean)'
		]) {
			expect(await canExecute(db, 'anon', sig)).toBe(false);
			expect(await canExecute(db, 'authenticated', sig)).toBe(true);
		}
		expect(
			await refusal(() => db.asAnon((q) => q(SET, [app.p.app, true])))
		).toMatch(/permission denied for function/);
	});
});

// ===========================================================================
describe('only an admin marks an app', () => {
	test('the owner and a stranger are refused, and the row does not move', async () => {
		const before = await stored(app.p.app);
		expect(before.major_release_at).toBeNull();
		expect(await refusal(() => setMajor(maker, app.p.app, true))).toBe(ADMIN_ONLY);
		expect(await refusal(() => setMajor(stranger, app.p.app, true))).toBe(ADMIN_ONLY);
		const after = await stored(app.p.app);
		expect(after.major_release_at).toBeNull();
		expect(after.major_release_by).toBeNull();
	});

	test('a null flag is misuse and raises', async () => {
		expect(await refusal(() => setMajor(admin, app.p.app, null))).toBe(
			'A major release or not? That has to be one or the other.'
		);
	});

	test('the admin marks P: ok, changed; every reader now sees the stamp; updated_at does not move', async () => {
		const r = await setMajor(admin, app.p.app, true);
		expect(r).toMatchObject({ ok: true, app_id: app.p.app, changed: true });
		expect(typeof r.major_release_at).toBe('string');

		const row = await stored(app.p.app);
		expect(row.major_release_at).not.toBeNull();
		expect(row.major_release_by).toBe(admin.id);
		expect(row.updated_at.toISOString()).toBe(updatedBefore.toISOString());

		const gallery = await listAs(stranger, null, false, false);
		expect(gallery.find((a) => a.slug === 'major-p')?.major_release_at).not.toBeNull();
		const detail = await getAs(stranger, 'major-p', false, false);
		expect(detail?.major_release_at).not.toBeNull();
	});

	test('a second mark is ok and changes nothing, the original stamp kept', async () => {
		const first = (await stored(app.p.app)).major_release_at!.toISOString();
		const r = await setMajor(admin, app.p.app, true);
		expect(r).toMatchObject({ ok: true, changed: false });
		expect((await stored(app.p.app)).major_release_at!.toISOString()).toBe(first);
	});

	test('the actor is in the row and in no payload, for any caller', async () => {
		expect((await stored(app.p.app)).major_release_by).toBe(admin.id);
		let payloads = 0;
		for (const [, who, owner, h, u] of LIST_CASES) {
			const rows = await listAs(who(), owner(), h, u);
			expect(keysDeep(rows).has('major_release_by')).toBe(false);
			expect(keysDeep(rows).has('major_release_at')).toBe(true);
			payloads += rows.length;
			for (const slug of ['major-p', 'major-h', 'major-u']) {
				const one = await getAs(who(), slug, h, u);
				if (!one) continue;
				expect(keysDeep(one).has('major_release_by')).toBe(false);
				payloads++;
			}
		}
		expect(payloads).toBeGreaterThan(8);
	});

	test('unmark: both columns cleared; a second unmark changes nothing', async () => {
		expect(await setMajor(admin, app.p.app, false)).toMatchObject({
			ok: true,
			changed: true,
			major_release_at: null
		});
		const row = await stored(app.p.app);
		expect(row.major_release_at).toBeNull();
		expect(row.major_release_by).toBeNull();
		expect(row.updated_at.toISOString()).toBe(updatedBefore.toISOString());
		expect(await setMajor(admin, app.p.app, false)).toMatchObject({ ok: true, changed: false });
	});
});

// ===========================================================================
describe('what can be marked', () => {
	test('a draft is refused as not published, a hidden app as hidden, an invented id as not found', async () => {
		expect(await setMajor(admin, app.u.app, true)).toEqual({ ok: false, reason: 'not_published' });
		expect(await setMajor(admin, app.h.app, true)).toEqual({ ok: false, reason: 'hidden' });
		expect(await setMajor(admin, FAKE, true)).toEqual({ ok: false, reason: 'not_found' });
		expect((await stored(app.u.app)).major_release_at).toBeNull();
		expect((await stored(app.h.app)).major_release_at).toBeNull();
	});

	test('hiding keeps the flag, unmarking works while hidden, restoring brings it back', async () => {
		expect(await setMajor(admin, app.p.app, true)).toMatchObject({ ok: true, changed: true });
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'A while.')`, [app.p.app])
		);
		expect((await stored(app.p.app)).major_release_at).not.toBeNull();
		// Off the gallery while hidden: the flag shows nobody anything.
		expect((await listAs(stranger, null, false, false)).map((r) => r.slug)).not.toContain('major-p');
		await db.asUser(admin.id, (q) => q(`select public.foundry_set_app_hidden($1::uuid, false, null)`, [app.p.app]));
		const back = (await listAs(stranger, null, false, false)).find((r) => r.slug === 'major-p');
		expect(back?.major_release_at).not.toBeNull();

		// And an unmark of a hidden app is allowed.
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'Again.')`, [app.p.app])
		);
		expect(await setMajor(admin, app.p.app, false)).toMatchObject({ ok: true, changed: true });
		expect((await stored(app.p.app)).major_release_at).toBeNull();
		await db.asUser(admin.id, (q) => q(`select public.foundry_set_app_hidden($1::uuid, false, null)`, [app.p.app]));
	});
});

// ===========================================================================
describe('the owner cannot reach it', () => {
	test('the metadata RPC refuses the field on a published, unhidden app', async () => {
		expect((await stored(app.p.app)).hidden_at).toBeNull();
		const said = await refusal(() =>
			db.asUser(maker.id, (q) =>
				q(`select public.foundry_update_app_metadata($1::uuid, 'major_release_at', $2)`, [
					app.p.app,
					'2026-10-07'
				])
			)
		);
		expect(said).toMatch(/There is no editable field/);
	});

	test('a direct update is permission denied, with a select of the same row as the positive control', async () => {
		const seen = await db.asUser(maker.id, async (q) =>
			(await q<{ id: string }>(`select id from public.student_apps where id = $1`, [app.p.app])).rows
		);
		expect(seen).toHaveLength(1);
		expect(
			await refusal(() =>
				db.asUser(maker.id, (q) =>
					q(`update public.student_apps set major_release_at = now() where id = $1`, [app.p.app])
				)
			)
		).toMatch(/permission denied for table student_apps/);
		expect((await stored(app.p.app)).major_release_at).toBeNull();
	});
});

// ===========================================================================
describe('a second paste', () => {
	test('keeps every flag and moves nothing this part owns in the catalog', async () => {
		expect(await setMajor(admin, app.p.app, true)).toMatchObject({ ok: true, changed: true });
		const stamp = (await stored(app.p.app)).major_release_at!.toISOString();
		const before = await ownFingerprint();
		expect(before).toContain('foundry_set_app_major');
		await db.sql(SQL_0233);
		expect(await ownFingerprint()).toBe(before);
		expect((await stored(app.p.app)).major_release_at!.toISOString()).toBe(stamp);
		expect(await overloads(db, 'foundry_list_apps')).toBe(1);
	});
});
