// tests/db/harness.ts
//
// A real Postgres, with the repo's REAL migration files applied to it,
// unmodified, in order. This is the fixture the notebook security tests run
// against.
//
// WHY A REAL DATABASE AND NOT A MOCK. Every guarantee these tests cover --
// row-level security, table privileges, the SECURITY DEFINER write path -- is
// enforced by Postgres itself. A mock would only be able to assert that the SQL
// text says what we already read it saying. So the fixture starts an embedded
// Postgres, applies the migrations verbatim from supabase/migrations, and the
// tests then behave like a real client: switch to the `authenticated` role and
// set the request.jwt.claims GUC, which is exactly what PostgREST does per
// request and what auth.uid() reads.
//
// WHICH MIGRATIONS, AND WHY THOSE. The notebook layer's dependency chain, not
// the whole history: 0001 (profiles, roles, the role_for_email derivation),
// 0003 + 0020 (the profiles columns the notebook grid reads), 0067 (the ADMIN
// tier -- is_admin() is what "chair-level" means, and note the 0067 naming
// trap: is_teacher() now RETURNS is_admin()), 0069 (the notebook itself), 0070
// (coin economy -- it sits between the two notebook migrations and shares
// 0067's current_user_email(), so applying it keeps the ordering honest), 0071
// (the notebook's own follow-up, which drops and recreates two of the RPCs
// under test) and 0075 (which replaces notebook_create_entry again, to make
// the photo conditional on the tier). The three coin migrations between them
// (0072-0074) touch nothing the notebook reads and are left out. 0078 adds
// notebook_entry_notes and its three write RPCs; it is purely additive (a new
// table and new functions), so it changes nothing an earlier suite reads.
//
// THE CHAIN GREW IN 0094, and it had to. That migration wires the notebook's
// sections and roster onto IDEA Classroom, so 0082 (classroom_sections,
// classroom_enrollments, classroom_manages_section) is now a real dependency
// of the notebook rather than a neighbouring feature -- and 0088 comes with
// it, because 0094 recreates notebook_create_entry from ITS latest definition,
// the one that writes notebook_entries.folder_id. A suite that wants 0091 on
// top still passes its own list; what changed is only that "the notebook
// chain" is a longer thing than it was.
//
// AND IN 0098, for the same kind of reason: check-ins became multi-section
// (one canonical notebook_sessions row, one notebook_session_postings row per
// section -- 0085's Classroom split applied again), which changes the shape
// every notebook suite seeds against. notebook_admin_upsert_session takes a
// uuid[] now, notebook_sessions has no section_id column, and the entries'
// composite key points at the postings table. Leaving it out would leave every
// other notebook suite testing a schema that no longer exists.
//
// HOW THE FIXTURE IS ISOLATED, which every test author here needs to know.
// The embedded Postgres CLUSTER is booted once for the whole run by
// `tests/db/cluster.ts` (vitest `globalSetup`). `startTestDb` does NOT boot a
// server: it creates a brand-new DATABASE on that shared cluster, applies the
// stub and the migrations to it, and drops it in `stop()`. So each call still
// gets a private schema, private rows and private catalogs -- a file cannot
// see anything a neighbour left behind -- while the 5.58s initdb is paid once
// instead of 47 times. `tests/db-isolation-a.test.ts` and `-b` are the pair
// that PROVE that rather than asserting it: one deliberately leaves rows
// behind, the other fails if it can see them.
//
// A test file needs no setup for this. Call startTestDb() exactly as before.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import type { ClusterAddress } from './cluster';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const STUB_SQL = fileURLToPath(new URL('./supabase-stub.sql', import.meta.url));

/** Applied in this order. See the header for why each one is here. */
export const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0088_notebook_folders.sql',
	'0094_notebook_classroom_sections.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql'
] as const;

export type QueryFn = <R extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	params?: unknown[]
) => Promise<pg.QueryResult<R>>;

export interface TestDb {
	/**
	 * The private database this handle owns on the shared cluster. Exposed so a
	 * test can tell its own database apart from a neighbour's in pg_database;
	 * tests/db-isolation-b.test.ts is the one that needs it.
	 */
	readonly databaseName: string;
	/** Runs as the connection owner: bypasses RLS. Seeding and raw assertions. */
	readonly sql: QueryFn;
	/** Runs as `authenticated` with auth.uid() = userId, the way a client does. */
	asUser<T>(userId: string, fn: (q: QueryFn) => Promise<T>): Promise<T>;
	/**
	 * Runs as `anon` with NO jwt claims — a signed-out request through
	 * PostgREST. What a public surface must actually be tested against, since
	 * `authenticated` carries grants `anon` does not.
	 */
	asAnon<T>(fn: (q: QueryFn) => Promise<T>): Promise<T>;
	/**
	 * Runs as `service_role` — a request from one of our own servers holding
	 * SUPABASE_SERVICE_ROLE_KEY, which is a different caller from every other
	 * one here: it bypasses RLS and carries grants no client has. Pass `userId`
	 * for the case where such a request also carries a signed-in subject, so
	 * auth.uid() is set; omit it for the signed-out case.
	 */
	asServiceRole<T>(fn: (q: QueryFn) => Promise<T>, userId?: string | null): Promise<T>;
	stop(): Promise<void>;
}

