// tests/gauntlet-author-tier.test.ts
//
// 0155: the GAUNTLET AUTHOR tier reaches exactly what it was granted, and
// nothing else.
//
// WHY THIS FILE EXISTS, given that automated tests here are the exception.
// Every failure this covers is SILENT in normal use, in one of two directions,
// and the second direction is the dangerous one.
//
//   * TOO NARROW fails visibly: an author presses Publish and sees a refusal.
//     Somebody reports it the same day. That half is covered here mostly so the
//     matrix is symmetric and so a regression names which gate closed.
//   * TOO WIDE FAILS SILENTLY AND FOREVER. If `gauntlet_can_author()` leaks
//     onto the four student-work policies -- every student's submissions, their
//     Speedrun attempts, their run events, their run analysis -- nothing on any
//     screen changes, nobody is refused anything, and a tier meant to write
//     questions is quietly reading what every student answered. That is item
//     four on 0067's own list of what a domain-derived role must not carry, and
//     it is exactly the shape of defect this bundle was written to avoid
//     creating.
//
// MUTATION-PROVEN IN THE PERMISSIVE DIRECTION. A policy commented out entirely
// fails CLOSED and reddens almost nothing; what reproduces the real leak is
// swapping a SHUT gate onto `gauntlet_can_author()`, which is precisely the
// edit a future session would make by accident while "making 0155 consistent".
// The proof run and its counts are recorded in
// docs/history/gauntlet-authoring-allowlist-xui3ps.md.
//
// FOUR CALLERS, because two would not separate the two things being claimed.
// "An author can publish" and "a teacher cannot" are different assertions, and
// a matrix with only an admin and a student cannot tell an allowlist apart from
// a domain check -- which is the entire decision 0155 implements.
//
//   admin    the pinned owner. Must still reach everything, including the
//            gates 0155 leaves shut.
//   author   @boscotech.edu, NOT in app_admins, granted through the real
//            gauntlet_author_grant RPC rather than by raw insert.
//   teacher  @boscotech.edu, on neither list. role_for_email makes them
//            'teacher', and that must still buy nothing. This caller is the
//            whole point: an inferred predicate would pass them.
//   student  @boscotech.net. Reaches none of it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';

/**
 * The GAUNTLET chain as production stands, with 0155 on top.
 *
 * 0149 is deliberately absent, for the reason 0151's own suite records: its
 * self-check requires nine views a gauntlet-only chain does not have.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0004_gauntlet.sql',
	'0005_gauntlet_speedrun.sql',
	'0006_gauntlet_macro.sql',
	'0007_gauntlet_modeling_modes.sql',
	'0008_gauntlet_knowledge_modes.sql',
	'0009_gauntlet_authoring.sql',
	'0010_gauntlet_rooms.sql',
	'0015_gauntlet_speedrun_formalize.sql',
	'0016_gauntlet_speedrun_start.sql',
	'0017_gauntlet_run_status.sql',
	'0018_gauntlet_speedrun_units.sql',
	'0019_gauntlet_purge_demo.sql',
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0025_gauntlet_room_delete.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
	'0031_gauntlet_tools_bucket.sql',
	'0033_gauntlet_speedrun_attempts.sql',
	'0034_gauntlet_volume_only_verification.sql',
	'0035_gauntlet_run_events.sql',
	'0036_gauntlet_volume_tolerance_0_1.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql',
	'0153_gauntlet_unpublish_the_target.sql',
	'0154_gauntlet_rank_what_is_checkable.sql',
	'0155_gauntlet_authoring_tier.sql'
] as const;

/** The four callers, by the name the matrix reports them under. */
type Who = 'admin' | 'author' | 'teacher' | 'student';
const EVERYONE: readonly Who[] = ['admin', 'author', 'teacher', 'student'];
/** Who each OPEN gate must admit. */
const AUTHORS: readonly Who[] = ['admin', 'author'];
/** Who each SHUT gate must admit. Every one of them is admin-only. */
const ADMIN_ONLY: readonly Who[] = ['admin'];

let db: TestDb;
const user = {} as Record<Who, SeededUser>;
/** A draft (unpublished) challenge, seeded past the RPC so it exists for everyone's read. */
let draftId = '';
/** A published challenge, so "can you see a draft" is separable from "can you see anything". */
let publishedId = '';
/** A student submission, a Speedrun attempt, a run event and a run analysis row. */
let studentSubmissionId = '';

