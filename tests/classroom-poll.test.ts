// tests/classroom-poll.test.ts
//
// THE SHARED CLASSROOM POLLER (ledger 0357), driven through a fake clock, fake
// timers, a fake visibility flag and a seeded random source.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly: every rule the
// poller keeps fails SILENTLY. A poll that ticked twice on a tab return, ran in
// step with the rest of the class, kept asking while the tab was hidden, or
// went on asking as anon after the session was lost looks exactly like a poll
// that works -- the widget shows the right thing either way. What it costs is
// the database, and on 2026-09-29 and 2026-09-30 that cost was two outages.
// So each rule is asserted as a COUNT of runs, in both directions.

import { describe, expect, it } from 'vitest';
import {
	POLL_JITTER,
	POLL_MAX_BACKOFF_MS,
	POLL_MIN_POKE_GAP_MS,
	PollSignedOut,
	backoffMs,
	defaultPokeGapMs,
	isSignedOutFailure,
	jittered,
	startPoller,
	type PollOutcome,
	type PollerEnv
} from '../src/lib/classroom/poll';

/** A deterministic world: a clock, a timer queue, a visibility flag, a random tape. */
function world(randoms: number[] = [0.5]) {
	let now = 1_000_000;
	let hidden = false;
	let seq = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const pokes: (() => void)[] = [];
	let tape = 0;
	const env: PollerEnv = {
		now: () => now,
		random: () => randoms[Math.min(tape++, randoms.length - 1)],
		setTimeout(fn, ms) {
			const id = ++seq;
			timers.set(id, { at: now + ms, fn });
			return id;
		},
		clearTimeout(h) {
			timers.delete(h as number);
		},
		hidden: () => hidden,
		listen(poke) {
			pokes.push(poke);
			return () => {
				const i = pokes.indexOf(poke);
				if (i >= 0) pokes.splice(i, 1);
			};
		}
	};
	/** Move the clock, firing every timer that comes due, in order. */
	async function advance(ms: number) {
		const end = now + ms;
		for (;;) {
			const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
			if (!due) break;
			timers.delete(due[0]);
			now = due[1].at;
			due[1].fn();
			await flush();
		}
		now = end;
		await flush();
	}
	async function flush() {
		for (let i = 0; i < 20; i++) await Promise.resolve();
	}
	return {
		env,
		advance,
		flush,
		get now() {
			return now;
		},
		setHidden(h: boolean) {
			hidden = h;
		},
		/** What the browser does on a return to the tab: visibilitychange AND focus. */
		tabReturn() {
			for (const p of [...pokes]) p();
			for (const p of [...pokes]) p();
		},
		listeners: () => pokes.length,
		pendingTimers: () => timers.size
	};
}

function counter(outcomes: (PollOutcome | 'throw' | 'signed-out-throw')[] = []) {
	const runs: number[] = [];
	let i = 0;
	return {
		runs,
		run: (w: { now: number }) => async () => {
			runs.push(w.now);
			const o = outcomes[Math.min(i++, outcomes.length - 1)] ?? 'ok';
			if (o === 'throw') throw new Error('network');
			if (o === 'signed-out-throw') throw new PollSignedOut();
			return o;
		}
	};
}

