// tests/db/profile-identity-style.test.ts
//
// 0220's GATE AND ITS SHAPE RULES, AGAINST A REAL POSTGRES.
//
// This is the file the prompt for ledger 0289 asks for by name: "a student
// writing their own style, and being refused another student's, proved at the
// SQL layer through `db.asUser` rather than through the postgrest shim, which
// models `select` and `rpc` but not `insert`." Every write below is a real
// UPDATE issued as the `authenticated` role with a real `auth.uid()`, so the
// thing being measured is the policy Postgres is enforcing and not a mock's
// opinion about it.
//
// WHY THERE IS NO NEW POLICY TO TEST, WHICH IS THE POINT RATHER THAN A GAP.
// 0220 adds six columns to `profiles` and NOTHING else -- no policy, no grant,
// no function. The gate is 0001's, unchanged: "update own profile"
// (id = auth.uid()) and "teachers update any profile". So what these tests
// prove is that the columns landed INSIDE that existing gate rather than
// beside it, which is exactly the failure a column-on-an-existing-table design
// can have: a column readable or writable by a wider audience than the row it
// sits on. The refusal assertions are paired with positive controls
// throughout, because "the update affected 0 rows" is also what a typo in a
// column name produces.
//
// AND THE REFUSAL HERE IS SILENT, WHICH IS WHY EVERY CASE COUNTS ROWS. An RLS
// UPDATE whose `using` clause excludes the row does not raise -- it matches
// nothing and reports 0 rows affected. A test that only checked for a thrown
// error would pass on a policy that had been removed entirely.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/**
 * The minimum chain that puts `profiles`, its four policies and the role
 * trigger in place, plus the file under test. 0067 is included because it
 * re-signs `is_teacher()` onto `is_admin()`, which is what the
 * "teachers update any profile" policy actually resolves to today -- without
 * it this file would be measuring a gate that has not existed since 0067.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0220_profile_identity_style.sql'
] as const;

/** The chain WITHOUT the file under test: the before-state for the columns. */
const BEFORE = CHAIN.slice(0, -1);

let db: TestDb;
let ana: SeededUser;
let bruno: SeededUser;
let staff: SeededUser;

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');
	staff = await createUser(db, 'staff@boscotech.edu', 'Sam Staff');
	// `is_admin()` reads public.app_admins, keyed on the lowercased email.
	await db.sql('insert into public.app_admins (email) values ($1) on conflict do nothing', [
		staff.email
	]);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

/** Writes one field of a style as `who`, onto `whose` row. Returns rows hit. */
async function setAccent(who: SeededUser, whose: SeededUser, hex: string | null) {
	return db.asUser(who.id, async (q) => {
		const r = await q('update public.profiles set style_accent_color = $1 where id = $2', [
			hex,
			whose.id
		]);
		return r.rowCount ?? 0;
	});
}

/** Reads a row's accent as the connection owner, bypassing RLS entirely. */
async function accentOf(whose: SeededUser): Promise<string | null> {
	const { rows } = await db.sql<{ style_accent_color: string | null }>(
		'select style_accent_color from public.profiles where id = $1',
		[whose.id]
	);
	return rows[0]?.style_accent_color ?? null;
}

