// tests/ideacad-solid-addon-spinner.test.ts
//
// THE SPINNER WEAPON ADD-ON'S ARITHMETIC, AGAINST THE TWO WORKED EXAMPLES ITS
// SOURCES PUBLISH. A spinner calculator that is off by a factor of 60 or 2 pi
// renders a perfectly confident number, so the published answers are the
// expected values, typed from the pages, never recomputed from the module:
//
//   * Ask Aaron's Spinner FAQ: 88 in/s of attack, 2 teeth and 5,300 RPM give
//     a bite of about 0.5 in;
//   * Just 'Cuz Robotics: a 4 in blade whose tip runs at 250 mph on an 11.1 V
//     pack needs a motor of about 1,891 kV.
//
// Beside them: E = 1/2 I omega^2 on a disk whose inertia is known in closed
// form, an unknown inertia giving an unknown energy (never a guess), and the
// add-on's registration: off by default and carrying no function at all.
import { describe, expect, it } from 'vitest';
import { IN_PER_S_PER_MPH, SPINNER_ADDON_ID, SPINNER_DEFAULTS, SPINNER_SOURCES, biteIn, omegaOf, requiredKv, rpmForTipSpeed, spinnerReadout, spinnerWeapon, storedEnergyJ, tipSpeedMph } from '../src/lib/ideacad/solid/addons/spinner';
import { addonById, addonEnabled } from '../src/lib/ideacad/solid/addons/registry';
import { emptyManifest } from '../src/lib/ideacad/solid/types';

describe('the published worked examples', () => {
	it('Ask Aaron: 88 in/s, 2 teeth, 5,300 RPM is about half an inch of bite', () => {
		const bite = biteIn(88, 5300, 2);
		expect(Math.abs(bite - 0.5)).toBeLessThan(0.005);
		expect(bite).toBeCloseTo(0.498, 3);
	});
	it("Just 'Cuz Robotics: a 4 in blade at 250 mph on 11.1 V needs about 1,891 kV", () => {
		const rpm = rpmForTipSpeed(250, 2), kv = requiredKv(rpm, 11.1);
		/* Within 0.1 percent of the published figure, which rounds its own RPM. */
		expect(Math.abs(kv - 1891) / 1891).toBeLessThan(0.001);
		/* And back again: that RPM puts the 2 in tip at 250 mph. */
		expect(tipSpeedMph(rpm, 2)).toBeCloseTo(250, 9);
	});
});

describe('the formulas', () => {
	it('omega is RPM x 2 pi / 60, and a mile an hour is 17.6 in/s', () => {
		expect(omegaOf(60)).toBeCloseTo(2 * Math.PI, 12);
		expect(IN_PER_S_PER_MPH).toBe((5280 * 12) / 3600);
	});
	it('stored energy is 1/2 I omega^2: a 1 kg·m² rotor at 60 RPM holds 2 pi^2 J', () => {
		expect(storedEnergyJ(1, 60)).toBeCloseTo(2 * Math.PI * Math.PI, 10);
	});
	it('an unknown inertia is an unknown energy, never a guess; the rest still reads', () => {
		const r = spinnerReadout(SPINNER_DEFAULTS, null, 2, 1);
		expect(r.energyJ).toBeNull(); expect(r.energyPerKg).toBeNull();
		expect(r.tipMph).toBeCloseTo(tipSpeedMph(5300, 2), 12);
		expect(r.biteIn).toBeCloseTo(biteIn(88, 5300, 2), 12);
		expect(r.kv).toBeCloseTo(5300 / 11.1, 10);
		/* Positive control: with an inertia, the energy is there. */
		expect(spinnerReadout(SPINNER_DEFAULTS, 0.001, 2, 1).energyJ).toBeCloseTo(0.5 * 0.001 * omegaOf(5300) ** 2, 10);
	});
	it('any value may be typed: 0 RPM bites without end and is shown as such, never bounded', () => {
		expect(biteIn(88, 0, 2)).toBe(Infinity);
		expect(spinnerReadout({ ...SPINNER_DEFAULTS, rpm: -1000 }, 0.001, 2, null).energyJ).toBeGreaterThan(0);
	});
});

describe('the add-on', () => {
	it('is registered, off by default, names both sources, and carries no function that could touch a document', () => {
		expect(addonById(SPINNER_ADDON_ID)).toBe(spinnerWeapon);
		expect(addonEnabled(emptyManifest().addons, SPINNER_ADDON_ID)).toBe(false);
		expect(Object.values(spinnerWeapon).filter((v) => typeof v === 'function')).toEqual([]);
		expect(spinnerWeapon.tools).toEqual([]); expect(spinnerWeapon.starters).toEqual([]); expect(spinnerWeapon.references).toEqual([]);
		expect(SPINNER_SOURCES.aaron.url).toMatch(/^https:\/\/runamok\.tech\/AskAaron\/spinner_FAQ\.html$/);
		expect(SPINNER_SOURCES.jcr.url).toMatch(/^https:\/\/justcuzrobotics\.com\//);
	});
});
