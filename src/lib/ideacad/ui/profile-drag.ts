import type { Station } from '../blade/tree';

export const PROFILE_MIN_STATIONS = 3;
export const PROFILE_MAX_STATIONS = 8;
export const PROFILE_Z_GAP = 0.005;

export interface ProfileScale {
	left: number;
	top: number;
	width: number;
	height: number;
	minZ: number;
	maxZ: number;
	maxR: number;
}

export interface DragResult {
	station: Station;
	limits: Array<'axis' | 'lower-z' | 'upper-z' | 'tip-z'>;
}

const round = (value: number) => Number(value.toFixed(4));

export function profileScale(stations: Station[], width: number, height: number, pad = 28): ProfileScale {
	const minZ = Math.min(...stations.map((station) => station.z));
	const maxZ = Math.max(...stations.map((station) => station.z), minZ + 0.1);
	return {
		left: pad,
		top: pad,
		width: Math.max(1, width - pad * 2),
		height: Math.max(1, height - pad * 2),
		minZ,
		maxZ,
		maxR: Math.max(...stations.map((station) => station.r), 0.1) * 1.15
	};
}

export function stationToScreen(station: Station, scale: ProfileScale): { x: number; y: number } {
	return {
		x: scale.left + (station.r / scale.maxR) * scale.width,
		y: scale.top + scale.height - ((station.z - scale.minZ) / (scale.maxZ - scale.minZ)) * scale.height
	};
}

/** Converts a pointer delta into document units and clamps at the document's existing rules. */
export function dragProfileStation(
	stations: Station[],
	index: number,
	dx: number,
	dy: number,
	scale: ProfileScale
): DragResult {
	const start = stations[index];
	if (!start) return { station: { r: 0, z: 0 }, limits: [] };
	const limits: DragResult['limits'] = [];
	let r = start.r + (dx / scale.width) * scale.maxR;
	let z = start.z - (dy / scale.height) * (scale.maxZ - scale.minZ);
	if (r < 0) {
		r = 0;
		limits.push('axis');
	}
	if (index === 0) {
		z = start.z;
		if (dy !== 0) limits.push('tip-z');
	} else {
		const lower = stations[index - 1].z + PROFILE_Z_GAP;
		if (z < lower) {
			z = lower;
			limits.push('lower-z');
		}
	}
	if (index < stations.length - 1) {
		const upper = stations[index + 1].z - PROFILE_Z_GAP;
		if (z > upper) {
			z = upper;
			limits.push('upper-z');
		}
	}
	return { station: { r: round(r), z: round(z) }, limits };
}

/** Inserts on the segment the pointer selected; t is its fractional position along that segment. */
export function addProfileStation(stations: Station[], segment: number, t: number): Station[] {
	if (stations.length >= PROFILE_MAX_STATIONS) return stations;
	const a = stations[segment];
	const b = stations[segment + 1];
	if (!a || !b) return stations;
	const between = Math.min(1 - PROFILE_Z_GAP / (b.z - a.z), Math.max(PROFILE_Z_GAP / (b.z - a.z), t));
	const made = { r: round(a.r + (b.r - a.r) * between), z: round(a.z + (b.z - a.z) * between) };
	return [...stations.slice(0, segment + 1), made, ...stations.slice(segment + 1)];
}

export function deleteProfileStation(stations: Station[], index: number): Station[] {
	if (stations.length <= PROFILE_MIN_STATIONS) return stations;
	return stations.filter((_, stationIndex) => stationIndex !== index);
}
