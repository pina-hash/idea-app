// tests/db/grant-sequence-sweep-control.test.ts
//
// THE POSITIVE CONTROL FOR SECTION D OF tests/grant-surface.test.ts, AND IT
// EXISTS BECAUSE THAT SECTION'S ALLOWLIST IS EMPTY.
//
// Section D asserts that no sequence in `public` carries a USAGE, SELECT or
// UPDATE privilege for `anon` or `authenticated`, against a declared list with
// nothing in it. Every assertion it makes is therefore an absence over an
// absence -- and the failure mode of that shape is not a wrong answer, it is a
// green run that proves nothing: a renamed role, a typo in the privilege array,
// a catalog query that stopped matching `relkind = 'S'`, or a fixture that no
// longer carries the hosted default privileges all produce exactly the same
// clean sweep as a correctly narrowed schema.
//
// So this file MUTATES. It applies the whole real chain, confirms the sweep
// reads clean, grants `anon` one privilege on one real sequence, and asserts
// the sweep NAMES that sequence and that privilege and nothing else. Then it
// takes the grant back and asserts clean again, so the file cannot leave the
// database it ran on in a state another assertion could read.
//
// IT MUTATES THE CATALOG, NEVER A FILE ON DISK. CLAUDE.md's mutation-proof rule
// warns that `git checkout --` restores from HEAD rather than from whatever a
// script saved, and has three times discarded a session's uncommitted work
// while every remaining mutant then "passed" against a pristine tree. There is
// nothing to restore here: the grant and the revoke are two statements against
// this file's own throwaway database, which `startTestDb` drops in `stop()`.
//
// IT USES THE SAME SWEEP THE THING IT CONTROLS USES, imported from
// tests/db/grant-sweeps.ts. A control running its own copy of the query would
// prove the copy works.
//
// THE SEQUENCE IT MUTATES IS A REAL ONE, `tournament_match_events_id_seq`, and
// not one this file creates. A created sequence would be mutation-proof of a
// sweep over objects nobody ships; this is one of the three 0203 narrowed, so
// what is being proven is that the sweep sees the exact objects the migration
// was written for.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, type TestDb } from './harness';
import {
	SEQUENCE_PRIVILEGES,
	sequenceCount,
	sequencesHeldBy,
	describeSeq,
	viewFacts,
	type SeqHeld
} from './grant-sweeps';

const MIGRATION_DIR = new URL('../../supabase/migrations', import.meta.url);
const ALL_MIGRATIONS = readdirSync(MIGRATION_DIR)
	.filter((f) => f.endsWith('.sql'))
	.sort();

const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** The sequence this file grants on, and the one 0203's own notice names first. */
const SUBJECT = 'tournament_match_events_id_seq';

/** The other two 0203 narrowed, asserted to stay clean while SUBJECT is open. */
const SIBLINGS = ['gauntlet_run_events_id_seq', 'tournament_reward_ledger_id_seq'] as const;

async function sweep(db: TestDb): Promise<SeqHeld[]> {
	return [...(await sequencesHeldBy(db, 'anon')), ...(await sequencesHeldBy(db, 'authenticated'))];
}

