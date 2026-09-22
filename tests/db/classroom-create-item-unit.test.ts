// tests/db/classroom-create-item-unit.test.ts
//
// 0218: a unit chosen at CREATION time, against REAL embedded Postgres with
// the REAL migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Four of the five guarantees below fail silently:
//
//   * THE SIGNATURE TRAP. `create or replace` keys on the parameter list, so
//     adding one leaves 0176's twelve-argument form standing as a second
//     overload -- and two overloads differing only by a defaulted trailing
//     parameter make PostgREST unable to resolve the call AT ALL. That does
//     not break the unit; it breaks EVERY item creation in the app, and
//     nothing in a SQL-level test of the function's behaviour would notice,
//     because calling it by name from psql resolves fine. Only the catalog
//     says so.
//   * THE DEPLOYED CALL SHAPE. The running client sends eleven named keys and
//     no `p_unit_id`. If the drop left that call unable to resolve, or if the
//     new parameter were not defaulted, every teacher's Post button would 400
//     between the migration landing and the client shipping. Asserted by
//     making exactly that call.
//   * THE ANON GRANT. The new arity IS a create, so the project's default
//     privileges hand it a direct `anon` grant at creation time, which
//     `revoke ... from public` does not remove. An anon-executable item
//     creator is invisible from every surface in the app.
//   * THE WRONG-COURSE REFUSAL. A unit from another course that was accepted
//     would file an item somewhere its class cannot see -- `classGroups`
//     treats a unit id the reader cannot see as unfiled, so the item simply
//     appears unfiled and the teacher concludes the picker does not work.
//
// AND ONE THAT DOES NOT FAIL SILENTLY BUT IS THE POINT OF THE FILE: an item
// created WITH a valid unit is actually filed under it on the canonical record.
//
// EVERY REFUSAL HALF CARRIES ITS POSITIVE CONTROL. A suite that refuses
// everything, including what it is meant to accept, passes every assertion it
// makes.
//
// WHICH LAYER EACH ASSERTION RUNS AT. Everything here is SQL against the real
// functions, through `db.asUser`, which sets the `request.jwt.claims` GUC and
// `set role authenticated` exactly as PostgREST does. Nothing here goes
// through `tests/db/postgrest-shim.ts` -- that shim models `select` and `rpc`
// and not `insert`, and none of these claims is about a client select string.
// The one thing SQL cannot speak for is PostgREST's own overload RESOLUTION,
// which is why the arity claim is read off `pg_proc` rather than inferred from
// a call succeeding.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/** The classroom chain as deployed, SHORT of 0218. */
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
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0159_classroom_duplicate_carries_the_spec.sql',
	'0176_classroom_item_images.sql'
] as const;

const MIGRATION_0218 = readFileSync(
	join(
		fileURLToPath(new URL('../..', import.meta.url)),
		'supabase',
		'migrations',
		'0218_classroom_create_item_unit.sql'
	),
	'utf8'
);

const WIDE_SIG =
	'public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, ' +
	'boolean, jsonb, boolean, jsonb, timestamptz, uuid)';

