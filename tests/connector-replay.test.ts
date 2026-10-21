// tests/connector-replay.test.ts
//
// THE NIGHTLY REPLAY (ledger 0422): saved requests were never replayed. These
// hold the judge to the registry (a live tool passes, a missing one fails, a
// site_call step must be among site_find_tool's five) and the runner to its
// once-a-night guard, its record, and leaving a gap that is not built out.

import { describe, expect, it } from 'vitest';
import { judgeSavedRequest, runNightlyReplay } from '../src/lib/server/connector/replay';
import type { ConnectorBackend } from '../src/lib/server/connector/types';

function fakeBackend(lastReplayAt: number | null, recordAs: string | null) {
	const recorded: unknown[] = [];
	const backend = {
		replayState: async () => ({
			evals: [
				{ id: 'e1', seq: 1, said: 'who hasn\'t turned in Shop Fix in Block 2', level: 'read', expected_path: ['read_grades'] },
				{ id: 'e2', seq: 2, said: 'make a seating chart for Block 2', level: 'refuse', expected_path: ['report_gap'] },
				{ id: 'e3', seq: 3, said: 'do the impossible', level: 'read', expected_path: ['no_such_tool'] },
				{ id: 'e4', seq: 4, said: 'list the contracts', level: 'read', expected_path: ['site_call:coin_contracts_admin'] }
			],
			lastReplayAt,
			recordAs
		}),
		recordReplay: async (rows: unknown[]) => {
			recorded.push(...rows);
		}
	} as unknown as ConnectorBackend;
	return { backend, recorded };
}

describe('judging one saved request', () => {
	it('passes a live facade and fails a tool that does not exist (both directions)', () => {
		expect(judgeSavedRequest('read me the grades', ['read_grades'])?.passed).toBe(true);
		expect(judgeSavedRequest('x', ['no_such_tool'])?.passed).toBe(false);
	});
	it('a site_call step must exist AND be among the five matches for his words', () => {
		const good = judgeSavedRequest('list the contracts', ['site_call:coin_contracts_admin']);
		expect(good?.passed).toBe(true);
		expect(good?.steps[0].rank).toBeGreaterThanOrEqual(1);
		const unrouted = judgeSavedRequest('xyzzy plugh', ['site_call:coin_contracts_admin']);
		expect(unrouted?.passed).toBe(false);
		expect(unrouted?.steps[0]).toMatchObject({ exists: true, rank: null });
	});
	it('leaves out a gap that is not built yet', () => {
		expect(judgeSavedRequest('seating chart', ['report_gap'])).toBeNull();
	});
});

describe('the nightly run', () => {
	it('records one run per replayable request and counts the gaps it left out', async () => {
		const { backend, recorded } = fakeBackend(null, 'user-1');
		const a = await runNightlyReplay(backend, Date.parse('2026-10-22T10:17:00Z'));
		expect(a).toMatchObject({ ran: true, replayed: 3, passed: 2, failed: 1, gaps_waiting: 1 });
		expect(recorded).toHaveLength(3);
		expect((recorded as Array<{ userId: string }>).every((r) => r.userId === 'user-1')).toBe(true);
	});
	it('runs once a night: a second call within twenty hours records nothing', async () => {
		const now = Date.parse('2026-10-22T11:23:00Z');
		const { backend, recorded } = fakeBackend(now - 60 * 60_000, 'user-1');
		expect(await runNightlyReplay(backend, now)).toMatchObject({ ran: false, reason: 'already ran tonight' });
		expect(recorded).toHaveLength(0);
	});
	it('records nothing when there is no connection to record it under', async () => {
		const { backend, recorded } = fakeBackend(null, null);
		expect((await runNightlyReplay(backend)).ran).toBe(false);
		expect(recorded).toHaveLength(0);
	});
});