describe('the arithmetic', () => {
	it('jitters by at most 20% either way, and never below a second unless asked for less', () => {
		expect(POLL_JITTER).toBe(0.2);
		expect(jittered(100_000, 0)).toBe(80_000);
		expect(jittered(100_000, 0.5)).toBe(100_000);
		expect(jittered(100_000, 0.999999)).toBeLessThanOrEqual(120_000);
		expect(jittered(100_000, 0.999999)).toBeGreaterThan(119_000);
		expect(jittered(5_000, 0)).toBe(4_000);
		expect(jittered(1_100, 0)).toBe(1_000); // the floor
		// A base under a second (a test's accelerated clock) is never stretched UP.
		expect(jittered(50, 0)).toBe(50);
		// Bounds over a sweep of the random source.
		let lo = Infinity;
		let hi = -Infinity;
		for (let r = 0; r < 1; r += 0.001) {
			const v = jittered(60_000, r);
			lo = Math.min(lo, v);
			hi = Math.max(hi, v);
		}
		expect(lo).toBeGreaterThanOrEqual(48_000);
		expect(hi).toBeLessThanOrEqual(72_000);
		expect(hi - lo).toBeGreaterThan(23_000); // the sweep really spread out
	});

	it('backs off by doubling from the interval to a five-minute cap', () => {
		expect(POLL_MAX_BACKOFF_MS).toBe(300_000);
		expect(backoffMs(30_000, 0)).toBe(30_000);
		expect(backoffMs(30_000, 1)).toBe(60_000);
		expect(backoffMs(30_000, 2)).toBe(120_000);
		expect(backoffMs(30_000, 3)).toBe(240_000);
		expect(backoffMs(30_000, 4)).toBe(300_000);
		expect(backoffMs(30_000, 40)).toBe(300_000);
	});

	it('a poke must clear at least 10 seconds, and a quarter of a slow interval', () => {
		expect(POLL_MIN_POKE_GAP_MS).toBe(10_000);
		expect(defaultPokeGapMs(30_000)).toBe(10_000);
		expect(defaultPokeGapMs(180_000)).toBe(45_000);
	});

	it('reads 401, 403, 42501 and the JWT codes as signed out, and a network failure as not', () => {
		expect(isSignedOutFailure({ code: '42501' })).toBe(true);
		expect(isSignedOutFailure({ code: 'PGRST301' })).toBe(true);
		expect(isSignedOutFailure({ code: '' }, 401)).toBe(true);
		expect(isSignedOutFailure({ code: 'P0001' }, 403)).toBe(true);
		// The negatives: a network failure, a timeout, a raised refusal, a missing RPC.
		expect(isSignedOutFailure({ code: '' }, 0)).toBe(false);
		expect(isSignedOutFailure({ code: '57014' }, 500)).toBe(false);
		expect(isSignedOutFailure({ code: 'P0001' }, 400)).toBe(false);
		expect(isSignedOutFailure({ code: 'PGRST202' }, 404)).toBe(false);
		expect(isSignedOutFailure(null)).toBe(false);
	});
});

describe('out of step with the rest of the class', () => {
	it('waits a random time in [0, interval) for the first run, then the interval +/- 20%', async () => {
		const w = world([0.25, 0, 0.999999, 0.5]);
		const c = counter();
		startPoller({ intervalMs: 60_000, run: c.run(w), env: w.env });
		const start = w.now;
		await w.advance(15_000 - 1);
		expect(c.runs.length).toBe(0);
		await w.advance(1);
		expect(c.runs).toEqual([start + 15_000]);
		await w.advance(48_000); // 60s at random 0 is 48s
		expect(c.runs.length).toBe(2);
		await w.advance(71_000); // random ~1 is ~72s
		expect(c.runs.length).toBe(2);
		await w.advance(1_000);
		expect(c.runs.length).toBe(3);
	});

	it('spreads twenty-one clients across the interval instead of landing them together', async () => {
		const firsts: number[] = [];
		for (let i = 0; i < 21; i++) {
			const w = world([i / 21]);
			const c = counter();
			startPoller({ intervalMs: 90_000, run: c.run(w), env: w.env });
			const t0 = w.now;
			await w.advance(90_000);
			firsts.push(c.runs[0] - t0);
		}
		expect(new Set(firsts).size).toBe(21);
		expect(Math.min(...firsts)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...firsts)).toBeLessThan(90_000);
	});

	it('an immediate poller runs at once, and only then on the jittered interval', async () => {
		const w = world([0.5]);
		const c = counter();
		startPoller({ intervalMs: 30_000, immediate: true, run: c.run(w), env: w.env });
		await w.flush();
		expect(c.runs.length).toBe(1);
		await w.advance(29_999);
		expect(c.runs.length).toBe(1);
		await w.advance(1);
		expect(c.runs.length).toBe(2);
	});
});

