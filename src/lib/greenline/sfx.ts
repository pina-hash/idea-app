/**
 * GREENLINE sound-effect registry + loader.
 *
 * This is the content layer over the Phase 2C audio engine: the engine owns the
 * bus graph, voice pooling, pan and Doppler; this module owns WHICH file plays
 * for a given game event, how loud, and how its variations rotate.
 *
 * Assets live flat in `static/greenline/audio/` beside the music tracks (the
 * existing convention), named `sfx_<category>_<specific>_NN.wav`.
 *
 * Loading model, and why it is shaped this way: a gameplay frame cannot await.
 * `playSfx` is therefore synchronous and plays only from an already-decoded
 * buffer; a miss kicks off that file's load and returns null (one silent
 * trigger) rather than firing late and out of sync. `primeSfx()` is called once
 * the audio context is alive (title screen, long before a race) so the cache is
 * warm by the time anything shoots.
 *
 * Every entry degrades to silence, never an exception: a missing file, a failed
 * decode, or an unavailable Web Audio context all resolve to a null buffer and
 * the call site carries on.
 */

import { audioEngine, type SfxBus, type PlayOptions, type VoiceHandle } from './audio-engine';

const BASE = '/greenline/audio/';

interface SfxDef {
	/** Interchangeable takes; one is picked per trigger (never the last one twice). */
	files: string[];
	bus: SfxBus;
	/** Sustained cue: caller owns the returned handle and must stop() it. */
	loop?: boolean;
	/** Mix level for this sound (linear 0..1), tuned against the placeholder tones. */
	gain: number;
	/** Per-trigger playbackRate jitter, so repeats never sound machine-stamped. */
	jitter?: [number, number];
	/** Loop swell-in seconds (loops only). */
	fadeIn?: number;
	/**
	 * `false` = a HUD / meta / atmosphere cue: it plays at full relative volume
	 * no matter where the listener is, and any position a caller passes is
	 * DISCARDED (no pan, no distance falloff, no Doppler).
	 *
	 * Declared here rather than inferred from whether a call site remembered to
	 * pass a position, so the split is one readable list and a caller can never
	 * accidentally turn the rain bed or a menu click into a point source.
	 * Defaults to spatial, so a new world sound is correct by omission and only
	 * the exceptions have to say so.
	 */
	spatial?: false;
}

/**
 * Build a variation file list: `sfx_foo` x3 -> sfx_foo_01/02/03.
 */
function takes(base: string, n: number): string[] {
	return Array.from({ length: n }, (_, i) => `${base}_${String(i + 1).padStart(2, '0')}.wav`);
}

/**
 * The roster. Bus assignment follows the Phase 2C graph:
 *  - weapons: a machine's own action (fire, launch, deploy, activate, sustain)
 *  - impacts: the moment something LANDS on a target (impact, contact, trigger,
 *    latch, break) plus every structural-damage cue
 *  - ui: menus, the race-start sequence, and the post-race result stings
 *  - ambient: environment, weather, vehicle status readouts, and tire grip
 *  - engine: the per-vehicle RPM layers, and nothing else (loops only)
 *
 * SPATIAL vs NOT is a separate axis from the bus, and every entry below decides
 * it: a world sound pans, Dopplers and falls off with distance, while a HUD /
 * meta / atmosphere cue (`spatial: false`) plays flat at full relative volume
 * wherever the listener is. Spatial is the default so a new world sound is
 * correct by omission.
 */
