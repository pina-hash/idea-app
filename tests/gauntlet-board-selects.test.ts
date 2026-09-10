// tests/gauntlet-board-selects.test.ts
//
// THE BOARD SELECT LADDER (0194). CLAUDE.md: "Ladders live in one shared module
// per subsystem, not inline in a route, and are covered by a test asserting the
// rungs strictly narrow."
//
// WHY THIS FAILS SILENTLY, which is the whole reason it is a test rather than a
// harness drive. `0194` is applied BY HAND, so a deployment sitting between this
// code and the migration is a real state. PostgREST refuses a select naming a
// column that does not exist with `42703` and fails the WHOLE request -- so a
// board read that lost its narrower rung would answer nothing on that
// deployment, and every Speedrun page would render an EMPTY LEADERBOARD. No
// error, no console message, no missing element: just a board that says nobody
// has cleared it. Nobody would report that as a bug for weeks.
//
// AND THE OTHER DIRECTION IS WORSE. If a `42703` degraded to a rung that still
// carried `rank_state`, the ladder would look like it worked and would answer
// with a capability flag that is a lie. `rankStateReady` is derived from the
// rung that actually succeeded, and that derivation is asserted here.

import { describe, it, expect } from 'vitest';
import {
	BOARD_BASE_COLUMNS,
	BOARD_SELECT_RUNGS,
	MY_BEST_SELECT_RUNGS,
	readBoard
} from '../src/lib/gauntlet/board-selects';

/** Split a select string into its column names, the way PostgREST reads it. */
const cols = (s: string) => s.split(',').map((c) => c.trim()).filter(Boolean);

describe('0194 board select rungs', () => {
	it('strictly narrow: every rung is a proper subset of the one above it', () => {
		for (const rungs of [BOARD_SELECT_RUNGS, MY_BEST_SELECT_RUNGS]) {
			// POSITIVE CONTROL for the sweep: a one-rung ladder is not a ladder,
			// and a zero-rung one would pass every assertion below vacuously.
			expect(rungs.length).toBeGreaterThanOrEqual(2);

			for (let i = 1; i < rungs.length; i++) {
				const wider = new Set(cols(rungs[i - 1]));
				const narrower = cols(rungs[i]);
				// Every column of the narrower rung is in the wider one...
				for (const c of narrower) expect(wider.has(c)).toBe(true);
				// ...and it is STRICTLY narrower, never merely different. A rung
				// that swapped a column for another of the same count would
				// satisfy a subset check written the other way round.
				expect(narrower.length).toBeLessThan(wider.size);
			}
		}
	});

	it('names rank_state on the widest rung and on no other', () => {
		for (const rungs of [BOARD_SELECT_RUNGS, MY_BEST_SELECT_RUNGS]) {
			expect(rungs[0]).toContain('rank_state');
			for (const rung of rungs.slice(1)) expect(rung).not.toContain('rank_state');
		}
	});

	it('ends on a rung that works on the schema 0154 left behind', () => {
		// The last rung is the pre-0194 select, exactly. Asserted against the
		// shared constant rather than a retyped list, so the two cannot drift.
		expect(BOARD_SELECT_RUNGS[BOARD_SELECT_RUNGS.length - 1]).toBe(BOARD_BASE_COLUMNS);
		expect(cols(BOARD_BASE_COLUMNS)).toContain('rank');
	});

	it('degrades on 42703 and reports the capability the SUCCEEDING rung had', async () => {
		const asked: string[] = [];
		const out = await readBoard<{ id: number }>(async (columns) => {
			asked.push(columns);
			// The pre-0194 database: the widest rung is refused, the next works.
			if (columns.includes('rank_state')) return { data: null, error: { code: '42703' } };
			return { data: [{ id: 1 }], error: null };
		});

		expect(asked.length).toBe(2);
		expect(out.rows).toEqual([{ id: 1 }]);
		// THE HALF THAT MATTERS: the rung that answered had no `rank_state`, so
		// the flag is false. "Cannot tell" must never reach a surface as "ranked".
		expect(out.rankStateReady).toBe(false);
	});

	it('stops at the widest rung and reports it ready when the column is there', async () => {
		const asked: string[] = [];
		const out = await readBoard<{ id: number }>(async (columns) => {
			asked.push(columns);
			return { data: [{ id: 7 }], error: null };
		});

		// POSITIVE CONTROL for the test above: an unnecessary second call would
		// mean the ladder walks past a rung that worked, which costs a round trip
		// and reports a narrower capability than the deployment actually has.
		expect(asked.length).toBe(1);
		expect(out.rankStateReady).toBe(true);
		expect(out.rows).toEqual([{ id: 7 }]);
	});

	it('FAILS CLOSED on any error that is not 42703, rather than degrading', async () => {
		// A permission failure, a dropped view or a statement timeout is not a
		// schema-version question, and answering it with a narrower select would
		// turn a broken read into a clean empty board -- which is the one outcome
		// a leaderboard must never produce. It stops on the WIDEST rung.
		const asked: string[] = [];
		const out = await readBoard<{ id: number }>(async (columns) => {
			asked.push(columns);
			return { data: null, error: { code: '42501' } };
		});

		expect(asked.length).toBe(1);
		expect(out.rows).toEqual([]);
		expect(out.rankStateReady).toBe(false);
	});
});
