/**
 * GREENLINE Web Audio engine (Phase 2C). One shared AudioContext with a bus
 * graph, each bus a GainNode feeding a master GainNode feeding destination:
 *
 *     [music element source] --------------> music   ┐
 *     [voice gain] -> panner? ->  weapons             │
 *     [voice gain] -> panner? ->  impacts             ├─> master -> destination
 *     [voice gain] -> panner? ->  ui                  │
 *     [voice gain] -> panner? ->  ambient             │
 *     [voice gain] -> panner? ->  engine   ───────────┘
 *
 * The `engine` bus is the one bus that carries ONLY sustained loops (the
 * per-vehicle RPM layers), which is why it is its own bus rather than folded
 * into `ambient`: it is continuous, it is always several voices deep, and its
 * level wants to move independently of the one-shot categories.
 *
 * Autoplay: the context is created suspended per browser policy. resume() is
 * coordinated with GreenlineMusic's existing first-gesture arm (armGesture) so
 * there is ONE resume path for both music and SFX, not two competing listeners.
 *
 * The engine degrades gracefully: if Web Audio is unavailable (SSR, ancient
 * browser, creation throws) every method is a safe no-op and music falls back to
 * plain HTMLAudioElement playback (the element is never routed through a dead
 * graph).
 */

export type SfxBus = 'weapons' | 'impacts' | 'ui' | 'ambient' | 'engine';
export type BusName = 'music' | SfxBus;

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface PlayOptions {
	/** Emitter world position (three.js convention: x/z ground plane, y up). */
	position?: Vec3;
	/** Emitter world velocity in m/s, for manual Doppler. */
	velocity?: Vec3;
	/**
	 * playbackRate jitter range [min, max]; a fresh random rate is picked in it
	 * per trigger. Omitted (or a degenerate range) means no jitter (rate 1).
	 */
	pitchJitter?: [number, number];
	/** Linear voice gain 0..1 (pre-bus). Default 1. */
	gain?: number;
	/**
	 * Loop the source until the handle's stop() is called. A looping voice is
	 * EXEMPT from the one-shot pool caps and stealing (a sustained loop cut off
	 * mid-play by an unrelated burst would be a bug, not a graceful degradation),
	 * so its lifetime is entirely the caller's responsibility.
	 */
	loop?: boolean;
	/** Fade-in seconds for a loop start; default the shared short attack. */
	fadeInSec?: number;
}

/** Handle returned by a started voice. */
export interface VoiceHandle {
	setPosition: (p: Vec3, v?: Vec3) => void;
	/** Retarget the voice's gain (linear 0..1), ramped. For loop swells. */
	setGain: (g: number, rampSec?: number) => void;
	/**
	 * Retarget the voice's BASE playback rate (1 = as recorded). Doppler still
	 * multiplies on top, so this is the caller's own pitch control, not a
	 * replacement for it: engine layers use it to glide continuously with RPM
	 * instead of stepping at each crossfade boundary.
	 */
	setRate: (rate: number) => void;
	/** Stop the voice, fading out over rampSec (default a short release). */
	stop: (rampSec?: number) => void;
}

/** A pooled one-shot voice. */
interface Voice {
	bus: SfxBus;
	/** Looping voices are excluded from cap accounting and stealing. */
	loop: boolean;
	source: AudioScheduledSourceNode & { playbackRate?: AudioParam; frequency?: AudioParam };
	gainNode: GainNode;
	/**
	 * Distance attenuation, owned by the engine and kept on its OWN node,
	 * deliberately separate from `gainNode`. Callers retarget `gainNode` freely
	 * (the engine-layer crossfade rewrites it every frame); if distance shared
	 * that node the two writers would overwrite each other. Null for a
	 * non-positional voice.
	 */
	distNode: GainNode | null;
	panner: PannerNode | null;
	/** Last applied distance gain, so the ticker skips no-op param writes and
	 * voice stealing can rank by what is actually AUDIBLE, not just by peak. */
	distGain: number;
	/** Jittered base rate before Doppler is layered on. */
	baseRate: number;
	/**
	 * Nominal oscillator frequency, set only for tone (test) voices. A buffer
	 * voice drives rate through source.playbackRate; an oscillator has none, so
	 * rate is applied by scaling its frequency around this nominal instead.
	 */
	oscFreq: number | null;
	/** Peak linear gain (used when stealing the quietest voice). */
	peak: number;
	position: Vec3 | null;
	velocity: Vec3 | null;
	startedAt: number;
	stopped: boolean;
}

