// tests/foundry-app-cap.test.ts
//
// 0141: THE FIVE-APP CAP IS GONE, AND THE THINGS AROUND IT ARE NOT.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly. Removing a check
// is the shape of change that takes something else with it silently:
//
// 1. THE CAP ITSELF. Asserted from BOTH ends of the same chain -- the cap bites
//    at 0131 and does not at 0141 -- because "a sixth app was created" proves
//    nothing on its own unless the same seed is known to have been refused one
//    migration earlier. Two chains, one assertion each, is the only shape that
//    distinguishes "the cap was removed" from "the test never reached five".
//
// 2. THE SLUG. A unique address is the app's permanent, printed, QR-coded name,
//    and the check that was deleted sat two statements above the one that
//    guards it. Nothing about removing a count should touch it, which is
//    exactly why it is worth measuring rather than reasoning about.
//
// 3. THE LOCK. `perform 1 from profiles ... for update` was written FOR the
//    count and outlives it. 0141 keeps it for a narrower job -- one person's
//    two tabs racing for one address get the considered refusal instead of a
//    constraint error naming a table -- and that job is either real or it is
//    not, so it is measured here with two genuinely concurrent transactions
//    rather than asserted in a comment.
//
// 4. THE GRANTS. A hosted Supabase project's default privileges hand every
//    function a direct `anon` grant at creation time, so a `create or replace`
//    is a place `anon` can silently come back (0137's whole subject). The ACL
//    is read off the catalog rather than inferred from the migration running.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * The Foundry chain. 0130 reuses `_classroom_deck_path_ok` from 0101 rather
 * than cloning it, which is what pulls the classroom migrations in: 0101 itself
 * recreates `classroom_delete_item` and `classroom_duplicate_item`, so it needs
 * the canonical-items chain under it.
 *
 * 0137 GOES LAST, as it does in every chain: it is a sweep over whatever the
 * chain above it created, and 0141 comes after it because that is the order the
 * files are applied in on the real project. That ordering is the point of the
 * ACL assertions below -- 0141 is a `create or replace` sitting AFTER the sweep,
 * which is precisely where a fresh `anon` grant would go unnoticed.
 */
const BASE = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0101_classroom_decks.sql',
	'0130_foundry.sql',
	'0131_foundry_service_role_writes.sql'
] as const;

/** The world as it was: the cap in force. */
const BEFORE = [...BASE] as const;

/** The world this bundle ships, sweep included. */
const AFTER = [...BASE, '0137_anon_execute_sweep.sql', '0141_foundry_app_cap_and_download.sql'] as const;

const NOTES = 'Built with plain HTML, CSS and a bit of JavaScript. No framework.';

let before: TestDb;
let after: TestDb;