describe('one request in flight', () => {
	it('drops a poke while a run is outstanding, and schedules the next only after it ends', async () => {
		const w = world([0.5]);
		let release: () => void = () => undefined;
		let runs = 0;
		const p = startPoller({
			intervalMs: 60_000,
			immediate: true,
			pokeGapMs: 0,
			run: () =>
				new Promise<void>((r) => {
					runs++;
					release = r;
				}),
			env: w.env
		});
		expect(runs).toBe(1);
		expect(p.inFlight).toBe(true);
		w.tabReturn();
		p.poke();
		await w.advance(10 * 60_000); // no timer is pending while the run is out
		expect(runs).toBe(1);
		expect(w.pendingTimers()).toBe(0);
		release();
		await w.flush();
		expect(p.inFlight).toBe(false);
		expect(w.pendingTimers()).toBe(1);
		await w.advance(60_000);
		expect(runs).toBe(2);
	});
});

describe('a return to the tab is one call', () => {
	it('visibilitychange and focus together are ONE run, and a second return inside the gap is none', async () => {
		const w = world([0.5]);
		const c = counter();
		startPoller({ intervalMs: 180_000, run: c.run(w), env: w.env });
		// Inside the gap after the page load: the load just answered, ask nothing.
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(0);
		await w.advance(defaultPokeGapMs(180_000));
		w.tabReturn(); // two events, as the browser fires them
		await w.flush();
		expect(c.runs.length).toBe(1);
		await w.advance(defaultPokeGapMs(180_000) - 1);
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(1);
		await w.advance(1);
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(2);
	});

	it('the old focus storm: twenty focus events a minute cost at most four runs a minute on a 3-minute widget', async () => {
		const w = world([0.5]);
		const c = counter();
		startPoller({ intervalMs: 180_000, run: c.run(w), env: w.env });
		for (let i = 0; i < 60; i++) {
			await w.advance(3_000);
			w.tabReturn();
			await w.flush();
		}
		// Three minutes of focus every 3 seconds.
		expect(c.runs.length).toBeLessThanOrEqual(4);
		expect(c.runs.length).toBeGreaterThanOrEqual(3);
	});
});

describe('paused while hidden', () => {
	it('a tick that comes due while hidden asks nothing, and the return runs it', async () => {
		const w = world([0.5]);
		const c = counter();
		startPoller({ intervalMs: 60_000, run: c.run(w), env: w.env });
		w.setHidden(true);
		await w.advance(10 * 60_000);
		expect(c.runs.length).toBe(0);
		w.tabReturn(); // still hidden: nothing
		await w.flush();
		expect(c.runs.length).toBe(0);
		w.setHidden(false);
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(1);
		// And it is back on its interval.
		await w.advance(60_000);
		expect(c.runs.length).toBe(2);
	});

	it('an immediate poller started hidden waits for the tab', async () => {
		const w = world([0.5]);
		const c = counter();
		w.setHidden(true);
		startPoller({ intervalMs: 30_000, immediate: true, run: c.run(w), env: w.env });
		await w.advance(60_000);
		expect(c.runs.length).toBe(0);
		w.setHidden(false);
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(1);
	});
});

describe('backs off a failing database', () => {
	it('doubles the wait on each failure to the five-minute cap, and one success resets it', async () => {
		const w = world([0.5]);
		const c = counter(['failed', 'throw', 'failed', 'failed', 'failed', 'ok', 'ok']);
		startPoller({ intervalMs: 60_000, immediate: true, run: c.run(w), env: w.env });
		await w.flush();
		const gaps: number[] = [];
		for (let i = 0; i < 6; i++) {
			const before = c.runs.length;
			const t0 = w.now;
			while (c.runs.length === before) await w.advance(1_000);
			gaps.push(w.now - t0);
		}
		expect(gaps).toEqual([120_000, 240_000, 300_000, 300_000, 300_000, 60_000]);
	});

	it('a tab return does not cut a backoff short', async () => {
		const w = world([0.5]);
		const c = counter(['failed', 'ok']);
		startPoller({ intervalMs: 60_000, immediate: true, run: c.run(w), env: w.env });
		await w.flush();
		await w.advance(60_000);
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(1);
		await w.advance(60_000);
		expect(c.runs.length).toBe(2);
	});
});

