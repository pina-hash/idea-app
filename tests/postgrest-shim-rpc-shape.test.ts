// tests/postgrest-shim-rpc-shape.test.ts
//
// THE FIXTURE'S OWN CONTROL. `tests/db/postgrest-shim.ts` called every RPC as
// `select f(...) as result` and handed back `rows[0].result`, which is right
// for a scalar-returning function and wrong twice over for a SET-RETURNING one:
// it collapses the whole set to its FIRST ROW, and it hands that row back as a
// COMPOSITE (node-postgres renders one as the raw `(a,b,c)` string) instead of
// the named columns a deployed client receives. PostgREST issues
// `select * from f(...)` and answers with an ARRAY of row objects.
//
// A DEFECT IN A FIXTURE IS WORSE THAN A DEFECT IN CODE, which is why this file
// exists at all. Nothing on screen reports it: a load driven against the broken
// shape got a value its own TypeScript said was an array, iterated it (or threw
// into its own degrade path and returned the empty answer), and the test around
// it went green -- certifying a shape production never produces. That is the
// same family as the default-privileges gap 0137 closed, where 41 assertions
// about `anon` passed vacuously because the stub set no default privileges.
//
// So every assertion here is about the SHIM, not about a feature, and the two
// halves that matter are:
//
//   * THE SET PATH RETURNS AN ARRAY OF ROW OBJECTS. Asserted with a function
//     seeded to return MORE THAN ONE ROW, because one row is exactly what the
//     broken shape also produced and would pass either way.
//   * THE SCALAR PATH IS UNCHANGED. The fix must not have widened; a shim that
//     started arraying every answer would break every scalar caller in the
//     suite in a way that reads as a feature regression.
//
// And one tripwire: `routineShape` refuses to model a bare `setof <scalar>`,
// because PostgREST answers an array of VALUES there and `select *` cannot
// produce that. No function in the migrations is that shape today. The sweep
// below asserts that over the WHOLE catalog, so the day one is written the
// fixture says so instead of quietly handing back `[{ f: 1 }]`.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import { createPostgrestShim, loadForeignKeys, routineShape } from './db/postgrest-shim';
import { loadSectionRoster } from '../src/lib/classroom/transports';

/**
 * The smallest chain that owns a set-returning function AND a scalar one:
 * 0067's `admin_list()` (`returns table`, five columns, admin-gated so it
 * answers an EMPTY SET to everyone else) and `is_admin()` (`returns boolean`).
 * 0137 last, per the harness note -- it is a sweep over what the chain above
 * created and the grant facts are only true once it has run.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let owner: SeededUser;
let admin: SeededUser;
let student: SeededUser;

/** 0067 pins the owner in the schema; every admin fixture has to use that one. */
const OWNER_EMAIL = 'apina@boscotech.edu';

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);
	owner = await createUser(db, OWNER_EMAIL, 'Owner');
	admin = await createUser(db, 'second.admin@boscotech.edu', 'Second Admin');
	student = await createUser(db, 'student@boscotech.net', 'A Student');
	// TWO rows, deliberately: one row is what the broken shim also produced.
	await db.sql(
		`insert into public.app_admins (email, is_owner, granted_by, note)
		 values ($1, true, $1, 'pinned'), ($2, false, $1, 'granted')
		 on conflict (email) do nothing`,
		[OWNER_EMAIL, admin.email]
	);
}, 300000);

afterAll(async () => {
	await db?.stop();
});

const client = (who: SeededUser) => createPostgrestShim(db, fks, who.id);

