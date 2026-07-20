/**
 * GREENLINE weather selection: a reactive, localStorage-backed preset id (the
 * audio-settings / creative-mode store pattern). Persisted across a real
 * reload, so a player who prefers racing in fog keeps racing in fog.
 *
 * Presentation only. Weather NEVER touches grip, drag, damage, AI targets, or
 * lap timing — a rainy lap and a clear lap are the same physics, so a stormy
 * run is still a fair run and still ranks. Every preset is a NIGHT preset (see
 * environment.ts): this varies atmosphere, not the hour.
 */
import { browser } from '$app/environment';
import {
	DEFAULT_ENV_ID,
	ENV_PRESETS,
	environmentById,
	type EnvironmentPreset,
	type EnvPresetId
} from './environment';

const KEY = 'greenline_weather';

function stored(): EnvPresetId {
	if (!browser) return DEFAULT_ENV_ID;
	const v = localStorage.getItem(KEY);
	return v && ENV_PRESETS[v] ? (v as EnvPresetId) : DEFAULT_ENV_ID;
}

export const weatherSettings = $state({ preset: stored() });

export function setWeatherPreset(id: EnvPresetId): void {
	if (!ENV_PRESETS[id]) return;
	weatherSettings.preset = id;
	if (browser) localStorage.setItem(KEY, id);
}

/** The live preset object. Read reactively; the race applies it on change. */
export function activeEnvironment(): EnvironmentPreset {
	return environmentById(weatherSettings.preset);
}