/**
 * Runs `fn` as `who` and answers whether the gate ADMITTED them.
 *
 * A gate is "shut" for a caller when the statement raises OR (for a read)
 * returns nothing. Those are the same answer from outside and the codebase
 * treats them as such deliberately -- an empty RLS result is indistinguishable
 * from the row not existing, which is what stops an id being probed.
 */
async function admits(who: Who, fn: (q: TestDb['sql']) => Promise<boolean>): Promise<boolean> {
	try {
		return await db.asUser(user[who].id, fn);
	} catch {
		return false;
	}
}

/** Runs one gate for all four callers and returns the set that got in. */
async function matrix(fn: (q: TestDb['sql']) => Promise<boolean>): Promise<Who[]> {
	const got: Who[] = [];
	for (const who of EVERYONE) if (await admits(who, fn)) got.push(who);
	return got;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	// THE STUB MODELS storage's SHAPE, NOT ITS GRANTS. tests/db/supabase-stub.sql
	// creates storage.objects and enables RLS on it but issues no table grant, so
	// without this every caller is refused by "permission denied for table
	// objects" BEFORE any policy is evaluated -- which would make the four
	// storage assertions below pass for the wrong reason (an empty admitted set
	// reads as a correct refusal). A hosted Supabase project grants the table to
	// anon/authenticated/service_role and lets the POLICIES decide, which is the
	// world the 0009/0015/0031 policies were written for. Reproduced here, in
	// this file's own private database, rather than by editing the shared stub.
	await db.sql(`grant select, insert, update, delete on storage.objects to authenticated`);

	user.admin = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	user.author = await createUser(db, 'mcosso@boscotech.edu', 'Author Teacher');
	user.teacher = await createUser(db, 'notonthelist@boscotech.edu', 'Plain Teacher');
	user.student = await createUser(db, 'kid@boscotech.net', 'A Student');

	// THE ALLOWLIST IS POPULATED THROUGH THE REAL RPC, not by raw insert: the
	// grant path is itself a gate under test, and seeding around it would leave
	// gauntlet_author_grant unexercised while the matrix below looked complete.
	await db.asUser(user.admin.id, (q) =>
		q(`select public.gauntlet_author_grant($1, $2)`, [
			user.author.email,
			'Granted by the suite through the real RPC.'
		])
	);

	// Two challenges, seeded as the owner (direct DML on challenges is revoked
	// from every client since 0009, so this cannot go through a caller).
	const seed = async (title: string, status: string) => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('spot_the_error', $1, 2,
				jsonb_build_object('question', 'q', 'options', jsonb_build_array(
					jsonb_build_object('id', 'a', 'label', 'A'),
					jsonb_build_object('id', 'b', 'label', 'B'))),
				jsonb_build_object('correct', 'a', 'explanation', 'because'),
				$2)
			 returning id`,
			[title, status]
		);
		return rows[0].id;
	};
	draftId = await seed('A draft nobody has published', 'draft');
	publishedId = await seed('A published question', 'published');

	// A student's graded work, in all four tables the SHUT half is about.
	const sub = await db.sql<{ id: string }>(
		`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric)
		 values ($1, $2, 'spot_the_error', '{"answer":"a"}'::jsonb, true, 12.5)
		 returning id`,
		[user.student.id, publishedId]
	);
	studentSubmissionId = sub.rows[0].id;

	await db.sql(
		`insert into public.gauntlet_speedrun_attempts (user_id, challenge_id, run_id, result)
		 values ($1, $2, gen_random_uuid(), 'abandoned')`,
		[user.student.id, publishedId]
	);
	await db.sql(
		`insert into public.gauntlet_run_events (user_id, challenge_id, run_id, seq, t_ms, event_type, payload)
		 values ($1, $2, gen_random_uuid(), 1, 100, 'snapshot', '{}'::jsonb)`,
		[user.student.id, publishedId]
	);
	await db.sql(
		`insert into public.gauntlet_run_analysis (user_id, challenge_id, run_id)
		 values ($1, $2, gen_random_uuid())`,
		[user.student.id, publishedId]
	);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The predicate itself
// ---------------------------------------------------------------------------

describe('gauntlet_can_author() is the tier, and is not is_admin()', () => {
	it('admits the admin and the allowlisted author, and nobody else', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.gauntlet_can_author() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...AUTHORS]);
	});

	it('DOES NOT make the author an admin -- the whole point of a separate tier', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.is_admin() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('and is_teacher(), the 0067 shim, still answers the admin check for all four', async () => {
		// If this ever tracked gauntlet_can_author() instead, ~90 applied policies
		// across every subsystem would widen at once. It is asserted here because
		// this is the file that introduces a second GAUNTLET predicate beside it.
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.is_teacher() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('answers false for a signed-out caller', async () => {
		// current_user_email() returns '' and not null with no session, which is
		// the case 0138's header calls out; a helper that forgot it would answer
		// for a caller who is not there.
		await expect(
			db.asAnon(async (q) => q(`select public.gauntlet_can_author()`))
		).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// OPEN: the eleven gates the tier was granted
// ---------------------------------------------------------------------------

describe('what the author tier reaches', () => {
	it('reads a DRAFT challenge (0004 select policy)', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(`select id from public.challenges where id = $1`, [draftId]);
			return rows.length === 1;
		});
		expect(got).toEqual([...AUTHORS]);
	});

	it('POSITIVE CONTROL: everybody reads the PUBLISHED one', async () => {
		// Without this, a draft read failing for three callers could equally mean
		// the seed never landed or the whole table is unreadable.
		const got = await matrix(async (q) => {
			const { rows } = await q(`select id from public.challenges where id = $1`, [publishedId]);
			return rows.length === 1;
		});
		expect(got).toEqual([...EVERYONE]);
	});

	it('reads a challenge including its hidden answer (gauntlet_author_get)', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ v: { answer?: unknown } }>(
				`select public.gauntlet_author_get($1) as v`,
				[draftId]
			);
			return rows[0].v?.answer !== undefined;
		});
		expect(got).toEqual([...AUTHORS]);
	});

	it('creates a challenge (gauntlet_author_upsert)', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ id: string }>(
				`select public.gauntlet_author_upsert(
					null, 'spot_the_error', 'Made by ' || public.current_user_email(), 2::smallint,
					'draft',
					jsonb_build_object('question','q','options', jsonb_build_array(
						jsonb_build_object('id','a','label','A'), jsonb_build_object('id','b','label','B'))),
					jsonb_build_object('correct','a','explanation','because')) as id`
			);
			return !!rows[0].id;
		});
		expect(got).toEqual([...AUTHORS]);
	});

	it('publishes a challenge (gauntlet_author_set_status)', async () => {
		// Each caller gets their OWN row, seeded as the owner (client DML on
		// challenges is revoked since 0009), so one caller's success can never be
		// another's precondition and only the RPC is under test.
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			const { rows } = await db.sql<{ id: string }>(
				`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
				 values ('spot_the_error', 'to publish for ' || $1, 2,
					jsonb_build_object('question','q','options', jsonb_build_array(
						jsonb_build_object('id','a','label','A'), jsonb_build_object('id','b','label','B'))),
					jsonb_build_object('correct','a','explanation','because'), 'draft')
				 returning id`,
				[who]
			);
			const id = rows[0].id;
			if (
				await admits(who, async (q) => {
					await q(`select public.gauntlet_author_set_status($1, 'published')`, [id]);
					return true;
				})
			) {
				admitted.push(who);
			}
			const { rows: after } = await db.sql<{ status: string }>(
				`select status from public.challenges where id = $1`,
				[id]
			);
			// The gate and the EFFECT agree: a refused call left the row a draft.
			expect(after[0].status).toBe(admitted.includes(who) ? 'published' : 'draft');
		}
		expect(admitted).toEqual([...AUTHORS]);
	});

	it('deletes a challenge (gauntlet_author_delete)', async () => {
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			const { rows } = await db.sql<{ id: string }>(
				`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
				 values ('spot_the_error', 'to delete for ' || $1, 2, '{}'::jsonb, '{}'::jsonb, 'draft')
				 returning id`,
				[who]
			);
			const id = rows[0].id;
			if (
				await admits(who, async (q) => {
					const { rows: r } = await q<{ v: string }>(
						`select public.gauntlet_author_delete($1) as v`,
						[id]
					);
					return r[0].v === 'deleted';
				})
			) {
				admitted.push(who);
			}
		}
		expect(admitted).toEqual([...AUTHORS]);
	});

	it('creates, edits and deletes a drawing series (0022 policies)', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.gauntlet_series (name) values ('series by ' || public.current_user_email())
				 returning id`
			);
			const id = rows[0].id;
			const upd = await q(`update public.gauntlet_series set name = 'renamed' where id = $1 returning id`, [id]);
			const del = await q(`delete from public.gauntlet_series where id = $1 returning id`, [id]);
			return upd.rows.length === 1 && del.rows.length === 1;
		});
		expect(got).toEqual([...AUTHORS]);
	});

	it('assigns a challenge to a series (gauntlet_series_assign)', async () => {
		const { rows: seriesRows } = await db.sql<{ id: string }>(
			`insert into public.gauntlet_series (name) values ('shared series') returning id`
		);
		const seriesId = seriesRows[0].id;
		const got = await matrix(async (q) => {
			await q(`select public.gauntlet_series_assign($1, $2, 0)`, [publishedId, seriesId]);
			return true;
		});
		expect(got).toEqual([...AUTHORS]);
	});

	it('uploads to the three authoring buckets (0009 + 0015 storage policies)', async () => {
		// NO `returning`, deliberately. Postgres evaluates a RETURNING clause
		// against the SELECT policy, and the public `gauntlet` bucket has none --
		// it is served without auth by its public URL, so nothing ever needed one.
		// An `insert ... returning` here therefore fails for EVERY caller, admin
		// included (measured), which would read as a correct refusal and quietly
		// assert nothing. The write is done bare and the landing is confirmed as
		// the owner, outside RLS.
		for (const bucket of ['gauntlet', 'gauntlet-drawings', 'gauntlet-models']) {
			const admitted: Who[] = [];
			for (const who of EVERYONE) {
				const key = `${bucket}/${who}.bin`;
				if (
					await admits(who, async (q) => {
						await q(
							`insert into storage.objects (bucket_id, name, owner)
							 values ($1, $2, (select auth.uid()))`,
							[bucket, key]
						);
						return true;
					})
				) {
					admitted.push(who);
				}
				const { rows } = await db.sql(
					`select id from storage.objects where bucket_id = $1 and name = $2`,
					[bucket, key]
				);
				// The gate's answer and the object's existence agree.
				expect(rows.length, `${who} on ${bucket}`).toBe(admitted.includes(who) ? 1 : 0);
			}
			expect(admitted, `bucket ${bucket}`).toEqual([...AUTHORS]);
		}
	});

	it('hosts a room, and can delete the room it hosts (0028 + 0025)', async () => {
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			const roomId = await db
				.asUser(user[who].id, async (q) => {
					const { rows } = await q<{ v: { id: string } }>(
						`select public.gauntlet_room_create() as v`
					);
					return rows[0].v.id;
				})
				.catch(() => null);
			if (!roomId) continue;
			admitted.push(who);
			// Hosting without being able to clear the room would be a trap, so the
			// delete is asserted for the same caller in the same breath.
			await db.asUser(user[who].id, (q) =>
				q(`select public.gauntlet_room_delete($1)`, [roomId])
			);
			const { rows: gone } = await db.sql(`select id from public.gauntlet_rooms where id = $1`, [
				roomId
			]);
			expect(gone.length, `${who} could not clear their own room`).toBe(0);
		}
		expect(admitted).toEqual([...AUTHORS]);
	});
});

