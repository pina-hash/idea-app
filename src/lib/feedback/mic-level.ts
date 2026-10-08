/**
 * THE MICROPHONE'S LOUDNESS, MEASURED ON THIS DEVICE AND NOWHERE ELSE (report
 * 5ab3adb6: "it hears me" should be visible while dictating).
 *
 * WHAT IT IS. One `getUserMedia` stream into an `AnalyserNode`; every tick the
 * root mean square of the waveform becomes a number from 0 to 1. Nothing is
 * recorded, nothing is kept and nothing leaves the browser:
 * tests/feedback-mic-level.test.ts sweeps this file for every way a page can
 * send or keep audio, with the two calls it does make as the positive control.
 * It lives apart from `dictation.ts` so that module keeps ITS sweep (it never
 * opens the microphone itself; the browser's speech service does).
 *
 * WHEN IT OPENS. `Dictation` opens it once per person-started session, after
 * the speech service has the microphone, and closes it on every end, a
 * teardown included. It opens ONLY when the Permissions API already answers
 * "granted" for the microphone: a second capture beside the recogniser must
 * never be the thing that raises a second permission prompt (whether a
 * browser shares the speech grant with this one is unmeasured here). Anything
 * else, or a throw anywhere, is NO METER: the surface keeps its pulsing dot.
 * The surfaces open it only on a fine pointer; beside a recogniser on Android
 * or iOS a second capture is unmeasured and could starve recognition.
 *
 * BEST EFFORT, ALWAYS. Every failure is swallowed, because instrumentation
 * must never be able to affect the thing it measures: a meter that cannot
 * start is a dictation with no meter, never a failed dictation.
 *
 * NO OPEN MICROPHONE OUTLIVES `close()`. A generation counter makes a
 * `getUserMedia` that resolves AFTER close stop its tracks at once and build
 * nothing, which is the leak a slow permission check would otherwise cause.
 * The tick is scheduled on a frame OR a 50ms timeout, whichever comes first,
 * because a backgrounded window never ticks a frame.
 */
import type { MicMeter } from './dictation';

export type { MicMeter };

interface TrackLike {
	stop(): void;
}
interface StreamLike {
	getTracks(): TrackLike[];
}
interface AnalyserLike {
	fftSize: number;
	getFloatTimeDomainData(buf: Float32Array): void;
}
interface AudioContextLike {
	state?: string;
	resume?(): Promise<void>;
	close(): Promise<void>;
	createMediaStreamSource(stream: StreamLike): { connect(node: unknown): unknown };
	createAnalyser(): AnalyserLike;
}

export interface MicLevelDeps {
	mediaDevices?: { getUserMedia(c: { audio: boolean }): Promise<StreamLike> } | null;
	permissions?: { query(d: { name: string }): Promise<{ state: string }> } | null;
	AudioContext?: (new () => AudioContextLike) | null;
	/** Run `fn` on the next frame or after 50ms; answers a cancel. */
	schedule?: (fn: () => void) => () => void;
}

/** The quietest level drawn, and the level that fills the meter. */
const FLOOR_DB = -60;
const CEIL_DB = -10;

/** A frame or 50ms, whichever comes first: a hidden window never ticks a frame. */
function frameOrTimeout(fn: () => void): () => void {
	let done = false;
	let raf = 0;
	const run = () => {
		if (done) return;
		done = true;
		clearTimeout(timer);
		if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
		fn();
	};
	const timer = setTimeout(run, 50);
	if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(run);
	return () => {
		done = true;
		clearTimeout(timer);
		if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
	};
}

function defaults(): MicLevelDeps {
	const nav = typeof navigator === 'undefined' ? undefined : (navigator as unknown as Record<string, unknown>);
	const win = typeof window === 'undefined' ? undefined : (window as unknown as Record<string, unknown>);
	const Ctx = (win?.AudioContext ?? win?.webkitAudioContext) as MicLevelDeps['AudioContext'];
	return {
		mediaDevices: (nav?.mediaDevices as MicLevelDeps['mediaDevices']) ?? null,
		permissions: (nav?.permissions as MicLevelDeps['permissions']) ?? null,
		AudioContext: typeof Ctx === 'function' ? Ctx : null,
		schedule: frameOrTimeout
	};
}

