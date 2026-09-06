// tests/dom/tournament-host-control-mount.test.ts
//
// THE TAP COUNT BETWEEN TWO MATCHES, MEASURED ON THE REAL CONTROL (prompt 0077).
//
// Mr. Pina runs the IDEA100 Hook Design Competition bracket from a phone, in
// class, between matches. What he does between one match and the next is:
// pick the winner, submit it, start the next one. That is three taps, and it
// has to stay three -- a fourth (a confirm, an arm step, a scroll to a
// control) is the finding this bundle exists to prevent. `svelte/server`'s
// `render()` cannot count a tap: it produces one string per call and no
// handler runs. This file mounts `HostMatchControl` in happy-dom, drives it
// with real clicks against the in-memory simulator that mirrors 0062, and
// counts.
//
// WHAT IS ASSERTED: click counts, which callback ran with which payload, and
// the match rows' state transitions (pending -> in_progress -> complete). NOT
// geometry: happy-dom has no layout engine, so the 44px floors on these same
// controls are `npm run verify:browser`'s claim (routes/tournaments-*.mjs)
// and are deliberately not read here (tests/dom/README.md).
//
// THE POSITIVE CONTROL: the bundle's history entry records that with an arm
// step put back in front of Start (a second click required), `three taps`
// below reddens on the count and on the state transition together.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import HostMatchControl from '$lib/tournaments/HostMatchControl.svelte';
import { matchQueue } from '$lib/tournaments/live';
import { entryMap } from '$lib/tournaments/tournaments';
import {
	buildSim,
	forfeitMatch,
	startMatch,
	startNext,
	submitResult,
	type Sim
} from '../../src/routes/dev/tournaments/sim';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Control = HostMatchControl as unknown as Component<Record<string, unknown>>;

const mounted: Mounted[] = [];
afterEach(async () => {
	while (mounted.length) await mounted.pop()!.stop();
});

function click(el: Element | null, taps: { n: number }) {
	if (!el) throw new Error('nothing to click');
	el.dispatchEvent(new Event('click', { bubbles: true }));
	taps.n += 1;
}

/**
 * The route's arrangement in miniature: callbacks that write the sim, then
 * hand the component the new rows -- what `invalidateAll` does for real.
 */
function mountLive(sim: Sim, extra: Record<string, unknown> = {}) {
	const calls: { name: string; args: unknown[] }[] = [];
	const props = reactiveProps<Record<string, unknown>>({
		matches: [...sim.matches],
		entries: entryMap(sim.entries),
		scoreEntry: false,
		busy: false,
		onstart: (id: string) => {
			calls.push({ name: 'start', args: [id] });
			const ok = startMatch(sim, id);
			props.matches = [...sim.matches];
			return ok;
		},
		onsubmit: (id: string, result: unknown) => {
			calls.push({ name: 'submit', args: [id, result] });
			const ok = submitResult(sim, id, result);
			props.matches = [...sim.matches];
			return ok;
		},
		onforfeit: (id: string, result: unknown) => {
			calls.push({ name: 'forfeit', args: [id, result] });
			const r = result as { winner_id: string; reason: string };
			const ok = forfeitMatch(sim, id, r.winner_id, r.reason);
			props.matches = [...sim.matches];
			return ok;
		},
		oncorrect: (id: string, result: unknown, reason: string) => {
			calls.push({ name: 'correct', args: [id, result, reason] });
			return true;
		},
		...extra
	});
	const m = mountInto(Control, props);
	mounted.push(m);
	return { m, props, calls };
}

