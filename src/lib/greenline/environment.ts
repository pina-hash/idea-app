/**
 * GREENLINE environment presets: the one swappable sky / light / fog / flood
 * configuration the race scene reads instead of hardcoding values inline.
 *
 * Plain data (the loadout.ts / curriculum.ts convention): no three.js imports,
 * colors are CSS hex strings so they feed both THREE.Color and canvas
 * gradients. Adding a preset here plus a way to pick one is the whole cost of
 * a new look; the scene setup itself never changes.
 *
 * WEATHER, NOT TIME OF DAY (Phase 8c). Every preset is a NIGHT preset. The
 * floodlit rig-yard night of the key art ("1A / IMPACT", KeyArtScene.svelte)
 * is locked brand identity, not a placeholder, so weather varies the
 * ATMOSPHERE inside it — fog depth, precipitation, how far the floods throw —
 * and never the hour. A dusk or daylight preset would compete with that
 * identity and is deliberately absent.
 */

export interface EnvKeyLight {
	color: string;
	intensity: number;
	/** World position the light shines FROM (directional, aimed at origin). */
	position: { x: number; y: number; z: number };
}

/**
 * Precipitation. Rendered as camera-following line segments (streaks), NOT a
 * physics or gameplay system: rain never touches grip, drag, or damage. The
 * count is the whole perf dial — one LineSegments draw call either way.
 */
export interface EnvPrecip {
	count: number;
	/** Fall speed, m/s (streaks also lean with this). */
	speed: number;
	color: string;
	opacity: number;
	/** Streak length in world units (longer reads as faster/heavier). */
	length: number;
}

/** Storm lightning: an occasional sky-wide flash. Presentation only. */
export interface EnvLightning {
	/** Random gap between strikes, seconds. */
	minGapSec: number;
	maxGapSec: number;
	/** Peak intensity of the flash light. */
	intensity: number;
}

export interface EnvironmentPreset {
	id: string;
	/** Shown in the settings weather selector. */
	label: string;
	/** One-line description under the selector. */
	note: string;
	/** Gradient sky dome, zenith down to below the horizon line. */
	sky: {
		top: string;
		high: string;
		horizon: string;
		/** Thin brighter band sitting right on the horizon line. */
		glow: string;
		/** Below the horizon, fading into the ground murk. */
		base: string;
		/** Two soft motivated glow spots low on the sky (the key art's
		 * off-frame yards): warm on one heading, cool on the opposite.
		 * rgba() strings, painted additively into the dome texture. */
		warmGlow: string;
		coolGlow: string;
	};
	/** Hemisphere (ambient) fill. */
	hemisphere: { sky: string; ground: string; intensity: number };
	/** Key directionals. Night carries the key art's dual-tone rig: a cool
	 * primary from one side, a dimmer warm counter from the other. */
	keyLights: EnvKeyLight[];
	/** Exponential fog (FogExp2): also what hides draw distance cheaply. */
	fog: { color: string; density: number };
	/** Multiplier on the light-tower flood lamps, cones, and ground pools.
	 * Thick air makes a beam READ brighter (more to scatter off), so the foggy
	 * and stormy presets push this above 1. */
	floodIntensity: number;
	/** Rain, when the weather has any. */
	precip?: EnvPrecip;
	/** Storm flashes, when the weather has any. */
	lightning?: EnvLightning;
}

export const NIGHT_ENV: EnvironmentPreset = {
	id: 'night',
	label: 'Clear night',
	note: 'The key-art rig yard. Cold air, long sightlines, hard floodlight.',
	sky: {
		top: '#03050a',
		high: '#070b11',
		horizon: '#10161c',
		glow: '#182028',
		base: '#04070b',
		warmGlow: 'rgba(255, 150, 40, 0.14)',
		coolGlow: 'rgba(120, 165, 205, 0.12)'
	},
	hemisphere: { sky: '#8fb6dc', ground: '#0b0e12', intensity: 0.55 },
	keyLights: [
		{ color: '#d7e8fa', intensity: 1.15, position: { x: -70, y: 120, z: 90 } },
		{ color: '#ffdcae', intensity: 0.5, position: { x: 110, y: 80, z: -70 } }
	],
	fog: { color: '#060a0f', density: 0.0038 },
	floodIntensity: 1
};

/**
 * Fog: the same yard swallowed by ground haze. The floods gain weight (thick
 * air scatters), the sky flattens toward the fog color so the dome and the
 * murk meet without a seam, and draw distance collapses to roughly 40 m — the
 * corner you cannot see yet is the whole point.
 */