/** Creates an app through the real RPC and returns its id. */
async function createApp(db: TestDb, as: SeededUser, slug: string): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3) as r`,
			[slug, 'Test app', NOTES]
		);
		return rows[0].r.app_id;
	});
}

/** The message Postgres actually produced, so a report can quote it. */
async function refusal(fn: () => Promise<unknown>): Promise<string> {
	try {
		await fn();
	} catch (err) {
		return (err as Error).message;
	}
	throw new Error('expected a refusal, but the call succeeded');
}

beforeAll(async () => {
	before = await startTestDb(BEFORE);
	after = await startTestDb(AFTER);
}, 180_000);

afterAll(async () => {
	await before?.stop();
	await after?.stop();
});

/* ========================================================================
 * 1. THE CAP, MEASURED FROM BOTH SIDES OF THE SAME SEED.
 * ===================================================================== */

describe('the five-app cap', () => {
	/**
	 * THE POSITIVE CONTROL, AND IT IS NOT OPTIONAL. Without it "the sixth app
	 * was created" is equally consistent with a test that never reached five,
	 * with a seed that silently failed, and with a chain that was missing 0130
	 * altogether. The refusal text is asserted too, because that sentence is
	 * what a student read and it is the thing being retired.
	 */
	it('refuses a sixth app at 0131, which is the world 0141 changes', async () => {
		const student = await createUser(before, 'capped@boscotech.net', 'Capped Student');
		for (let i = 1; i <= 5; i++) await createApp(before, student, `capped-app-${i}`);

		const message = await refusal(() => createApp(before, student, 'capped-app-6'));
		expect(message).toContain('which is the limit');

		const count = await before.sql(
			`select count(*)::int as n from public.student_apps where owner = $1`,
			[student.id]
		);
		expect(count.rows[0].n).toBe(5);
	});

	it('lets the same seed past five, and past ten, at 0141', async () => {
		const student = await createUser(after, 'uncapped@boscotech.net', 'Uncapped Student');
		for (let i = 1; i <= 12; i++) await createApp(after, student, `uncapped-app-${i}`);

		const count = await after.sql(
			`select count(*)::int as n from public.student_apps where owner = $1`,
			[student.id]
		);
		expect(count.rows[0].n).toBe(12);
	});

	/**
	 * THE CAP COUNTED NON-HIDDEN APPS, so a shelved one used to free a slot.
	 * Nothing counts anything now, which means hiding cannot change what a
	 * student may create -- asserted rather than assumed, because "hidden apps
	 * are excluded from the count" is the sort of clause that gets reimplemented
	 * somewhere else when the count is removed.
	 */
	it('does not consult hidden_at any more, in either direction', async () => {
		const owner = await createUser(after, 'apina@boscotech.edu', 'Owner Account');
		const student = await createUser(after, 'shelved@boscotech.net', 'Shelved Student');
		const ids: string[] = [];
		for (let i = 1; i <= 6; i++) ids.push(await createApp(after, student, `shelf-app-${i}`));

		// Shelve them all through the real admin RPC. The owner is an admin by
		// the pinned constant in 0067, with no grant needed.
		for (const id of ids) {
			await after.asUser(owner.id, (q) =>
				q(`select public.foundry_set_app_hidden($1::uuid, true, $2)`, [id, 'Under discussion'])
			);
		}

		// Six shelved apps, and a seventh is still creatable.
		await createApp(after, student, 'shelf-app-7');
		const count = await after.sql(
			`select count(*)::int as n from public.student_apps where owner = $1`,
			[student.id]
		);
		expect(count.rows[0].n).toBe(7);
	});
});

/* ========================================================================
 * 2. WHAT MUST NOT HAVE MOVED.
 * ===================================================================== */

describe('everything else about foundry_create_app is 0130`s', () => {
	it('still refuses a taken address, with the same sentence', async () => {
		const a = await createUser(after, 'slug-a@boscotech.net', 'Slug A');
		const b = await createUser(after, 'slug-b@boscotech.net', 'Slug B');
		await createApp(after, a, 'contested-address');

		const mine = await refusal(() => createApp(after, a, 'contested-address'));
		const theirs = await refusal(() => createApp(after, b, 'contested-address'));
		expect(mine).toContain('is already taken');
		expect(theirs).toContain('is already taken');
	});

	/**
	 * THE COLUMN IS THE GUARANTEE, NOT THE RPC's `exists` CHECK. 0141's header
	 * rests on this: the lock it keeps is per-PERSON and does nothing about two
	 * different people racing, so what actually makes a slug unique is the unique
	 * index. Asserted with RLS and the RPC out of the way ENTIRELY, as the
	 * connection owner, so nothing but the constraint itself can be what refuses.
	 */
	it('has a real unique constraint on the address, under the RPC', async () => {
		const a = await createUser(after, 'raw-a@boscotech.net', 'Raw A');
		await after.sql(
			`insert into public.student_apps (owner, slug, title, build_notes) values ($1, 'raw-address', 'T', $2)`,
			[a.id, NOTES]
		);
		await expect(
			after.sql(
				`insert into public.student_apps (owner, slug, title, build_notes) values ($1, 'raw-address', 'T', $2)`,
				[a.id, NOTES]
			)
		).rejects.toThrow(/unique|duplicate key/i);
	});

	it('still refuses a malformed address, a blank name and blank build notes', async () => {
		const s = await createUser(after, 'gates@boscotech.net', 'Gates');
		expect(await refusal(() => createApp(after, s, 'A'))).toContain('An address is 2 to 64');
		expect(await refusal(() => createApp(after, s, '-bad-'))).toContain('An address is 2 to 64');

		const blankTitle = await refusal(() =>
			after.asUser(s.id, (q) =>
				q(`select public.foundry_create_app($1, $2, $3)`, ['blank-title', '   ', NOTES])
			)
		);
		expect(blankTitle).toContain('Your app needs a name');

		const blankNotes = await refusal(() =>
			after.asUser(s.id, (q) =>
				q(`select public.foundry_create_app($1, $2, $3)`, ['blank-notes', 'T', ' \n\t '])
			)
		);
		expect(blankNotes).toContain('Say how you built it');
	});

	it('still refuses a caller with no session', async () => {
		const message = await refusal(() =>
			after.asAnon((q) =>
				q(`select public.foundry_create_app($1, $2, $3)`, ['anon-app', 'T', NOTES])
			)
		);
		// `anon` has no EXECUTE, so the refusal is the grant rather than the body.
		// Either sentence is a refusal; what must never happen is a row.
		expect(message).toMatch(/permission denied|signed in/i);
		const count = await after.sql(`select count(*)::int as n from public.student_apps where slug = 'anon-app'`);
		expect(count.rows[0].n).toBe(0);
	});

	it('still returns the app id and the normalized address', async () => {
		const s = await createUser(after, 'shape@boscotech.net', 'Shape');
		const r = await after.asUser(s.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; app_id: string; slug: string } }>(
				`select public.foundry_create_app($1, $2, $3) as r`,
				['  MiXeD-CaSe  ', 'Shape app', NOTES]
			);
			return rows[0].r;
		});
		expect(r.ok).toBe(true);
		expect(r.slug).toBe('mixed-case');
		expect(r.app_id).toMatch(/^[0-9a-f-]{36}$/);
	});
});