// Concurrency caps, tuned as a conservative starting point for the aging school
// desktops. The four ONE-SHOT soft caps SUM to the global cap, so per-bus
// stealing is the effective limiter and the global cap is a defensive ceiling
// (see report). `engine` is deliberately outside that arithmetic: it carries
// nothing but caller-owned loops, which are exempt from cap accounting and
// stealing, so its entry is only here to keep the record total.
const GLOBAL_VOICE_CAP = 24;
const SFX_BUSES: SfxBus[] = ['weapons', 'impacts', 'ui', 'ambient', 'engine'];
const SOFT_CAP: Record<SfxBus, number> = { weapons: 8, impacts: 8, ui: 4, ambient: 4, engine: 8 };

// Manual Doppler. Modern browsers don't reliably auto-Doppler via PannerNode, so
// we compute relative radial velocity each frame and nudge playbackRate. The
// clamp keeps it reading as physical, never cartoonish, regardless of closing
// speed. TUNING KNOB: widen for more drama, narrow if a flyby sounds cartoonish.
const DOPPLER_C = 340; // speed of sound (m/s), gameplay-plausible
const DOPPLER_MIN = 0.85;
const DOPPLER_MAX = 1.18;

// --- Distance falloff -------------------------------------------------------
// TUNING KNOBS. These four are the whole distance model; tune by ear here and
// nowhere else (no call site carries its own falloff curve).
//
// WHY THIS IS COMPUTED HERE INSTEAD OF BY THE PannerNode, which is the obvious
// place for it: neither native distanceModel does what this game needs, and
// both were MEASURED rather than assumed (see the report).
//   - `inverse` IGNORES maxDistance completely — that term only appears in the
//     `linear` formula — so it keeps falling forever: at ref 14 / rolloff 1 it
//     reaches 0.012 across a 1.2km straight, i.e. silent, with no way to floor
//     it. A sound that vanishes entirely reads as a bug, not as distance.
//   - `linear` DOES honor maxDistance, by hitting exactly zero there. Same
//     problem, harder edge, plus the harsh near-field spike it is known for.
// So the panner stays azimuth-only (rolloffFactor 0) and the falloff is the
// `inverse` CURVE evaluated here, with maxDistance as a genuine clamp and an
// explicit floor under it. It is close to free: the Doppler ticker already
// computes each positional voice's distance every frame, so this reuses that
// number rather than adding a second pass.
const DISTANCE_REF_M = 14; // full volume within this radius
const DISTANCE_MAX_M = 180; // falloff stops steepening past this
const DISTANCE_ROLLOFF = 1; // higher = steeper falloff
/**
 * Hard floor on distance attenuation. The clamp at DISTANCE_MAX_M is what sets
 * the practical floor (ref/max = 0.078 at the shipped numbers); this is the
 * backstop that guarantees a far-off sound stays faintly present no matter how
 * the three knobs above are retuned. Never set it to 0.
 */
const DISTANCE_MIN_GAIN = 0.06;

/**
 * Web Audio's `inverse` curve, with maxDistance actually respected and a floor.
 * Returns 1 inside the reference radius.
 */
export function distanceGainFor(dist: number): number {
	const d = clamp(dist, DISTANCE_REF_M, DISTANCE_MAX_M);
	const g = DISTANCE_REF_M / (DISTANCE_REF_M + DISTANCE_ROLLOFF * (d - DISTANCE_REF_M));
	return Math.max(DISTANCE_MIN_GAIN, g);
}

/** The knobs, for the dev harness and for anything sizing a cull radius. */
export const DISTANCE_MODEL = {
	refM: DISTANCE_REF_M,
	maxM: DISTANCE_MAX_M,
	rolloff: DISTANCE_ROLLOFF,
	minGain: DISTANCE_MIN_GAIN
} as const;

const SFX_RAMP_S = 0.04; // bus-volume change ramp, avoids clicks
/** Distance-gain smoothing, ~one frame: a flyby slides instead of zippering. */
const DISTANCE_RAMP_S = 0.02;

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