const SFX = {
	// ---- UI ---- (all flat: a menu is not a place in the world)
	ui_click: { files: takes('sfx_ui_click', 2), bus: 'ui', gain: 0.35, jitter: [0.97, 1.03], spatial: false },
	ui_hover: { files: takes('sfx_ui_hover', 2), bus: 'ui', gain: 0.18, jitter: [0.97, 1.04], spatial: false },
	ui_confirm: { files: takes('sfx_ui_confirm', 5), bus: 'ui', gain: 0.4, spatial: false },
	ui_back: { files: takes('sfx_ui_back', 1), bus: 'ui', gain: 0.34, spatial: false },
	ui_error: { files: takes('sfx_ui_error', 1), bus: 'ui', gain: 0.36, spatial: false },
	ui_save: { files: takes('sfx_ui_save', 1), bus: 'ui', gain: 0.4, spatial: false },
	ui_tab_switch: { files: takes('sfx_ui_tab_switch', 3), bus: 'ui', gain: 0.26, jitter: [0.98, 1.02], spatial: false },
	ui_purchase: { files: takes('sfx_ui_purchase', 1), bus: 'ui', gain: 0.45, spatial: false },
	ui_insufficient_funds: { files: takes('sfx_ui_insufficient_funds', 2), bus: 'ui', gain: 0.36, spatial: false },
	ui_socket_conflict: { files: takes('sfx_ui_socket_conflict', 1), bus: 'ui', gain: 0.34, spatial: false },

	// ---- Race ---- (the start sequence is a broadcast, not a speaker on a post)
	race_countdown_tick: { files: takes('sfx_race_countdown_tick', 1), bus: 'ui', gain: 0.5, spatial: false },
	race_go: { files: takes('sfx_race_go', 3), bus: 'ui', gain: 0.55, spatial: false },

	// ---- Weapons ----
	wpn_autocannon_fire: { files: takes('sfx_wpn_autocannon_fire', 8), bus: 'weapons', gain: 0.3, jitter: [0.94, 1.07] },
	wpn_autocannon_impact: { files: takes('sfx_wpn_autocannon_impact', 4), bus: 'impacts', gain: 0.3, jitter: [0.92, 1.09] },
	wpn_railgun_fire: { files: takes('sfx_wpn_railgun_fire', 3), bus: 'weapons', gain: 0.42, jitter: [0.98, 1.02] },
	wpn_railgun_impact: { files: takes('sfx_wpn_railgun_impact', 6), bus: 'impacts', gain: 0.44 },
	wpn_shotgun_fire: { files: takes('sfx_wpn_shotgun_fire', 4), bus: 'weapons', gain: 0.36, jitter: [0.9, 1.1] },
	wpn_shotgun_impact: { files: takes('sfx_wpn_shotgun_impact', 4), bus: 'impacts', gain: 0.32, jitter: [0.9, 1.1] },
	wpn_rocket_lock_charging: { files: takes('sfx_wpn_rocket_lock_charging', 1), bus: 'weapons', loop: true, gain: 0.22, fadeIn: 0.05 },
	wpn_rocket_lock_confirmed: { files: takes('sfx_wpn_rocket_lock_confirmed', 1), bus: 'weapons', gain: 0.3 },
	wpn_rocket_launch: { files: takes('sfx_wpn_rocket_launch', 2), bus: 'weapons', gain: 0.4, jitter: [0.95, 1.05] },
	wpn_rocket_travel: { files: takes('sfx_wpn_rocket_travel', 1), bus: 'weapons', loop: true, gain: 0.2, fadeIn: 0.08 },
	wpn_rocket_impact: { files: takes('sfx_wpn_rocket_impact', 4), bus: 'impacts', gain: 0.46 },
	wpn_cluster_launch: { files: takes('sfx_wpn_cluster_launch', 3), bus: 'weapons', gain: 0.4, jitter: [0.95, 1.05] },
	wpn_cluster_impact_direct: { files: takes('sfx_wpn_cluster_impact_direct', 4), bus: 'impacts', gain: 0.46 },
	wpn_cluster_impact_splash: { files: takes('sfx_wpn_cluster_impact_splash', 4), bus: 'impacts', gain: 0.3, jitter: [0.9, 1.12] },
	wpn_turret_fire: { files: takes('sfx_wpn_turret_fire', 7), bus: 'weapons', gain: 0.24, jitter: [0.93, 1.08] },
	wpn_turret_swivel: { files: takes('sfx_wpn_turret_swivel', 2), bus: 'weapons', gain: 0.16, jitter: [0.94, 1.06] },
	wpn_shield_activate: { files: takes('sfx_wpn_shield_activate', 1), bus: 'weapons', gain: 0.34 },
	wpn_shield_hum: { files: takes('sfx_wpn_shield_hum', 2), bus: 'weapons', loop: true, gain: 0.16, fadeIn: 0.12 },
	wpn_shield_break: { files: takes('sfx_wpn_shield_break', 1), bus: 'impacts', gain: 0.42 },
	wpn_jammer_hum: { files: takes('sfx_wpn_jammer_hum', 2), bus: 'weapons', loop: true, gain: 0.12, fadeIn: 0.2 },
	wpn_blades_deploy: { files: takes('sfx_wpn_blades_deploy', 2), bus: 'weapons', gain: 0.34 },
	wpn_blades_contact: { files: takes('sfx_wpn_blades_contact', 4), bus: 'impacts', gain: 0.32, jitter: [0.9, 1.12] },
	wpn_blades_retract: { files: takes('sfx_wpn_blades_retract', 2), bus: 'weapons', gain: 0.26 },
	wpn_caltrops_deploy: { files: takes('sfx_wpn_caltrops_deploy', 3), bus: 'weapons', gain: 0.32 },
	wpn_caltrops_trigger: { files: takes('sfx_wpn_caltrops_trigger', 3), bus: 'impacts', gain: 0.3, jitter: [0.9, 1.1] },
	wpn_emp_fire: { files: takes('sfx_wpn_emp_fire', 2), bus: 'weapons', gain: 0.36, jitter: [0.95, 1.06] },
	wpn_emp_impact: { files: takes('sfx_wpn_emp_impact', 2), bus: 'impacts', gain: 0.36 },
	wpn_oil_deploy: { files: takes('sfx_wpn_oil_deploy', 2), bus: 'weapons', gain: 0.32 },
	wpn_oil_trigger: { files: takes('sfx_wpn_oil_trigger', 3), bus: 'impacts', gain: 0.34, jitter: [0.92, 1.08] },
	wpn_hook_launch: { files: takes('sfx_wpn_hook_launch', 4), bus: 'weapons', gain: 0.34 },
	wpn_hook_latch: { files: takes('sfx_wpn_hook_latch', 2), bus: 'impacts', gain: 0.36 },
	wpn_hook_pull: { files: takes('sfx_wpn_hook_pull', 5), bus: 'weapons', loop: true, gain: 0.2, fadeIn: 0.1 },
	wpn_hook_release: { files: takes('sfx_wpn_hook_release', 3), bus: 'weapons', gain: 0.3 },

	// ---- Abilities ----
	abl_nitro_activate: { files: takes('sfx_abl_nitro_activate', 2), bus: 'weapons', gain: 0.38 },
	abl_nitro_loop: { files: takes('sfx_abl_nitro_loop', 2), bus: 'weapons', loop: true, gain: 0.26, fadeIn: 0.1 },
	abl_nitro_end: { files: takes('sfx_abl_nitro_end', 2), bus: 'weapons', gain: 0.28 },
	abl_jump: { files: takes('sfx_abl_jump', 3), bus: 'weapons', gain: 0.34, jitter: [0.95, 1.08] },
	abl_flip: { files: takes('sfx_abl_flip', 4), bus: 'weapons', gain: 0.36 },
	abl_repair_activate: { files: takes('sfx_abl_repair_activate', 1), bus: 'weapons', gain: 0.32 },
	abl_repair_loop: { files: takes('sfx_abl_repair_loop', 2), bus: 'weapons', loop: true, gain: 0.22, fadeIn: 0.1 },
	abl_repair_complete: { files: takes('sfx_abl_repair_complete', 1), bus: 'weapons', gain: 0.34 },
	abl_grip_activate: { files: takes('sfx_abl_grip_activate', 4), bus: 'weapons', gain: 0.3 },
	abl_grip_loop: { files: takes('sfx_abl_grip_loop', 2), bus: 'weapons', loop: true, gain: 0.2, fadeIn: 0.1 },
	abl_aircorrect_engage: { files: takes('sfx_abl_aircorrect_engage', 1), bus: 'weapons', loop: true, gain: 0.2, fadeIn: 0.08 },

	// ---- Vehicle status / damage ----
	veh_hit_scuff: { files: takes('sfx_veh_hit_scuff', 4), bus: 'impacts', gain: 0.24, jitter: [0.9, 1.12] },
	veh_hit_crunch: { files: takes('sfx_veh_hit_crunch', 6), bus: 'impacts', gain: 0.38, jitter: [0.9, 1.08] },
	veh_connector_snap: { files: takes('sfx_veh_connector_snap', 2), bus: 'impacts', gain: 0.34, jitter: [0.92, 1.1] },
	veh_armor_strip: { files: takes('sfx_veh_armor_strip', 4), bus: 'impacts', gain: 0.4, jitter: [0.94, 1.06] },
	veh_mount_kill: { files: takes('sfx_veh_mount_kill', 4), bus: 'impacts', gain: 0.46 },
	// The two READOUTS are flat: a cockpit alarm and a systems-offline callout
	// are instrumentation reporting on your own machine, not events happening at
	// a point in the yard. (The brief's world-space `veh_*` means the hit and
	// damage cues above, which are all spatial.)
	veh_low_health_warning: { files: takes('sfx_veh_low_health_warning', 1), bus: 'ambient', loop: true, gain: 0.22, fadeIn: 0.15, spatial: false },
	veh_flip_recover: { files: takes('sfx_veh_flip_recover', 2), bus: 'ambient', gain: 0.38 },
	veh_offline_status: { files: takes('sfx_veh_offline_status', 1), bus: 'ambient', gain: 0.34, spatial: false },

	// ---- Environment / track ----
	env_draft_engage: { files: takes('sfx_env_draft_engage', 2), bus: 'ambient', gain: 0.26 },
	env_boost_pad: { files: takes('sfx_env_boost_pad', 3), bus: 'ambient', gain: 0.4, jitter: [0.95, 1.06] },
	env_pit_repair_loop: { files: takes('sfx_env_pit_repair_loop', 1), bus: 'ambient', loop: true, gain: 0.28, fadeIn: 0.15 },
	// The four ATMOSPHERE beds are flat: they are the whole sky, not a point in
	// the yard, so they have no distance to fall off over. Thunder is included
	// deliberately — the strike has no position in the scene, and a rolling
	// recording already carries its own distance.
	env_ambient_yard: { files: takes('sfx_env_ambient_yard', 4), bus: 'ambient', loop: true, gain: 0.16, fadeIn: 1.2, spatial: false },
	env_rain_loop: { files: takes('sfx_env_rain_loop', 1), bus: 'ambient', loop: true, gain: 0.24, fadeIn: 1.2, spatial: false },
	env_storm_thunder: { files: takes('sfx_env_storm_thunder', 4), bus: 'ambient', gain: 0.42, jitter: [0.94, 1.06], spatial: false },
	env_fog_ambience: { files: takes('sfx_env_fog_ambience', 1), bus: 'ambient', loop: true, gain: 0.2, fadeIn: 1.2, spatial: false },
	env_tire_dust: { files: takes('sfx_env_tire_dust', 2), bus: 'ambient', gain: 0.2, jitter: [0.9, 1.12] },

	// ---- Engine (RPM layers) ----
	// Three constant-RPM recordings per archetype, crossfaded live against the
	// vehicle's own revs (GreenlineRace's engine-audio block). Every one is a
	// LOOP with exactly one take: variation would be audible as a seam at the
	// loop point, and there is nothing to rotate when the sound never stops.
	//
	// THE GAINS HERE LOOK ARBITRARY AND ARE NOT: they are LEVEL-MATCHED against
	// the measured RMS of each take. The twelve recordings arrived spanning a
	// ~6.7x level range (handling idle 0.080 RMS against systems mid 0.537), and
	// a crossfade between two takes that far apart does not glide, it lurches —
	// the motor would drop away to nothing in the middle of the rev range on one
	// archetype and swell on another. Each gain is therefore
	// `(target x band) / measuredRms`, where the band profile (idle 0.72, mid
	// 1.0, high 1.25) is what deliberately keeps a revving engine LOUDER than an
	// idling one after normalization has flattened everything else. Re-measure
	// and recompute if a take is ever replaced.
	eng_armor_idle: { files: takes('sfx_eng_armor_idle', 1), bus: 'engine', loop: true, gain: 0.17, fadeIn: 0.35 },
	eng_armor_mid: { files: takes('sfx_eng_armor_mid', 1), bus: 'engine', loop: true, gain: 0.42, fadeIn: 0.35 },
	eng_armor_high: { files: takes('sfx_eng_armor_high', 1), bus: 'engine', loop: true, gain: 0.32, fadeIn: 0.35 },
	eng_velocity_idle: { files: takes('sfx_eng_velocity_idle', 1), bus: 'engine', loop: true, gain: 0.27, fadeIn: 0.35 },
	eng_velocity_mid: { files: takes('sfx_eng_velocity_mid', 1), bus: 'engine', loop: true, gain: 0.41, fadeIn: 0.35 },
	eng_velocity_high: { files: takes('sfx_eng_velocity_high', 1), bus: 'engine', loop: true, gain: 0.27, fadeIn: 0.35 },
	eng_handling_idle: { files: takes('sfx_eng_handling_idle', 1), bus: 'engine', loop: true, gain: 0.5, fadeIn: 0.35 },
	eng_handling_mid: { files: takes('sfx_eng_handling_mid', 1), bus: 'engine', loop: true, gain: 0.26, fadeIn: 0.35 },
	eng_handling_high: { files: takes('sfx_eng_handling_high', 1), bus: 'engine', loop: true, gain: 0.21, fadeIn: 0.35 },
	eng_systems_idle: { files: takes('sfx_eng_systems_idle', 1), bus: 'engine', loop: true, gain: 0.43, fadeIn: 0.35 },
	eng_systems_mid: { files: takes('sfx_eng_systems_mid', 1), bus: 'engine', loop: true, gain: 0.1, fadeIn: 0.35 },
	eng_systems_high: { files: takes('sfx_eng_systems_high', 1), bus: 'engine', loop: true, gain: 0.21, fadeIn: 0.35 },

	// ---- Collision (ram) ----
	// Three severity tiers off the ram's own `violence` scalar, so a nudge and a
	// full-speed nose-to-tail read as different events rather than one louder one.
	hit_ram_light: { files: takes('sfx_hit_ram_light', 3), bus: 'impacts', gain: 0.36, jitter: [0.92, 1.08] },
	hit_ram_medium: { files: takes('sfx_hit_ram_medium', 3), bus: 'impacts', gain: 0.46, jitter: [0.94, 1.06] },
	hit_ram_heavy: { files: takes('sfx_hit_ram_heavy', 2), bus: 'impacts', gain: 0.55, jitter: [0.96, 1.04] },

	// ---- Drift ----
	// On the ambient bus with the other own-vehicle status readouts: this is a
	// grip report, not a weapon the car fired.
	drift_engage: { files: takes('sfx_drift_engage', 2), bus: 'ambient', gain: 0.32, jitter: [0.94, 1.08] },
	drift_loop: { files: takes('sfx_drift_loop', 1), bus: 'ambient', loop: true, gain: 0.34, fadeIn: 0.12 },

	// ---- Results / meta ----
	// Level-matched the same way as the engine layers: these four takes span a
	// 6x RMS range, so equal gains would have put the win fanfare over everything
	// and left the lose sting inaudible. The lose take is genuinely quiet
	// (0.034 RMS, ~16dB under the win) and sits at full gain for that reason —
	// it is still, correctly, the quietest of the four.
	// Flat: the results screen has no world to be positioned in.
	result_win: { files: takes('sfx_result_win', 1), bus: 'ui', gain: 0.43, spatial: false },
	result_lose: { files: takes('sfx_result_lose', 1), bus: 'ui', gain: 1, spatial: false },
	result_milestone_unlock: { files: takes('sfx_result_milestone_unlock', 1), bus: 'ui', gain: 0.69, spatial: false },
	result_leaderboard_new_record: { files: takes('sfx_result_leaderboard_new_record', 1), bus: 'ui', gain: 0.8, spatial: false },

	// ---- Fun / misc ----
	// Loaded and playable, but nothing triggers them: the game has no horn or
	// siren action bound (see the control registry), and inventing one is a
	// gameplay change this pass deliberately did not make.
	fun_siren: { files: takes('sfx_fun_siren', 1), bus: 'weapons', loop: true, gain: 0.3, fadeIn: 0.2 },
	fun_horn: { files: takes('sfx_fun_horn', 1), bus: 'weapons', gain: 0.4 }
} satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;

