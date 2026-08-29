// tests/dom/gauntlet-room-target-disclosure.test.ts
//
// A ROOM RUN RANKS ON THE SAME GLOBAL BOARD A SOLO SPEEDRUN RUN DOES
// (`source = 'macro'`, and a supervised manual entry ranks too), so the room
// page must withhold the ranked target, its density and its pass band exactly
// as the solo Speedrun page does (0153's own header). Before this file the
// room page derived a `{ lo, hi }` band straight from `framing.target_mass`
// and `framing.tolerance_pct` and printed Density / Target mass / Tolerance
// on TWO spec cards (the racer's and the host's lobby summary) -- the room's
// human witness watches the ROOM, not the leaderboard, so that disclosure was
// not defensible just because a host happened to be present.
//
// WHY A DOM MOUNT AND NOT AN SSR RENDER. The replacement is a band-driven
// closeness bar and a "you measured" line, both of which only exist once a
// manual check answers -- state reached through `submitManual`'s RPC call,
// which never runs under `svelte/server` (no effects, no click handlers). The
// pre-check spec cards ARE assertable under SSR, and are covered here too, so
// a single file proves both halves: nothing leaks before a check and nothing
// leaks after one either.
//
// `FRAMING` is deliberately the LEGACY shape (0153 stopped writing these keys,
// but did not strip them from rows already stored, and the room loader still
// reads `prompt` whole) -- exactly the row a pre-migration deployment, or one
// where 0153's own migration has not been applied yet, would still be holding.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import RoomPage from '../../src/routes/gauntlet/rooms/[id]/+page.svelte';
import { DEFAULT_SPEEDRUN_RULESET, deviationBandLabel } from '$lib/gauntlet';
import { mountInto, type Mounted } from './mount';
import * as nav from '../stubs/app-navigation';

const ME = '11111111-1111-1111-1111-111111111111';
const HOST = '22222222-2222-2222-2222-222222222222';

/** The legacy shape: pre-0153 `prompt`, still carrying the ranked answer. */
const FRAMING = {
	title: 'Angle Bracket',
	difficulty: 2,
	material: 'Aluminum 6061',
	density: 2.7,
	density_unit: 'g/cm3',
	// Deliberately distinct from any `your_mass` a test below drives, so a
	// leak of this exact figure cannot be confused with a legitimate render
	// of the student's own measured mass.
	target_mass: 187,
	mass_unit: 'g',
	tolerance_pct: 2,
	unit_system: 'MMGS'
};

type RpcCall = { name: string; args: unknown };

/**
 * The narrowest client the room page uses: a chainable Realtime channel (three
 * `.on()` registrations, matching `onMount`) and an `rpc` dispatcher keyed by
 * function name, so `gauntlet_room_reveal` (fired on mount, since the room
 * starts `live`) and `gauntlet_room_manual_submit` (fired by the test) each
 * get their own scripted answer.
 */
function supabaseStub(answers: Record<string, unknown>) {
	const calls: RpcCall[] = [];
	const channel = {
		on() {
			return channel;
		},
		subscribe() {
			return channel;
		}
	};
	return {
		calls,
		supabase: {
			channel: () => channel,
			removeChannel: () => {},
			async rpc(name: string, args: unknown) {
				calls.push({ name, args });
				const data = answers[name];
				if (data === undefined) throw new Error(`unscripted rpc: ${name}`);
				return { data, error: null };
			}
		}
	};
}

function mountRoom(answers: Record<string, unknown>) {
	const stub = supabaseStub({
		gauntlet_room_reveal: { drawing: null, code: 'ABCD1234', started_at: new Date().toISOString() },
		...answers
	});
	const data = {
		supabase: stub.supabase,
		userName: 'Racer One',
		userRole: 'student',
		room: {
			id: 'room-1',
			host_id: HOST,
			join_code: 'ABC123',
			current_challenge_id: 'c1',
			state: 'live',
			started_at: new Date().toISOString(),
			created_at: new Date().toISOString()
		},
		amHost: false,
		myRole: 'racer',
		myUserId: ME,
		roster: [
			{ user_id: HOST, role: 'racer', player: 'Host' },
			{ user_id: ME, role: 'racer', player: 'Racer One' }
		],
		board: [],
		framing: FRAMING,
		modelUrl: null,
		ruleset: DEFAULT_SPEEDRUN_RULESET,
		speedrunChallenges: []
	};
	const m = mountInto(RoomPage as unknown as Component<Record<string, unknown>>, { data });
	return { m, stub };
}

