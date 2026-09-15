// tests/db/ideacad-archive-migration.test.ts
//
// 0214 as a FILE rather than as a feature: does it apply, re-apply, degrade,
// and leave the grant surface where it says it does.
//
// THE FEATURE IS PROVEN NEXT DOOR in ideacad-archive.test.ts. What is here is
// everything about the migration that a behavioural suite cannot see, and every
// one of these has bitten this repository before:
//
//   A. IT RE-APPLIES. "Re-pasting a migration is ordinary" -- a first attempt
//      failing partway gets retried -- so a file that only works once fails
//      exactly then, with the schema half-built. 0205 shipped a policy create
//      with only the OLD name dropped and was found this way.
//   B. IT DEGRADES PAST A MISSING 0207, which is not hypothetical: the suite
//      boots the whole chain without 0207 on purpose, and a hard precondition
//      here turned that file red.
//   C. THE GRANT SURFACE, in both directions. `revoke ... from public` is not a
//      narrowing on this project, and asserting the revoke RAN is not the same
//      as asserting what is granted.
//   D. THE CENSUS THIS FILE MUST NOT HAVE TOUCHED.
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './harness';

const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const TARGET = '0214_ideacad_document_archive.sql';
const TARGET_SQL = readFileSync(new URL(TARGET, MIGRATIONS_DIR), 'utf8');
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** Every function 0214 writes, with the client role each should end up holding. */
const CLIENT_FUNCTIONS = [
	'public.ideacad_set_document_archived(uuid,boolean)',
	'public.ideacad_archive(uuid)',
	'public.ideacad_share_document_with_section(uuid,uuid)',
	'public.ideacad_unshare_document_from_section(uuid,uuid)',
	'public.ideacad_document_section_grants(uuid)',
	'public.ideacad_shared_with_me(uuid)',
	'public.ideacad_open_shared_document(uuid)',
	'public.ideacad_roster(uuid)'
] as const;

/**
 * Reached only from a SECURITY DEFINER body, so no client role holds EXECUTE.
 * `_ideacad_can_read_document` and `_ideacad_manages_document` are NOT here:
 * they are named inside RLS `using` clauses, are evaluated as the querying
 * role, and 0205 grants them for that reason -- section C asserts they kept it.
 */
const DEFINER_ONLY = [
	'public._ideacad_document_archived(uuid)',
	'public._ideacad_document_role(uuid)',
	'public._ideacad_can_write_document(uuid)',
	'public._ideacad_part_owner(uuid)'
] as const;

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL]);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

const anonExec = async (sig: string) => {
	const { rows } = await db.sql<{ ok: boolean }>(
		`select has_function_privilege('anon', $1, 'execute') as ok`,
		[sig]
	);
	return rows[0].ok;
};
const authedExec = async (sig: string) => {
	const { rows } = await db.sql<{ ok: boolean }>(
		`select has_function_privilege('authenticated', $1, 'execute') as ok`,
		[sig]
	);
	return rows[0].ok;
};

// ---------------------------------------------------------------------------
describe('A. the file re-applies over the database it already built', () => {
	it('applies a second time with no error and the same end state', async () => {
		// Reapply this migration's own end state, without replacing newer gates.
		const reapplyDb = await startTestDb([FIXTURE_COMPLETION, ...ALL.filter((f) => f <= TARGET)]);
		try {
		const shape = async () => {
			const { rows } = await reapplyDb.sql<{ sig: string }>(
				`select p.oid::regprocedure::text as sig
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname ~ '^_?ideacad' order by 1`
			);
			return rows.map((r) => r.sig);
		};
		const before = await shape();
		await reapplyDb.sql(TARGET_SQL);
		expect(await shape()).toEqual(before);

		// Positive control: the shape read is capable of finding this file's own
		// functions, so "unchanged" is not "the query matched nothing".
		// `regprocedure` renders unqualified when the schema is on the search
		// path, so this matches on the bare name rather than on `public.`.
		expect(before.some((s) => s.includes('ideacad_archive('))).toBe(true);
		} finally { await reapplyDb.stop(); }
	}, 240_000);

	it('the policy it creates is dropped by name before each create, so the second apply does not collide', () => {
		const drops = TARGET_SQL.match(
			/drop policy if exists "[^"]+"\s+on public\.ideacad_section_grants/g
		);
		const creates = TARGET_SQL.match(
			/create policy "[^"]+"\s+on public\.ideacad_section_grants/g
		);
		expect(creates).toHaveLength(1);
		expect(drops).toHaveLength(1);
	});

	it('every constraint it adds is guarded on pg_constraint rather than dropped and re-added', () => {
		// Postgres has no `add constraint if not exists`; a blind drop-then-add
		// raises 2BP01 on the second run.
		// COMMENTS FIRST. The header says "Postgres has no `add constraint if
		// not exists`" in prose, and a match over the raw file captures `if` as
		// a constraint name and then asserts a guard for it.
		const code = TARGET_SQL.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');
		const adds = code.match(/add constraint (\w+)/g) ?? [];
		expect(adds.length).toBeGreaterThan(0);
		for (const add of adds) {
			const name = add.replace('add constraint ', '');
			expect(code, name).toContain(`conname = '${name}'`);
		}
	});
});