describe('between two matches on the host console', () => {
	it('three taps: pick the winner, submit, start the next -- and the rows move with them', () => {
		const sim = buildSim(8);
		startNext(sim);
		const live = matchQueue(sim.matches).inProgress[0];
		const next = matchQueue(sim.matches).ready[0];
		expect(live).toBeTruthy();
		expect(next).toBeTruthy();
		const { m, calls } = mountLive(sim);
		const taps = { n: 0 };

		// The in-progress match is on screen with its result form open, and
		// the next match is on screen with its Start, BEFORE anything is
		// pressed: nothing has to be opened to reach either.
		const liveBlock = m.one(`[data-match-state="live"][data-match-id="${live.id}"]`);
		expect(liveBlock.querySelector('.result-form')).not.toBeNull();
		expect(m.one(`[data-match-state="next"][data-match-id="${next.id}"] .btn.start`)).toBeTruthy();

		// 1. pick the winner (side A)
		click(liveBlock.querySelectorAll('.pick')[0], taps);
		m.flush();
		// 2. submit
		click(liveBlock.querySelector('.btn.go'), taps);
		m.flush();
		expect(calls.map((c) => c.name)).toEqual(['submit']);
		expect(calls[0].args[0]).toBe(live.id);
		expect(calls[0].args[1]).toEqual({ games: [{ winner: 'a' }] });
		const decided = sim.matches.find((x) => x.id === live.id)!;
		expect(decided.status).toBe('complete');
		expect(decided.winner_id).toBe(live.entry_a_id);
		// The form for the decided match is gone and the next match still
		// leads with its Start.
		expect(m.all(`[data-match-state="live"]`)).toHaveLength(0);
		const nextBlock = m.one(`[data-match-state="next"][data-match-id="${next.id}"]`);

		// 3. start the next
		click(nextBlock.querySelector('.btn.start'), taps);
		m.flush();
		expect(calls.map((c) => c.name)).toEqual(['submit', 'start']);
		expect(calls[1].args[0]).toBe(next.id);
		expect(sim.matches.find((x) => x.id === next.id)!.status).toBe('in_progress');
		expect(m.one(`[data-match-state="live"][data-match-id="${next.id}"] .result-form`)).toBeTruthy();

		expect(taps.n).toBe(3);
	});

	it('the winner pick is not itself a submit: one tap records nothing', () => {
		const sim = buildSim(8);
		startNext(sim);
		const live = matchQueue(sim.matches).inProgress[0];
		const { m, calls } = mountLive(sim);
		const taps = { n: 0 };
		click(m.one(`[data-match-state="live"] .pick`), taps);
		m.flush();
		expect(calls).toHaveLength(0);
		expect(sim.matches.find((x) => x.id === live.id)!.status).toBe('in_progress');
		expect(taps.n).toBe(1);
	});

	it('submit with no winner picked refuses locally and calls nothing', () => {
		const sim = buildSim(8);
		startNext(sim);
		const { m, calls } = mountLive(sim);
		const taps = { n: 0 };
		click(m.one(`[data-match-state="live"] .btn.go`), taps);
		m.flush();
		expect(calls).toHaveLength(0);
		expect(m.one('[data-match-state="live"] .err').textContent).toMatch(/pick the winner/i);
	});
});