describe('the sequence sweep bites: a granted privilege is named', () => {
	let db: TestDb;

	beforeAll(async () => {
		db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	}, 300_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('applied the whole chain, including 0203', () => {
		expect(
			ALL_MIGRATIONS,
			'Without 0203 in the chain the three sequences are still open and the BEFORE state below ' +
				'is not clean, so the mutation proves nothing -- there would be nothing to tell apart.'
		).toContain('0203_sequence_anon_grant_sweep.sql');
	});

	it('sees the sequences at all', async () => {
		const n = await sequenceCount(db);
		expect(
			n,
			'The denominator. If this is 0 the sweep is looking at an empty set and every absence ' +
				'assertion in section D, and the BEFORE assertion below, is green for the wrong reason.'
		).toBe(3);
	});

	it('BEFORE: reads clean, which is what 0203 leaves behind', async () => {
		const held = await sweep(db);
		expect(
			held.map(describeSeq),
			'0203 revoked USAGE, SELECT and UPDATE from public, anon and authenticated on all three ' +
				'sequences. If this is not empty, the mutation below cannot be told apart from the ' +
				'state that was already there.'
		).toEqual([]);
	});

	it('AFTER a grant: names exactly the mutated sequence, role and privilege', async () => {
		await db.sql(`grant usage on sequence public.${SUBJECT} to anon`);
		try {
			const held = await sweep(db);

			expect(
				held.map(describeSeq),
				'THE MUTATION. One privilege, on one real sequence, for one role -- exactly the shape ' +
					'the project default privileges write and exactly what 0203 removed. A sweep that ' +
					'reports nothing here is a sweep that would have reported nothing about the three ' +
					'sequences that were genuinely open, and section D would be decoration.'
			).toEqual([`usage on sequence ${SUBJECT} (anon)`]);

			// Both halves separately, so a sweep that over-reports is caught too.
			expect(
				held.filter((h) => h.role === 'authenticated'),
				'The grant was to `anon` alone. A sweep answering for `authenticated` as well is ' +
					'reading the wrong role and would call a clean schema dirty.'
			).toEqual([]);
			expect(
				held.filter((h) => (SIBLINGS as readonly string[]).includes(h.name)),
				'The other two sequences were not touched and must not be named. A sweep that reports ' +
					'every sequence regardless of its ACL passes the assertion above for the wrong ' +
					'reason.'
			).toEqual([]);
			expect(
				held.filter((h) => h.privilege !== 'usage'),
				'SELECT and UPDATE were not granted. The privilege list is unnested per object, so a ' +
					'sweep that ignored `has_sequence_privilege` and listed all three would look right ' +
					'in the count and be wrong in the content.'
			).toEqual([]);
		} finally {
			await db.sql(`revoke usage on sequence public.${SUBJECT} from anon`);
		}
	});

	it('AFTER the revoke: reads clean again, so this file leaves nothing behind', async () => {
		const held = await sweep(db);
		expect(held.map(describeSeq)).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// THE SAME CONTROL FOR SECTION E's OTHER ABSENCE ASSERTION.
	//
	// E declares `anon: []` on all seven views and asserts it, which is the
	// same absence-over-an-absence shape as D. The exhaustiveness half of E
	// fails loudly on its own -- a view added or removed changes a list of
	// names -- but "anon holds nothing on any view" would read clean from a
	// sweep that had stopped seeing views, and `heldBy` filters on
	// `relkind in ('r','v','m','p')`, so a view silently dropping out of that
	// set is a real way for it to happen.
	// -----------------------------------------------------------------------
	it('the view sweep bites too: a granted view privilege is named for `anon`', async () => {
		const views = await viewFacts(db);
		expect(views.length, 'The denominator, and section E pins it at 7.').toBe(7);

		const subject = 'coin_balances';
		expect(views.map((v) => v.name)).toContain(subject);

		const anonOnViews = async () => {
			const { rows } = await db.sql<{ relname: string; privilege: string }>(
				`select c.relname, p.privilege
				   from pg_class c
				   join pg_namespace n on n.oid = c.relnamespace
				   cross join unnest(array['select','insert','update','delete']) as p(privilege)
				  where n.nspname = 'public'
				    and c.relkind in ('v', 'm')
				    and has_table_privilege('anon', c.oid, p.privilege)
				  order by c.relname, p.privilege`
			);
			return rows.map((r) => `${r.privilege} on view ${r.relname}`);
		};

		expect(await anonOnViews(), 'BEFORE: anon reaches no view, which is what E asserts.').toEqual(
			[]
		);

		await db.sql(`grant select on public.${subject} to anon`);
		try {
			expect(
				await anonOnViews(),
				'THE MUTATION. One SELECT, on one real view, for `anon` -- a coin balance view read by ' +
					'the public internet, which is the disclosure E exists to refuse. A sweep reporting ' +
					'nothing here would report nothing about a real one.'
			).toEqual([`select on view ${subject}`]);
		} finally {
			await db.sql(`revoke select on public.${subject} from anon`);
		}

		expect(await anonOnViews(), 'AFTER: clean again, so this file leaves nothing behind.').toEqual(
			[]
		);
	});

	it('the privilege list is the whole of what a sequence can carry', () => {
		expect(
			[...SEQUENCE_PRIVILEGES].sort(),
			'A sequence has exactly these three privileges. If Postgres ever grows a fourth, a sweep ' +
				'over three of them reports clean about the one it cannot see.'
		).toEqual(['select', 'update', 'usage']);
	});
});
