// tests/dom/gauntlet-modeling-run-target-disclosure.test.ts
//
// ModelingRun.svelte is the shared play screen for Reverse Engineer and
// Feature Golf. Both are macro-verified and rank on the same global board a
// Speedrun run does, so its spec card must withhold the target, its density
// and its tolerance band exactly as the Speedrun surfaces do (0153's own
// header): a level's own play screen is not exempt from the disclosure just
// because the mode is untimed.
//
// `FRAMING` is deliberately the LEGACY shape a pre-0153 row (or a deployment
// sitting between the push and the hand-applied migration) would still be
// holding -- `authoring.ts` stopped writing these keys into `prompt`, but
// nothing strips them from a row already stored. There is no band here at
// all (no manual-check RPC exists for these modes), so the only honest
// replacement is "Not published", never a dash.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import ModelingRun from '$lib/gauntlet/ModelingRun.svelte';
import { formatTime } from '$lib/gauntlet';
import { mountInto, type Mounted } from './mount';

const ME = '11111111-1111-1111-1111-111111111111';

/** The legacy shape: pre-0153 `prompt`, still carrying the ranked answer. */
const FRAMING = {
	material: 'Aluminum 6061',
	density: 2.7,
	density_unit: 'g/cm3',
	target_mass: 187,
	mass_unit: 'g',
	tolerance_pct: 2
};

function channelStub() {
	const channel = {
		on() {
			return channel;
		},
		subscribe() {
			return channel;
		}
	};
	return {
		supabase: {
			channel: () => channel,
			removeChannel: () => {},
			rpc: async () => ({ data: { code: 'ABCD1234', drawing: null }, error: null })
		}
	};
}

function mountRun() {
	const stub = channelStub();
	const m = mountInto(ModelingRun as unknown as Component<Record<string, unknown>>, {
		supabase: stub.supabase,
		challenge: { id: 'c1', title: 'Angle Bracket', difficulty: 2, framing: FRAMING },
		board: [],
		myUserId: ME,
		myBest: null,
		gated: true,
		metricLabel: 'Time',
		formatMetric: formatTime,
		backHref: '/gauntlet/feature-golf',
		ranked: false,
		next: null
	});
	return m;
}

/** Every string a legacy row's answer could leak through. */
const LEAKS = [/\bDensity\b/i, /±\s*2\s*%/, /2\.7\s*g\/cm3/, /\b187\b/];

function assertNoLeak(m: Mounted) {
	const text = m.target.textContent ?? '';
	for (const re of LEAKS) {
		expect(text).not.toMatch(re);
	}
}

describe('the ModelingRun spec card withholds the target, density and tolerance', () => {
	it('at the framing screen, from a legacy-shaped framing row', async () => {
		const m = mountRun();
		await m.settle();
		assertNoLeak(m);
		expect(m.target.textContent).toMatch(/Not published/i);
		await m.stop();
	});

	it('POSITIVE CONTROL: the legacy fixture really does carry the answer', () => {
		// If this fails, `assertNoLeak` above is vacuous: the fixture stopped
		// carrying anything that could leak, and the exclusion passed for the
		// wrong reason.
		expect(FRAMING.density).toBe(2.7);
		expect(FRAMING.target_mass).toBe(187);
		expect(FRAMING.tolerance_pct).toBe(2);
	});

	it('after Start reveals the code, still no leak', async () => {
		const m = mountRun();
		m.one<HTMLButtonElement>('.start-gate .btn').click();
		await m.settle();
		assertNoLeak(m);
		await m.stop();
	});
});