class GreenlineAudioEngine {
	available = false;
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private buses: Record<BusName, GainNode> | null = null;
	private wrapped = new WeakSet<HTMLMediaElement>();
	private voices: Voice[] = [];
	private sfxVolume = 1;
	private listenerPos: Vec3 = { x: 0, y: 0, z: 0 };
	private listenerVel: Vec3 = { x: 0, y: 0, z: 0 };
	private ticking = false;
	private rafId: number | null = null;
	private timeoutId: ReturnType<typeof setTimeout> | null = null;

	// --- lifecycle ------------------------------------------------------------

	/** Lazily create the context + bus graph. Returns null if unavailable. */
	private ensure(): AudioContext | null {
		if (this.ctx) return this.ctx;
		if (typeof window === 'undefined') return null;
		const Ctor: typeof AudioContext | undefined =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		let ctx: AudioContext;
		try {
			ctx = new Ctor();
		} catch {
			return null;
		}
		const master = ctx.createGain();
		master.gain.value = 1;
		master.connect(ctx.destination);
		const mk = (v: number) => {
			const g = ctx.createGain();
			g.gain.value = v;
			g.connect(master);
			return g;
		};
		this.ctx = ctx;
		this.master = master;
		this.buses = {
			// Music bus sits at unity: the HTMLAudioElement's own .volume carries the
			// user's music level, and this gain only moves for ducking.
			music: mk(1),
			weapons: mk(this.sfxVolume),
			impacts: mk(this.sfxVolume),
			ui: mk(this.sfxVolume),
			ambient: mk(this.sfxVolume),
			engine: mk(this.sfxVolume)
		};
		this.available = true;
		return ctx;
	}

	/** Resume the context (call from a user gesture). Safe no-op if unavailable. */
	resume(): void {
		const ctx = this.ensure();
		if (!ctx) return;
		if (ctx.state === 'suspended') ctx.resume().catch(() => {});
	}

	/** True when audio can actually be heard, OR when Web Audio is unavailable
	 * (so callers relying on plain-element fallback don't force-arm a gesture). */
	contextRunning(): boolean {
		if (!this.available && !this.ctx) return true; // let element fallback handle it
		return this.ctx?.state === 'running';
	}

	// --- music bus ------------------------------------------------------------

	/**
	 * Route a music HTMLAudioElement through the music bus. Each element may be
	 * wrapped exactly once, ever (createMediaElementSource is one-shot), so this
	 * is idempotent per element. If Web Audio is unavailable the element is left
	 * to play directly to the speakers (graceful fallback).
	 */
	connectMusicElement(el: HTMLMediaElement): void {
		const ctx = this.ensure();
		if (!ctx || !this.buses) return;
		if (this.wrapped.has(el)) return;
		try {
			const src = ctx.createMediaElementSource(el);
			src.connect(this.buses.music);
			this.wrapped.add(el);
		} catch {
			// Already wrapped or unsupported: leave the element playing directly.
		}
	}

	/**
	 * Duck the music bus down by amountDb over attackMs, then back to unity over
	 * releaseMs. For future impact/explosion phases to call; nothing calls it in
	 * normal play yet.
	 */
	duckMusicBus(amountDb = -12, attackMs = 90, releaseMs = 450): void {
		const ctx = this.ensure();
		if (!ctx || !this.buses) return;
		const g = this.buses.music.gain;
		const now = ctx.currentTime;
		const floor = clamp(Math.pow(10, amountDb / 20), 0, 1); // -12dB -> ~0.25
		g.cancelScheduledValues(now);
		g.setValueAtTime(Math.max(0.0001, g.value), now);
		g.linearRampToValueAtTime(floor, now + attackMs / 1000);
		g.linearRampToValueAtTime(1, now + attackMs / 1000 + releaseMs / 1000);
	}

	// --- sfx volume -----------------------------------------------------------

	/** Set the shared SFX level (0..1); applied to all four SFX bus gains. */
	setSfxVolume(v: number): void {
		this.sfxVolume = clamp(v, 0, 1);
		const ctx = this.ensure();
		if (!ctx || !this.buses) return;
		const now = ctx.currentTime;
		for (const bus of SFX_BUSES) {
			const g = this.buses[bus].gain;
			g.cancelScheduledValues(now);
			g.setValueAtTime(g.value, now);
			g.linearRampToValueAtTime(this.sfxVolume, now + SFX_RAMP_S);
		}
	}

	// --- listener + voices ----------------------------------------------------

