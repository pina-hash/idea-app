// tests/gauntlet-leaderboard-history.test.ts
//
// 0154's own header names a regression it could not fix, because it lives
// under `src/`: `gauntlet_leaderboard` is a RANKING, and four list loaders --
// speedrun/+page.server.ts and the three knowledge-mode list route servers
// (drawing-reading, gdt-tolerance, spot-the-error) -- were reading it as a
// HISTORY of what a student has done. Since 0154 the board drops a wrong
// knowledge answer and a sub-floor modeling pass entirely, so a loader that
// derives "attempted"/"cleared" from board PRESENCE now answers wrong: a
// student who genuinely tried (and was wrong) reads as never having tried,
// and a student who genuinely cleared a level (under the floor) reads as
// never having cleared it.
//
// The fix reads `submissions` directly for a student's own history (RLS: "read
// own submissions", granted since 0004 -- no new RPC, no new grant) and keeps
// the board as the source for bestTime/rank, which are legitimately absent for
// an unranked run. This file proves that against a REAL Postgres with 0154
// APPLIED, because a claim about what these loaders read off a pre-0154 board
// proves nothing about the regression 0154 introduced.
//
// TWO PAGE KINDS, per CLAUDE.md's mutation-proof standard: speedrun (only
// `cleared`, no `attempted` field) and one knowledge mode driven fully against
// the database, plus a source-level equivalence sweep proving the other two
// knowledge modes carry the identical fix rather than the pre-0154 shape.
//
// MUTATION PROOF: each DB-driven assertion is re-run against a MUTANT of the
// loader that reverts to the pre-fix, board-presence-only derivation. The
// mutant is a NEW temporary file written beside the original and deleted in a
// `finally`; the original on disk is never touched, so there is nothing to
// restore and no `git checkout --` anywhere near this.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as SPEEDRUN_LOAD } from '../src/routes/gauntlet/speedrun/+page.server';
import { load as DRAWING_READING_LOAD } from '../src/routes/gauntlet/drawing-reading/+page.server';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SPEEDRUN_ROUTE = join(ROOT, 'src/routes/gauntlet/speedrun/+page.server.ts');
const DRAWING_READING_ROUTE = join(ROOT, 'src/routes/gauntlet/drawing-reading/+page.server.ts');
const GDT_TOLERANCE_ROUTE = join(ROOT, 'src/routes/gauntlet/gdt-tolerance/+page.server.ts');
const SPOT_THE_ERROR_ROUTE = join(ROOT, 'src/routes/gauntlet/spot-the-error/+page.server.ts');

const MIGRATION_FILE = new URL(
	'../supabase/migrations/0154_gauntlet_rank_what_is_checkable.sql',
	import.meta.url
);
const MIGRATION_SQL = readFileSync(MIGRATION_FILE, 'utf8');

const FLOOR_MS = 30_000;
const TARGET_VOLUME_MM3 = 61237.4408;

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
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
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
	'0153_gauntlet_unpublish_the_target.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let untouched: SeededUser;
let knowledgeWrongOnly: SeededUser;
let knowledgeCorrect: SeededUser;
let speedrunSubFloor: SeededUser;
let speedrunHonest: SeededUser;

let drawingReadingId: string;
let speedrunId: string;

function client(who: SeededUser) {
	return createPostgrestShim(db, fks, who.id);
}

interface SpeedrunLoadResult {
	challenges: Array<{ id: string; cleared: boolean; bestTime: number | null; rank: number | null }>;
}

interface KnowledgeLoadResult {
	challenges: Array<{
		id: string;
		cleared: boolean;
		attempted: boolean;
		bestTime: number | null;
		rank: number | null;
	}>;
}

async function driveSpeedrun(who: SeededUser): Promise<SpeedrunLoadResult> {
	const out = await SPEEDRUN_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return out as unknown as SpeedrunLoadResult;
}

async function driveDrawingReading(who: SeededUser): Promise<KnowledgeLoadResult> {
	const out = await DRAWING_READING_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return out as unknown as KnowledgeLoadResult;
}

/**
 * Runs the given loader as a MUTANT: a temporary copy of the file at
 * `routePath` with `transform` applied, imported from a sibling path (so its
 * relative/alias imports resolve exactly as the original's do) and deleted
 * before returning. The transform must actually change the source, or the
 * mutant is not a mutant and the proof is vacuous.
 */