/* ========================================================================
 * 3. THE LOCK 0141 KEPT, AND WHAT IT ACTUALLY BUYS.
 * ===================================================================== */

describe('the per-person lock', () => {
	it('is still in the function body', async () => {
		const { rows } = await after.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'foundry_create_app'`
		);
		expect(rows[0].src).toContain('for update');
		expect(rows[0].src).not.toContain('which is the limit');
	});

	/**
	 * THE JOB IT STILL HAS, MEASURED WITH REAL CONCURRENCY rather than argued.
	 *
	 * Two transactions, one person, one address. T1 takes the profile lock and
	 * inserts without committing; T2 blocks AT THE LOCK, which is confirmed by
	 * polling `pg_stat_activity` rather than by sleeping -- a timing-shaped test
	 * passes on the broken code too whenever the burst happens not to overlap.
	 * T1 then commits and T2 proceeds.
	 *
	 * WITH THE LOCK, T2's `exists` check sees T1's committed row and answers with
	 * this file's own sentence. WITHOUT it, both callers pass `exists`, both
	 * insert, and the loser is answered by the unique index with
	 * `duplicate key value violates unique constraint "student_apps_slug_key"` --
	 * a storage-vendor sentence naming a table, in front of a student.
	 */
	it('turns one person`s concurrent double-submit into the considered refusal', async () => {
		const s = await createUser(after, 'race@boscotech.net', 'Racer');

		let t2Result: string = '(never ran)';

		const t1 = after.asUser(s.id, async (q) => {
			await q('begin');
			await q(`select public.foundry_create_app($1, $2, $3)`, ['raced-address', 'T', NOTES]);
			// Hold the lock until T2 is demonstrably waiting on it.
			for (let i = 0; i < 200; i++) {
				const { rows } = await after.sql<{ n: number }>(
					`select count(*)::int as n from pg_stat_activity
					 where datname = current_database() and wait_event_type = 'Lock'`
				);
				if (rows[0].n > 0) break;
				await new Promise((r) => setTimeout(r, 25));
			}
			await q('commit');
		});

		const t2 = after.asUser(s.id, async (q) => {
			// Let T1 take the lock first. It is not a synchronisation point -- if
			// T2 wins the race the assertion below is simply about T1 instead, and
			// the outcome is the same considered refusal either way.
			await new Promise((r) => setTimeout(r, 100));
			await q('begin');
			try {
				await q(`select public.foundry_create_app($1, $2, $3)`, ['raced-address', 'T', NOTES]);
				t2Result = '(succeeded)';
			} catch (err) {
				t2Result = (err as Error).message;
			}
			await q('rollback').catch(() => {});
		});

		await Promise.all([t1, t2]);

		expect(t2Result).toContain('is already taken');
		expect(t2Result).not.toContain('unique constraint');

		const count = await after.sql(
			`select count(*)::int as n from public.student_apps where slug = 'raced-address'`
		);
		expect(count.rows[0].n).toBe(1);
	}, 30_000);
});

