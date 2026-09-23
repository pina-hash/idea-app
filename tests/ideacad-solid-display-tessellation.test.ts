// tests/ideacad-solid-display-tessellation.test.ts
//
// THE DISPLAY MESH IS SIZED TO THE MODEL AND THE EXPORT MESH IS NOT. The
// viewport's per-face meshes take a chord relative to the model's largest side
// so round things read round at every size; the whole-body mesh that STL, 3MF
// and the advisory checks read must stay at 0.002 in and 0.15 rad, because the
// advisory band (a diameter within 0.004 of a limit is Unknown) is twice that
// chord. A change that moved the export numbers along with the display ones
// would pass every visual check and silently shift which holes the advisory
// can call. The expected numbers are the brief's (0296 stage W3), not read back.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISPLAY_TESSELLATION, EXPORT_TESSELLATION, displayChord } from '../src/lib/ideacad/solid/engine';

describe('display tessellation', () => {
	it('takes 2e-4 of the model size as its chord, never finer than 1e-5 in, at 0.06 rad', () => {
		expect(displayChord(6)).toBeCloseTo(1.2e-3, 12);
		expect(displayChord(0.5)).toBeCloseTo(1e-4, 12);
		expect(displayChord(0.01)).toBe(1e-5);
		expect(displayChord(Number.NaN)).toBeCloseTo(2e-4, 12);
		expect(DISPLAY_TESSELLATION.angle).toBe(0.06);
	});
	it('leaves the export and advisory mesh at 0.002 in and 0.15 rad, the deflection the advisory band assumes', () => {
		expect(EXPORT_TESSELLATION).toEqual({ chord: 0.002, angle: 0.15 });
		const advisory = readFileSync('src/lib/ideacad/solid/advisory.ts', 'utf8');
		expect(advisory).toMatch(/<\.004\)/);
		const engine = readFileSync('src/lib/ideacad/solid/engine.ts', 'utf8');
		/* The whole-body mesh reads the export numbers and nothing else does: one call, by name. */
		expect(engine.match(/tessellateSolidGroupedBinary\(solid, EXPORT_TESSELLATION\.chord, EXPORT_TESSELLATION\.angle\)/g)).toHaveLength(1);
		expect(engine.match(/tessellateFace\(handle, chord, DISPLAY_TESSELLATION\.angle\)/g)).toHaveLength(1);
	});
});