// ---------------------------------------------------------------------------
// SHUT: the gates the tier must NOT have widened. This half is the one whose
// failure is invisible.
// ---------------------------------------------------------------------------

describe('what the author tier must NOT reach', () => {
	it("does not read another student's submission (0067's item four)", async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(`select id from public.submissions where id = $1`, [
				studentSubmissionId
			]);
			return rows.length === 1;
		});
		// The student is absent because this is not their row -- it is, so they
		// read it through the own-row disjunct. Assert that explicitly rather than
		// letting it hide in the set.
		expect(got).toEqual(['admin', 'student']);
	});

	it("does not read another student's Speedrun attempts, run events or run analysis", async () => {
		// gauntlet_run_analysis is keyed on run_id and has no id column.
		for (const [table, key] of [
			['gauntlet_speedrun_attempts', 'id'],
			['gauntlet_run_events', 'id'],
			['gauntlet_run_analysis', 'run_id']
		] as const) {
			const got = await matrix(async (q) => {
				const { rows } = await q(
					`select ${key} from public.${table} where user_id = $1`,
					[user.student.id]
				);
				return rows.length > 0;
			});
			expect(got, `table ${table}`).toEqual(['admin', 'student']);
		}
	});

	it('does not rewrite the global Speedrun ruleset (0015)', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`update public.gauntlet_speedrun_ruleset set projection = 'changed by ' || public.current_user_email()
				 where id returning id`
			);
			return rows.length === 1;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('POSITIVE CONTROL: everybody can READ that ruleset', async () => {
		// So the update failing for three callers is a write refusal and not the
		// row being missing or the table unreadable.
		const got = await matrix(async (q) => {
			const { rows } = await q(`select id from public.gauntlet_speedrun_ruleset`);
			return rows.length === 1;
		});
		expect(got).toEqual([...EVERYONE]);
	});

	it('does not write the gauntlet-tools bucket (0031)', async () => {
		// Bare insert for the same reason as the three buckets above.
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			const key = `tools/${who}.bin`;
			if (
				await admits(who, async (q) => {
					await q(
						`insert into storage.objects (bucket_id, name, owner)
						 values ('gauntlet-tools', $1, (select auth.uid()))`,
						[key]
					);
					return true;
				})
			) {
				admitted.push(who);
			}
			const { rows } = await db.sql(
				`select id from storage.objects where bucket_id = 'gauntlet-tools' and name = $1`,
				[key]
			);
			expect(rows.length, `${who} on gauntlet-tools`).toBe(admitted.includes(who) ? 1 : 0);
		}
		// POSITIVE CONTROL is the admin's own row: the insert path works, so the
		// three empty results are a policy refusal and not a broken statement.
		expect(admitted).toEqual([...ADMIN_ONLY]);
	});

	it('does not play an UNPUBLISHED challenge (the eleven draft gates stay on is_teacher())', async () => {
		const got = await matrix(async (q) => {
			await q(`select public.gauntlet_knowledge_start($1)`, [draftId]);
			return true;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('POSITIVE CONTROL: everybody can start the PUBLISHED one', async () => {
		const got = await matrix(async (q) => {
			await q(`select public.gauntlet_knowledge_start($1)`, [publishedId]);
			return true;
		});
		expect(got).toEqual([...EVERYONE]);
	});

	it('does not read the admin roster', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(`select email from public.app_admins`);
			return rows.length > 0;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('does not read the AUTHOR roster either -- it carries staff emails', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(`select email from public.gauntlet_authors`);
			return rows.length > 0;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('does not grant or revoke authoring -- the tier does not propagate', async () => {
		const granted = await matrix(async (q) => {
			await q(`select public.gauntlet_author_grant($1)`, ['someone.else@boscotech.edu']);
			return true;
		});
		expect(granted).toEqual([...ADMIN_ONLY]);

		const revoked = await matrix(async (q) => {
			await q(`select public.gauntlet_author_revoke($1)`, ['someone.else@boscotech.edu']);
			return true;
		});
		expect(revoked).toEqual([...ADMIN_ONLY]);
	});

	it('does not read the per-student practice meter or run review (0151, 0152)', async () => {
		// BEHAVIOUR FIRST: a non-admin gets an empty set. Both functions gate
		// inside their own `bounds` CTE, so nothing raises and nothing comes back.
		for (const fn of ['gauntlet_practice_pressure', 'gauntlet_run_review']) {
			for (const who of ['author', 'teacher', 'student'] as const) {
				const rows = await db.asUser(user[who].id, async (q) => {
					const { rows: r } = await q(`select * from public.${fn}()`);
					return r.length;
				});
				expect(rows, `${fn} answered ${who}`).toBe(0);
			}
		}

		// THAT ALONE PROVES NOTHING, and saying so is the point: the seeded
		// student work does not satisfy either function's filters (a macro run
		// with a trail, a practice cadence), so the ADMIN reads zero rows too and
		// the behavioural probe cannot tell a closed gate from an empty table.
		// Building a fixture either one would return is a macro-run harness this
		// file has no other use for. What IS decidable, and is the actual claim,
		// is that 0155 did not re-gate them: read the deployed bodies back out of
		// pg_proc, which is the same instrument the migration's own self-check
		// uses -- the catalog, never the file.
		const { rows: shut } = await db.sql<{ proname: string; widened: boolean }>(
			`select p.proname, p.prosrc like '%gauntlet_can_author%' as widened
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
				and p.proname in ('gauntlet_practice_pressure', 'gauntlet_run_review')
			 order by p.proname`
		);
		expect(shut.map((r) => r.proname)).toEqual(['gauntlet_practice_pressure', 'gauntlet_run_review']);
		expect(shut.every((r) => r.widened === false)).toBe(true);

		// POSITIVE CONTROL for that `false`: the identical query over the seven
		// functions 0155 DID re-gate answers true for every one of them, so a
		// query that simply matched nothing cannot be what produced the result
		// above.
		const { rows: open } = await db.sql<{ n: string }>(
			`select count(*)::text as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
				and p.proname in ('gauntlet_author_get', 'gauntlet_author_upsert',
					'gauntlet_author_set_status', 'gauntlet_author_delete',
					'gauntlet_series_assign', 'gauntlet_room_create', 'gauntlet_room_delete')
				and p.prosrc like '%gauntlet_can_author%'`
		);
		expect(open[0].n).toBe('7');
	});

	it('and the four student-work POLICIES still read is_teacher(), not the new predicate', async () => {
		// The policy half of the same claim, read off pg_policy. These four are
		// where a leak would be silent: nothing on screen changes, nobody is
		// refused, and the tier is reading what every student answered.
		const { rows } = await db.sql<{ polname: string; widened: boolean; teacher: boolean }>(
			`select pol.polname,
				pg_get_expr(pol.polqual, pol.polrelid) like '%gauntlet_can_author%' as widened,
				pg_get_expr(pol.polqual, pol.polrelid) like '%is_teacher%' as teacher
			 from pg_policy pol
			 where pol.polname in ('teachers read all submissions', 'read own attempts',
				'read own run events', 'read own run analysis')
			 order by pol.polname`
		);
		expect(rows).toHaveLength(4);
		expect(rows.every((r) => r.widened === false)).toBe(true);
		// POSITIVE CONTROL: the same expression genuinely contains the OLD
		// predicate, so `widened === false` is a real read and not a query that
		// matched an empty string.
		expect(rows.every((r) => r.teacher === true)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The roster's own rules, mirrored from app_admins
// ---------------------------------------------------------------------------

describe('the allowlist behaves like app_admins', () => {
	it('refuses a non-@boscotech.edu address', async () => {
		await expect(
			db.asUser(user.admin.id, (q) =>
				q(`select public.gauntlet_author_grant($1)`, ['someone@gmail.com'])
			)
		).rejects.toThrow(/boscotech\.edu/);
	});

	it('normalizes the address, so one person cannot hold two rows', async () => {
		await db.asUser(user.admin.id, (q) =>
			q(`select public.gauntlet_author_grant($1)`, ['  MiXeD@BoscoTech.edu '])
		);
		const { rows } = await db.sql<{ email: string; n: string }>(
			`select email, count(*)::text as n from public.gauntlet_authors
			 where email like 'mixed%' group by email`
		);
		expect(rows).toEqual([{ email: 'mixed@boscotech.edu', n: '1' }]);
	});

	it('revoking removes the tier, and leaves an admin untouched', async () => {
		await db.asUser(user.admin.id, (q) =>
			q(`select public.gauntlet_author_revoke($1)`, [user.author.email])
		);
		const after = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.gauntlet_can_author() as ok`);
			return rows[0].ok === true;
		});
		expect(after).toEqual([...ADMIN_ONLY]);

		// Put it back so file order cannot matter to anything added later.
		await db.asUser(user.admin.id, (q) =>
			q(`select public.gauntlet_author_grant($1)`, [user.author.email])
		);
	});

	it('has no client write path to the table itself', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`insert into public.gauntlet_authors (email) values ($1) returning email`,
				[`self.${Math.random().toString(36).slice(2)}@boscotech.edu`]
			);
			return rows.length === 1;
		});
		// Not even an admin: writes are the definer RPCs, exactly as app_admins
		// has it. A grant here would be a second way in to keep authorized.
		expect(got).toEqual([]);
	});

	it('is not executable by anon (the 0137 default-privileges trap)', async () => {
		const { rows } = await db.sql<{ anon: boolean }>(
			`select has_function_privilege('anon', 'public.gauntlet_can_author()', 'execute') as anon`
		);
		expect(rows[0].anon).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Re-applying the file
// ---------------------------------------------------------------------------

describe('0155 re-applies', () => {
	it('pastes cleanly a second time over a database that already has it', async () => {
		// Re-pasting a migration is ordinary here -- somebody re-runs it, or a
		// first attempt failed partway and gets retried -- so a file that only
		// works once fails exactly then, with the schema half built. The seed is
		// `on conflict do nothing` and every other statement is create-or-replace,
		// `if not exists` or drop-then-create, and the self-check's own DO block
		// runs again on the way past.
		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/0155_gauntlet_authoring_tier.sql'),
			'utf8'
		);
		await expect(db.sql(sql)).resolves.toBeDefined();

		// And the world is unchanged: the tier still admits exactly the two, and
		// the roster did not gain a duplicate seed row.
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.gauntlet_can_author() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...AUTHORS]);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.gauntlet_authors where email = 'wcosso@boscotech.edu'`
		);
		expect(rows[0].n).toBe('1');
	});
});
