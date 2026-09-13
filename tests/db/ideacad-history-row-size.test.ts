/**
 * MEASURED BYTES PER ACTION, against real Postgres.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS A TEST AND NOT A PARAGRAPH
 * ---------------------------------------------------------------------------
 *
 * The whole design rests on one number. Prompt 0189 and Mr. Pina sized it
 * together: at ~400 bytes an action, 100 students across three projects a year
 * is about 192 MB against a 500 MB tier shared with coins, notebooks, Foundry
 * and tournaments -- and that holds ONLY if a row is an action rather than a
 * snapshot. An estimate written into a header is a number nobody re-derives; a
 * measurement that runs on every suite run is one that reddens the day somebody
 * widens a column.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY IT IS `pg_total_relation_size` AND NOT `pg_column_size`
 * ---------------------------------------------------------------------------
 *
 * `pg_column_size(h.*)` answers the size of the tuple's DATA. It leaves out the
 * 24-byte heap header, the item pointer, page overhead, and -- the big one --
 * every index. This table carries two: the primary key on (concept_id, seq) and
 * the partial unique index on (concept_id, undoes_seq). A figure that ignored
 * them would understate the real cost by roughly a third and would be the
 * comfortable answer rather than the true one.
 *
 * So the headline number is a DELTA in `pg_total_relation_size` -- heap, both
 * indexes, TOAST and all -- across a large, realistic corpus, divided by the
 * actions that produced it. The corpus is large on purpose: Postgres allocates
 * in 8 KB pages, so a few hundred rows would have the measurement dominated by
 * quantisation.
 *
 * The `pg_column_size` breakdown is reported BESIDE it, because when the
 * headline moves, the breakdown is what says which column did it.
 *
 * ---------------------------------------------------------------------------
 * IF THIS GOES OVER
 * ---------------------------------------------------------------------------
 *
 * It fails, loudly, with the number. Prompt 0189's instruction was to say so
 * plainly rather than land it quietly, and a threshold nobody enforces is a
 * paragraph. What it must NOT do is get fixed by adding retention: Mr. Pina
 * asked for as far back as possible and pruning is a decision he makes, with a
 * measured number in front of him. The lever that is available without asking
 * him anything is `actor`, the widest column here -- normalising it to a small
 * integer would take roughly a quarter off a row, and it is a join bought with
 * a number, which is the right order to do it in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';
import { diffTrees, IDEACAD_ACTION_BUDGET_BYTES, stateAt } from '../../src/lib/ideacad/history';
import { bladeCorpus, CORPUS_ORIGIN } from '../ideacad-history-corpus';
import type { BladeTree } from '../../src/lib/ideacad/blade/tree';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/**
 * The scale prompt 0189's budget was quoted at: 480,000 actions is what 192 MB
 * at 400 bytes means, which is 100 students x 3 projects x ~1,600 actions.
 */
const BUDGET_SCALE_ACTIONS = 480_000;

/** Big enough that 8 KB page quantisation is under a percent of the answer. */
const CORPUS_EDITS = 1_400;

let db: TestDb;
let teacher: SeededUser;
let alice: SeededUser;
let itemId: string;
let conceptId: string;

const measured = {
	actions: 0,
	totalBytes: 0,
	perAction: 0,
	heapDataPerAction: 0,
	indexBytesPerAction: 0
};
const notes: string[] = [];

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

const totalSize = async (): Promise<number> => {
	const { rows } = await db.sql<{ n: string }>(
		`select pg_total_relation_size('public.ideacad_history') as n`
	);
	return Number(rows[0].n);
};

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'ideacad.size.teacher@boscotech.edu', 'Size Teacher');
	// A REALISTIC ADDRESS LENGTH, because `actor` is the widest column in the
	// table and a short fixture email would quietly flatter the measurement.
	// This is the shape a Bosco Tech student account actually has.
	alice = await createUser(db, 'alejandra.dominguez@boscotech.net', 'Alejandra Dominguez');
	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEASIZE', 'IdeaCAD Size')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 1', teacher.email]
	);
	await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		section.section_id,
		alice.email,
		alice.email
	]);
	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[section.section_id]]
	);
	itemId = item.item_id;
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		itemId,
		JSON.stringify({ defaultFeatures: CORPUS_ORIGIN })
	]);
	const opened = await call<{ concepts: Array<{ id: string }> }>(
		alice,
		'public.ideacad_open_document($1::uuid)',
		[itemId]
	);
	conceptId = opened.concepts[0].id;

	// ---------------------------------------------------------------------
	// The measurement.
	// ---------------------------------------------------------------------
	const before = await totalSize();
	const steps = bladeCorpus(CORPUS_EDITS, 424242);
	let revision = 1;
	let appended = 0;
	for (let i = 0; i < steps.length; i += 25) {
		const batch = steps.slice(i, i + 25);
		const actions = batch.flatMap((s) => diffTrees(s.before, s.after));
		revision += 1;
		const result = await call<{ ok: boolean; appended: number }>(
			alice,
			'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, $4)',
			[
				conceptId,
				JSON.stringify(actions),
				JSON.stringify(batch[batch.length - 1].after),
				revision
			]
		);
		if (!result.ok) throw new Error('the corpus write was refused');
		appended += result.appended;
	}
	// VACUUM so the page accounting is settled rather than mid-write. Nothing
	// here updates or deletes, so there is no bloat to reclaim -- this is about
	// the free space map and the visibility map being written, not about
	// flattering the number.
	await db.sql('vacuum analyze public.ideacad_history');
	const after = await totalSize();

	const { rows: breakdown } = await db.sql<{ heap: string; idx: string; tuples: string }>(`
		select sum(pg_column_size(h.*))::bigint as heap,
		       (pg_total_relation_size('public.ideacad_history')
		        - pg_relation_size('public.ideacad_history'))::bigint as idx,
		       count(*)::bigint as tuples
		from public.ideacad_history h
	`);

	measured.actions = appended;
	measured.totalBytes = after - before;
	measured.perAction = (after - before) / appended;
	measured.heapDataPerAction = Number(breakdown[0].heap) / Number(breakdown[0].tuples);
	measured.indexBytesPerAction = Number(breakdown[0].idx) / Number(breakdown[0].tuples);

	notes.push(
		`corpus: ${CORPUS_EDITS} accepted edits -> ${appended} action rows on one concept`,
		`pg_total_relation_size delta: ${measured.totalBytes} bytes`,
		`MEASURED BYTES PER ACTION (heap + both indexes + page overhead): ${measured.perAction.toFixed(1)}`,
		`  of which tuple data (pg_column_size, no 24-byte header): ${measured.heapDataPerAction.toFixed(1)}`,
		`  of which index (pk on (concept_id, seq) + partial unique on undoes_seq): ${measured.indexBytesPerAction.toFixed(1)}`,
		`budget: ${IDEACAD_ACTION_BUDGET_BYTES} bytes/action`,
		`projected at prompt 0189's own scale (${BUDGET_SCALE_ACTIONS.toLocaleString()} actions = 100 students x 3 projects): ` +
			`${((measured.perAction * BUDGET_SCALE_ACTIONS) / 1e6).toFixed(0)} MB ` +
			`(the budget's own figure at 400 bytes is 192 MB)`
	);
}, 900_000);