	/** Update the listener (the player) world pose for pan + Doppler. */
	setListener(pos: Vec3, vel?: Vec3, forward?: Vec3, up?: Vec3): void {
		this.listenerPos = { ...pos };
		if (vel) this.listenerVel = { ...vel };
		const ctx = this.ctx;
		if (!ctx) return;
		const l = ctx.listener;
		if (l.positionX) {
			l.positionX.value = pos.x;
			l.positionY.value = pos.y;
			l.positionZ.value = pos.z;
		} else if ((l as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition) {
			(l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
		}
		const f = forward ?? { x: 0, y: 0, z: -1 };
		const u = up ?? { x: 0, y: 1, z: 0 };
		if (l.forwardX) {
			l.forwardX.value = f.x;
			l.forwardY.value = f.y;
			l.forwardZ.value = f.z;
			l.upX.value = u.x;
			l.upY.value = u.y;
			l.upZ.value = u.z;
		} else if ((l as unknown as { setOrientation?: (...n: number[]) => void }).setOrientation) {
			(l as unknown as { setOrientation: (...n: number[]) => void }).setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
		}
	}

	/**
	 * Play a one-shot buffer on a bus. Positional if opts.position is given.
	 * Returns a handle to reposition a moving emitter (or null if unavailable).
	 * Content is Phase 4/6; this is the call other phases target.
	 */
	playBuffer(bus: SfxBus, buffer: AudioBuffer, opts: PlayOptions = {}): VoiceHandle | null {
		const ctx = this.ensure();
		if (!ctx || !this.buses) return null;
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		if (opts.loop) src.loop = true;
		return this.startVoice(bus, src, opts);
	}

	/**
	 * Decode encoded audio bytes into an AudioBuffer on the shared context.
	 * Resolves null if Web Audio is unavailable or the bytes fail to decode, so
	 * a missing/corrupt asset degrades to silence rather than throwing into a
	 * gameplay frame.
	 */
	async decode(data: ArrayBuffer): Promise<AudioBuffer | null> {
		const ctx = this.ensure();
		if (!ctx) return null;
		try {
			return await ctx.decodeAudioData(data);
		} catch {
			return null;
		}
	}

	/**
	 * Dev/test one-shot oscillator tone on a bus (proves routing/pan/Doppler/
	 * caps without real content). Returns a positional handle.
	 */
	playTone(
		bus: SfxBus,
		opts: PlayOptions & { freq?: number; durationMs?: number; type?: OscillatorType } = {}
	): VoiceHandle | null {
		const ctx = this.ensure();
		if (!ctx || !this.buses) return null;
		const osc = ctx.createOscillator();
		osc.type = opts.type ?? 'triangle';
		const freq = opts.freq ?? 440;
		osc.frequency.value = freq;
		const dur = (opts.durationMs ?? 220) / 1000;
		const handle = this.startVoice(bus, osc, opts, dur, freq);
		return handle;
	}

	/** Common voice wiring + pooling for buffer and oscillator sources. */
	private startVoice(
		bus: SfxBus,
		source: AudioScheduledSourceNode & { playbackRate?: AudioParam; frequency?: AudioParam },
		opts: PlayOptions,
		toneDurSec?: number,
		oscFreq?: number
	): VoiceHandle | null {
		const ctx = this.ctx;
		if (!ctx || !this.buses) return null;

		const looping = !!opts.loop;
		if (!looping) this.evictForBus(bus);

		const gainNode = ctx.createGain();
		const peak = clamp(opts.gain ?? 1, 0, 1);

		// Short attack/release envelope so tones and clips never click. A loop may
		// ask for a longer fade so it swells in rather than snapping on.
		const now = ctx.currentTime;
		const atk = Math.max(0.008, opts.fadeInSec ?? 0);
		gainNode.gain.setValueAtTime(0, now);
		gainNode.gain.linearRampToValueAtTime(peak, now + atk);

		let panner: PannerNode | null = null;
		let distNode: GainNode | null = null;
		const positional = !!opts.position;
		if (positional) {
			panner = ctx.createPanner();
			panner.panningModel = 'equalpower'; // cheap azimuth pan, not HRTF
			// Azimuth ONLY. Distance is applied on distNode instead, because
			// neither native distanceModel can both honour maxDistance and keep a
			// floor (see the DISTANCE_* block).
			panner.distanceModel = 'inverse';
			panner.refDistance = DISTANCE_REF_M;
			panner.rolloffFactor = 0;
			distNode = ctx.createGain();
			distNode.gain.value = 1;
			panner.connect(this.buses[bus]);
			distNode.connect(panner);
			gainNode.connect(distNode);
		} else {
			gainNode.connect(this.buses[bus]);
		}
		source.connect(gainNode);

		// Per-trigger pitch jitter (fixed base rate; Doppler multiplies on top).
		let baseRate = 1;
		if (opts.pitchJitter) {
			const [a, b] = opts.pitchJitter;
			const lo = Math.min(a, b);
			const hi = Math.max(a, b);
			if (hi > lo) baseRate = lo + Math.random() * (hi - lo);
		}

		const voice: Voice = {
			bus,
			loop: looping,
			source,
			gainNode,
			distNode,
			panner,
			distGain: 1,
			baseRate,
			oscFreq: oscFreq ?? null,
			peak,
			position: opts.position ? { ...opts.position } : null,
			velocity: opts.velocity ? { ...opts.velocity } : null,
			startedAt: now,
			stopped: false
		};
		this.applyRate(voice, baseRate);
		if (panner && voice.position) {
			this.applyPanner(voice);
			// Set distance BEFORE the source starts: a short one-shot could
			// otherwise finish before the first ticker frame and play at full
			// volume no matter how far away it was.
			this.applyDistance(voice, 0);
		}

		const cleanup = () => this.removeVoice(voice);
		source.onended = cleanup;
		try {
			source.start();
			if (toneDurSec != null) {
				// Fade out then stop, so an oscillator tone ends cleanly.
				const end = now + toneDurSec;
				gainNode.gain.setValueAtTime(peak, Math.max(now + atk, end - 0.03));
				gainNode.gain.linearRampToValueAtTime(0, end);
				source.stop(end + 0.01);
			}
		} catch {
			cleanup();
			return null;
		}

		this.voices.push(voice);
		if (positional) this.startTicker();

		return {
			setPosition: (p: Vec3, v?: Vec3) => {
				// A voice created non-positional (a `spatial: false` roster entry) has
				// no panner and never gains one: ignore the update outright rather
				// than storing a position that would then read back as a distance the
				// voice does not actually have.
				if (!voice.panner) return;
				voice.position = { ...p };
				if (v) voice.velocity = { ...v };
				this.applyPanner(voice);
				this.applyDistance(voice, DISTANCE_RAMP_S);
			},
			setGain: (g: number, rampSec = SFX_RAMP_S) => {
				if (voice.stopped || !this.ctx) return;
				const t = this.ctx.currentTime;
				const target = clamp(g, 0, 1);
				voice.peak = target;
				const p = voice.gainNode.gain;
				p.cancelScheduledValues(t);
				p.setValueAtTime(Math.max(0.0001, p.value), t);
				p.linearRampToValueAtTime(target, t + Math.max(0.001, rampSec));
			},
			setRate: (rate: number) => {
				if (voice.stopped) return;
				// Store it as the BASE rate so the Doppler ticker keeps multiplying on
				// top rather than overwriting the caller's pitch next frame.
				voice.baseRate = clamp(rate, 0.25, 4);
				this.applyRate(voice, voice.baseRate * this.dopplerFactor(voice));
			},
			stop: (rampSec = 0.06) => this.stopVoice(voice, rampSec)
		};
	}

	/**
	 * Enforce the per-bus soft cap (and global ceiling) by stealing a voice.
	 * Looping voices are never candidates: they are caller-owned and stealing one
	 * would silence a sustained cue that has no way to restart itself.
	 */
	private evictForBus(bus: SfxBus): void {
		const busVoices = this.voices.filter((v) => v.bus === bus && !v.stopped && !v.loop);
		if (busVoices.length >= SOFT_CAP[bus]) this.steal(busVoices);
		const active = this.voices.filter((v) => !v.stopped && !v.loop);
		if (active.length >= GLOBAL_VOICE_CAP) {
			// Defensive: soft caps sum to the global cap, so this only trips if that
			// invariant ever changes. Steal the oldest on the busiest same-bus set.
			this.steal(busVoices);
		}
	}

	/**
	 * Steal the oldest, breaking ties toward the quietest, from a candidate set.
	 *
	 * "Quietest" is `peak x distGain`, NOT `peak` alone. Before distance
	 * attenuation existed the two were the same thing, so the tiebreak only ever
	 * compared authored mix levels; now that a far-off sound is genuinely quiet,
	 * ranking by audible level is what makes stealing prefer to drop the
	 * across-the-map gunshot and keep the one next to you. This does not happen
	 * for free — `peak` is the caller's gain and never sees distance — so the
	 * term is explicit here.
	 */
	private audibleLevel(v: Voice): number {
		return v.peak * (v.panner ? v.distGain : 1);
	}

	private steal(candidates: Voice[]): void {
		if (!candidates.length) return;
		let victim = candidates[0];
		for (const v of candidates) {
			if (
				v.startedAt < victim.startedAt ||
				(v.startedAt === victim.startedAt && this.audibleLevel(v) < this.audibleLevel(victim))
			) {
				victim = v;
			}
		}
		this.stopVoice(victim);
	}

	private stopVoice(voice: Voice, rampSec = 0.03): void {
		if (voice.stopped) return;
		voice.stopped = true;
		const ctx = this.ctx;
		try {
			if (ctx) {
				const now = ctx.currentTime;
				const fade = Math.max(0.005, rampSec);
				voice.gainNode.gain.cancelScheduledValues(now);
				voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value), now);
				voice.gainNode.gain.linearRampToValueAtTime(0, now + fade);
				voice.source.stop(now + fade + 0.01);
				// Do NOT tear the graph down here: source.onended already points at
				// removeVoice and fires when the scheduled stop lands, so the fade is
				// actually heard. Disconnecting now would cut it into a click, which a
				// sustained loop (nitro, shield hum) would make obvious.
				return;
			}
			voice.source.stop();
		} catch {
			/* already stopped */
		}
		this.removeVoice(voice);
	}