describe('the shim answers a set-returning RPC the way PostgREST does', () => {
	it('returns an ARRAY of row objects with named columns, not one composite', async () => {
		const { data, error } = await client(owner).rpc('admin_list');
		expect(error).toBeNull();

		// The three things the broken shape got wrong, each asserted on its own
		// so a partial fix cannot pass.
		expect(Array.isArray(data)).toBe(true);
		const rows = data as Array<Record<string, unknown>>;

		// THE EXPECTED VALUE COMES FROM THE TABLE, NOT FROM THE SHIM. Read as the
		// connection owner, which bypasses RLS and the function entirely, so the
		// count and the order are an independent fact about the fixture rather
		// than a restatement of what the code under test just said.
		const seeded = await db.sql<{ email: string; is_owner: boolean }>(
			`select email, is_owner from public.app_admins order by is_owner desc, email`
		);
		expect(seeded.rows.length).toBeGreaterThan(1); // one row passes either shape
		expect(rows).toHaveLength(seeded.rows.length);
		for (const row of rows) {
			expect(typeof row).toBe('object');
			expect(row).not.toBeNull();
			// Named columns, in the function's own vocabulary. A composite would
			// have been a STRING and would have none of these.
			expect(Object.keys(row).sort()).toEqual([
				'email',
				'granted_at',
				'granted_by',
				'is_owner',
				'note'
			]);
		}
		expect(rows.map((r) => r.email)).toEqual(seeded.rows.map((r) => r.email));
		expect(rows.map((r) => r.is_owner)).toEqual(seeded.rows.map((r) => r.is_owner));
		// And the pair this fixture seeded is genuinely in there.
		expect(rows.map((r) => r.email)).toContain(OWNER_EMAIL);
		expect(rows.map((r) => r.email)).toContain(admin.email);
	});

	it('answers JSON values, not the driver’s parsed ones', async () => {
		// The reason the `from()` path builds json_build_object, one call shape
		// over: PostgREST is JSON on the wire, so a timestamptz arrives as an ISO
		// STRING. node-postgres would have handed back a Date, which no deployed
		// client ever sees.
		const { data } = await client(owner).rpc('admin_list');
		const first = (data as Array<Record<string, unknown>>)[0];
		expect(typeof first.granted_at).toBe('string');
		expect(first.granted_at).not.toBeInstanceOf(Date);
		expect(Number.isNaN(Date.parse(first.granted_at as string))).toBe(false);
	});

	it('answers an EMPTY ARRAY, not null, when the set is empty', async () => {
		// A non-admin gets no rows from `admin_list` -- 0067 puts `is_admin()` in
		// the WHERE clause rather than raising, so this is the ordinary empty-set
		// path and not an error. Under the scalar call it came back `null`, which
		// is what a MISSING function looks like: a load could not tell "nobody is
		// an admin" from "this RPC is not applied yet".
		const { data, error } = await client(student).rpc('admin_list');
		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(data).not.toBeNull();
	});
});

describe('the scalar path is untouched', () => {
	it('still hands back the value itself, not an array', async () => {
		const asOwner = await client(owner).rpc('is_admin');
		expect(asOwner.error).toBeNull();
		expect(asOwner.data).toBe(true);

		const asStudent = await client(student).rpc('is_admin');
		expect(asStudent.error).toBeNull();
		expect(asStudent.data).toBe(false);
	});

	it('still reports a function that does not exist as PGRST202', async () => {
		const { data, error } = await client(owner).rpc('no_such_function_anywhere');
		expect(data).toBeNull();
		expect(error?.code).toBe('PGRST202');
	});

	it('still reports a call naming a parameter the function lacks as PGRST202', async () => {
		// The 0096 signature trap, which is what named notation buys.
		const { error } = await client(owner).rpc('admin_list', { p_not_a_parameter: 1 });
		expect(error?.code).toBe('PGRST202');
	});
});

