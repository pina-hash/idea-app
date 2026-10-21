// tests/db/foundry-covers-0291.test.ts
//
// 0291 (ledger 0422, feedback 1cc58a6e): an admin replaces any game's cover
// with a picture or an HTML cover. Booted short of the file, seeded through the
// real pre-0291 RPCs (a published app, a hidden one, an unpublished one, an
// existing card override), then the file applied over the top.
//
// What would fail SILENTLY, and so is asserted in both directions:
//   - only an admin replaces a cover; a student and a teacher are refused;
//   - the HTML document reaches the apps-origin route (anon) ONLY for an app
//     the gallery shows, never for a hidden or unpublished one, and not while
//     the whole Foundry is off;
//   - the gallery read carries the revision and never the document;
//   - clearing the card's other details keeps a row that holds an HTML cover;
//   - the existing override row survives the migration untouched.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => f.startsWith('0291_'))!;
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0291')];
const THUMB = '11111111-2222-4333-8444-555555555555/cover.png';
const HTML = '<!doctype html><html><body><canvas id="c"></canvas><script>/* spin */</script></body></html>';

let db: TestDb;
let admin: SeededUser, teacher: SeededUser, ana: SeededUser, ben: SeededUser;
const apps: Record<string, string> = {};

const as = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
const anonHtml = (app: string) =>
	db.asAnon(async (q) => (await q<{ r: string | null }>(`select public.foundry_cover_html($1::uuid) as r`, [app])).rows[0].r);
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

async function makeApp(owner: SeededUser, slug: string, publish: boolean): Promise<string> {
	const appId = (await as<{ app_id: string }>(owner, `public.foundry_create_app($1, $2, $3, null, $4)`, [slug, `App ${slug}`, 'Plain HTML.', 'A test app.'])).app_id;
	if (publish) {
		const v = (await as<{ version_id: string }>(owner, `public.foundry_create_version($1::uuid, $2)`, [appId, `uploads/${appId}/v1.zip`])).version_id;
		await as(owner, `public.foundry_submit_version($1::uuid)`, [v]);
		await as(admin, `public.foundry_review_version($1::uuid, 'approve', null, null)`, [v]);
	}
	return appId;
}

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	apps.live = await makeApp(ana, 'blade-run', true);
	apps.hidden = await makeApp(ben, 'hidden-run', true);
	apps.draft = await makeApp(ben, 'draft-run', false);
	await db.sql(`update public.student_apps set hidden_at = now() where id = $1`, [apps.hidden]);
	// A card override that exists before the file, through the real RPC.
	await as(admin, `public.foundry_gallery_override_set($1, 'Blade Run', null, null)`, [`app:${apps.live}`]);

	await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0291 applies', () => {
	test('re-applies cleanly, carries no top-level DML, and kept the existing override', async () => {
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
		const scan = scanFile(readFileSync(join(DIR, FILE), 'utf8'));
		expect(scan.findings).toEqual([]);
		// Control: the scanner does see a top-level write.
		expect(scanFile('update public.foundry_gallery_overrides set title = null;').findings).toHaveLength(1);
		const row = (await db.sql(`select title, cover_html, cover_html_rev from public.foundry_gallery_overrides where subject = $1`, [`app:${apps.live}`])).rows[0];
		expect(row).toEqual({ title: 'Blade Run', cover_html: null, cover_html_rev: 0 });
	});
});

describe('who replaces a cover', () => {
	test('a student and a teacher are refused; nothing is written', async () => {
		for (const who of [ana, teacher]) {
			expect(await refusal(as(who, `public.foundry_cover_set($1::uuid, 'html', null, $2)`, [apps.live, HTML]))).toMatch(/Only a site administrator/);
		}
		expect((await db.sql(`select count(*)::int n from public.foundry_gallery_overrides where cover_html is not null`)).rows[0].n).toBe(0);
	});

	test('an unknown app, a bad kind, an empty document and a picture outside the covers folder are refused in words', async () => {
		expect(await as(admin, `public.foundry_cover_set(gen_random_uuid(), 'html', null, $1)`, [HTML])).toMatchObject({ ok: false, reason: 'not_found' });
		expect(await as(admin, `public.foundry_cover_set($1::uuid, 'gif', null, null)`, [apps.live])).toMatchObject({ ok: false, reason: 'kind' });
		expect(await as(admin, `public.foundry_cover_set($1::uuid, 'html', null, '')`, [apps.live])).toMatchObject({ ok: false, reason: 'html_empty' });
		expect(await as(admin, `public.foundry_cover_set($1::uuid, 'image', '../etc/passwd', null)`, [apps.live])).toMatchObject({ ok: false, reason: 'image' });
	});
});

