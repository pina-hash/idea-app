// tests/view-as-orphans-dropped.test.ts
//
// 0124: the five orphaned classroom view-as functions are gone, and nothing
// anywhere still calls one. Against REAL embedded Postgres with the REAL
// migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Both failure modes are silent, and they fail in opposite
// directions:
//
//   * DROPPING A FUNCTION SOMETHING STILL CALLS is a 500 in production and
//     nowhere else. Postgres records a dependency from a policy, a view, a
//     default or an index to a function -- but NOT from one plpgsql function
//     to another, because a plpgsql body is an opaque string until it runs. So
//     the drop succeeds quietly here and the caller breaks at its next
//     invocation, in front of a real person. `svelte-check` cannot see this,
//     no harness exercises it, and the migration's own guard is the only thing
//     between the two. This file proves that guard BITES, by putting a caller
//     in front of it and requiring a refusal.
//   * A DROP THAT DID NOT HAPPEN looks exactly like a drop that did. An
//     assertion that five functions are absent passes just as happily against
//     a chain that never created them, a namespace typo, or a query reading
//     the wrong catalog. Every absence assertion below therefore carries a
//     positive control on the SAME read.
//
// WHAT IS NOT COVERED HERE, stated rather than left silent: the live Supabase
// project. The local `.env` is the placeholder (`example-ref`), so nothing
// here has queried a deployed catalog. Every claim is about the migration
// files applied to a fresh database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The classroom chain through 0113 -- the last migration that recreated any of
 * the five -- so the functions 0124 drops are the shipping ones, defined by
 * the file that defined them last.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0111_classroom_units.sql',
	'0112_classroom_sentence_count_fix.sql',
	'0113_classroom_view_as_body_doc_units.sql'
] as const;

const MIGRATION_0124 = readFileSync(
	join(REPO_ROOT, 'supabase', 'migrations', '0124_drop_orphaned_view_as.sql'),
	'utf8'
);

/** What 0124 drops. */
const DROPPED = [
	'classroom_view_as_section',
	'classroom_view_as_item',
	'classroom_view_as_can_read_attachment',
	'classroom_view_as_sections',
	'_classroom_item_json'
] as const;

/**
 * What 0124 keeps, and the positive control for every absence assertion here.
 * `classroom_view_as_students` is the student picker the surviving notebook
 * preview is reached through; `_classroom_view_as_guard` is the admin +
 * real-enrollment check both it and `notebook_view_as_notebook` call;
 * `_classroom_item_live` is 0109's publish predicate, which has nothing to do
 * with view-as.
 */
const KEPT = [
	'classroom_view_as_students',
	'_classroom_view_as_guard',
	'_classroom_item_live'
] as const;

let db: TestDb;

