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
 *  - ui: menus and the race-start sequence
 *  - ambient: environment, weather, and vehicle status readouts
 */
const SFX = {
	// ---- UI ----
	ui_click: { files: takes('sfx_ui_click', 2), bus: 'ui', gain: 0.35, jitter: [0.97, 1.03] },
	ui_hover: { files: takes('sfx_ui_hover', 2), bus: 'ui', gain: 0.18, jitter: [0.97, 1.04] },
	ui_confirm: { files: takes('sfx_ui_confirm', 5), bus: 'ui', gain: 0.4 },
	ui_back: { files: takes('sfx_ui_back', 1), bus: 'ui', gain: 0.34 },
	ui_error: { files: takes('sfx_ui_error', 1), bus: 'ui', gain: 0.36 },
	ui_save: { files: takes('sfx_ui_save', 1), bus: 'ui', gain: 0.4 },
	ui_tab_switch: { files: takes('sfx_ui_tab_switch', 3), bus: 'ui', gain: 0.26, jitter: [0.98, 1.02] },
	ui_purchase: { files: takes('sfx_ui_purchase', 1), bus: 'ui', gain: 0.45 },
	ui_insufficient_funds: { files: takes('sfx_ui_insufficient_funds', 2), bus: 'ui', gain: 0.36 },
	ui_socket_conflict: { files: takes('sfx_ui_socket_conflict', 1), bus: 'ui', gain: 0.34 },

	// ---- Race ----
	race_countdown_tick: { files: takes('sfx_race_countdown_tick', 1), bus: 'ui', gain: 0.5 },
	race_go: { files: takes('sfx_race_go', 3), bus: 'ui', gain: 0.55 },

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
	veh_low_health_warning: { files: takes('sfx_veh_low_health_warning', 1), bus: 'ambient', loop: true, gain: 0.22, fadeIn: 0.15 },
	veh_flip_recover: { files: takes('sfx_veh_flip_recover', 2), bus: 'ambient', gain: 0.38 },
	veh_offline_status: { files: takes('sfx_veh_offline_status', 1), bus: 'ambient', gain: 0.34 },

	// ---- Environment / track ----
	env_draft_engage: { files: takes('sfx_env_draft_engage', 2), bus: 'ambient', gain: 0.26 },
	env_boost_pad: { files: takes('sfx_env_boost_pad', 3), bus: 'ambient', gain: 0.4, jitter: [0.95, 1.06] },
	env_pit_repair_loop: { files: takes('sfx_env_pit_repair_loop', 1), bus: 'ambient', loop: true, gain: 0.28, fadeIn: 0.15 },
	env_ambient_yard: { files: takes('sfx_env_ambient_yard', 4), bus: 'ambient', loop: true, gain: 0.16, fadeIn: 1.2 },
	env_rain_loop: { files: takes('sfx_env_rain_loop', 1), bus: 'ambient', loop: true, gain: 0.24, fadeIn: 1.2 },
	env_storm_thunder: { files: takes('sfx_env_storm_thunder', 4), bus: 'ambient', gain: 0.42, jitter: [0.94, 1.06] },
	env_fog_ambience: { files: takes('sfx_env_fog_ambience', 1), bus: 'ambient', loop: true, gain: 0.2, fadeIn: 1.2 },
	env_tire_dust: { files: takes('sfx_env_tire_dust', 2), bus: 'ambient', gain: 0.2, jitter: [0.9, 1.12] }
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
		gain: Math.min(1, def.gain * gainScale),
		pitchJitter: def.jitter ? [...def.jitter] : undefined
	});
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
		loop: true,
		fadeInSec: def.fadeIn,
		gain: Math.min(1, def.gain * gainScale)
	});
}