/**
 * A name no other file can collide with, on a cluster every file shares.
 * The counter alone would repeat across vitest worker processes, so the
 * random half is what actually makes it unique; the counter and pid just
 * make a stray database in a crashed run readable.
 */
let dbSequence = 0;
function nextDatabaseName(): string {
	dbSequence += 1;
	const salt = randomBytes(6).toString('hex');
	return `idea_test_${process.pid}_${dbSequence}_${salt}`;
}

/** A short-lived superuser connection to the maintenance database. */
async function withMaintenance<T>(
	cluster: ClusterAddress,
	fn: (client: pg.Client) => Promise<T>
): Promise<T> {
	const client = new pg.Client({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database: cluster.maintenanceDatabase
	});
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end().catch(() => {});
	}
}

/**
 * Creates a FRESH DATABASE on the shared cluster, applies the stub then every
 * migration in `migrationFiles` (defaults to MIGRATIONS, the notebook chain)
 * to it, and returns the handle the tests drive. Callers with a different
 * dependency chain (a different feature's own migrations) pass their own list
 * rather than editing the shared MIGRATIONS constant, which stays exactly what
 * the notebook tests need -- so extending the harness for a new feature can
 * never change what an existing suite applies.
 *
 * ISOLATION IS A SEPARATE DATABASE, NOT A SCHEMA AND NOT A TRANSACTION.
 * A database is the only one of the three that costs nothing to reason about:
 * separate catalogs, so a row, a sequence, a function or a policy left behind
 * by one file is not reachable from another even by name.
 *
 *   - NOT a per-file SCHEMA: the migrations name `public`, `auth` and
 *     `storage` literally and are applied verbatim (that is the whole point of
 *     this fixture), so sharing a database would mean rewriting migration SQL
 *     or bending `search_path` -- and pinning `search_path` is exactly what the
 *     SECURITY DEFINER functions under test do, so the fixture would be
 *     fighting the thing it exists to verify.
 *   - NOT transactional rollback: `asUser` deliberately does not open a
 *     transaction, because many tests assert that a statement is REJECTED and
 *     one rejection poisons every statement after it inside a transaction.
 *     Several suites also hold more than one connection at once (the pool runs
 *     up to 4) and a few run DDL, neither of which survives being wrapped.
 *
 * The migrations run per database rather than being copied from a template.
 * A template would save the measured 0.31s migration pass per file, against
 * the 5.58s boot this change removes; paying it keeps the harness's stated
 * guarantee literally true -- every test database has had the REAL migration
 * files applied to it, in order, not a byte-copy of one that did.
 */
