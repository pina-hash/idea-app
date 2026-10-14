/**
 * THE CLASS BANNER'S PATTERN FLOWS WITHOUT A SEAM (decision 61, Mr. Pina
 * 2026-10-14: "they should be smoothly continuous looping animations").
 *
 * `patternFlow` derives the moving form from the one template. What makes the
 * loop seamless is arithmetic, so it is held here rather than by eye: the
 * phase shifts EVERY colour stop by the same amount, the loop's travel is
 * exactly one period of the template (the largest stop), and at phase zero the
 * picture is the still template's.
 */
import { describe, expect, it } from 'vitest';
import {
	CLASS_THEME_PATTERNS,
	PATTERN_FLOW_MS,
	classThemeFlow,
	patternFlow,
	patternFlowOffset,
	resolveClassTheme
} from '../src/lib/classroom/class-theme';

const STROKE = 'hsl(200 50% 40% / 0.16)';
const drawn = CLASS_THEME_PATTERNS.filter((p) => p.template !== null);

/** The flowing CSS with the phase set to zero, normalised the way the still template is written. */
function atPhaseZero(css: string): string {
	return css
		.replace(/calc\((\d+(?:\.\d+)?)px \+ var\(--ct-phase\)\)/g, (_, n) => (n === '0' ? '0' : `${n}px`))
		.replace('from var(--ct-turn) ', '');
}

describe('patternFlow', () => {
	it('derives a flowing form for every drawn pattern and none for the plain one', () => {
		expect(drawn.length).toBe(4);
		expect(patternFlow(CLASS_THEME_PATTERNS.find((p) => p.id === 'plain')!, STROKE)).toBeNull();
		for (const p of drawn) expect(patternFlow(p, STROKE), p.id).not.toBeNull();
	});

	it('is the still template at phase zero, so every frame is the measured frame', () => {
		for (const p of drawn) {
			const still = p.template!.replace('{c}', STROKE);
			expect(atPhaseZero(patternFlow(p, STROKE)!.css), p.id).toBe(still);
		}
	});

	it('moves every colour stop by the same phase (so the picture slides rather than distorts)', () => {
		for (const p of drawn.filter((d) => !d.template!.startsWith('repeating-conic'))) {
			const css = patternFlow(p, STROKE)!.css;
			const stops = p.template!.match(/\d+(?:\.\d+)?px|\s0\s/g)!.length;
			expect((css.match(/var\(--ct-phase\)/g) ?? []).length, p.id).toBe(stops);
			expect(css, p.id).not.toContain('--ct-turn');
		}
	});

	it('turns the conic pattern from the phase and leaves its stops alone', () => {
		const rays = patternFlow(CLASS_THEME_PATTERNS.find((p) => p.id === 'rays')!, STROKE)!;
		expect(rays.css.startsWith('repeating-conic-gradient(from var(--ct-turn) at 100% 100%,')).toBe(true);
		expect(rays.css).not.toContain('--ct-phase');
		expect(rays).toMatchObject({ period: 9, unit: 'deg', property: '--ct-turn' });
	});

	it('travels exactly one period of each template, which is what makes the loop seamless', () => {
		const periods = Object.fromEntries(drawn.map((p) => [p.id, patternFlow(p, STROKE)!.period]));
		// The periods are read off the templates' own last stops, written out
		// here from class-theme.ts rather than from the function under test.
		expect(periods).toEqual({ stripes: 12, rings: 14, rays: 9, ripples: 16 });
	});

	it('gives every drawn pattern a duration', () => {
		for (const p of drawn) expect(PATTERN_FLOW_MS[p.id], p.id).toBeGreaterThan(0);
	});

	it('puts both twins on the layer, for a theme with a pattern, and nothing for one without', () => {
		const theme = resolveClassTheme({ winners: { palette: 'ocean', pattern: 'stripes' }, accent: null })!;
		const flow = classThemeFlow(theme)!;
		expect(flow.style).toMatch(/^--ct-pf:repeating-linear-gradient\(.*;--ct-pf-light:repeating-linear-gradient\(/);
		expect(flow.durationMs).toBe(PATTERN_FLOW_MS.stripes);
		const plain = resolveClassTheme({ winners: { palette: 'ocean', pattern: 'plain' }, accent: null })!;
		expect(classThemeFlow(plain)).toBeNull();
		expect(classThemeFlow(null)).toBeNull();
	});
});

describe('patternFlowOffset', () => {
	it('is the wall clock modulo one loop, so every mount lands on the same frame', () => {
		expect(patternFlowOffset(10_500, 3000)).toBe(1500);
		expect(patternFlowOffset(9000, 3000)).toBe(0);
		expect(patternFlowOffset(-500, 3000)).toBe(2500);
		expect(patternFlowOffset(1234, 0)).toBe(0);
		// Two mounts a second apart are a second apart in the loop, never reset.
		const a = patternFlowOffset(1_791_996_773_000, 3500);
		const b = patternFlowOffset(1_791_996_774_000, 3500);
		expect((b - a + 3500) % 3500).toBe(1000);
	});
});