async function withMutant<T>(
	routePath: string,
	transform: (src: string) => string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run: (load: any) => Promise<T>
): Promise<T> {
	const src = readFileSync(routePath, 'utf8');
	const mutated = transform(src);
	expect(mutated, 'mutation did not change the source').not.toBe(src);
	const mutantPath = join(dirname(routePath), `+page.server.mutant-${randomUUID()}.ts`);
	writeFileSync(mutantPath, mutated, 'utf8');
	try {
		const url = `${pathToFileURL(mutantPath).href}?t=${Date.now()}`;
		const mod = await import(/* @vite-ignore */ url);
		return await run(mod.load);
	} finally {
		rmSync(mutantPath, { force: true });
	}
}

/** Reverts the speedrun loader's `cleared` to the pre-fix, board-presence read. */
const revertSpeedrun = (src: string) =>
	src.replace('cleared: clearedIds.has(row.id),', 'cleared: best !== undefined,');

/** Reverts a knowledge loader's `cleared`/`attempted` to the pre-fix reads. */
const revertKnowledge = (src: string) =>
	src.replace(
		'cleared: clearedIds.has(c.id as string),\n\t\t\tattempted: attemptedIds.has(c.id as string),',
		'cleared: best?.is_correct === true,\n\t\t\tattempted: best !== undefined,'
	);