describe('0218: a unit at creation time', () => {
	let db: TestDb;
	let teacher: SeededUser;
	/** Course A: two sections. Course B: one, and a unit of its own. */
	let sectionA1: string;
	let sectionA2: string;
	let sectionB: string;
	let unitA: string;
	let unitB: string;

	async function upsertCourse(code: string, title: string): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { course_id: string } }>(
				'select public.classroom_upsert_course($1, $2) as result',
				[code, title]
			);
			return rows[0].result.course_id;
		});
	}

	async function upsertSection(course: string, label: string, block: string): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { section_id: string } }>(
				'select public.classroom_upsert_section($1::uuid, $2, $3) as result',
				[course, label, block]
			);
			return rows[0].result.section_id;
		});
	}

	async function upsertUnit(course: string, name: string): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { unit_id: string } }>(
				'select public.classroom_upsert_unit($1::uuid, $2) as result',
				[course, name]
			);
			return rows[0].result.unit_id;
		});
	}

	/**
	 * THE DEPLOYED CALL SHAPE, verbatim: the eleven named keys
	 * `src/routes/api/classroom/item/+server.ts` sends today, and no
	 * `p_unit_id`. Named arguments rather than positional, because that is what
	 * PostgREST emits and it is the only shape whose resolution this file can
	 * speak for.
	 */
	async function createAsDeployedClient(title: string): Promise<Record<string, unknown>> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: Record<string, unknown> }>(
				`select public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
					p_body => 'Bench brief', p_points => 10, p_due_at => null,
					p_category => null, p_published => true, p_resources => '[]'::jsonb,
					p_body_doc => null, p_publish_at => null) as result`,
				[[sectionA1], title]
			);
			return rows[0].result;
		});
	}

	/** The new call: the same keys plus `p_unit_id`. */
	async function createWithUnit(
		title: string,
		sections: string[],
		unit: string | null
	): Promise<Record<string, unknown>> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: Record<string, unknown> }>(
				`select public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
					p_body => 'Bench brief', p_points => 10, p_due_at => null,
					p_category => null, p_published => true, p_resources => '[]'::jsonb,
					p_body_doc => null, p_publish_at => null, p_unit_id => $3::uuid) as result`,
				[sections, title, unit]
			);
			return rows[0].result;
		});
	}

	async function storedUnit(itemId: string): Promise<string | null> {
		const { rows } = await db.sql<{ unit_id: string | null }>(
			'select unit_id from public.classroom_items where id = $1::uuid',
			[itemId]
		);
		return rows[0].unit_id;
	}

	async function arities(): Promise<number> {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			   join pg_namespace ns on ns.oid = p.pronamespace
			  where ns.nspname = 'public' and p.proname = 'classroom_create_item'`
		);
		return Number(rows[0].n);
	}

	async function canExecute(role: string, sig: string): Promise<boolean> {
		const { rows } = await db.sql<{ ok: boolean }>(
			'select has_function_privilege($1, $2, $3) as ok',
			[role, sig, 'execute']
		);
		return rows[0].ok;
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');

		const courseA = await upsertCourse('IDEA209H', 'Engineering I Honors');
		const courseB = await upsertCourse('IDEA100', 'Intro to Engineering');
		sectionA1 = await upsertSection(courseA, 'Period 2', 'B');
		sectionA2 = await upsertSection(courseA, 'Period 5', 'E');
		sectionB = await upsertSection(courseB, 'Period 1', 'A');
		unitA = await upsertUnit(courseA, 'Unit 3 - Bearings');
		unitB = await upsertUnit(courseB, 'Unit 1 - Sketching');
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// Part 0. THE WORLD AS DEPLOYED, measured before the file is applied.
	// -----------------------------------------------------------------------
	describe('before 0218', () => {
		it('classroom_create_item has exactly one arity and it takes twelve arguments', async () => {
			expect(await arities()).toBe(1);
			const { rows } = await db.sql<{ n: number }>(
				`select p.pronargs as n from pg_proc p
				   join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and p.proname = 'classroom_create_item'`
			);
			expect(rows[0].n).toBe(12);
		});

		it('creation has no channel for a unit: an item lands unfiled', async () => {
			const res = await createAsDeployedClient('Before, no unit');
			expect(await storedUnit(String(res.item_id))).toBeNull();
		});

		it('filing it afterwards is the ONLY path, and it works', async () => {
			// The reason this bundle is small -- the post-creation path is not
			// what is broken, and 0218 must not disturb it.
			const res = await createAsDeployedClient('Before, filed after');
			const id = String(res.item_id);
			await db.asUser(teacher.id, (q) =>
				q('select public.classroom_set_item_unit($1::uuid, $2::uuid)', [id, unitA])
			);
			expect(await storedUnit(id)).toBe(unitA);
		});

		it('is already closed to anon at the OLD arity, and that is why 0218 must revoke for itself', async () => {
			// MEASURED, AND IT CORRECTED THIS FILE'S FIRST GUESS. The guess was
			// that 0176's `revoke ... from public` had left a direct `anon`
			// grant standing, because on a hosted project the default
			// privileges write one into every new function at creation time.
			// It had not: `create or replace` at an UNCHANGED signature
			// PRESERVES the existing ACL, so 0137's sweep survived 0176 intact
			// and anon is false here.
			//
			// That is the whole reason 0218 cannot lean on the same mechanism.
			// A NEW signature is a CREATE, not a replace, so the thirteen-argument
			// form arrives with a fresh direct `anon` grant that no earlier sweep
			// can reach and that `revoke ... from public` would not remove. The
			// assertion after the apply is what proves the revoke landed; the
			// mutation proof is what proves it was needed.
			const narrow =
				'public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, ' +
				'text, boolean, jsonb, boolean, jsonb, timestamptz)';
			expect(await canExecute('anon', narrow)).toBe(false);
			// POSITIVE CONTROL: the same query CAN see a grant, so the `false`
			// above is an answer about the ACL and not about the query.
			expect(await canExecute('authenticated', narrow)).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Part 1. APPLY, and prove it landed before reading anything from it.
	// -----------------------------------------------------------------------
	describe('after 0218', () => {
		beforeAll(async () => {
			await db.sql(MIGRATION_0218);
		});

		it('leaves exactly ONE arity, and it is the thirteen-argument one', async () => {
			// THE SIGNATURE TRAP. A count of two here is not a cosmetic finding:
			// PostgREST cannot resolve a call that could bind to both, so every
			// item creation in the app would fail.
			expect(await arities()).toBe(1);
			const { rows } = await db.sql<{ n: number; names: string[] }>(
				`select p.pronargs as n, p.proargnames as names from pg_proc p
				   join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and p.proname = 'classroom_create_item'`
			);
			expect(rows[0].n).toBe(13);
			expect(rows[0].names[12]).toBe('p_unit_id');
		});

		it('THE DEPLOYED CLIENT STILL RESOLVES: eleven keys, no p_unit_id, item created unfiled', async () => {
			// The whole argument for why the drop above costs no deploy
			// ordering. If this throws, the migration cannot be applied ahead of
			// the client without taking the class down.
			const res = await createAsDeployedClient('After, old call shape');
			expect(res.item_id).toBeTruthy();
			expect(await storedUnit(String(res.item_id))).toBeNull();
		});

		it('files an item into a valid unit at creation', async () => {
			const res = await createWithUnit('Bearing teardown', [sectionA1], unitA);
			expect(res.unit_id).toBe(unitA);
			expect(await storedUnit(String(res.item_id))).toBe(unitA);
		});

		it('an explicit null unit creates, unfiled -- the default nobody has to think about', async () => {
			const res = await createWithUnit('Announcement', [sectionA1], null);
			expect(await storedUnit(String(res.item_id))).toBeNull();
		});

		it('REFUSES a unit from a course none of the target sections belongs to', async () => {
			// 0111's `wrong_course` rule, at creation. It is a RAISE rather than
			// a structured `{ok:false}` because this function's return value is
			// what carries the new item's id -- see the migration header.
			await expect(createWithUnit('Wrong course', [sectionA1], unitB)).rejects.toThrow(
				/different course/
			);
		});

		it('and creates NOTHING when it refuses', async () => {
			const { rows } = await db.sql<{ n: string }>(
				"select count(*)::text as n from public.classroom_items where title = 'Wrong course'"
			);
			expect(rows[0].n).toBe('0');
		});

		it('refuses a unit id that does not exist, in 0111 own words', async () => {
			await expect(
				createWithUnit('No such unit', [sectionA1], '00000000-0000-0000-0000-000000000001')
			).rejects.toThrow(/does not exist/);
		});

		// --- The multi-section case -------------------------------------
		//
		// A unit belongs to ONE course and `createItem` takes sectionIds
		// PLURAL, so this is the case that decides whether the parameter is one
		// value or one per section. It is one value, on the canonical record,
		// and the rule is an `exists` -- which is 0111's own rule rather than a
		// new one.

		it('accepts a unit when SOME target section shares its course (two sections, one course)', async () => {
			const res = await createWithUnit('Two periods', [sectionA1, sectionA2], unitA);
			expect(await storedUnit(String(res.item_id))).toBe(unitA);
		});

		it('accepts a unit when ONE of two COURSES matches, and files it once', async () => {
			// The item is posted to both courses and filed in a unit of one of
			// them. It groups under that unit for course A and reads as unfiled
			// for course B, which `classGroups` already does with a unit id the
			// reader cannot see. That is the deployed behaviour of
			// `classroom_set_item_unit`, and the create path must not invent a
			// stricter one.
			const res = await createWithUnit('Cross posted', [sectionA1, sectionB], unitA);
			expect(await storedUnit(String(res.item_id))).toBe(unitA);
			const { rows } = await db.sql<{ n: string }>(
				'select count(*)::text as n from public.classroom_postings where item_id = $1::uuid',
				[String(res.item_id)]
			);
			expect(rows[0].n).toBe('2');
		});

		it('refuses when the unit matches NEITHER of two courses', async () => {
			const courseC = await upsertCourse('IDEA300', 'Capstone');
			// A SECTION FIRST, and it is not scaffolding: `classroom_upsert_unit`
			// asks `classroom_manages_section` about the course, so a course with
			// no sections has no teacher of record and its own creator cannot
			// write a unit into it. Measured, not assumed -- the first draft of
			// this test skipped the section and was refused with 'Only a teacher
			// of this course can change its units.'
			await upsertSection(courseC, 'Period 7', 'G');
			const unitC = await upsertUnit(courseC, 'Unit 9');
			await expect(
				createWithUnit('Neither course', [sectionA1, sectionB], unitC)
			).rejects.toThrow(/different course/);
		});

		it('agrees with classroom_set_item_unit on the same pair', async () => {
			// TWO STATEMENTS OF ONE RULE IS THE THING THIS ASSERTS AGAINST. The
			// create path and the file-it-afterwards path must answer the same
			// way about the same unit and the same sections; only the SHAPE of
			// the refusal differs, for the reason the migration header gives.
			const res = await createWithUnit('Agreement control', [sectionA1], null);
			const id = String(res.item_id);
			const { rows } = await db.asUser(teacher.id, (q) =>
				q<{ result: { ok: boolean; reason?: string } }>(
					'select public.classroom_set_item_unit($1::uuid, $2::uuid) as result',
					[id, unitB]
				)
			);
			expect(rows[0].result.ok).toBe(false);
			expect(rows[0].result.reason).toBe('wrong_course');
			// And the create path refused the same pair, above.
			expect(await storedUnit(id)).toBeNull();
		});

		// --- Grants ------------------------------------------------------

		it('anon CANNOT execute the new arity', async () => {
			expect(await canExecute('anon', WIDE_SIG)).toBe(false);
		});

		it('authenticated CAN', async () => {
			expect(await canExecute('authenticated', WIDE_SIG)).toBe(true);
		});

		it('re-applies cleanly', async () => {
			// Re-pasting a migration is ordinary -- a first attempt fails
			// partway and gets retried -- so a file that only works once fails
			// exactly then, with the schema half-built.
			await db.sql(MIGRATION_0218);
			expect(await arities()).toBe(1);
			expect(await canExecute('anon', WIDE_SIG)).toBe(false);
			const res = await createWithUnit('After re-apply', [sectionA1], unitA);
			expect(await storedUnit(String(res.item_id))).toBe(unitA);
		});
	});
});