/**
 * Aliases: the roster deliberately REUSES a few recordings rather than shipping
 * near-identical takes. These point at the same loaded buffer, never a second
 * copy of the file.
 */
export const SFX_ALIASES = {
	wpn_cluster_lock_charging: 'wpn_rocket_lock_charging',
	wpn_cluster_lock_confirmed: 'wpn_rocket_lock_confirmed',
	wpn_cluster_travel: 'wpn_rocket_travel',
	wpn_turret_impact: 'wpn_autocannon_impact'
} as const satisfies Record<string, SfxId>;

export type SfxAlias = keyof typeof SFX_ALIASES;
export type SfxRef = SfxId | SfxAlias;

function defFor(ref: SfxRef): SfxDef {
	const id = (SFX_ALIASES as Record<string, SfxId>)[ref] ?? (ref as SfxId);
	return SFX[id] as SfxDef;
}

/**
 * The roster's tuned mix level for a sound. Mix level lives HERE, so a caller
 * that has to retarget a live loop's gain itself (the engine crossfade, whose
 * per-frame level is `rosterGain x bandWeight x distance`) can read the
 * authored level rather than hardcoding a second copy of it.
 */
export function sfxGain(ref: SfxRef): number {
	return defFor(ref)?.gain ?? 0;
}

// --- buffer cache -----------------------------------------------------------