describe('stops when the session is gone, and never asks as anon', () => {
	it('a signed-out run stops every timer and listener path, and hands over once', async () => {
		const w = world([0.5]);
		const c = counter(['ok', 'signed-out']);
		let handed = 0;
		const p = startPoller({
			intervalMs: 60_000,
			immediate: true,
			run: c.run(w),
			onSignedOut: () => handed++,
			env: w.env
		});
		await w.flush();
		await w.advance(60_000);
		expect(c.runs.length).toBe(2);
		expect(p.signedOut).toBe(true);
		expect(handed).toBe(1);
		// Positive control for the absence below: time and returns would have run it.
		await w.advance(60 * 60_000);
		w.tabReturn();
		p.poke();
		await w.flush();
		expect(c.runs.length).toBe(2);
		expect(handed).toBe(1);
		expect(w.pendingTimers()).toBe(0);
	});

	it('a thrown PollSignedOut is signed out; any other throw is a failure that backs off', async () => {
		const w = world([0.5]);
		const c = counter(['signed-out-throw']);
		const p = startPoller({ intervalMs: 60_000, immediate: true, run: c.run(w), env: w.env });
		await w.flush();
		expect(p.signedOut).toBe(true);
		const w2 = world([0.5]);
		const c2 = counter(['throw', 'ok']);
		const p2 = startPoller({ intervalMs: 60_000, immediate: true, run: c2.run(w2), env: w2.env });
		await w2.flush();
		expect(p2.signedOut).toBe(false);
		expect(p2.failures).toBe(1);
	});

	it('restarts only for a NEW session, never for none and never for the one it stopped on', async () => {
		const w = world([0.5]);
		const c = counter(['signed-out', 'ok']);
		const p = startPoller({ intervalMs: 60_000, immediate: true, run: c.run(w), env: w.env });
		p.authChanged('user:100');
		await w.flush();
		expect(p.signedOut).toBe(true);
		p.authChanged(null);
		p.authChanged('user:100');
		await w.advance(10 * 60_000);
		expect(c.runs.length).toBe(1);
		p.authChanged('user:200'); // a refreshed token
		await w.flush();
		expect(p.signedOut).toBe(false);
		expect(c.runs.length).toBe(2);
		await w.advance(60_000);
		expect(c.runs.length).toBe(3);
	});
});

describe('runNow, for a caller that knows it needs an answer', () => {
	it('runs past the gap and a backoff, restarts the wait from itself, and never runs hidden or in flight', async () => {
		const w = world([0.5]);
		const c = counter(['failed', 'ok', 'ok', 'ok']);
		const p = startPoller({ intervalMs: 60_000, immediate: true, run: c.run(w), env: w.env });
		await w.flush();
		expect(p.failures).toBe(1);
		await w.advance(5_000);
		p.runNow(); // inside the gap AND inside a backoff: runs anyway
		await w.flush();
		expect(c.runs.length).toBe(2);
		// The wait restarted from that run: nothing for 60s, then one.
		await w.advance(59_999);
		expect(c.runs.length).toBe(2);
		await w.advance(1);
		expect(c.runs.length).toBe(3);
		// Hidden: owed to the return, not run.
		w.setHidden(true);
		p.runNow();
		await w.flush();
		expect(c.runs.length).toBe(3);
		w.setHidden(false);
		w.tabReturn();
		await w.flush();
		expect(c.runs.length).toBe(4);
	});

	it('is refused once signed out', async () => {
		const w = world([0.5]);
		const c = counter(['signed-out']);
		const p = startPoller({ intervalMs: 60_000, immediate: true, run: c.run(w), env: w.env });
		await w.flush();
		p.runNow();
		await w.flush();
		expect(c.runs.length).toBe(1);
	});
});

describe('a token refreshed while a request is out', () => {
	it('does not stop on a refusal that belongs to the session that was just replaced', async () => {
		const w = world([0.5]);
		let release: (o: PollOutcome) => void = () => undefined;
		let runs = 0;
		const p = startPoller({
			intervalMs: 60_000,
			run: () =>
				new Promise<PollOutcome>((r) => {
					runs++;
					release = r;
				}),
			env: w.env
		});
		p.authChanged('user:100');
		p.runNow();
		await w.flush();
		expect(runs).toBe(1);
		// While the anon request is out, the token is refreshed.
		p.authChanged('user:200');
		release('signed-out');
		await w.flush();
		expect(p.signedOut).toBe(false);
		// It asks again, under the new session, on an ordinary backed-off wait.
		await w.advance(backoffMs(60_000, 1));
		expect(runs).toBe(2);
		// The control: a refusal under the CURRENT session still stops it.
		release('signed-out');
		await w.flush();
		expect(p.signedOut).toBe(true);
	});
});