async function proNames(names: readonly string[]): Promise<string[]> {
	const { rows } = await db.sql<{ proname: string }>(
		`select p.proname from pg_proc p
		   join pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.proname = any($1::text[])
		  order by p.proname`,
		[names as string[]]
	);
	return rows.map((r) => r.proname);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('0124 refuses rather than destroys', () => {
	it('raises, and drops nothing, while a surviving function still calls one', async () => {
		// SHORT OF 0124: all five present, which is what makes the refusal
		// below mean something.
		expect(await proNames(DROPPED)).toHaveLength(5);

		// The caller Postgres cannot see. A plpgsql body is an opaque string,
		// so nothing in pg_depend relates this function to the helper it
		// calls -- which is the whole reason 0124 carries a guard of its own.
		await db.sql(`
			create or replace function public._probe_still_calls_it(p_id uuid)
			returns jsonb language plpgsql stable as $probe$
			begin
				return public._classroom_item_json(p_id);
			end;
			$probe$;
		`);

		await expect(db.sql(MIGRATION_0124)).rejects.toThrow(
			/0124 REFUSED: 1 surviving function\(s\) still call one of the five/
		);

		// AND IT CHANGED NOTHING. A guard that raises after the drops have
		// already run is not a guard.
		expect(await proNames(DROPPED)).toHaveLength(5);

		await db.sql('drop function public._probe_still_calls_it(uuid);');
	});

	it('is not fooled by classroom_view_as_sections containing classroom_view_as_section', async () => {
		// The two names are a prefix of each other, so a plain substring
		// search reports each as calling the other and the migration could
		// never apply at all. The guard looks for a CALL -- `<name>(` -- which
		// is what makes them distinguishable. Applying cleanly IS the
		// assertion; the test below is its positive control.
		await db.sql(MIGRATION_0124);
		expect(await proNames(DROPPED)).toEqual([]);
	});
});

describe('after 0124', () => {
	it('has dropped all five and kept all three', async () => {
		expect(await proNames(DROPPED)).toEqual([]);
		// THE POSITIVE CONTROL, on the identical catalog read.
		expect(await proNames(KEPT)).toEqual([...KEPT].sort());
	});

	it('leaves no function in the database calling any of the five', async () => {
		const { rows } = await db.sql<{ caller: string; callee: string }>(
			`select p.proname as caller, d.name as callee
			   from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			   cross join unnest($1::text[]) as d(name)
			  where n.nspname = 'public'
			    and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
			    and position(d.name || '(' in p.prosrc) > 0
			  order by p.proname`,
			[DROPPED as unknown as string[]]
		);
		expect(rows).toEqual([]);

		// THE POSITIVE CONTROL: the same sweep, over the three that stayed,
		// must find real callers. A zero above is only worth anything if this
		// is not also zero.
		const { rows: control } = await db.sql<{ caller: string; callee: string }>(
			`select p.proname as caller, d.name as callee
			   from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			   cross join unnest($1::text[]) as d(name)
			  where n.nspname = 'public'
			    and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
			    and p.proname <> d.name
			    and position(d.name || '(' in p.prosrc) > 0`,
			[KEPT as unknown as string[]]
		);
		expect(control.length).toBeGreaterThan(0);
	});

	it('re-applies cleanly', async () => {
		await db.sql(MIGRATION_0124);
		expect(await proNames(DROPPED)).toEqual([]);
		expect(await proNames(KEPT)).toEqual([...KEPT].sort());
	});
});

// ===========================================================================
// The client side
// ===========================================================================

/**
 * Every shipped source file that could name an RPC. `supabase/migrations` is
 * deliberately excluded: it is an IMMUTABLE APPLIED RECORD, so 0083, 0085,
 * 0109 and 0113 necessarily still contain the definitions and their calls, and
 * a sweep that reddened on those could only be satisfied by rewriting history.
 * What the database holds after the whole chain is the catalog assertion
 * above; this is the separate question of whether any CLIENT still asks.
 */
function sourceFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			const full = join(dir, name);
			if (statSync(full).isDirectory()) walk(full);
			else if (/\.(ts|js|svelte)$/.test(name)) out.push(full);
		}
	};
	walk(join(REPO_ROOT, 'src'));
	return out;
}

describe('nothing in the shipped client calls a dropped function', () => {
	const files = sourceFiles();

	it('swept a non-empty set of files', () => {
		// A sweep that generated nothing passes every assertion under it.
		expect(files.length).toBeGreaterThan(200);
	});

	it('names none of the five as a call or as an rpc target', () => {
		const hits: string[] = [];
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			for (const name of DROPPED) {
				// A CALL is `name(`; an RPC target is `'name'` or `"name"`.
				// Prose that merely mentions the name -- and two files
				// deliberately explain why the branch is gone -- is neither.
				const call = new RegExp(`\\b${name}\\s*\\(`).test(text);
				const target = new RegExp(`['"\`]${name}['"\`]`).test(text);
				if (call || target) hits.push(`${relative(REPO_ROOT, file)} -> ${name}`);
			}
		}
		expect(hits).toEqual([]);
	});

	it('POSITIVE CONTROL: the same sweep finds the view-as RPCs that stayed', () => {
		// Identical matcher, over `classroom_view_as_students` and
		// `notebook_view_as_notebook`, which the surviving picker and notebook
		// preview really do call. Without this, a broken regex, a wrong root
		// or an empty file list would make the assertion above pass for the
		// wrong reason.
		const hits: string[] = [];
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			for (const name of ['classroom_view_as_students', 'notebook_view_as_notebook']) {
				if (new RegExp(`['"\`]${name}['"\`]`).test(text)) {
					hits.push(`${relative(REPO_ROOT, file)} -> ${name}`);
				}
			}
		}
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.some((h) => h.includes('classroom_view_as_students'))).toBe(true);
		expect(hits.some((h) => h.includes('notebook_view_as_notebook'))).toBe(true);
	});
});