export async function startTestDb(migrationFiles: readonly string[] = MIGRATIONS): Promise<TestDb> {
	const cluster = inject('pgCluster');
	const database = nextDatabaseName();

	await withMaintenance(cluster, (client) => client.query(`create database "${database}"`));

	const pool = new pg.Pool({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database,
		max: 4
	});

	const sql: QueryFn = (text, params) => pool.query(text, params as unknown[]);

	let stopped = false;
	const stop = async () => {
		if (stopped) return;
		stopped = true;
		await pool.end().catch(() => {});
		// WITH (FORCE) so a leaked client cannot wedge teardown; the cluster is
		// thrown away at the end of the run either way, but a failure here would
		// otherwise surface as an unrelated timeout in the NEXT file.
		await withMaintenance(cluster, (client) =>
			client.query(`drop database if exists "${database}" with (force)`)
		).catch(() => {});
	};

	try {
		await sql(readFileSync(STUB_SQL, 'utf8'));
		for (const file of migrationFiles) {
			const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
			try {
				await sql(text);
			} catch (error) {
				throw new Error(`Migration ${file} failed to apply: ${(error as Error).message}`);
			}
		}
	} catch (error) {
		await stop();
		throw error;
	}

	/**
	 * One signed-in request, the PostgREST way: set the verified-JWT claims GUC,
	 * then SET ROLE authenticated so RLS and the table grants actually apply
	 * (the connection role owns these tables and would bypass both).
	 *
	 * Deliberately NOT wrapped in a transaction: several tests assert that a
	 * statement is REJECTED, and inside a transaction the first rejection would
	 * poison every statement after it.
	 */
	const asUser = async <T>(userId: string, fn: (q: QueryFn) => Promise<T>): Promise<T> => {
		const client = await pool.connect();
		try {
			await client.query(`select set_config('request.jwt.claims', $1, false)`, [
				JSON.stringify({ sub: userId, role: 'authenticated' })
			]);
			await client.query('set role authenticated');
			const q: QueryFn = (text, params) => client.query(text, params as unknown[]);
			return await fn(q);
		} finally {
			// Reset before the connection goes back in the pool, or the next
			// checkout inherits this user's identity.
			await client.query('reset role').catch(() => {});
			await client
				.query(`select set_config('request.jwt.claims', '', false)`)
				.catch(() => {});
			client.release();
		}
	};

	/** The signed-out counterpart of asUser: role `anon`, no claims at all. */
	const asAnon = async <T>(fn: (q: QueryFn) => Promise<T>): Promise<T> => {
		const client = await pool.connect();
		try {
			await client.query(`select set_config('request.jwt.claims', '', false)`);
			await client.query('set role anon');
			const q: QueryFn = (text, params) => client.query(text, params as unknown[]);
			return await fn(q);
		} finally {
			await client.query('reset role').catch(() => {});
			client.release();
		}
	};

	/**
	 * A request from one of our own servers, holding the service key. Same
	 * mechanism as asUser -- claims GUC, then SET ROLE -- because the role
	 * switch is what makes the function grants apply at all: the connection
	 * role owns everything here and would be refused by nothing.
	 */
	const asServiceRole = async <T>(
		fn: (q: QueryFn) => Promise<T>,
		userId?: string | null
	): Promise<T> => {
		const client = await pool.connect();
		try {
			await client.query(`select set_config('request.jwt.claims', $1, false)`, [
				userId
					? JSON.stringify({ sub: userId, role: 'service_role' })
					: JSON.stringify({ role: 'service_role' })
			]);
			await client.query('set role service_role');
			const q: QueryFn = (text, params) => client.query(text, params as unknown[]);
			return await fn(q);
		} finally {
			await client.query('reset role').catch(() => {});
			await client.query(`select set_config('request.jwt.claims', '', false)`).catch(() => {});
			client.release();
		}
	};

	return { databaseName: database, sql, asUser, asAnon, asServiceRole, stop };
}

export interface SeededUser {
	id: string;
	email: string;
}

/**
 * Creates an auth.users row. The 0001 on_auth_user_created trigger derives the
 * profile and its role from the email domain, so the role is never asserted
 * here -- it is whatever role_for_email says, which is the point.
 */
export async function createUser(
	db: TestDb,
	email: string,
	fullName: string
): Promise<SeededUser> {
	const { rows } = await db.sql<{ id: string }>(
		`insert into auth.users (email, raw_user_meta_data)
		 values ($1, jsonb_build_object('full_name', $2::text))
		 returning id`,
		[email, fullName]
	);
	return { id: rows[0].id, email };
}

/**
 * A CLASSROOM section for the notebook to hang off, created through the real
 * 0082 RPCs rather than by raw insert -- the same reason the harness applies
 * real migrations instead of asserting what the SQL text says. The course is
 * create-or-get, so several sections can share one code.
 *
 * `admin` runs it because assigning a section to someone else is admin-only in
 * 0082; a teacher creating their OWN section may run it themselves.
 */
export async function createClassroomSection(
	db: TestDb,
	opts: {
		as: SeededUser;
		courseCode: string;
		courseTitle?: string;
		label: string;
		teacherEmail: string;
	}
): Promise<string> {
	return db.asUser(opts.as.id, async (q) => {
		const course = await q<{ result: { course_id: string } }>(
			'select public.classroom_upsert_course($1, $2) as result',
			[opts.courseCode, opts.courseTitle ?? opts.courseCode]
		);
		const section = await q<{ result: { section_id: string } }>(
			'select public.classroom_upsert_section($1, $2, $3, $4) as result',
			[course.rows[0].result.course_id, opts.label, null, opts.teacherEmail]
		);
		return section.rows[0].result.section_id;
	});
}

/**
 * Puts a student on a section's roster. The email is the key (0082), so this
 * works for an account that does not exist yet -- which is exactly the state
 * the notebook grid has to survive.
 */
export async function enrollStudent(
	db: TestDb,
	opts: { as: SeededUser; sectionId: string; email: string; displayName: string; active?: boolean }
): Promise<void> {
	await db.asUser(opts.as.id, (q) =>
		q('select public.classroom_set_enrollment($1, $2, $3, $4)', [
			opts.sectionId,
			opts.email,
			opts.displayName,
			opts.active ?? true
		])
	);
}