describe('routineShape reads the catalog rather than a list', () => {
	it('classifies the two callers above from pg_proc', async () => {
		expect(await routineShape(db, 'admin_list')).toEqual({ set: true, rowObjects: true });
		expect(await routineShape(db, 'is_admin')).toEqual({ set: false, rowObjects: false });
	});

	it('answers null for a name the schema does not have', async () => {
		// Which is what puts an unapplied migration on the PGRST202 path above,
		// rather than on a guess about its shape.
		expect(await routineShape(db, 'no_such_function_anywhere')).toBeNull();
	});

	it('covers a function created AFTER the snapshot, with a positive control', async () => {
		// The point of reading the catalog per call rather than caching a list:
		// nothing has to be remembered when a migration adds one. The control is
		// that the same name answered null a moment ago.
		expect(await routineShape(db, 'shim_shape_probe')).toBeNull();
		await db.sql(
			`create function public.shim_shape_probe() returns table (a int, b text)
			 language sql stable as $$ select 1, 'x'::text union all select 2, 'y' $$;
			 grant execute on function public.shim_shape_probe() to authenticated;`
		);
		try {
			expect(await routineShape(db, 'shim_shape_probe')).toEqual({ set: true, rowObjects: true });
			const { data } = await client(student).rpc('shim_shape_probe');
			expect(data).toEqual([
				{ a: 1, b: 'x' },
				{ a: 2, b: 'y' }
			]);
		} finally {
			await db.sql('drop function public.shim_shape_probe()');
		}
	});

	it('THROWS on overloads that disagree about their shape rather than guessing', async () => {
		await db.sql(
			`create function public.shim_disagree(p_a int) returns int language sql stable as $$ select 1 $$;
			 create function public.shim_disagree(p_a int, p_b int) returns table (x int)
			   language sql stable as $$ select 2 $$;`
		);
		try {
			await expect(routineShape(db, 'shim_disagree')).rejects.toThrow(/disagree about their result shape/);
		} finally {
			await db.sql('drop function public.shim_disagree(int); drop function public.shim_disagree(int, int);');
		}
	});

	it('refuses a bare setof <scalar>, which PostgREST answers as an array of VALUES', async () => {
		await db.sql(
			`create function public.shim_scalar_set() returns setof int language sql stable
			   as $$ select 1 union all select 2 $$;
			 grant execute on function public.shim_scalar_set() to authenticated;`
		);
		try {
			expect(await routineShape(db, 'shim_scalar_set')).toEqual({ set: true, rowObjects: false });
			await expect(client(student).rpc('shim_scalar_set')).rejects.toThrow(/set of bare scalars/);
		} finally {
			await db.sql('drop function public.shim_scalar_set()');
		}
	});
});