afterAll(async () => {
	// eslint-disable-next-line no-console
	console.log(['', 'IDEACAD ACTION LOG -- MEASURED SIZE', ...notes.map((n) => `  ${n}`), ''].join('\n'));
	await db?.stop();
});

describe('the measurement itself', () => {
	it('measured a corpus big enough that 8 KB page quantisation is noise', () => {
		expect(measured.actions).toBeGreaterThan(1_000);
		// One 8 KB page against the total, expressed as a share of the answer.
		const quantisationShare = 8192 / measured.totalBytes;
		expect(quantisationShare).toBeLessThan(0.02);
	});

	it('did not measure an empty table, which is the control every number above needs', () => {
		expect(measured.totalBytes).toBeGreaterThan(100_000);
		expect(measured.perAction).toBeGreaterThan(0);
		expect(measured.indexBytesPerAction).toBeGreaterThan(0);
	});
});

describe('BYTES PER ACTION, against the budget the design was sized on', () => {
	it(`is at or under ${IDEACAD_ACTION_BUDGET_BYTES} bytes, heap and every index included`, () => {
		// If this reddens, read the header: the answer is NOT retention.
		expect(measured.perAction).toBeLessThanOrEqual(IDEACAD_ACTION_BUDGET_BYTES);
	});

	it('projects under the 192 MB the budget was quoted at, at the same scale', () => {
		const projectedMb = (measured.perAction * BUDGET_SCALE_ACTIONS) / 1e6;
		expect(projectedMb).toBeLessThanOrEqual(192);
	});

	it('is an ACTION LOG rather than a snapshot log, which is what the budget assumes', async () => {
		// The comparison that makes the number mean something: what one stored
		// tree costs. A design that snapshotted per action would multiply the
		// heap figure above by this ratio.
		//
		// AND THE MEASURED RATIO IS SMALLER THAN THE FIGURE THE BUDGET WAS
		// ARGUED WITH, WHICH IS WORTH SAYING RATHER THAN ROUNDING PAST. Prompt
		// 0189 said a snapshot is "roughly a hundred times larger"; measured
		// against today's blade tree it is about SIX times, because that tree is
		// six features of scalars and is the smallest document this editor will
		// ever hold. The direction of the argument survives the correction and
		// the magnitude does not: a snapshot row grows with the part while an
		// action row does not, so the ratio is a floor that rises as IdeaCAD
		// grows, and the assertion below is written as a floor for that reason.
		const { rows } = await db.sql<{ tree: string; rowbytes: string }>(
			`select pg_column_size(c.features)::bigint as tree,
			        (select avg(pg_column_size(h.*))::bigint from public.ideacad_history h
			         where h.concept_id = c.id and h.seq > 0) as rowbytes
			 from public.ideacad_concepts c where c.id = $1::uuid`,
			[conceptId]
		);
		const ratio = Number(rows[0].tree) / Number(rows[0].rowbytes);
		notes.push(
			`one stored tree is ${rows[0].tree} bytes against ${rows[0].rowbytes} bytes for an action row ` +
				`-- a snapshot per action would be ${ratio.toFixed(0)}x this table`
		);
		expect(ratio).toBeGreaterThan(5);
	});

	it('still replays to the stored tree at this size, so the number is not bought with a broken log', async () => {
		const payload = await call<{ rows: Parameters<typeof stateAt>[0] }>(
			alice,
			'public.ideacad_concept_history($1::uuid, -1, 5000)',
			[conceptId]
		);
		const { rows } = await db.sql<{ features: BladeTree }>(
			'select features from public.ideacad_concepts where id = $1::uuid',
			[conceptId]
		);
		expect(stateAt(payload.rows)).toEqual(rows[0].features);
	});
});