const buffers = new Map<string, AudioBuffer>();
const failed = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

async function loadFile(file: string): Promise<void> {
	if (buffers.has(file) || failed.has(file)) return;
	const existing = inFlight.get(file);
	if (existing) return existing;
	const p = (async () => {
		try {
			const res = await fetch(BASE + file);
			if (!res.ok) throw new Error(String(res.status));
			const buf = await audioEngine.decode(await res.arrayBuffer());
			if (buf) buffers.set(file, buf);
			else failed.add(file);
		} catch {
			// Missing or undecodable asset: mark it dead so we never retry in a loop.
			failed.add(file);
		} finally {
			inFlight.delete(file);
		}
	})();
	inFlight.set(file, p);
	return p;
}

let primed = false;

/**
 * Warm the whole cache in the background. Safe to call repeatedly (idempotent)
 * and safe to call before the context is running: decode works on a suspended
 * context. Concurrency is capped so a school desktop is not hit with 124
 * simultaneous requests.
 */
export function primeSfx(): void {
	if (primed || typeof window === 'undefined') return;
	primed = true;
	const queue: string[] = [];
	for (const def of Object.values(SFX) as SfxDef[]) queue.push(...def.files);
	let cursor = 0;
	const pump = async (): Promise<void> => {
		while (cursor < queue.length) {
			const file = queue[cursor++];
			await loadFile(file);
		}
	};
	for (let i = 0; i < 4; i++) void pump();
}

