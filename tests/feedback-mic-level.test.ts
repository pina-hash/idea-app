// tests/feedback-mic-level.test.ts
//
// THE LOUDNESS METER CAN LEAVE A MICROPHONE OPEN, AND NOTHING ON SCREEN WOULD
// SAY SO. Report 5ab3adb6 asked for a live level beside STOP; `mic-level.ts`
// opens its own capture for it, so the property that matters is the one no
// harness can see: every track it opened is stopped, every context closed,
// including when `close()` lands BEFORE the browser has answered. Driven with
// injected fakes, so no microphone and no `AudioContext` are needed.
//
// The no-request sweep for this module sits beside the dictation one, in
// tests/feedback-dictation.test.ts.

import { describe, expect, it } from 'vitest';
import { MicLevel, levelOf, type MicLevelDeps } from '../src/lib/feedback/mic-level';

interface World {
	deps: MicLevelDeps;
	tracks: { stopped: boolean }[];
	contexts: { closed: boolean; resumed: number }[];
	asked: number;
	ticks: (() => void)[];
	resolveStream: () => void;
	sample: number;
}

/** A browser, in memory. `holdStream` keeps getUserMedia pending until released. */
function world(
	opts: { permission?: string; holdStream?: boolean; rejectStream?: boolean; suspended?: boolean; hangResume?: boolean } = {}
): World {
	const w: World = {
		deps: {},
		tracks: [],
		contexts: [],
		asked: 0,
		ticks: [],
		resolveStream: () => {},
		sample: 0
	};
	const makeStream = () => {
		const track = { stopped: false, stop: () => (track.stopped = true) };
		w.tracks.push(track);
		return { getTracks: () => [track] };
	};
	w.deps = {
		permissions: { query: async () => ({ state: opts.permission ?? 'granted' }) },
		mediaDevices: {
			getUserMedia: () => {
				w.asked++;
				if (opts.rejectStream) return Promise.reject(new Error('NotAllowedError'));
				if (!opts.holdStream) return Promise.resolve(makeStream());
				return new Promise((resolve) => {
					w.resolveStream = () => resolve(makeStream());
				});
			}
		},
		AudioContext: class {
			state = opts.suspended ? 'suspended' : 'running';
			record = { closed: false, resumed: 0 };
			constructor() {
				w.contexts.push(this.record);
			}
			resume() {
				this.record.resumed++;
				// A resume the browser never answers.
				if (opts.hangResume) return new Promise<void>(() => {});
				this.state = 'running';
				return Promise.resolve();
			}
			async close() {
				this.record.closed = true;
			}
			createMediaStreamSource() {
				return { connect: () => undefined };
			}
			createAnalyser() {
				return {
					fftSize: 0,
					getFloatTimeDomainData: (buf: Float32Array) => buf.fill(w.sample)
				};
			}
		},
		schedule: (fn) => {
			w.ticks.push(fn);
			return () => {
				const i = w.ticks.indexOf(fn);
				if (i >= 0) w.ticks.splice(i, 1);
			};
		}
	};
	return w;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
function tick(w: World) {
	const due = w.ticks.splice(0);
	for (const fn of due) fn();
}

describe('the meter never outlives close()', () => {
	it('close stops every track it opened and closes the context', async () => {
		const w = world();
		const levels: number[] = [];
		const m = new MicLevel(w.deps);
		m.open((l) => levels.push(l));
		await settle();
		expect(w.tracks).toHaveLength(1);
		expect(w.contexts).toHaveLength(1);
		w.sample = 0.1;
		tick(w);
		expect(levels.at(-1)).toBeGreaterThan(0);
		m.close();
		expect(w.tracks.every((t) => t.stopped)).toBe(true);
		await settle();
		expect(w.contexts.every((c) => c.closed)).toBe(true);
		expect(levels.at(-1)).toBe(0);
		// No tick is left scheduled.
		expect(w.ticks).toHaveLength(0);
	});

	it('a close BEFORE the browser answers stops the late stream and builds nothing', async () => {
		const w = world({ holdStream: true });
		const m = new MicLevel(w.deps);
		m.open(() => {});
		await settle();
		expect(w.asked).toBe(1);
		m.close();
		w.resolveStream();
		await settle();
		expect(w.tracks).toHaveLength(1);
		expect(w.tracks[0]!.stopped).toBe(true);
		expect(w.contexts).toHaveLength(0);
		expect(w.ticks).toHaveLength(0);
	});

	it('a close WHILE the context resumes stops the capture, even if the resume never answers', async () => {
		const w = world({ suspended: true, hangResume: true });
		const m = new MicLevel(w.deps);
		m.open(() => {});
		await settle();
		// The capture is open and the context is stuck resuming.
		expect(w.tracks).toHaveLength(1);
		expect(w.contexts[0]!.resumed).toBe(1);
		expect(w.tracks[0]!.stopped).toBe(false);
		m.close();
		expect(w.tracks[0]!.stopped).toBe(true);
		await settle();
		expect(w.contexts[0]!.closed).toBe(true);
		expect(w.ticks).toHaveLength(0);
	});

	it('opens only where the microphone is already allowed: no second prompt, ever', async () => {
		for (const permission of ['prompt', 'denied']) {
			const w = world({ permission });
			new MicLevel(w.deps).open(() => {});
			await settle();
			expect(w.asked, permission).toBe(0);
		}
		// Positive control: granted asks.
		const ok = world({ permission: 'granted' });
		new MicLevel(ok.deps).open(() => {});
		await settle();
		expect(ok.asked).toBe(1);
	});

	it('no Permissions API, no media devices or no AudioContext is no meter, and no request', async () => {
		for (const missing of ['permissions', 'mediaDevices', 'AudioContext'] as const) {
			const w = world();
			const deps = { ...w.deps, [missing]: null };
			new MicLevel(deps).open(() => {});
			await settle();
			expect(w.asked, missing).toBe(0);
		}
	});

	it('a refused capture throws nothing and never reports a level', async () => {
		const w = world({ rejectStream: true });
		const levels: number[] = [];
		const m = new MicLevel(w.deps);
		expect(() => m.open((l) => levels.push(l))).not.toThrow();
		await settle();
		expect(levels).toEqual([]);
		expect(w.contexts).toHaveLength(0);
	});

	it('resumes a context that starts suspended', async () => {
		const w = world({ suspended: true });
		new MicLevel(w.deps).open(() => {});
		await settle();
		expect(w.contexts[0]!.resumed).toBe(1);
	});
});

describe('the level is a number from 0 to 1', () => {
	it('silence is 0, full scale is 1, and a quiet voice is in between', () => {
		expect(levelOf(new Float32Array(256))).toBe(0);
		expect(levelOf(new Float32Array(256).fill(1))).toBe(1);
		expect(levelOf(new Float32Array(256).fill(-1))).toBe(1);
		const quiet = levelOf(new Float32Array(256).fill(0.01));
		expect(quiet).toBeGreaterThan(0);
		expect(quiet).toBeLessThan(1);
		expect(levelOf([])).toBe(0);
	});
});
