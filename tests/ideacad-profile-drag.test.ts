import { describe, expect, it } from 'vitest';
import {
	addProfileStation,
	deleteProfileStation,
	dragProfileStation,
	profileScale
} from '$lib/ideacad/ui/profile-drag';

const stations = [
	{ r: 0.2, z: 0 },
	{ r: 1, z: 1 },
	{ r: 1.5, z: 2 },
	{ r: 1.2, z: 3 }
];
const scale = profileScale(stations, 400, 400, 20);

describe('profile direct-manipulation maths', () => {
	it('converts screen deltas to radius and upward z movement', () => {
		const moved = dragProfileStation(stations, 1, scale.width / scale.maxR, -scale.height / 6, scale);
		expect(moved.station).toEqual({ r: 2, z: 1.5 });
	});

	it('holds radius on the visible revolution axis', () => {
		const moved = dragProfileStation(stations, 1, -1000, 0, scale);
		expect(moved.station.r).toBe(0);
		expect(moved.limits).toContain('axis');
	});

	it('holds z strictly between both neighbours and keeps the configured tip fixed', () => {
		expect(dragProfileStation(stations, 1, 0, 1000, scale)).toMatchObject({ station: { z: 0.005 }, limits: ['lower-z'] });
		expect(dragProfileStation(stations, 1, 0, -1000, scale)).toMatchObject({ station: { z: 1.995 }, limits: ['upper-z'] });
		expect(dragProfileStation(stations, 0, 0, -100, scale)).toMatchObject({ station: { z: 0 }, limits: ['tip-z'] });
	});

	it('lands an added point on the selected segment between the right neighbours', () => {
		const next = addProfileStation(stations, 1, 0.25);
		expect(next[2]).toEqual({ r: 1.125, z: 1.25 });
		expect(next[1]).toEqual(stations[1]);
		expect(next[3]).toEqual(stations[2]);
	});

	it('refuses deletion at the three-station minimum', () => {
		const minimum = stations.slice(0, 3);
		expect(deleteProfileStation(minimum, 1)).toBe(minimum);
	});
});
