/**
 * THE SPINNER WEAPON ADD-ON: the stored energy, tip speed, bite and motor kV
 * of a spinning weapon, fed by the moment of inertia of the student's OWN
 * model -- the one number every published spinner calculator asks a builder to
 * copy out of their CAD by hand.
 *
 * IT ADVISES AND NEVER RESTRICTS, BY CONSTRUCTION. The add-on record below
 * carries no tool, no starter, no reference and no advise hook: it is an
 * On/Off switch in the Add-ons panel, off by default like every add-on, and
 * while it is on the Analysis panel shows its readout. Nothing here can touch
 * the document; every function in this file is arithmetic over numbers the
 * student typed and the inertia `analysis/mass.ts` computed. Any value may be
 * typed; a result the arithmetic cannot give (a bite at 0 RPM divides by
 * zero) is shown as such, never bounded.
 *
 * EVERY FORMULA NAMES ITS PUBLISHED SOURCE (`SPINNER_SOURCES`), and the two
 * worked examples those sources publish are the unit tests
 * (`tests/ideacad-solid-addon-spinner.test.ts`):
 *  - bite = attack speed * 60 / (RPM * teeth): 88 in/s, 2 teeth, 5,300 RPM
 *    gives about 0.5 in (Ask Aaron, Spinner FAQ);
 *  - kV = ideal RPM / battery voltage, the ideal RPM being the one that puts
 *    the tip at its target speed: a 4 in blade at 250 mph on 11.1 V needs
 *    about 1,891 kV (Just 'Cuz Robotics, Combat Robot Spinner Design);
 *  - stored energy = 1/2 I omega^2, omega in rad/s, I "calculated by CAD
 *    software" (Just 'Cuz Robotics) -- which is this model;
 *  - tip speed = omega r, r the farthest point of the body from its spin axis.
 *
 * THE DENSITY RULE BINDS IT. The inertia is known only when every body it
 * sums has a cited density (`bodyMass`, `advisory.ts`); otherwise the energy
 * is Unknown and the panel names the bodies that block it. A printed blade
 * has no inertia here, and says so.
 */
import type { Addon } from './registry';

export const SPINNER_ADDON_ID = 'spinnerWeapon';

export interface SpinnerSource { name: string; url: string }
export const SPINNER_SOURCES = {
	aaron: { name: 'Ask Aaron: Spinner FAQ', url: 'https://runamok.tech/AskAaron/spinner_FAQ.html' },
	jcr: { name: "Just 'Cuz Robotics: Combat Robot Spinner Design", url: 'https://justcuzrobotics.com/blogs/jcr/combat-robot-spinner-design' }
} as const satisfies Record<string, SpinnerSource>;

/** 5,280 ft * 12 in / 3,600 s. */
export const IN_PER_S_PER_MPH = 17.6;
export const M_PER_S_PER_MPH = 0.44704;
/** Tip speed past this is where Just 'Cuz Robotics advises stopping (ideally 200 to 250 mph). Advice only. */
export const TIP_SPEED_ADVICE_MPH = 300;
/** Ask Aaron's rule of thumb: at least about 60 J per kg of weight class, effective weapons near twice that. Advice only. */
export const ENERGY_ADVICE_J_PER_KG = 60;

export interface SpinnerInputs { rpm: number; teeth: number; attackInPerS: number; volts: number }
/** The fields open on Ask Aaron's own worked example and a 3S pack. */
export const SPINNER_DEFAULTS: SpinnerInputs = { rpm: 5300, teeth: 2, attackInPerS: 88, volts: 11.1 };

/** rad/s from RPM. */
export const omegaOf = (rpm: number) => (rpm * 2 * Math.PI) / 60;
/** 1/2 I omega^2, joules, from I in kg·m². */
export const storedEnergyJ = (inertiaKgM2: number, rpm: number) => 0.5 * inertiaKgM2 * omegaOf(rpm) ** 2;
/** omega r, in/s. */
export const tipSpeedInPerS = (rpm: number, radiusIn: number) => omegaOf(rpm) * radiusIn;
export const tipSpeedMph = (rpm: number, radiusIn: number) => tipSpeedInPerS(rpm, radiusIn) / IN_PER_S_PER_MPH;
/** attack speed * 60 / (RPM * teeth), inches per tooth strike. */
export const biteIn = (attackInPerS: number, rpm: number, teeth: number) => (attackInPerS * 60) / (rpm * teeth);
/** RPM / volts. */
export const requiredKv = (rpm: number, volts: number) => rpm / volts;
/** The RPM that puts a tip `radiusIn` from the axis at `mph`. */
export const rpmForTipSpeed = (mph: number, radiusIn: number) => ((mph * IN_PER_S_PER_MPH) / radiusIn) * (60 / (2 * Math.PI));

export interface SpinnerReadout {
	omega: number;
	/** Joules, or null when the inertia is unknown. */
	energyJ: number | null;
	/** Joules per kg of the whole model, or null when either is unknown. */
	energyPerKg: number | null;
	tipMph: number | null;
	tipMps: number | null;
	biteIn: number;
	kv: number;
}

/** The whole readout for one set of typed values. A result that is not a finite number is left as the arithmetic gave it; the panel says so. */
export function spinnerReadout(inputs: SpinnerInputs, inertiaKgM2: number | null, radiusIn: number | null, modelKg: number | null): SpinnerReadout {
	const energyJ = inertiaKgM2 === null ? null : storedEnergyJ(inertiaKgM2, inputs.rpm);
	const tipMph = radiusIn === null ? null : tipSpeedMph(inputs.rpm, radiusIn);
	return {
		omega: omegaOf(inputs.rpm),
		energyJ,
		energyPerKg: energyJ !== null && modelKg !== null && modelKg > 0 ? energyJ / modelKg : null,
		tipMph,
		tipMps: tipMph === null ? null : tipMph * M_PER_S_PER_MPH,
		biteIn: biteIn(inputs.attackInPerS, inputs.rpm, inputs.teeth),
		kv: requiredKv(inputs.rpm, inputs.volts)
	};
}

/**
 * The registered add-on. No member here is a function, so it adds nothing to
 * the function count the registry test pins and carries nothing that could
 * run against the document.
 */
export const spinnerWeapon: Addon = {
	id: SPINNER_ADDON_ID,
	name: 'Spinner weapon',
	description: "Energy, tip speed, bite and motor kV from your weapon's own inertia, in Analysis.",
	tools: [],
	starters: [],
	references: []
};