	private removeVoice(voice: Voice): void {
		voice.stopped = true;
		const i = this.voices.indexOf(voice);
		if (i >= 0) this.voices.splice(i, 1);
		try {
			voice.source.disconnect();
			voice.gainNode.disconnect();
			voice.distNode?.disconnect();
			voice.panner?.disconnect();
		} catch {
			/* noop */
		}
		if (!this.voices.some((v) => v.panner)) this.stopTicker();
	}

	/**
	 * Apply a rate multiplier (jitter x Doppler) to a voice. A buffer source
	 * drives it through playbackRate; an oscillator (test tone) has no
	 * playbackRate, so the same pitch change is realized by scaling its frequency
	 * around the nominal.
	 */
	private applyRate(voice: Voice, rate: number): void {
		const src = voice.source;
		if (src.playbackRate) src.playbackRate.value = rate;
		else if (src.frequency && voice.oscFreq != null) src.frequency.value = voice.oscFreq * rate;
	}

	/** Current effective rate of a voice, for dev introspection. */
	private voiceRate(voice: Voice): number {
		const src = voice.source;
		if (src.playbackRate) return src.playbackRate.value;
		if (src.frequency && voice.oscFreq) return src.frequency.value / voice.oscFreq;
		return 1;
	}

	private applyPanner(voice: Voice): void {
		if (!voice.panner || !voice.position) return;
		const p = voice.panner;
		if (p.positionX) {
			p.positionX.value = voice.position.x;
			p.positionY.value = voice.position.y;
			p.positionZ.value = voice.position.z;
		} else if ((p as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition) {
			(p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(
				voice.position.x,
				voice.position.y,
				voice.position.z
			);
		}
	}

	/**
	 * Push the distance attenuation for a voice's current position onto its own
	 * gain node. `rampSec` 0 sets it outright (voice start); the ticker ramps
	 * over roughly a frame so a fast flyby slides instead of zippering.
	 */
	private applyDistance(voice: Voice, rampSec: number): void {
		const node = voice.distNode;
		if (!node || !voice.position || voice.stopped) return;
		const g = distanceGainFor(this.distanceTo(voice.position));
		// Param writes are not free at 36+ live engine loops; skip the ones that
		// would not change anything audible.
		if (Math.abs(g - voice.distGain) < 0.002) return;
		voice.distGain = g;
		const ctx = this.ctx;
		if (!ctx) return;
		const t = ctx.currentTime;
		if (rampSec <= 0) {
			node.gain.setValueAtTime(g, t);
			return;
		}
		node.gain.cancelScheduledValues(t);
		node.gain.setValueAtTime(node.gain.value, t);
		node.gain.linearRampToValueAtTime(g, t + rampSec);
	}

	private distanceTo(p: Vec3): number {
		return Math.hypot(p.x - this.listenerPos.x, p.y - this.listenerPos.y, p.z - this.listenerPos.z);
	}

	// --- manual Doppler ticker ------------------------------------------------

	/**
	 * Recompute Doppler AND distance for every positional voice from its stored
	 * pos/vel and the listener. Idempotent, so both the internal ticker and a
	 * future game-loop caller may drive it without conflict.
	 */
	update(): void {
		for (const voice of this.voices) {
			if (!voice.panner || !voice.position || voice.stopped) continue;
			const factor = this.dopplerFactor(voice);
			this.applyRate(voice, voice.baseRate * factor);
			this.applyDistance(voice, DISTANCE_RAMP_S);
		}
	}

	private dopplerFactor(voice: Voice): number {
		if (!voice.position) return 1;
		const rel = {
			x: voice.position.x - this.listenerPos.x,
			y: voice.position.y - this.listenerPos.y,
			z: voice.position.z - this.listenerPos.z
		};
		const dist = Math.hypot(rel.x, rel.y, rel.z);
		if (dist < 1e-3) return 1;
		const dir = { x: rel.x / dist, y: rel.y / dist, z: rel.z / dist };
		const ev = voice.velocity ?? { x: 0, y: 0, z: 0 };
		// Radial separation velocity (positive = emitter moving away from listener).
		const vrel =
			(ev.x - this.listenerVel.x) * dir.x +
			(ev.y - this.listenerVel.y) * dir.y +
			(ev.z - this.listenerVel.z) * dir.z;
		// Approaching (vrel < 0) raises pitch; separating lowers it.
		const factor = DOPPLER_C / (DOPPLER_C + vrel);
		return clamp(factor, DOPPLER_MIN, DOPPLER_MAX);
	}

	private startTicker(): void {
		if (this.ticking) return;
		this.ticking = true;
		// rAF, with a setTimeout fallback so a throttled/backgrounded window still
		// advances Doppler (the codebase's throttled-window discipline).
		const tick = () => {
			if (!this.ticking) return;
			this.update();
			if (typeof requestAnimationFrame === 'function') this.rafId = requestAnimationFrame(tick);
			else this.timeoutId = setTimeout(tick, 33);
		};
		if (typeof requestAnimationFrame === 'function') this.rafId = requestAnimationFrame(tick);
		else this.timeoutId = setTimeout(tick, 33);
	}

	private stopTicker(): void {
		this.ticking = false;
		if (this.rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
		if (this.timeoutId != null) clearTimeout(this.timeoutId);
		this.rafId = null;
		this.timeoutId = null;
	}

	// --- dev introspection ----------------------------------------------------

	/** A snapshot for the dev harness (no gameplay reads this). */
	snapshot() {
		return {
			available: this.available,
			state: this.ctx?.state ?? 'none',
			sfxVolume: this.sfxVolume,
			busGain: this.buses
				? {
						music: round(this.buses.music.gain.value),
						weapons: round(this.buses.weapons.gain.value),
						impacts: round(this.buses.impacts.gain.value),
						ui: round(this.buses.ui.gain.value),
						ambient: round(this.buses.ambient.gain.value),
						engine: round(this.buses.engine.gain.value)
					}
				: null,
			voices: {
				total: this.voices.length,
				weapons: this.voices.filter((v) => v.bus === 'weapons').length,
				impacts: this.voices.filter((v) => v.bus === 'impacts').length,
				ui: this.voices.filter((v) => v.bus === 'ui').length,
				ambient: this.voices.filter((v) => v.bus === 'ambient').length,
				engine: this.voices.filter((v) => v.bus === 'engine').length
			}
		};
	}

	/** Per-voice live rate/pan, for dev verification of jitter/Doppler/pan. */
	voiceDetail() {
		return this.voices.map((v) => ({
			bus: v.bus,
			baseRate: round(v.baseRate),
			rate: round(this.voiceRate(v)),
			panX: v.panner?.positionX ? round(v.panner.positionX.value) : null,
			/** null = non-positional (a HUD/meta cue, never attenuated). */
			distM: v.position ? round(this.distanceTo(v.position)) : null,
			distGain: v.panner ? round(v.distGain) : null,
			audible: round(this.audibleLevel(v))
		}));
	}
}

function round(v: number): number {
	return Math.round(v * 1000) / 1000;
}

/** The shared engine singleton. */
export const audioEngine = new GreenlineAudioEngine();
