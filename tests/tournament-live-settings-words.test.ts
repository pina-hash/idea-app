// The live-settings confirm's words (ledger 0392, 0266) and the lock that
// opens for an admin and only for an admin. The effect on played matches is
// always stated, and never claims a change the plan did not report.
import { describe, expect, test } from 'vitest';
import { liveEffectLines, liveRefusalSentence, normalizeLivePlan, LIVE_QUALS_LOCK } from '../src/lib/tournaments/live-settings';
import { settingsLocks } from '../src/lib/tournaments/settings';

describe('the lock', () => {
	test('a live event opens its format to an admin, qualifying stays locked', () => {
		const admin = settingsLocks({ status: 'live', pools: 0, qualResults: 0, liveAdmin: true });
		expect(admin).toEqual({ format: null, quals: LIVE_QUALS_LOCK, score: null });
	});
	test('control: the same event without the admin flag is locked as before, and complete stays locked for an admin', () => {
		expect(settingsLocks({ status: 'live', pools: 0, qualResults: 0 }).format).toMatch(/locked/);
		expect(settingsLocks({ status: 'live', pools: 0, qualResults: 0, liveAdmin: false }).format).toMatch(/locked/);
		expect(settingsLocks({ status: 'complete', pools: 0, qualResults: 0, liveAdmin: true }).format).toMatch(/complete/);
	});
});

describe('the confirm', () => {
	const plan = normalizeLivePlan({
		ok: true,
		changes: [
			{ key: 'score_entry', from: false, to: true },
			{ key: 'best_of_default', from: 1, to: 3 }
		],
		matches_restamped: 4,
		matches_kept_length: 2,
		matches_played: 1,
		stored: {},
		after: {}
	});
	test('every change, the played matches, the restamp, the kept lengths and coins', () => {
		const lines = liveEffectLines(plan);
		expect(lines).toEqual([
			'Scoring turns ON: from now on every result is entered with per-game scores.',
			'Match length changes from best of 1 to best of 3.',
			'1 match is already decided and keeps its recorded result. Nothing is re-decided.',
			'4 matches that have not started take the new length.',
			'2 matches already started or played keep the length they were played to.',
			'No coins move: rewards already recorded keep their amounts, and payouts are still settled at the end.'
		]);
	});
	test('control: a scoring-only change claims no length moves', () => {
		const lines = liveEffectLines(normalizeLivePlan({ ok: true, changes: [{ key: 'score_entry', from: true, to: false }], matches_played: 0 }));
		expect(lines.some((l) => /length/.test(l))).toBe(false);
		expect(lines).toContain('No match has been decided yet, so no result changes.');
	});
	test('a stale preview says nothing changed', () => {
		expect(liveRefusalSentence({ reason: 'stale' })).toMatch(/Nothing was changed/);
		expect(liveRefusalSentence({ reason: 'team_size_below_largest', largest: 3 })).toMatch(/\(3\)/);
	});
});