describe('stop', () => {
	it('removes the listener and the timer', async () => {
		const w = world([0.5]);
		const c = counter();
		const p = startPoller({ intervalMs: 60_000, run: c.run(w), env: w.env });
		expect(w.listeners()).toBe(1);
		p.stop();
		expect(w.listeners()).toBe(0);
		await w.advance(10 * 60_000);
		expect(c.runs.length).toBe(0);
	});
});

describe('the cadences, against the database rules and the 2026-09-30 load', () => {
	it("the student's beat stays inside 0200's own limits at both ends of the jitter", async () => {
		const { PRESENCE_BEAT_STRETCH, PRESENCE_LIMITS_FALLBACK: L } = await import(
			'../src/lib/classroom/presence/state'
		);
		const beat = L.heartbeatSeconds * PRESENCE_BEAT_STRETCH;
		const longest = beat * (1 + POLL_JITTER);
		const shortest = beat * (1 - POLL_JITTER);
		// The credit cap is two heartbeats (`_classroom_presence_credit_cap`, 60s).
		expect(longest).toBeLessThanOrEqual(L.heartbeatSeconds * 2);
		expect(longest).toBeLessThanOrEqual(L.inputWindowSeconds);
		expect(longest).toBeLessThan(L.awayWindowSeconds);
		// The class's own throttle (80% of the beat less half a second) clears the
		// database's floor, so no honest beat is refused.
		expect(shortest - 0.5).toBeGreaterThan(L.minGapSeconds);
		expect(beat).toBe(40);
	});

	it('cuts a student\'s steady-state calls a minute by at least half, on the class page and the item page', async () => {
		const [
			{ HALL_PASS_POLL_MS },
			{ SONG_QUEUE_POLL_MS },
			{ CLASS_TEAMS_POLL_MS },
			{ PRESENCE_BEAT_STRETCH, PRESENCE_LIMITS_FALLBACK },
			{ QUICK_POSTS_POLL_MS }
		] = await Promise.all([
			import('../src/lib/classroom/hall-pass'),
			import('../src/lib/classroom/song-queue'),
			import('../src/lib/classroom/class-teams'),
			import('../src/lib/classroom/presence/state'),
			import('../src/lib/classroom/quick-posts')
		]);
		const perMinute = (ms: number) => 60_000 / ms;
		// THE BASELINE, measured from main at 8d703f5 (ledger 0357's audit): hall
		// pass 45s, songs 90s, posted teams 60s, presence beat 30s.
		const classBefore = perMinute(45_000) + perMinute(90_000) + perMinute(60_000);
		const itemBefore = classBefore + perMinute(30_000);
		// The class's notices (ledger 0360, R22) poll too, on the section layout,
		// so they count on both pages: ten minutes is the headroom 0357 left.
		const classAfter =
			perMinute(HALL_PASS_POLL_MS) +
			perMinute(SONG_QUEUE_POLL_MS) +
			perMinute(CLASS_TEAMS_POLL_MS) +
			perMinute(QUICK_POSTS_POLL_MS);
		const itemAfter =
			classAfter + perMinute(PRESENCE_LIMITS_FALLBACK.heartbeatSeconds * 1000 * PRESENCE_BEAT_STRETCH);
		expect(classBefore).toBeCloseTo(3.0, 5);
		expect(itemBefore).toBeCloseTo(5.0, 5);
		expect(classAfter).toBeCloseTo(1.0, 5);
		expect(itemAfter).toBeCloseTo(2.5, 5);
		expect(classAfter).toBeLessThanOrEqual(classBefore / 2);
		expect(itemAfter).toBeLessThanOrEqual(itemBefore / 2);
	});
});