describe('a forfeit on the host console', () => {
	it('is five taps with no keyboard: open, side, preset reason, confirm, confirm', () => {
		const sim = buildSim(8);
		startNext(sim);
		const live = matchQueue(sim.matches).inProgress[0];
		const { m, calls } = mountLive(sim);
		const taps = { n: 0 };
		const block = () => m.one(`[data-match-id="${live.id}"]`);

		click(block().querySelector('.mini.gold'), taps); // 1. open the forfeit panel
		m.flush();
		expect(block().querySelector('.ff')).not.toBeNull();
		expect(block().querySelector('.result-form')).toBeNull();

		click(block().querySelectorAll('.ff .pick')[1], taps); // 2. side B advances
		m.flush();
		click(block().querySelector('.ff .chip'), taps); // 3. preset reason
		m.flush();
		expect((block().querySelector('.ff .reason') as HTMLInputElement).value).toBe('No-show');

		click(block().querySelector('.ff .go'), taps); // 4. arm
		m.flush();
		expect(calls).toHaveLength(0);
		expect(block().querySelector('.ff .go')!.textContent).toMatch(/^\s*Confirm:/);

		click(block().querySelector('.ff .go'), taps); // 5. confirm
		m.flush();
		expect(calls.map((c) => c.name)).toEqual(['forfeit']);
		expect(calls[0].args[1]).toEqual({
			forfeit: true,
			winner_id: live.entry_b_id,
			reason: 'No-show'
		});
		const decided = sim.matches.find((x) => x.id === live.id)!;
		expect(decided.status).toBe('complete');
		expect(decided.forfeit).toBe(true);
		expect(decided.winner_id).toBe(live.entry_b_id);
		expect(taps.n).toBe(5);
		// The panel closed on success.
		expect(m.all('.ff')).toHaveLength(0);
	});

	it('refuses to arm with no reason, so a chip is load-bearing and not decoration', () => {
		const sim = buildSim(8);
		startNext(sim);
		const { m, calls } = mountLive(sim);
		const taps = { n: 0 };
		click(m.one('[data-match-state="live"] .mini.gold'), taps);
		m.flush();
		click(m.one('.ff .pick'), taps);
		m.flush();
		click(m.one('.ff .go'), taps);
		m.flush();
		expect(calls).toHaveLength(0);
		expect(m.one('.ff .err').textContent).toMatch(/reason/i);
		expect(m.one('.ff .go').textContent).not.toMatch(/Confirm:/);
	});

	it('a forfeit the transport refuses leaves the panel open', () => {
		const sim = buildSim(8);
		startNext(sim);
		const { m } = mountLive(sim, { onforfeit: () => false });
		const taps = { n: 0 };
		click(m.one('[data-match-state="live"] .mini.gold'), taps);
		m.flush();
		click(m.one('.ff .pick'), taps);
		m.flush();
		click(m.one('.ff .chip'), taps);
		m.flush();
		click(m.one('.ff .go'), taps);
		m.flush();
		click(m.one('.ff .go'), taps);
		m.flush();
		expect(m.all('.ff')).toHaveLength(1);
	});
});

describe('an omitted transport removes the control it drives', () => {
	it('no onping means no ping buttons; with one, a linked entry gets a button', () => {
		const sim = buildSim(8);
		startNext(sim);
		// Two linked accounts on the live match, so a ping is offerable.
		const live = matchQueue(sim.matches).inProgress[0];
		for (const e of sim.entries) {
			if (e.id === live.entry_a_id || e.id === live.entry_b_id) e.user_id = `user-${e.id}`;
		}
		const pingText = (m: Mounted) =>
			m.all('button').filter((b) => /^\s*ping /.test(b.textContent ?? ''));

		const without = mountLive(sim);
		expect(pingText(without.m)).toHaveLength(0);

		const pings: unknown[][] = [];
		const withPing = mountLive(sim, {
			onping: (...args: unknown[]) => {
				pings.push(args);
			}
		});
		const buttons = pingText(withPing.m);
		expect(buttons.length).toBeGreaterThanOrEqual(2);
		const taps = { n: 0 };
		click(buttons[0], taps);
		expect(pings).toHaveLength(1);
		expect(pings[0][0]).toBe(live.id);
	});

	it('no tournamentId means a completed row does not link anywhere', () => {
		const sim = buildSim(8);
		startNext(sim);
		const live = matchQueue(sim.matches).inProgress[0];
		submitResult(sim, live.id, { games: [{ winner: 'a' }] });
		const plain = mountLive(sim);
		expect(plain.m.all('[data-match-state="done"] a')).toHaveLength(0);
		expect(plain.m.all('[data-match-state="done"]')).toHaveLength(1);
		const linked = mountLive(sim, { tournamentId: 'sim' });
		expect(linked.m.all('[data-match-state="done"] a')).toHaveLength(1);
		expect(linked.m.one<HTMLAnchorElement>('[data-match-state="done"] a').getAttribute('href')).toBe(
			`/tournaments/sim/match/${live.id}`
		);
	});
});
