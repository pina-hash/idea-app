/**
 * WHO MAY WRITE A MATERIAL (0208), ASKED OF THE REAL FUNCTIONS ON A REAL
 * POSTGRES WITH THE REAL MIGRATION CHAIN APPLIED.
 *
 * TWO REFUSALS, EACH WITH A SIGNED-IN PEER CONTROL. A denial test whose only
 * negative case is "not signed in" proves almost nothing -- every function in
 * this schema refuses a caller with no session. What has to be measured is that
 * a perfectly ordinary signed-in STUDENT cannot write a shared material, and
 * that a perfectly ordinary signed-in student cannot touch ANOTHER student's
 * custom one. Both peers here hold real sessions, real profiles and real
 * enrollments; the only thing they lack is the specific right being asked for.
 *
 * AND EVERY REFUSAL IS PAIRED WITH THE POSITIVE IT MIRRORS, in the same
 * `it`, because a gate that refuses everybody passes every denial assertion
 * ever written about it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let alice: SeededUser;
let bob: SeededUser;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

const rowsFor = async <T extends Record<string, unknown>>(
	user: SeededUser,
	sql: string,
	params: unknown[] = []
): Promise<T[]> => db.asUser(user.id, async (q) => (await q<T>(sql, params)).rows);

interface Material extends Record<string, unknown> {
	id: string;
	slug: string;
	owner: string | null;
	name: string;
	density_g_cm3: string | number;
	thicknesses_in: string | number[];
	retired_at: string | null;
	source_verified: boolean;
}

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	admin = await createUser(db, 'mat.admin@boscotech.edu', 'Mat Admin');
	teacher = await createUser(db, 'mat.teacher@boscotech.edu', 'Mat Teacher');
	alice = await createUser(db, 'mat.alice@boscotech.net', 'Alice');
	bob = await createUser(db, 'mat.bob@boscotech.net', 'Bob');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [admin.email]);
}, 600_000);

afterAll(async () => db?.stop());

describe('a shared material is an admin decision', () => {
	it('refuses a signed-in student and a signed-in NON-ADMIN TEACHER, and accepts the admin', async () => {
		await expect(
			call(alice, "public.ideacad_material_save_global(null, 'brass', 'Brass', 8.5, array[0.0625]::numeric[], null, 'ASTM B36', false)")
		).rejects.toThrow(/Only a site admin/);
		/* THE TEACHER IS THE CONTROL THAT MATTERS. `teacher` is auto-granted by
		   the email domain and on its own grants nothing; a gate written against
		   the ROLE rather than against `is_admin()` would let this one through
		   and the student assertion above would still pass. */
		await expect(
			call(teacher, "public.ideacad_material_save_global(null, 'brass', 'Brass', 8.5, array[0.0625]::numeric[], null, 'ASTM B36', false)")
		).rejects.toThrow(/Only a site admin/);

		const saved = await call<Material>(
			admin,
			"public.ideacad_material_save_global(null, 'brass', 'Brass', 8.5, array[0.0625, 0.125]::numeric[], 'shop stock', 'ASTM B36', false)"
		);
		expect(saved).toMatchObject({ slug: 'brass', owner: null, name: 'Brass' });
		expect(Number(saved.density_g_cm3)).toBe(8.5);
	});

	it('refuses a student EDIT of a shared material the admin just made', async () => {
		const rows = await rowsFor<Material>(admin, `select id from public.ideacad_materials where slug = 'brass'`);
		const id = rows[0].id;
		await expect(
			call(alice, "public.ideacad_material_save_global($1::uuid, 'brass', 'Not brass', 1, array[0.125]::numeric[], null, 'x', true)", [id])
		).rejects.toThrow(/Only a site admin/);
		const after = await rowsFor<Material>(admin, `select name from public.ideacad_materials where id = $1`, [id]);
		expect(after[0].name).toBe('Brass');
	});

	it('refuses a shared slug in the custom namespace, so a custom id can never be shadowed', async () => {
		await expect(
			call(admin, "public.ideacad_material_save_global(null, 'custom-sneaky', 'Sneaky', 1, array[0.125]::numeric[], null, 'x', false)")
		).rejects.toThrow(/cannot start with custom-/);
	});

	it('refuses a density outside the bounds and a material with no named source', async () => {
		await expect(
			call(admin, "public.ideacad_material_save_global(null, 'lead', 'Lead', 0, array[0.125]::numeric[], null, 'x', false)")
		).rejects.toThrow(/Density must be/);
		await expect(
			call(admin, "public.ideacad_material_save_global(null, 'lead', 'Lead', 11.3, array[0.125]::numeric[], null, '   ', false)")
		).rejects.toThrow(/published source/);
		/* The positive: the same call with both fixed lands. */
		const ok = await call<Material>(
			admin,
			"public.ideacad_material_save_global(null, 'lead', 'Lead', 11.3, array[0.125]::numeric[], null, 'CRC Handbook', false)"
		);
		expect(ok.slug).toBe('lead');
	});
});