beforeAll(async () => {
	db = await startTestDb(CHAIN as unknown as string[]);
	fks = await loadForeignKeys(db);

	untouched = await createUser(db, 'untouched@boscotech.net', 'Never Tried');
	knowledgeWrongOnly = await createUser(db, 'wrong@boscotech.net', 'Wrong Only');
	knowledgeCorrect = await createUser(db, 'correct@boscotech.net', 'Got It Right');
	speedrunSubFloor = await createUser(db, 'subfloor@boscotech.net', 'Sub Floor');
	speedrunHonest = await createUser(db, 'honest@boscotech.net', 'Honest Modeller');

	const { rows: k } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
		 values ('drawing_reading', 'History fixture: knowledge', 1, 'published', '{}'::jsonb, $1::jsonb)
		 returning id`,
		[JSON.stringify({ correct: 'b' })]
	);
	drawingReadingId = k[0].id;

	const { rows: s } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
		 values ('speedrun', 'History fixture: speedrun', 1, 'published', '{}'::jsonb, $1::jsonb)
		 returning id`,
		[JSON.stringify({ target_volume_mm3: TARGET_VOLUME_MM3, tolerance_pct: 0.1, density: 2.7 })]
	);
	speedrunId = s[0].id;

	// --- knowledge: wrong-only history ----------------------------------
	await db.asUser(knowledgeWrongOnly.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"a"}'::jsonb, 4000)`, [drawingReadingId])
	);

	// --- knowledge: a genuine, correct clear -----------------------------
	await db.asUser(knowledgeCorrect.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"b"}'::jsonb, 20000)`, [drawingReadingId])
	);

	// --- modeling: forged (sub-floor) pass and an honest one -------------
	const run = async (user: SeededUser, backdateSeconds: number | null) => {
		const rv = await db.asUser(user.id, (q) =>
			q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [
				speedrunId
			])
		);
		const code = rv.rows[0].r.code;
		const st = await db.asUser(user.id, (q) =>
			q<{ r: { run_id: string } }>(`select public.gauntlet_macro_start($1::text, 0.0) as r`, [
				code
			])
		);
		if (backdateSeconds !== null) {
			await db.sql(
				`update public.gauntlet_run_tokens
				 set started_at = started_at - make_interval(secs => $2::numeric)
				 where code = $1`,
				[code, backdateSeconds]
			);
		}
		const sub = await db.asUser(user.id, (q) =>
			q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_macro_submit($1::text, $2::numeric, $3::text) as r`,
				[code, TARGET_VOLUME_MM3, st.rows[0].r.run_id]
			)
		);
		return sub.rows[0].r;
	};

	const forged = await run(speedrunSubFloor, null);
	const honestRun = await run(speedrunHonest, 420);

	// The fixture premise, asserted rather than assumed.
	expect(Number(forged.elapsed_ms)).toBeLessThan(FLOOR_MS);
	expect(Number(honestRun.elapsed_ms)).toBeGreaterThan(FLOOR_MS);

	// Now apply 0154 for real: the WHOLE point is that the loaders are proven
	// against a board that has already had this file applied over it.
	await db.sql(MIGRATION_SQL);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// The premise: 0154 really did remove these rows from the board.
// ===========================================================================
describe('the premise: the board (post-0154) really has dropped these seats', () => {
	it('the wrong knowledge answer holds no board row', async () => {
		const { rows } = await db.asUser(knowledgeWrongOnly.id, (q) =>
			q(
				`select 1 from public.gauntlet_leaderboard
				 where challenge_id = $1::uuid and user_id = $2::uuid`,
				[drawingReadingId, knowledgeWrongOnly.id]
			)
		);
		expect(rows).toHaveLength(0);
	});

	it('the sub-floor speedrun pass holds no board row', async () => {
		const { rows } = await db.asUser(speedrunSubFloor.id, (q) =>
			q(
				`select 1 from public.gauntlet_leaderboard
				 where challenge_id = $1::uuid and user_id = $2::uuid`,
				[speedrunId, speedrunSubFloor.id]
			)
		);
		expect(rows).toHaveLength(0);
	});
});

// ===========================================================================
// Knowledge page kind: drawing-reading, all three states, both fields.
// ===========================================================================
describe('drawing-reading list: history read from submissions, not the board', () => {
	it('a wrong-only history reads attempted, not cleared', async () => {
		const { challenges } = await driveDrawingReading(knowledgeWrongOnly);
		const row = challenges.find((c) => c.id === drawingReadingId)!;
		expect(row.attempted).toBe(true);
		expect(row.cleared).toBe(false);
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	it('a correct answer reads cleared and attempted, with a real time and rank', async () => {
		const { challenges } = await driveDrawingReading(knowledgeCorrect);
		const row = challenges.find((c) => c.id === drawingReadingId)!;
		expect(row.attempted).toBe(true);
		expect(row.cleared).toBe(true);
		expect(row.bestTime).not.toBeNull();
		expect(row.rank).not.toBeNull();
	});

	it('an untouched challenge reads as new', async () => {
		const { challenges } = await driveDrawingReading(untouched);
		const row = challenges.find((c) => c.id === drawingReadingId)!;
		expect(row.attempted).toBe(false);
		expect(row.cleared).toBe(false);
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	// --- mutation proof: the pre-fix, board-presence read gets all three wrong
	it('MUTATION PROOF: the pre-fix read fails the wrong-only case', async () => {
		const { challenges } = await withMutant<KnowledgeLoadResult>(DRAWING_READING_ROUTE, revertKnowledge, (load) =>
			load({
				locals: {
					supabase: client(knowledgeWrongOnly),
					claims: { sub: knowledgeWrongOnly.id, email: knowledgeWrongOnly.email, role: 'authenticated' }
				}
			})
		);
		const row = challenges.find((c: { id: string }) => c.id === drawingReadingId)!;
		// The regression this file exists to catch: board-presence says "never
		// attempted" for a student who genuinely, if wrongly, tried.
		expect(row.attempted).toBe(false);
	});

	it('MUTATION PROOF: the pre-fix read still gets the untouched and correct cases right', async () => {
		const untouchedOut = await withMutant<KnowledgeLoadResult>(DRAWING_READING_ROUTE, revertKnowledge, (load) =>
			load({
				locals: {
					supabase: client(untouched),
					claims: { sub: untouched.id, email: untouched.email, role: 'authenticated' }
				}
			})
		);
		const untouchedRow = untouchedOut.challenges.find((c: { id: string }) => c.id === drawingReadingId)!;
		expect(untouchedRow.attempted).toBe(false);
		expect(untouchedRow.cleared).toBe(false);

		const correctOut = await withMutant<KnowledgeLoadResult>(DRAWING_READING_ROUTE, revertKnowledge, (load) =>
			load({
				locals: {
					supabase: client(knowledgeCorrect),
					claims: { sub: knowledgeCorrect.id, email: knowledgeCorrect.email, role: 'authenticated' }
				}
			})
		);
		const correctRow = correctOut.challenges.find((c: { id: string }) => c.id === drawingReadingId)!;
		expect(correctRow.attempted).toBe(true);
		expect(correctRow.cleared).toBe(true);
	});
});

// ===========================================================================
// Modeling page kind: speedrun, all three states, the one field it exposes.
// ===========================================================================
describe('speedrun list: cleared read from submissions, not the board', () => {
	it('a sub-floor pass still reads cleared, having genuinely cleared it', async () => {
		const { challenges } = await driveSpeedrun(speedrunSubFloor);
		const row = challenges.find((c) => c.id === speedrunId)!;
		expect(row.cleared).toBe(true);
		// It does not rank, so there is no time or rank to show.
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	it('an honest, above-floor pass reads cleared, with a real time and rank', async () => {
		const { challenges } = await driveSpeedrun(speedrunHonest);
		const row = challenges.find((c) => c.id === speedrunId)!;
		expect(row.cleared).toBe(true);
		expect(row.bestTime).not.toBeNull();
		expect(row.rank).not.toBeNull();
	});

	it('an untouched challenge reads as new', async () => {
		const { challenges } = await driveSpeedrun(untouched);
		const row = challenges.find((c) => c.id === speedrunId)!;
		expect(row.cleared).toBe(false);
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	// --- mutation proof: the pre-fix, board-presence read loses the sub-floor clear
	it('MUTATION PROOF: the pre-fix read loses the sub-floor clear', async () => {
		const out = await withMutant<SpeedrunLoadResult>(SPEEDRUN_ROUTE, revertSpeedrun, (load) =>
			load({
				locals: {
					supabase: client(speedrunSubFloor),
					claims: { sub: speedrunSubFloor.id, email: speedrunSubFloor.email, role: 'authenticated' }
				}
			})
		);
		const row = out.challenges.find((c: { id: string }) => c.id === speedrunId)!;
		// The regression this file exists to catch: a genuine clear reads as
		// never cleared once the board (post-0154) drops the seat.
		expect(row.cleared).toBe(false);
	});

	it('MUTATION PROOF: the pre-fix read still gets the untouched and honest cases right', async () => {
		const untouchedOut = await withMutant<SpeedrunLoadResult>(SPEEDRUN_ROUTE, revertSpeedrun, (load) =>
			load({
				locals: {
					supabase: client(untouched),
					claims: { sub: untouched.id, email: untouched.email, role: 'authenticated' }
				}
			})
		);
		const untouchedRow = untouchedOut.challenges.find((c: { id: string }) => c.id === speedrunId)!;
		expect(untouchedRow.cleared).toBe(false);

		const honestOut = await withMutant<SpeedrunLoadResult>(SPEEDRUN_ROUTE, revertSpeedrun, (load) =>
			load({
				locals: {
					supabase: client(speedrunHonest),
					claims: { sub: speedrunHonest.id, email: speedrunHonest.email, role: 'authenticated' }
				}
			})
		);
		const honestRow = honestOut.challenges.find((c: { id: string }) => c.id === speedrunId)!;
		expect(honestRow.cleared).toBe(true);
	});
});

// ===========================================================================
// The other two knowledge modes: a source-level equivalence sweep, not a
// second full DB drive. `drawing-reading` above is proven behaviourally
// against a live database; this proves `gdt-tolerance` and `spot-the-error`
// carry the IDENTICAL fix (mode string aside) rather than the pre-0154 shape,
// which is what "find the equivalents" (the task) asks for without
// duplicating the same database proof four times over one shared pattern.
// ===========================================================================
describe('the other two knowledge-mode loaders carry the identical fix', () => {
	const knowledgeRoutes = [
		{ name: 'gdt-tolerance', path: GDT_TOLERANCE_ROUTE, mode: 'gdt_tolerance' },
		{ name: 'spot-the-error', path: SPOT_THE_ERROR_ROUTE, mode: 'spot_the_error' }
	] as const;

	it('POSITIVE CONTROL: the reference file (drawing-reading) itself matches the shape asserted below', () => {
		const src = readFileSync(DRAWING_READING_ROUTE, 'utf8');
		expect(src).toContain(`.from('submissions')`);
		expect(src).toContain(`.select('challenge_id, is_correct')`);
		expect(src).toContain('cleared: clearedIds.has(c.id as string),');
		expect(src).toContain('attempted: attemptedIds.has(c.id as string),');
	});

	for (const { name, path, mode } of knowledgeRoutes) {
		it(`${name}: reads its own \`submissions\` rows for \`cleared\`/\`attempted\``, () => {
			const src = readFileSync(path, 'utf8');
			expect(src, `${name} has no submissions read`).toContain(`.from('submissions')`);
			expect(src, `${name} does not select is_correct off submissions`).toContain(
				`.select('challenge_id, is_correct')`
			);
			// Filtered to this mode three times over: the challenges query, the
			// board query, and the new submissions query -- a loader that forgot
			// the mode filter on the new query would leak another mode's
			// attempts into this one's count.
			const modeFilterCount = (src.match(new RegExp(`\\.eq\\('mode', '${mode}'\\)`, 'g')) ?? []).length;
			expect(modeFilterCount, `${name} mode filter count`).toBe(3);
			expect(src, `${name} still derives cleared from clearedIds`).toContain(
				'cleared: clearedIds.has(c.id as string),'
			);
			expect(src, `${name} still derives attempted from attemptedIds`).toContain(
				'attempted: attemptedIds.has(c.id as string),'
			);
		});

		it(`${name}: the pre-0154-fix board-presence read is gone`, () => {
			const src = readFileSync(path, 'utf8');
			expect(src, `${name} still has the old cleared read`).not.toContain(
				'cleared: best?.is_correct === true,'
			);
			expect(src, `${name} still has the old attempted read`).not.toContain(
				'attempted: best !== undefined,'
			);
		});
	}
});
