// tests/db/short-link-reserve-feedback-0269.test.ts
//
// 0269 (ledger 0396, part 5) reserves `feedback`, the top-level directory of
// the feedback window's own page at /feedback/embed. Pinned against a database
// as production held it BEFORE the file -- the chain short of 0269 with 0137
// last -- seeded through the REAL pre-migration RPC, then 0269 applied over the
// top, which is the order a hand paste or migrate.yml applies it in.
//
// WHAT IS HELD, each silent when broken:
//   1. `feedback` is refused at creation from now on, and every name the
//      predicate held before still is (a redefinition that dropped one would
//      re-open a shadowed slug with nothing reporting it).
//   2. An EXISTING `feedback` short link is LEFT ALONE, byte for byte, and
//      still resolves -- unlike 0215 and 0260, which moved a collision,
//      because `/feedback` itself is not a page and nothing shadows the link.
//      A file that "tidied" it would break a printed link for nothing.
//   3. The predicate stays one overload, closed to every client role, as the
//      catalog says (not as the self-check says).
//   4. The file re-applies over itself.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const PRE_CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0093_short_links.sql',
	'0156_short_link_reserved_names.sql',
	'0166_short_link_reserve_maps.sql',
	'0196_short_link_reserve_hx.sql',
	'0215_short_link_reserve_ideacad.sql',
	'0231_armory.sql',
	'0260_cert_engine.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const SQL_0269 = readFileSync(
	new URL('../../supabase/migrations/0269_short_link_reserve_feedback.sql', import.meta.url),
	'utf8'
);

let db: TestDb;
let owner: SeededUser;

type LinkRow = {
	slug: string;
	target: string;
	label: string | null;
	active: boolean;
	created_by: string;
	created_at: string;
	updated_at: string;
};

const linkRows = async () =>
	(
		await db.sql<LinkRow>(
			`select slug, target, label, active, created_by, created_at::text, updated_at::text
			 from public.app_short_links order by slug`
		)
	).rows;

const reserved = async (slug: string) =>
	(await db.sql<{ r: boolean }>(`select public._app_short_link_reserved($1) as r`, [slug])).rows[0].r;

const upsert = (slug: string, target: string) =>
	db.asUser(owner.id, async (q) => {
		const { rows } = await q<{ result: { ok: boolean } }>(
			`select public.app_short_link_upsert($1, $2, $3, true) as result`,
			[slug, target, 'Feedback form']
		);
		return rows[0].result;
	});

let before: LinkRow[];
let reservedBefore: boolean;

beforeAll(async () => {
	db = await startTestDb([...PRE_CHAIN]);
	// The owner is always an admin (admin_owner_email), and the upsert is
	// admin-only: this is the REAL pre-migration write path, not a raw insert.
	owner = await createUser(db, 'apina@boscotech.edu', 'Owner');
	reservedBefore = await reserved('feedback');
	expect(await upsert('feedback', '/assignments/idea209h-syllabus')).toMatchObject({ ok: true });
	expect(await upsert('open-lab', '/assignments/open-lab')).toMatchObject({ ok: true });
	before = await linkRows();
	await db.sql(SQL_0269);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('0269 reserves feedback, and only adds', () => {
	test('POSITIVE CONTROL: before the file, feedback was an ordinary slug', () => {
		expect(reservedBefore).toBe(false);
		expect(before.map((r) => r.slug)).toEqual(['feedback', 'open-lab']);
	});

	test('feedback is reserved now, and every name held before still is', async () => {
		expect(await reserved('feedback')).toBe(true);
		for (const name of ['a', 'certifications', 'coins', 'downloads', 'foundry', 'ideacad', 'maps', 'vanguard'])
			expect(await reserved(name), name).toBe(true);
		// Negative control: a name of the same shape that shadows nothing.
		expect(await reserved('open-lab')).toBe(false);
		expect(await reserved('feedbackx')).toBe(false);
	});

	test('a new feedback link is refused at creation, in the words the editor shows', async () => {
		await expect(upsert('feedback', '/assignments/anything-else')).rejects.toThrow(/real page on this site/);
	});

	test('the existing feedback link is left byte for byte and still resolves', async () => {
		expect(await linkRows()).toEqual(before);
		const resolved = await db.asAnon(async (q) => {
			const { rows } = await q<{ t: string | null }>(`select public.app_short_link_target('feedback') as t`);
			return rows[0].t;
		});
		expect(resolved).toBe('/assignments/idea209h-syllabus');
		// Nothing was moved aside the way 0215 and 0260 move a shadowed one.
		const moves = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.app_short_link_reserved_moves where original_slug = 'feedback'`
		);
		expect(moves.rows[0].n).toBe(0);
	});

	test('the predicate is one overload, closed to every client role, from the catalog', async () => {
		const { rows } = await db.sql<{ n: number; anon: boolean; auth: boolean; svc: boolean; lits: number }>(
			`select count(*)::int as n,
			        bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon,
			        bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as auth,
			        bool_or(has_function_privilege('service_role', p.oid, 'execute')) as svc,
			        max((select count(*) from regexp_matches(p.prosrc, '''([^'']*)''', 'g')))::int as lits
			 from pg_proc p where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace`
		);
		expect(rows[0]).toEqual({ n: 1, anon: false, auth: false, svc: true, lits: 38 });
	});

	test('re-pasting the file changes nothing', async () => {
		await db.sql(SQL_0269);
		expect(await reserved('feedback')).toBe(true);
		expect(await linkRows()).toEqual(before);
	});
});
