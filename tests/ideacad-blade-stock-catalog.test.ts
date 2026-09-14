import { describe, expect, it } from 'vitest';
import {
	BLADE_STOCK_MATERIALS,
	DENSITY_UNVERIFIED_REFUSAL,
	MATERIAL_UNKNOWN_REFUSAL,
	THICKNESS_UNKNOWN_REFUSAL,
	resolveBladeStock
} from '../src/lib/ideacad/blade/materials';

describe('ledger 0261 blade stock catalogue', () => {
	it('names exactly the five student-recognisable materials', () => {
		expect(BLADE_STOCK_MATERIALS.map((material) => material.id)).toEqual([
			'ar500', '6061', '4140', 'polycarbonate', 'baltic-birch-ply'
		]);
	});

	it('never turns an unverified density into a plausible number', () => {
		for (const material of BLADE_STOCK_MATERIALS) {
			expect(material.densityVerified).toBe(false);
			expect(material.densityGcm3).toBeNull();
			expect(material.densitySource).toBeNull();
		}
		expect(resolveBladeStock('6061', 0.125)).toMatchObject({
			ok: false,
			refusal: DENSITY_UNVERIFIED_REFUSAL
		});
	});

	it('carries a named thickness convention and selectable stock list per material', () => {
		for (const material of BLADE_STOCK_MATERIALS) {
			expect(['gauge', 'fractional-inch', 'metric-ply']).toContain(material.thicknessConvention);
			expect(material.stockThicknesses.length).toBeGreaterThan(0);
			expect(material.stockThicknesses.every((stock) => stock.label.length > 0 && stock.inches > 0)).toBe(true);
		}
		expect(BLADE_STOCK_MATERIALS.find((material) => material.id === 'baltic-birch-ply')?.thicknessConvention)
			.toBe('metric-ply');
	});

	it('returns named refusals for unknown materials and unknown thicknesses', () => {
		expect(resolveBladeStock('mystery-metal', 0.125)).toMatchObject({ ok: false, refusal: MATERIAL_UNKNOWN_REFUSAL });
		expect(resolveBladeStock('ar500', 123)).toMatchObject({ ok: false, refusal: THICKNESS_UNKNOWN_REFUSAL });
	});
});