/** Dev/diagnostic: how much of the roster is resident. */
export function sfxCacheStats() {
	const all = new Set<string>();
	for (const def of Object.values(SFX) as SfxDef[]) for (const f of def.files) all.add(f);
	return { total: all.size, loaded: buffers.size, failed: failed.size, pending: inFlight.size };
}

// --- playback ---------------------------------------------------------------

/** Last-played variation index per id, so a repeat never picks the same take. */
const lastTake = new Map<string, number>();

function pickFile(ref: SfxRef, def: SfxDef): string | null {
	const ready = def.files.filter((f) => buffers.has(f));
	if (!ready.length) {
		// Not resident yet: start the fetch so the NEXT trigger lands, stay silent now.
		for (const f of def.files) if (!failed.has(f)) void loadFile(f);
		return null;
	}
	if (ready.length === 1) return ready[0];
	const prev = lastTake.get(ref);
	let i = Math.floor(Math.random() * ready.length);
	if (prev !== undefined && ready[i] === def.files[prev]) i = (i + 1) % ready.length;
	lastTake.set(ref, def.files.indexOf(ready[i]));
	return ready[i];
}

export interface SfxOptions extends Omit<PlayOptions, 'loop' | 'pitchJitter' | 'fadeInSec' | 'gain'> {
	/** Scale the roster's tuned gain (1 = as authored). Level lives in the roster. */
	gainScale?: number;
}