describe('a custom material belongs to the student who made it', () => {
	let aliceMaterialId = '';

	it('lets a student add their own, with no identity parameter to forge', async () => {
		const made = await call<Material>(
			alice,
			"public.ideacad_material_save_custom(null, 'My PETG at 40%', 0.53, array[0.125, 0.25]::numeric[], 'weighed it')"
		);
		aliceMaterialId = made.id;
		expect(made.owner).toBe(alice.id);
		expect(made.slug.startsWith('custom-')).toBe(true);
		expect(Number(made.density_g_cm3)).toBe(0.53);
	});

	it('refuses a custom material with no thickness, because a thickness list is the lesson', async () => {
		await expect(
			call(alice, "public.ideacad_material_save_custom(null, 'Vapour', 1, array[]::numeric[], null)")
		).rejects.toThrow(/at least one thickness/);
	});

	it('refuses a SIGNED-IN PEER editing it, and lets the owner edit it', async () => {
		await expect(
			call(bob, "public.ideacad_material_save_custom($1::uuid, 'Bob was here', 9, array[0.125]::numeric[], null)", [
				aliceMaterialId
			])
		).rejects.toThrow(/only change your own material/);
		/* The admin is a peer here too: a shared-material admin is not an owner
		   of somebody's private material, and this is what says so. */
		await expect(
			call(admin, "public.ideacad_material_save_custom($1::uuid, 'Admin was here', 9, array[0.125]::numeric[], null)", [
				aliceMaterialId
			])
		).rejects.toThrow(/only change your own material/);

		const mine = await call<Material>(
			alice,
			"public.ideacad_material_save_custom($1::uuid, 'My PETG at 60%', 0.78, array[0.125]::numeric[], null)",
			[aliceMaterialId]
		);
		expect(mine.name).toBe('My PETG at 60%');
		expect(Number(mine.density_g_cm3)).toBe(0.78);
	});

	it('is invisible to every other signed-in caller, admin included', async () => {
		const forAlice = await rowsFor<Material>(alice, `select id from public.ideacad_materials where owner is not null`);
		expect(forAlice.map((r) => r.id)).toEqual([aliceMaterialId]);
		for (const peer of [bob, teacher, admin]) {
			const seen = await rowsFor<Material>(peer, `select id from public.ideacad_materials where owner is not null`);
			expect(seen, `${peer.email} can see somebody else's custom material`).toEqual([]);
		}
		/* THE POSITIVE CONTROL FOR THAT SWEEP. The same three callers DO read the
		   shared library, so the empty results above are the policy working and
		   not a read that returned nothing for an unrelated reason. */
		for (const peer of [bob, teacher, admin]) {
			const shared = await rowsFor<Material>(peer, `select id from public.ideacad_materials where owner is null`);
			expect(shared.length).toBeGreaterThan(6);
		}
	});
});

describe('retire is the only removal there is, and it removes nothing', () => {
	it('refuses a student retiring a shared material, and lets the admin do it', async () => {
		const rows = await rowsFor<Material>(admin, `select id from public.ideacad_materials where slug = 'lead'`);
		const id = rows[0].id;
		await expect(call(alice, 'public.ideacad_material_set_retired($1::uuid, true)', [id])).rejects.toThrow(
			/Only a site admin/
		);
		const retired = await call<Material>(admin, 'public.ideacad_material_set_retired($1::uuid, true)', [id]);
		expect(retired.retired_at).not.toBeNull();

		/* THE ROW IS STILL THERE AND STILL READABLE, which is the property the
		   whole retirement design rests on: a saved concept naming `lead` still
		   resolves. A delete would pass "it is no longer offered" just as well. */
		const still = await rowsFor<Material>(alice, `select id, density_g_cm3 from public.ideacad_materials where id = $1`, [id]);
		expect(still.length).toBe(1);
		expect(Number(still[0].density_g_cm3)).toBe(11.3);

		const restored = await call<Material>(admin, 'public.ideacad_material_set_retired($1::uuid, false)', [id]);
		expect(restored.retired_at).toBeNull();
	});

	it('lets a student retire their OWN and refuses a peer retiring it', async () => {
		const mine = await rowsFor<Material>(alice, `select id from public.ideacad_materials where owner = $1`, [alice.id]);
		const id = mine[0].id;
		/* Bob cannot even SEE the row, so the function answers the
		   does-not-exist refusal rather than the not-yours one -- "not found" and
		   "not yours" reading the same is the repo's own probing rule. */
		await expect(call(bob, 'public.ideacad_material_set_retired($1::uuid, true)', [id])).rejects.toThrow(
			/does not exist|only retire your own/
		);
		const off = await call<Material>(alice, 'public.ideacad_material_set_retired($1::uuid, true)', [id]);
		expect(off.retired_at).not.toBeNull();
		const on = await call<Material>(alice, 'public.ideacad_material_set_retired($1::uuid, false)', [id]);
		expect(on.retired_at).toBeNull();
	});
});

describe('there is no client write path that is not one of the three functions', () => {
	it('gives no client role insert, update, delete or truncate on the table', async () => {
		const { rows } = await db.sql<{ role_name: string; priv: string }>(
			`select rp.role_name, rp.priv
			 from pg_class c
			 join pg_namespace n on n.oid = c.relnamespace
			 cross join (
				select roles.role_name, privs.priv
				from (values ('anon'), ('authenticated')) as roles(role_name)
				cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privs(priv)
			 ) rp
			 where n.nspname = 'public' and c.relname = 'ideacad_materials'
			   and has_table_privilege(rp.role_name, c.oid, rp.priv)
			 order by 1, 2`
		);
		expect(rows).toEqual([{ role_name: 'authenticated', priv: 'SELECT' }]);
	});

	it('carries exactly one policy, and it is a SELECT policy', async () => {
		const { rows } = await db.sql<{ cmd: string }>(
			`select cmd from pg_policies where schemaname = 'public' and tablename = 'ideacad_materials'`
		);
		expect(rows.map((r) => r.cmd)).toEqual(['SELECT']);
	});

	it('refuses a direct insert by a signed-in student even so', async () => {
		await expect(
			db.asUser(alice.id, (q) =>
				q(
					`insert into public.ideacad_materials (slug, owner, name, density_g_cm3, source)
					 values ('sneaky', null, 'Sneaky', 1, 'x')`
				)
			)
		).rejects.toThrow();
	});
});