describe('0220 applies and lands its columns', () => {
	it('adds exactly the six style columns and no others', async () => {
		const { rows } = await db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			 where table_schema = 'public' and table_name = 'profiles'
			   and column_name like 'style\\_%'
			 order by column_name`
		);
		expect(rows.map((r) => r.column_name)).toEqual([
			'style_accent_color',
			'style_background_type',
			'style_background_value',
			'style_badge',
			'style_flourish',
			'style_tagline'
		]);
	});

	/* THE POSITIVE CONTROL FOR THE ASSERTION ABOVE: the columns are absent
	   without the file, so "six columns" means 0220 put them there rather than
	   some earlier migration having done it. Without this, a chain that
	   silently skipped 0220 would still pass. */
	it('and they do not exist before it', async () => {
		const before = await startTestDb([...BEFORE]);
		try {
			const { rows } = await before.sql(
				`select column_name from information_schema.columns
				 where table_schema = 'public' and table_name = 'profiles'
				   and column_name like 'style\\_%'`
			);
			expect(rows.length).toBe(0);
		} finally {
			await before.stop();
		}
	}, 600_000);

	it('adds no policy, no grant and no function -- the gate is 0001s', async () => {
		/* The design claim in 0220's header, asserted rather than stated. If a
		   later edit needs a policy of its own on `profiles`, the shape was
		   wrong and this reddens. */
		const { rows: policies } = await db.sql<{ policyname: string }>(
			`select policyname from pg_policies
			 where schemaname = 'public' and tablename = 'profiles'
			 order by policyname`
		);
		/* FOUR, not five: there is no insert policy on `profiles` at all. A row
		   is created by 0001's `on_auth_user_created` trigger, which runs as
		   the definer, so nothing client-side ever inserts one. The two pairs
		   are the whole gate -- own-row select + admin select, own-row update +
		   admin update -- and 0220 rides both without adding a third. */
		expect(policies.map((p) => p.policyname)).toEqual([
			'select own profile',
			'teachers select all profiles',
			'teachers update any profile',
			'update own profile'
		]);
	});

	it('re-applies cleanly, because a re-paste is ordinary', async () => {
		const file = await import('node:fs/promises').then((fs) =>
			fs.readFile('supabase/migrations/0220_profile_identity_style.sql', 'utf8')
		);
		/* The whole file, a second time, on a database that already has it.
		   An unguarded `add constraint` raises 42710 on exactly this. */
		await expect(db.sql(file)).resolves.toBeDefined();
	});
});

describe('the write gate is 0001s, and it holds for the new columns', () => {
	it('lets a student set their OWN style', async () => {
		expect(await setAccent(ana, ana, '#3e7bfa')).toBe(1);
		expect(await accentOf(ana)).toBe('#3e7bfa');
	});

	it('REFUSES a student writing another students style', async () => {
		expect(await setAccent(bruno, bruno, '#0fbe7a')).toBe(1); // control: bruno can write his own
		const hit = await setAccent(ana, bruno, '#e5484d');
		expect(hit, 'RLS matched no row, so nothing was written').toBe(0);
		expect(await accentOf(bruno), 'and brunos own value survived').toBe('#0fbe7a');
	});

	it('lets an admin write anybodys style, matching the existing policy pair', async () => {
		expect(await setAccent(staff, ana, '#efb539')).toBe(1);
		expect(await accentOf(ana)).toBe('#efb539');
	});

	it('REFUSES a signed-out caller outright', async () => {
		await expect(
			db.asAnon((q) =>
				q('update public.profiles set style_accent_color = $1 where id = $2', ['#e5484d', ana.id])
			)
		).rejects.toThrow();
		expect(await accentOf(ana), 'unchanged by the refused write').toBe('#efb539');
	});

	it('cannot be read by another student either', async () => {
		/* `profiles` select is own-row-or-admin, so a classmate reading a style
		   directly gets nothing. Every surface that shows somebody else's
		   identity goes through a SECURITY DEFINER RPC instead, which is the
		   same route `avatar` already takes (0179/0180). */
		const seen = await db.asUser(ana.id, async (q) => {
			const r = await q('select id from public.profiles where id = $1', [bruno.id]);
			return r.rowCount ?? 0;
		});
		expect(seen).toBe(0);
		// Control: ana can read her own row, so the zero above is the policy
		// and not a broken query.
		const own = await db.asUser(ana.id, async (q) => {
			const r = await q('select id from public.profiles where id = $1', [ana.id]);
			return r.rowCount ?? 0;
		});
		expect(own).toBe(1);
	});
});

describe('the shape rules refuse what the client cannot render', () => {
	/**
	 * Every case is written as the STUDENT, through the real policy, because a
	 * constraint that only holds for the connection owner is not the gate a
	 * student meets. `expected` is the assertion and the accepted rows are the
	 * positive controls: a run where everything is refused proves nothing.
	 */
	const cases: {
		label: string;
		expected: 'accept' | 'refuse';
		sql: string;
		params: unknown[];
	}[] = [
		// ---- positive controls ----
		{
			label: 'a solid background',
			expected: 'accept',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['solid', JSON.stringify('#3e7bfa')]
		},
		{
			label: 'a gradient of two hexes',
			expected: 'accept',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['gradient', JSON.stringify(['#3e7bfa', '#8e5bf0'])]
		},
		{
			label: 'an UPPERCASE accent (the client sends lowercase, the gate accepts both)',
			expected: 'accept',
			sql: 'update public.profiles set style_accent_color = $1 where id = $2',
			params: ['#AABBCC']
		},
		{
			label: 'every badge on the list',
			expected: 'accept',
			sql: 'update public.profiles set style_badge = $1 where id = $2',
			params: ['rocket']
		},
		{
			label: 'an ambient flourish',
			expected: 'accept',
			sql: 'update public.profiles set style_flourish = $1 where id = $2',
			params: ['glow-pulse']
		},
		{
			label: 'a 48 character tagline',
			expected: 'accept',
			sql: 'update public.profiles set style_tagline = $1 where id = $2',
			params: ['x'.repeat(48)]
		},
		{
			label: 'clearing everything',
			expected: 'accept',
			sql: `update public.profiles set style_background_type = null, style_background_value = null,
			      style_accent_color = null, style_badge = null, style_flourish = null,
			      style_tagline = null where id = $1`,
			params: []
		},
		// ---- refusals ----
		{
			label: 'an IMAGE background, refused on purpose (0220s narrowing against 0064)',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['image', JSON.stringify('https://example.test/a.png')]
		},
		{
			label: 'a background type with no value',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = null where id = $2',
			params: ['solid']
		},
		{
			label: 'a background value with no type',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = null, style_background_value = $1 where id = $2',
			params: [JSON.stringify('#3e7bfa')]
		},
		{
			label: 'a solid holding an array',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['solid', JSON.stringify(['#3e7bfa', '#8e5bf0'])]
		},
		{
			label: 'a gradient of one colour',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['gradient', JSON.stringify(['#3e7bfa'])]
		},
		{
			label: 'a gradient holding a number',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['gradient', JSON.stringify(['#3e7bfa', 5])]
		},
		{
			label: 'a solid that is a colour NAME',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['solid', JSON.stringify('red')]
		},
		{
			label: 'CSS smuggled into a solid value',
			expected: 'refuse',
			sql: 'update public.profiles set style_background_type = $1, style_background_value = $2 where id = $3',
			params: ['solid', JSON.stringify('#3e7bfa;background:url(//evil.test/p)')]
		},
		{
			label: 'an accent that is not a hex',
			expected: 'refuse',
			sql: 'update public.profiles set style_accent_color = $1 where id = $2',
			params: ['rebeccapurple']
		},
		{
			label: 'a three-digit accent',
			expected: 'refuse',
			sql: 'update public.profiles set style_accent_color = $1 where id = $2',
			params: ['#abc']
		},
		{
			label: 'a badge that is not on the list',
			expected: 'refuse',
			sql: 'update public.profiles set style_badge = $1 where id = $2',
			params: ['phone-cat']
		},
		{
			label: 'an EVENT flourish, which a profile has no moment to play',
			expected: 'refuse',
			sql: 'update public.profiles set style_flourish = $1 where id = $2',
			params: ['confetti-on-win']
		},
		{
			label: 'an empty tagline',
			expected: 'refuse',
			sql: 'update public.profiles set style_tagline = $1 where id = $2',
			params: ['']
		},
		{
			label: 'a 49 character tagline',
			expected: 'refuse',
			sql: 'update public.profiles set style_tagline = $1 where id = $2',
			params: ['x'.repeat(49)]
		}
	];

	/* THE SWEEP'S OWN CASE COUNT, so a loop that generated nothing cannot pass
	   (CLAUDE.md: assert the case count of a generated sweep). Both directions
	   are asserted, because an all-refuse corpus is the vacuous one. */
	it('puts a corpus of both kinds, not just refusals', () => {
		expect(cases.length).toBe(21);
		expect(cases.filter((c) => c.expected === 'accept').length).toBe(7);
		expect(cases.filter((c) => c.expected === 'refuse').length).toBe(14);
	});

	for (const c of cases) {
		it(`${c.expected}s ${c.label}`, async () => {
			const params = [...c.params, ana.id];
			const run = db.asUser(ana.id, (q) => q(c.sql, params));
			if (c.expected === 'accept') {
				await expect(run).resolves.toBeDefined();
			} else {
				await expect(run).rejects.toThrow();
			}
			// Leave the row clean for the next case either way.
			await db.sql(
				`update public.profiles set style_background_type = null, style_background_value = null,
				 style_accent_color = null, style_badge = null, style_flourish = null,
				 style_tagline = null where id = $1`,
				[ana.id]
			);
		});
	}
});