/* ========================================================================
 * 4. THE GRANTS, READ OFF THE CATALOG.
 * ===================================================================== */

describe('0141 does not hand the function back to anon', () => {
	const SIG = 'public.foundry_create_app(text, text, text, text, text)';

	it('is executable by authenticated and by nobody else', async () => {
		const { rows } = await after.sql<{
			anon: boolean;
			auth: boolean;
			svc: boolean;
			pub: boolean;
		}>(
			`select has_function_privilege('anon', $1, 'execute') as anon,
			        has_function_privilege('authenticated', $1, 'execute') as auth,
			        has_function_privilege('service_role', $1, 'execute') as svc,
			        has_function_privilege('public', $1, 'execute') as pub`,
			[SIG]
		);
		expect(rows[0]).toEqual({ anon: false, auth: true, svc: false, pub: false });
	});

	/**
	 * THE POSITIVE CONTROL FOR THAT SWEEP. `foundry_list_apps` is granted to
	 * `authenticated` by 0130 and kept by 0137, so a chain in which every
	 * `has_function_privilege` answered false -- a broken role, a wrong signature
	 * string -- would fail here rather than passing the assertion above vacuously.
	 */
	it('while a function that IS granted still reads as granted', async () => {
		const { rows } = await after.sql<{ auth: boolean }>(
			`select has_function_privilege('authenticated', 'public.foundry_list_apps(uuid, boolean, boolean)', 'execute') as auth`
		);
		expect(rows[0].auth).toBe(true);
	});

	it('exists exactly once, so no old arity survived the replace', async () => {
		const { rows } = await after.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'foundry_create_app'`
		);
		expect(rows[0].n).toBe(1);
	});
});

/* ========================================================================
 * 5. RE-APPLIABILITY. Somebody re-pastes; a first attempt failed partway.
 * ===================================================================== */

describe('0141 re-applies', () => {
	it('runs twice with the same end state', async () => {
		const { readFileSync } = await import('node:fs');
		const sql = readFileSync(
			'supabase/migrations/0141_foundry_app_cap_and_download.sql',
			'utf8'
		);
		await after.sql(sql);
		await after.sql(sql);

		const { rows } = await after.sql<{ n: number; anon: boolean; auth: boolean }>(
			`select (select count(*)::int from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			         where ns.nspname = 'public' and p.proname = 'foundry_create_app') as n,
			        has_function_privilege('anon', 'public.foundry_create_app(text, text, text, text, text)', 'execute') as anon,
			        has_function_privilege('authenticated', 'public.foundry_create_app(text, text, text, text, text)', 'execute') as auth`
		);
		expect(rows[0]).toEqual({ n: 1, anon: false, auth: true });

		// And it still works afterwards.
		const s = await createUser(after, 'reapply@boscotech.net', 'Reapply');
		const id = await createApp(after, s, 'reapplied-app');
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
	});
});