/**
 * Every string a legacy row's answer could leak through: the Density label
 * (never rendered any more), the exact target mass and density values, and
 * the tolerance percentage. NOT "tolerance" as a bare word -- the band's own
 * vocabulary ("Outside tolerance", "In tolerance") legitimately uses it and
 * always has, on this page and on the solo Speedrun page alike; what must
 * never appear is the WIDTH of that band.
 */
const LEAKS = [/\bDensity\b/i, /±\s*2\s*%/, /2\.7\s*g\/cm3/, /\b187\b/];

function assertNoLeak(m: Mounted) {
	const text = m.target.textContent ?? '';
	for (const re of LEAKS) {
		expect(text).not.toMatch(re);
	}
}

beforeEach(() => nav.reset());

describe('the room spec cards withhold the target, density and tolerance', () => {
	it('a racer in a live round sees no leak, from a legacy-shaped framing row', async () => {
		const { m } = mountRoom({});
		await m.settle();
		assertNoLeak(m);
		// Replaced with the same wording the solo Speedrun page uses.
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
});

describe('a band-driven display replaces the target after a manual check', () => {
	it('renders the four-step fill and the student\'s own measured mass, never a target', async () => {
		const { m } = mountRoom({
			gauntlet_room_manual_submit: {
				is_correct: false,
				score_metric: 41.2,
				rank: null,
				your_mass: 150,
				mass_unit: 'g',
				deviation_band: 'near',
				coaching_remaining: 3
			}
		});
		await m.settle();

		const massInput = m.one<HTMLInputElement>('.mass-input');
		massInput.value = '150';
		massInput.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		m.one<HTMLButtonElement>('.practice .btn').click();
		await m.settle();

		// The verdict is the band's own wording, never a number beside a target.
		expect(m.one<HTMLElement>('.result-verdict').textContent?.trim()).toBe(
			deviationBandLabel('near')
		);
		// The closeness bar, straight off the band -- LiveTelemetry's shape.
		const fill = m.one<HTMLElement>('.band-fill.band-near');
		expect(fill.getAttribute('style')).toMatch(/width:\s*45%/);
		// The student's OWN typed mass, never what it was checked against.
		expect(m.target.textContent).toMatch(/You measured 150 g/i);

		assertNoLeak(m);
		await m.stop();
	});

	it('POSITIVE CONTROL: a pass renders the pass band at full fill', async () => {
		const { m } = mountRoom({
			gauntlet_room_manual_submit: {
				is_correct: true,
				score_metric: 12.4,
				rank: 1,
				your_mass: 190,
				mass_unit: 'g',
				deviation_band: 'pass',
				coaching_remaining: 3
			}
		});
		await m.settle();

		const massInput = m.one<HTMLInputElement>('.mass-input');
		massInput.value = '190';
		massInput.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		m.one<HTMLButtonElement>('.practice .btn').click();
		await m.settle();

		expect(m.one<HTMLElement>('.result-verdict').textContent?.trim()).toBe('Pass, verified');
		const fill = m.one<HTMLElement>('.band-fill.band-pass');
		expect(fill.getAttribute('style')).toMatch(/width:\s*100%/);
		expect(m.target.textContent).toMatch(/You measured 190 g/i);

		assertNoLeak(m);
		await m.stop();
	});
});

describe('the host lobby summary withholds the target too', () => {
	it('a host sees material but no target mass', async () => {
		const stub = supabaseStub({
			gauntlet_room_reveal: {
				drawing: null,
				code: null,
				started_at: new Date().toISOString()
			}
		});
		const data = {
			supabase: stub.supabase,
			userName: 'Host One',
			userRole: 'teacher',
			room: {
				id: 'room-1',
				host_id: HOST,
				join_code: 'ABC123',
				current_challenge_id: 'c1',
				state: 'lobby',
				started_at: null,
				created_at: new Date().toISOString()
			},
			amHost: true,
			myRole: 'host',
			myUserId: HOST,
			roster: [{ user_id: HOST, role: 'racer', player: 'Host' }],
			board: [],
			framing: FRAMING,
			modelUrl: null,
			ruleset: DEFAULT_SPEEDRUN_RULESET,
			speedrunChallenges: [{ id: 'c1', title: 'Angle Bracket', difficulty: 2 }]
		};
		const m = mountInto(RoomPage as unknown as Component<Record<string, unknown>>, { data });
		await m.settle();

		expect(m.target.textContent).toMatch(/Angle Bracket/);
		expect(m.target.textContent).toMatch(/Aluminum 6061/);
		assertNoLeak(m);
		await m.stop();
	});
});
