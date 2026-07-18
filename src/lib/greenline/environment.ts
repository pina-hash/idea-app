/**
 * GREENLINE environment presets: the one swappable sky / light / fog / flood
 * configuration the race scene reads instead of hardcoding values inline.
 *
 * Plain data (the loadout.ts / curriculum.ts convention): no three.js imports,
 * colors are CSS hex strings so they feed both THREE.Color and canvas
 * gradients. A future time-of-day or weather system adds a preset here (dusk,
 * storm, ...) and a way to pick one; the scene setup itself never changes.
 * Only `night` exists today, matching the locked key art ("1A / IMPACT",
 * KeyArtScene.svelte): floodlit rig-yard night, cool key light one side and a
 * warm counter the other, motivated glows on the horizon, everything else
 * near-black or steel.
 */

export interface EnvKeyLight {
	color: string;
	intensity: number;
	/** World position the light shines FROM (directional, aimed at origin). */
	position: { x: number; y: number; z: number };
}

export interface EnvironmentPreset {
	id: string;
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
	/** Multiplier on the light-tower flood lamps, cones, and ground pools. */
	floodIntensity: number;
}

export const NIGHT_ENV: EnvironmentPreset = {
	id: 'night',
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
 * Preset registry. Adding `dusk` or `storm` later is a data addition here,
 * not a scene rewrite; the scene reads whichever preset it is handed.
 */
export const ENV_PRESETS: Record<string, EnvironmentPreset> = { night: NIGHT_ENV };