describe('an HTML cover', () => {
	test('saved by an admin, it reaches the apps-origin read for a live app, and each save moves the revision', async () => {
		const one = await as<Json>(admin, `public.foundry_cover_set($1::uuid, 'html', null, $2)`, [apps.live, HTML]);
		expect(one).toMatchObject({ ok: true, kind: 'html', cover_html_rev: 1, before: { had_html: false } });
		expect(await anonHtml(apps.live)).toBe(HTML);
		const two = await as<Json>(admin, `public.foundry_cover_set($1::uuid, 'html', null, $2)`, [apps.live, HTML + '<!-- v2 -->']);
		expect(two).toMatchObject({ cover_html_rev: 2, before: { had_html: true } });
		// The card's title, set before, is untouched.
		expect((await db.sql(`select title from public.foundry_gallery_overrides where subject = $1`, [`app:${apps.live}`])).rows[0].title).toBe('Blade Run');
	});

	test('never for a hidden or an unpublished app, and not while the Foundry is off (both directions)', async () => {
		for (const id of [apps.hidden, apps.draft]) {
			expect(await as(admin, `public.foundry_cover_set($1::uuid, 'html', null, $2)`, [id, HTML])).toMatchObject({ ok: true });
			expect(await anonHtml(id)).toBeNull();
		}
		expect(await anonHtml(apps.live)).not.toBeNull();
		await db.sql(`insert into public.foundry_site_settings (id, closed_at, closed_by) values (true, now(), 'apina@boscotech.edu')
			on conflict (id) do update set closed_at = now(), closed_by = 'apina@boscotech.edu'`);
		expect(await anonHtml(apps.live)).toBeNull();
		await db.sql(`update public.foundry_site_settings set closed_at = null, closed_by = null, note = null`);
		expect(await anonHtml(apps.live)).not.toBeNull();
	});

	test('the gallery read carries the revision and never the document', async () => {
		const rows = await as<Json[]>(ana, `public.foundry_gallery_overrides_read()`);
		const live = rows.find((r) => r.subject === `app:${apps.live}`)!;
		expect(live.cover_html_rev).toBe(2);
		expect(JSON.stringify(rows)).not.toContain('<canvas');
		// Signed out reads nothing at all, as before.
		const anon = await db.asAnon(async (q) => (await q<{ r: unknown }>(`select public.foundry_gallery_overrides_read() as r`).catch(() => ({ rows: [{ r: 'denied' }] }))).rows[0].r);
		expect(anon === 'denied' || (Array.isArray(anon) && anon.length === 0)).toBe(true);
	});

	test('clearing the card\'s other details keeps the HTML cover', async () => {
		await as(admin, `public.foundry_gallery_override_set($1, null, null, null)`, [`app:${apps.live}`]);
		const row = (await db.sql(`select title, cover_html is not null as has from public.foundry_gallery_overrides where subject = $1`, [`app:${apps.live}`])).rows[0];
		expect(row).toEqual({ title: null, has: true });
		expect(await anonHtml(apps.live)).not.toBeNull();
	});
});

describe('a picture, and back to the student\'s own', () => {
	test('a picture replaces the HTML cover; clear removes both and the empty row', async () => {
		const pic = await as<Json>(admin, `public.foundry_cover_set($1::uuid, 'image', $2, null)`, [apps.live, THUMB]);
		expect(pic).toMatchObject({ ok: true, image: THUMB, cover_html_rev: null, before: { had_html: true } });
		expect(await anonHtml(apps.live)).toBeNull();
		const clear = await as<Json>(admin, `public.foundry_cover_set($1::uuid, 'clear', null, null)`, [apps.live]);
		expect(clear).toMatchObject({ ok: true, before: { image: THUMB } });
		expect((await db.sql(`select count(*)::int n from public.foundry_gallery_overrides where subject = $1`, [`app:${apps.live}`])).rows[0].n).toBe(0);
		// The student's own record was never touched.
		expect((await db.sql(`select cover_path from public.student_apps where id = $1`, [apps.live])).rows[0].cover_path).toBeNull();
	});
});