/** RMS of a waveform as a level from 0 to 1, on a decibel scale. */
export function levelOf(samples: ArrayLike<number>): number {
	let sum = 0;
	for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
	const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
	if (!(rms > 0)) return 0;
	const db = 20 * Math.log10(rms);
	const level = (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB);
	return Math.min(1, Math.max(0, level));
}

function stopTracks(stream: StreamLike | null) {
	try {
		for (const t of stream?.getTracks() ?? []) t.stop();
	} catch {
		/* best effort */
	}
}

export class MicLevel implements MicMeter {
	#deps: MicLevelDeps;
	#gen = 0;
	#stream: StreamLike | null = null;
	#ctx: AudioContextLike | null = null;
	#cancel: (() => void) | null = null;
	#onLevel: ((level: number) => void) | null = null;

	constructor(deps: MicLevelDeps = defaults()) {
		this.#deps = deps;
	}

	open(onLevel: (level: number) => void): void {
		this.close();
		const gen = ++this.#gen;
		this.#onLevel = onLevel;
		void this.#start(gen).catch(() => {
			/* best effort: no meter */
		});
	}

	async #start(gen: number): Promise<void> {
		const { mediaDevices, permissions, AudioContext: Ctx } = this.#deps;
		if (!mediaDevices || !permissions || !Ctx) return;
		let state: string;
		try {
			state = (await permissions.query({ name: 'microphone' })).state;
		} catch {
			return;
		}
		if (state !== 'granted' || gen !== this.#gen) return;
		let stream: StreamLike;
		try {
			stream = await mediaDevices.getUserMedia({ audio: true });
		} catch {
			return;
		}
		if (gen !== this.#gen) {
			stopTracks(stream);
			return;
		}
		// HELD BEFORE ANY FURTHER AWAIT. A `close()` that lands while the
		// context below is resuming has to be able to reach this capture, or a
		// resume that never settles leaves the microphone open with nothing
		// holding it.
		this.#stream = stream;
		let ctx: AudioContextLike | null = null;
		let analyser: AnalyserLike;
		try {
			ctx = new Ctx();
			this.#ctx = ctx;
			analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			ctx.createMediaStreamSource(stream).connect(analyser);
			// Opened from the service's `start` rather than inside the click, a
			// context may begin suspended; a resume that fails is no meter.
			if (ctx.state === 'suspended' && ctx.resume) await ctx.resume();
		} catch {
			if (gen === this.#gen) {
				this.#stream = null;
				this.#ctx = null;
			}
			stopTracks(stream);
			void ctx?.close().catch(() => {});
			return;
		}
		// Closed while resuming: `close()` already stopped the tracks and
		// closed the context through the two fields above.
		if (gen !== this.#gen) return;
		const buf = new Float32Array(analyser.fftSize);
		let shown = 0;
		let drawn = -1;
		const schedule = this.#deps.schedule ?? frameOrTimeout;
		const tick = () => {
			if (gen !== this.#gen) return;
			try {
				analyser.getFloatTimeDomainData(buf);
				const next = levelOf(buf);
				// Fast attack, slow release: a word lights the bars at once and
				// they settle rather than flicker between syllables.
				shown += (next - shown) * (next > shown ? 0.6 : 0.15);
				if (Math.abs(shown - drawn) >= 0.01) {
					drawn = shown;
					this.#onLevel?.(shown);
				}
			} catch {
				this.close();
				return;
			}
			this.#cancel = schedule(tick);
		};
		this.#cancel = schedule(tick);
	}

	close(): void {
		this.#gen++;
		this.#cancel?.();
		this.#cancel = null;
		stopTracks(this.#stream);
		this.#stream = null;
		const ctx = this.#ctx;
		this.#ctx = null;
		if (ctx) void ctx.close().catch(() => {});
		const cb = this.#onLevel;
		this.#onLevel = null;
		try {
			cb?.(0);
		} catch {
			/* best effort */
		}
	}
}