describe('the whole migration chain, swept', () => {
	/**
	 * A TRIPWIRE, not a coverage claim. The set-returning functions in this
	 * repo are all `returns table (...)` or `returns setof <composite>`, so the
	 * `select * from f()` shape is right for every one of them. The day somebody
	 * writes `returns setof text`, the shim would silently hand back
	 * `[{ f: 'a' }]` where a client receives `['a']` -- so this asserts the
	 * absence, over the REAL catalog, with a positive control beside it so a
	 * sweep that found nothing at all cannot read as a clean result.
	 */
	it('has no set-returning function the shim would model wrong', async () => {
		const { rows } = await db.sql<{ proname: string; is_set: boolean; row_objects: boolean }>(
			`select p.proname, p.proretset as is_set,
			        (t.typtype = 'c' or coalesce(p.proargmodes, '{}'::"char"[]) && '{o,b,t}'::"char"[])
			          as row_objects
			   from pg_proc p
			   join pg_type t on t.oid = p.prorettype
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.prokind = 'f'`
		);
		expect(rows.length).toBeGreaterThan(0);
		const sets = rows.filter((r) => r.is_set);
		// POSITIVE CONTROL: the sweep can see set-returning functions at all.
		expect(sets.map((r) => r.proname)).toContain('admin_list');
		expect(sets.filter((r) => !r.row_objects).map((r) => r.proname)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The half that matters to a SHIPPED load, and the coverage hole it closes.
// ---------------------------------------------------------------------------

/**
 * `loadSectionRoster` is the call site the broken shape damaged worst, and the
 * damage was INVISIBLE at both ends.
 *
 * Its widest rung is `supabase.rpc('classroom_section_roster', ...)` (0138), a
 * `returns table`, and it hands the answer straight on as
 * `(wide.data ?? []) as ClassroomEnrollment[]`. Under the scalar call that
 * value was a node-postgres COMPOSITE -- the raw `(uuid,email,...)` string --
 * so the first thing that iterated it threw, or, where the roster was empty,
 * `rows[0].result` was `undefined` and the whole read came back as `[]` with
 * `managesReady: true`. Neither outcome is anything a client produces.
 *
 * AND NOTHING WAS DRIVING IT ANYWAY, which is the second half of the finding.
 * Instrumenting the shared shim over the whole suite recorded eight
 * `classroom_section_roster` calls and every one of them answered PGRST202 --
 * no shim-driven test's chain carries 0138 -- so every route test that reaches
 * a roster has been exercising the DEGRADE rung, with `managesReady: false`,
 * and the manager exclusion 0138 exists for was never in the payload.
 * `tests/classroom-manager-exclusion.test.ts` proves the FUNCTION thoroughly,
 * in raw SQL; what nothing proved is that the shipped transport reading it over
 * a PostgREST-shaped client gets rows back at all.
 */
const ROSTER_CHAIN = [
	// The chain `tests/classroom-manager-exclusion.test.ts` proves 0138 applies
	// over, plus 0137 and 0138 themselves. Copied rather than shortened: 0138's
	// refusal counts read responses, submissions, approvals AND notebook
	// entries, so the notebook half is a real dependency of the file, not a
	// neighbour.
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql'
] as const;

describe('a shipped load reading a `returns table` RPC', () => {
	let rdb: TestDb;
	let rfks: Awaited<ReturnType<typeof loadForeignKeys>>;
	let teacher: SeededUser;
	let sectionId: string;

	beforeAll(async () => {
		rdb = await startTestDb([...ROSTER_CHAIN]);
		rfks = await loadForeignKeys(rdb);
		teacher = await createUser(rdb, 'teacher@boscotech.edu', 'A Teacher');
		const course = await rdb.sql<{ id: string }>(
			`insert into public.classroom_courses (code, title) values ('IDEA209H', 'Engineering I Honors')
			 returning id`
		);
		const section = await rdb.sql<{ id: string }>(
			`insert into public.classroom_sections (course_id, label, teacher_email)
			 values ($1, 'Block 3', $2) returning id`,
			[course.rows[0].id, teacher.email]
		);
		sectionId = section.rows[0].id;
		// TWO students, so a set collapsed to its first row cannot pass.
		await rdb.sql(
			`insert into public.classroom_enrollments (section_id, student_email, display_name, active)
			 values ($1, 'ana@boscotech.net', 'Ana Reyes', true),
			        ($1, 'bo@boscotech.net', 'Bo Tran', true)`,
			[sectionId]
		);
	}, 300000);

	afterAll(async () => {
		await rdb?.stop();
	});

	it('gets its widest rung, with rows and a real `manages` flag', async () => {
		const supabase = createPostgrestShim(rdb, rfks, teacher.id);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await loadSectionRoster(supabase as any, sectionId);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		// The rung, not the degrade path. "Cannot tell" must never read as "yes",
		// so this flag being TRUE is the whole claim that the RPC answered.
		expect(res.data.managesReady).toBe(true);

		const rows = res.data.rows;
		expect(Array.isArray(rows)).toBe(true);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.student_email).sort()).toEqual([
			'ana@boscotech.net',
			'bo@boscotech.net'
		]);
		// A named column off a row object -- the thing a composite could not have.
		for (const row of rows) {
			expect(row.manages).toBe(false);
			expect(typeof row.display_name).toBe('string');
		}
	});

	it('and `manages` is projected, not derived, for the teacher of record', async () => {
		// A POSITIVE CONTROL for the assertion above: the flag is capable of being
		// true, so `false` on both students is an answer rather than a default.
		await rdb.sql(
			`insert into public.classroom_enrollments (section_id, student_email, display_name, active)
			 values ($1, $2, 'A Teacher', true)`,
			[sectionId, teacher.email]
		);
		const supabase = createPostgrestShim(rdb, rfks, teacher.id);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await loadSectionRoster(supabase as any, sectionId);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data.rows).toHaveLength(3);
		const mine = res.data.rows.find((r) => r.student_email === teacher.email);
		expect(mine?.manages).toBe(true);
		expect(res.data.rows.filter((r) => r.manages)).toHaveLength(1);
	});
});
