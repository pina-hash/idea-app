// tests/ideacad-viewport-config.test.ts
//
// `src/lib/ideacad/config.ts` had NO IMPORTER OF ANY KIND and no test, which
// ledger 0160 measured and recorded. It is one function -- a type guard over a
// `BladeConfig` -- and a guard nobody calls is a guard that cannot be wrong,
// which is a different thing from being right.
//
// `BladeEditor` calls it now, at the component boundary, because that is where
// a config from the document row arrives on the real page. The editor NAMES an
// unusable one rather than swapping it silently: a rail quoting limits from a
// config nobody supplied is worse than a rail saying which limits it is
// quoting.
//
// The cases below are built by BREAKING the real default, one key at a time,
// rather than by typing out shapes: a hand-written "valid" fixture is a fixture
// that agrees with whatever the guard happens to check, and a hand-written
// invalid one usually breaks more than the key it means to.

import { describe, expect, it } from 'vitest';
import { bladeConfigShaped } from '../src/lib/ideacad/config';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE, type BladeConfig } from '../src/lib/ideacad/blade/materials';

const clone = () => structuredClone(DEFAULT_BLADE_CONFIG) as BladeConfig;

describe('bladeConfigShaped', () => {
	it('accepts the shipped default, which is the positive control', () => {
		expect(bladeConfigShaped(DEFAULT_BLADE_CONFIG)).toBe(true);
	});

	it('refuses the things a missing or broken row actually looks like', () => {
		for (const bad of [null, undefined, 0, '', 'config', [], true]) {
			expect(bladeConfigShaped(bad), JSON.stringify(bad)).toBe(false);
		}
	});

	const required: (keyof BladeConfig)[] = [
		'materials',
		'stock',
		'standardParts',
		'launcher',
		'tipHeightIn',
		'rules',
		'defaultFeatures'
	];
	for (const key of required) {
		it(`refuses a config missing \`${key}\``, () => {
			const c = clone() as Record<string, unknown>;
			delete c[key];
			expect(bladeConfigShaped(c)).toBe(false);
		});
	}

	it('refuses a list key that is not a list', () => {
		const c = clone() as Record<string, unknown>;
		c.materials = { pla: { densityGcm3: 1.24 } };
		expect(bladeConfigShaped(c)).toBe(false);
	});

	it('refuses a tip height that arrived as a string', () => {
		/* The shape a JSON column hands back when somebody typed the number into
		   a text field. */
		const c = clone() as Record<string, unknown>;
		c.tipHeightIn = '0.125';
		expect(bladeConfigShaped(c)).toBe(false);
	});

	it('refuses default features that are not a valid blade tree', () => {
		/* The guard delegates to `validateBladeTree`, so a structurally legal
		   object whose TREE is wrong is still refused. Stations that do not
		   climb is 0145's own rule, and the guard has to inherit it rather than
		   restate it. */
		const c = clone();
		const body = c.defaultFeatures.features.find((f) => f.type === 'revolve');
		if (body && body.type === 'revolve') body.stations = [...body.stations].reverse();
		expect(bladeConfigShaped(c)).toBe(false);
	});

	it('refuses a tree whose editor is something else', () => {
		const c = clone();
		(c.defaultFeatures as { editor: string }).editor = 'gearbox';
		expect(bladeConfigShaped(c)).toBe(false);
	});

	it('accepts a config whose defaults were swapped for another valid tree', () => {
		/* The other direction: the guard must not be pinned to the one default,
		   or every real document row fails it. */
		const c = clone();
		c.defaultFeatures = structuredClone(DEFAULT_BLADE_TREE);
		const pattern = c.defaultFeatures.features.find((f) => f.type === 'circularPattern');
		if (pattern && pattern.type === 'circularPattern') pattern.count = 6;
		expect(bladeConfigShaped(c)).toBe(true);
	});
});