export const FOG_ENV: EnvironmentPreset = {
	id: 'fog',
	label: 'Fog',
	note: 'Ground haze. Sightlines collapse; the floods bloom and the next gate arrives late.',
	sky: {
		top: '#0a1015',
		high: '#0e151b',
		horizon: '#161e25',
		glow: '#1d262e',
		base: '#101820',
		warmGlow: 'rgba(255, 170, 80, 0.20)',
		coolGlow: 'rgba(150, 185, 215, 0.18)'
	},
	hemisphere: { sky: '#9fbdd8', ground: '#141b22', intensity: 0.72 },
	keyLights: [
		{ color: '#cfe0f0', intensity: 0.78, position: { x: -70, y: 120, z: 90 } },
		{ color: '#ffd9ae', intensity: 0.34, position: { x: 110, y: 80, z: -70 } }
	],
	fog: { color: '#141c24', density: 0.021 },
	floodIntensity: 1.45
};

/**
 * Rain: wet night. Darker and cooler than clear, moderate haze, and steady
 * precipitation. The floods stay near their clear-night weight — rain does not
 * scatter a beam the way fog does.
 */
export const RAIN_ENV: EnvironmentPreset = {
	id: 'rain',
	label: 'Rain',
	note: 'Steady downpour on a wet yard. Cooler light, shortened sightlines.',
	sky: {
		top: '#02050a',
		high: '#050910',
		horizon: '#0b1219',
		glow: '#101a22',
		base: '#03060a',
		warmGlow: 'rgba(255, 140, 50, 0.10)',
		coolGlow: 'rgba(110, 155, 200, 0.16)'
	},
	hemisphere: { sky: '#7ea6cc', ground: '#080c10', intensity: 0.5 },
	keyLights: [
		{ color: '#c6dcf2', intensity: 0.92, position: { x: -70, y: 120, z: 90 } },
		{ color: '#f0d0a8', intensity: 0.36, position: { x: 110, y: 80, z: -70 } }
	],
	fog: { color: '#070c12', density: 0.0092 },
	floodIntensity: 1.12,
	precip: { count: 2600, speed: 26, color: '#b8d4ea', opacity: 0.34, length: 1.3 }
};

/**
 * Storm: the loudest weather. Heavier rain than RAIN_ENV, thicker haze, the
 * warm counter-glow nearly gone, and sky-wide lightning every few seconds.
 */
export const STORM_ENV: EnvironmentPreset = {
	id: 'storm',
	label: 'Storm',
	note: 'Hard rain and lightning. The worst visibility in the game, on purpose.',
	sky: {
		top: '#010307',
		high: '#03070c',
		horizon: '#080e14',
		glow: '#0d151c',
		base: '#02050a',
		warmGlow: 'rgba(255, 130, 45, 0.06)',
		coolGlow: 'rgba(120, 160, 205, 0.20)'
	},
	hemisphere: { sky: '#6c94ba', ground: '#06090d', intensity: 0.42 },
	keyLights: [
		{ color: '#b8d2ec', intensity: 0.68, position: { x: -70, y: 120, z: 90 } },
		{ color: '#e6c8a4', intensity: 0.24, position: { x: 110, y: 80, z: -70 } }
	],
	fog: { color: '#050a10', density: 0.015 },
	floodIntensity: 1.3,
	precip: { count: 4200, speed: 38, color: '#cfe2f4', opacity: 0.42, length: 2.1 },
	lightning: { minGapSec: 4, maxGapSec: 11, intensity: 2.6 }
};

/**
 * Preset registry. The scene reads whichever preset it is handed, so a new
 * look is a data addition here plus an entry in the settings selector.
 */
export const ENV_PRESETS: Record<string, EnvironmentPreset> = {
	night: NIGHT_ENV,
	fog: FOG_ENV,
	rain: RAIN_ENV,
	storm: STORM_ENV
};

/** Selector order (the settings UI renders this, not Object.keys). */
export const ENV_PRESET_IDS = ['night', 'fog', 'rain', 'storm'] as const;
export type EnvPresetId = (typeof ENV_PRESET_IDS)[number];
export const DEFAULT_ENV_ID: EnvPresetId = 'night';

/** Resolve an id to a preset, falling back to the locked clear night. */
export function environmentById(id: string | null | undefined): EnvironmentPreset {
	return (id && ENV_PRESETS[id]) || NIGHT_ENV;
}