/**
 * Fire a one-shot. Returns null when the asset is not resident yet (that trigger
 * is silently skipped) or Web Audio is unavailable.
 */
export function playSfx(ref: SfxRef, opts: SfxOptions = {}): VoiceHandle | null {
	const def = defFor(ref);
	if (!def) return null;
	const file = pickFile(ref, def);
	if (!file) return null;
	const buffer = buffers.get(file);
	if (!buffer) return null;
	const { gainScale = 1, ...rest } = opts;
	return audioEngine.playBuffer(def.bus, buffer, {
		...rest,
		...spatialise(def, rest),
		gain: Math.min(1, def.gain * gainScale),
		pitchJitter: def.jitter ? [...def.jitter] : undefined
	});
}

/**
 * The roster decides spatialisation, not the call site: a `spatial: false` def
 * has any position/velocity stripped here, so it can never acquire a panner
 * however it is called. Spatial defs pass through untouched.
 */
function spatialise(def: SfxDef, opts: SfxOptions): Pick<PlayOptions, 'position' | 'velocity'> {
	if (def.spatial === false) return { position: undefined, velocity: undefined };
	return { position: opts.position, velocity: opts.velocity };
}

/**
 * Start a sustained loop. The caller OWNS the returned handle and must stop() it
 * (loops are exempt from voice stealing precisely so nothing else can). Returns
 * null if the asset is not resident yet, so callers should treat a null as "try
 * again next frame" rather than "already playing".
 */
export function startSfxLoop(ref: SfxRef, opts: SfxOptions = {}): VoiceHandle | null {
	const def = defFor(ref);
	if (!def) return null;
	const file = pickFile(ref, def);
	if (!file) return null;
	const buffer = buffers.get(file);
	if (!buffer) return null;
	const { gainScale = 1, ...rest } = opts;
	return audioEngine.playBuffer(def.bus, buffer, {
		...rest,
		...spatialise(def, rest),
		loop: true,
		fadeInSec: def.fadeIn,
		gain: Math.min(1, def.gain * gainScale)
	});
}
