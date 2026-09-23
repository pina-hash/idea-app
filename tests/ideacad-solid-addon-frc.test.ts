// tests/ideacad-solid-addon-frc.test.ts
//
// THE FRC CHECKS ADD-ON'S ARITHMETIC, against values worked by hand. A holding
// torque about the wrong lever -- the full distance where gravity only acts on
// the horizontal part of it, or a vertical axis read as if gravity could turn
// it -- renders a confident number an arm is then geared to, so each case below
// is the geometry a student would sketch: an arm straight out, straight up,
// and a turntable. The free speed is v = pi D n / (60 G), typed out.
import { describe, expect, it } from 'vitest';
import { FRC_ADDON_ID, FRC_REFERENCE, G, NM_PER_IN_LBF, freeSpeedFtPerS, frcChecks, gravityLeverIn, holdingTorqueNm, worstLeverIn } from '../src/lib/ideacad/solid/addons/frc';
import { addonById, addonEnabled } from '../src/lib/ideacad/solid/addons/registry';
import { emptyManifest } from '../src/lib/ideacad/solid/types';

const Y_AXIS = { origin: [0, 0, 5] as [number, number, number], direction: [0, 1, 0] as [number, number, number] };
describe('the lever gravity has about a pivot', () => {
	it('an arm held straight out has its full length as the lever; straight up it has none', () => {
		expect(gravityLeverIn([10, 0, 5], Y_AXIS)).toBeCloseTo(10, 12);
		expect(gravityLeverIn([0, 0, 15], Y_AXIS)).toBeCloseTo(0, 12);
		/* At 60 degrees up, the horizontal part: 10 cos 60. */
		expect(gravityLeverIn([10 * Math.cos(Math.PI / 3), 3, 5 + 10 * Math.sin(Math.PI / 3)], Y_AXIS)).toBeCloseTo(5, 12);
	});
	it('the worst pose is the arm level, whatever pose it was modeled in', () => {
		expect(worstLeverIn([0, 0, 15], Y_AXIS)).toBeCloseTo(10, 12);
		expect(worstLeverIn([6, 2, 13], Y_AXIS)).toBeCloseTo(10, 12);
	});
	it('gravity cannot turn a turntable: about a vertical axis the lever is zero at every pose', () => {
		const z = { origin: [0, 0, 0] as [number, number, number], direction: [0, 0, 2] as [number, number, number] };
		expect(gravityLeverIn([7, 3, 1], z)).toBeCloseTo(0, 12);
		expect(worstLeverIn([7, 3, 1], z)).toBeCloseTo(0, 12);
	});
});
describe('torque and speed', () => {
	it('2 kg on a 10 in lever holds 2 x 9.80665 x 0.254 N·m, about 44.1 in·lbf', () => {
		const t = holdingTorqueNm(2, 10);
		expect(t).toBeCloseTo(2 * 9.80665 * 0.254, 12);
		expect(t / NM_PER_IN_LBF).toBeCloseTo(44.09, 2);
		expect(G).toBe(9.80665);
	});
	it('a 4 in wheel on a 5,676 RPM motor through 8.45:1 runs pi x 4 x 5676 / (60 x 8.45) / 12 ft/s', () => {
		expect(freeSpeedFtPerS(4, 5676, 8.45)).toBeCloseTo((Math.PI * 4 * 5676) / (60 * 8.45) / 12, 12);
		expect(freeSpeedFtPerS(4, 5676, 8.45)).toBeCloseTo(11.72, 2);
	});
});
describe('the add-on', () => {
	it('is registered, off by default, names its reference, and carries no function that could touch a document', () => {
		expect(addonById(FRC_ADDON_ID)).toBe(frcChecks);
		expect(addonEnabled(emptyManifest().addons, FRC_ADDON_ID)).toBe(false);
		expect(Object.values(frcChecks).filter((v) => typeof v === 'function')).toEqual([]);
		expect(FRC_REFERENCE.url).toBe('https://www.reca.lc/');
	});
});