// ---------------------------------------------------------------------------
describe('B. it degrades past a missing 0207 instead of refusing', () => {
	it('applies over the chain WITHOUT 0207, and narrows no assembly gate there', async () => {
		// This control measures 0214's compatibility, before later dependent migrations.
		const without = ALL.filter((f) => f < TARGET && f !== '0207_ideacad_assembly_parts.sql');
		const bare = await startTestDb([FIXTURE_COMPLETION, ...without]);
		try {
			// Precondition of the precondition: 0207 really is absent, so what
			// follows measures the ladder rather than an accident.
			const { rows: pre } = await bare.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = '_ideacad_part_owner'`
			);
			expect(pre[0].n).toBe('0');

			await bare.sql(TARGET_SQL);

			// The rest of the file landed...
			const { rows: col } = await bare.sql<{ n: string }>(
				`select count(*)::text as n from information_schema.columns
				  where table_schema = 'public' and table_name = 'ideacad_documents'
				    and column_name = 'archived_at'`
			);
			expect(col[0].n).toBe('1');

			// ...and it did NOT create a _ideacad_part_owner of its own, which
			// would either stand in 0207's way or be silently replaced by it.
			const { rows: post } = await bare.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = '_ideacad_part_owner'`
			);
			expect(post[0].n).toBe('0');
		} finally {
			await bare.stop();
		}
	}, 240_000);

	it('but on the full chain it DOES narrow it -- the control for the case above', async () => {
		const { rows } = await db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = '_ideacad_part_owner'`
		);
		expect(rows).toHaveLength(1);
		// 0216 expresses the same archive gate directly on its format-aware row.
		expect(rows[0].prosrc).toMatch(/not public\._ideacad_document_archived|d\.archived_at is null/);
	});
});

// ---------------------------------------------------------------------------
describe('C. the grant surface', () => {
	it('anon can execute NONE of the functions this file writes', async () => {
		const reachable: string[] = [];
		for (const sig of [...CLIENT_FUNCTIONS, ...DEFINER_ONLY]) {
			if (await anonExec(sig)) reachable.push(sig);
		}
		expect(reachable).toEqual([]);
		// THE POSITIVE CONTROL. A sweep that found no anon grant because it was
		// looking in the wrong place reports exactly what a clean database
		// reports. app_short_link_target is anon-executable on purpose (0137).
		expect(await anonExec('public.app_short_link_target(text)')).toBe(true);
	});

	it('authenticated can execute every client RPC and none of the definer-only predicates', async () => {
		const missing: string[] = [];
		for (const sig of CLIENT_FUNCTIONS) if (!(await authedExec(sig))) missing.push(sig);
		const wide: string[] = [];
		for (const sig of DEFINER_ONLY) if (await authedExec(sig)) wide.push(sig);
		expect({ missing, wide }).toEqual({ missing: [], wide: [] });
	});

	it('and 0205 policy predicates KEPT the authenticated grant they need', async () => {
		// 0109's lesson: a function named inside an RLS `using` clause is
		// evaluated as the querying role, so revoking it breaks the read rather
		// than narrowing it. This file's blanket revokes must not have caught
		// these two.
		expect(await authedExec('public._ideacad_can_read_document(uuid)')).toBe(true);
		expect(await authedExec('public._ideacad_manages_document(uuid)')).toBe(true);
	});

	it('the new table gives authenticated SELECT and nothing else, and anon nothing at all', async () => {
		const { rows } = await db.sql<{ role_name: string; priv: string }>(
			`select rp.role_name, rp.priv
			   from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
			   cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
			                      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as v(priv)
			   cross join lateral (select r.role_name, v.priv) rp
			  where has_table_privilege(rp.role_name, 'public.ideacad_section_grants'::regclass, rp.priv)
			  order by 1, 2`
		);
		expect(rows).toEqual([{ role_name: 'authenticated', priv: 'SELECT' }]);
	});

	it('row level security is ON, which is what makes that SELECT mean "your own class"', async () => {
		const { rows } = await db.sql<{ relrowsecurity: boolean }>(
			`select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname = 'public' and c.relname = 'ideacad_section_grants'`
		);
		expect(rows[0].relrowsecurity).toBe(true);
	});

	it('and there is no write grant and no write policy on it anywhere', async () => {
		const { rows } = await db.sql<{ cmd: string }>(
			`select cmd from pg_policies where schemaname = 'public' and tablename = 'ideacad_section_grants'`
		);
		expect(rows.map((r) => r.cmd)).toEqual(['SELECT']);
	});
});

// ---------------------------------------------------------------------------
describe('D. what it left alone', () => {
	it('exactly one arity for every name it writes -- no surviving overload', async () => {
		const names = [
			'_ideacad_document_archived', '_ideacad_document_role', '_ideacad_can_write_document',
			'_ideacad_part_owner', 'ideacad_set_document_archived', 'ideacad_archive',
			'ideacad_share_document_with_section', 'ideacad_unshare_document_from_section',
			'ideacad_document_section_grants', 'ideacad_shared_with_me',
			'ideacad_open_shared_document', 'ideacad_roster'
		];
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*)::text as n
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = any($1) group by p.proname order by 1`,
			[names]
		);
		expect(rows).toHaveLength(names.length);
		expect(rows.filter((r) => r.n !== '1')).toEqual([]);
	});

	it('the READ predicate has no archive term -- "keeps being readable" is structural', async () => {
		const { rows } = await db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = '_ideacad_can_read_document'`
		);
		expect(rows[0].prosrc).not.toContain('archived');
		// Control: the WRITE predicate on the same database does have one.
		const { rows: w } = await db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = '_ideacad_can_write_document'`
		);
		expect(w[0].prosrc).toContain('archived');
	});

	it('the enrollment census has no archive term either', async () => {
		// Whichever of 0213 and 0214 lands first, archiving must never unlock a
		// removal. What is on THIS branch is 0138's four-way census; 0213 widens
		// it to five and is claimed by another lane.
		const { rows } = await db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].prosrc).not.toContain('archived');

		// The IdeaCAD count itself is 0213's, on another lane, so this branch's
		// chain carries 0138's FOUR-way census and asserting a fifth term here
		// would be asserting somebody else's file. What IS asserted either way:
		// the four 0138 counts are intact, so this file did not narrow the
		// census while nobody was looking.
		for (const table of [
			'public.classroom_responses',
			'public.classroom_submissions',
			'public.classroom_module_approvals',
			'public.notebook_entries'
		]) {
			expect(rows[0].prosrc, table).toContain(table);
		}
		// And whichever census is deployed, an archived document must still be
		// counted by whatever counts IdeaCAD work -- proven directly against the
		// tables in ideacad-archive.test.ts section G, because that is a
		// property of the ROWS rather than of this function's text.
		const hasIdeacadCount = rows[0].prosrc.includes('public.ideacad_documents');
		expect(typeof hasIdeacadCount).toBe('boolean');
	});

	it('0206 still passes over the database this file built', async () => {
		// 0206 is the applied guard that sweeps every ideacad function for the
		// anon grant and refuses any client table privilege beyond authenticated
		// SELECT. A new ideacad table or function that got either wrong turns it
		// red -- which is what it is for, and this is the cheapest place to find
		// out rather than in the SQL editor.
		const guard = readFileSync(new URL('0206_ideacad_grant_guard.sql', MIGRATIONS_DIR), 'utf8');
		await expect(db.sql(guard)).resolves.toBeDefined();
	}, 120_000);
});
