// tests/type-scale.test.ts
//
// LEDGER 0469: ONE TYPE SCALE, AND ITS FLOOR IS 11px (feedback 8a928045).
//
// The 2026-10-26 audit found text at 9.3px on the home page, 10.6px on coin
// labels and 155 nodes at 10.6px or less on the admin console, while the
// classroom carried about fifty distinct font sizes from 0.6rem to 1.6rem.
// What a reader sees is measured by `npm run verify:browser` (its `type-floor`
// check); what is held here is the part that regresses silently in source:
//
//   - every step of the scale stands on the floor, and the floor is 11px;
//   - the Plate's label size reads the floor rather than restating it;
//   - lib/classroom names a step, never a rem literal, below the display sizes;
//   - nothing in the plate-scope source this lane swept sets text under 11px;
//   - the HTML kit's label parts read the floor token.
//
// Positive controls: a planted literal is caught by the same sweep, and a
// planted step under the floor is caught by the same scale reader.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `--fs-<step>: <n>rem` the scale declares. */
function scale(css: string): Map<string, number> {
	const out = new Map<string, number>();
	for (const m of stripComments(css).matchAll(/(--fs-[a-z0-9]+):\s*([0-9.]+)rem\s*;/g)) out.set(m[1], Number(m[2]));
	return out;
}

/** Every .svelte and .css file under a directory. */
function walk(dir: string): string[] {
	const abs = new URL(dir, ROOT).pathname;
	const out: string[] = [];
	for (const name of readdirSync(abs)) {
		const p = join(abs, name);
		if (statSync(p).isDirectory()) out.push(...walk(join(dir, name)));
		else if (/\.(svelte|css)$/.test(name)) out.push(join(dir, name));
	}
	return out;
}

const REM_LITERAL = /font-size:\s*([0-9]*\.?[0-9]+)rem\s*(?:!important\s*)?;/g;
const ANY_LITERAL = /font-size:\s*([0-9]*\.?[0-9]+)(rem|px)\s*(?:!important\s*)?;/g;

/** rem literals under `ceiling` in one stylesheet's text. */
function remLiterals(css: string, ceiling: number): string[] {
	return [...stripComments(css).matchAll(REM_LITERAL)].map((m) => Number(m[1])).filter((v) => v < ceiling).map((v) => `${v}rem`);
}

/**
 * The rooms with a design system of their own that the floor sweep leaves
 * alone (themes.md, "scoped themes are deliberately off-brand"): a rule whose
 * selector names one is theirs, even in the global sheet.
 */
const OWN_ROOMS = ['.gauntlet', '.gt-', '.frc-root', '.fsp-root', '.glb', 'greenline', 'vanguard', '.ic-'];

/** Literals that set text under 11px, outside a rule of a room with its own design. */
function underFloor(css: string): string[] {
	const bare = stripComments(css);
	return [...bare.matchAll(ANY_LITERAL)]
		.filter((m) => (m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])) < 10.99)
		.filter((m) => {
			const open = bare.lastIndexOf('{', m.index);
			const selector = bare.slice(bare.lastIndexOf('}', open) + 1, open);
			return !OWN_ROOMS.some((r) => selector.includes(r));
		})
		.map((m) => `${m[1]}${m[2]}`);
}

const TYPO = read('src/lib/design-system/typography.css');
const PLATE = read('src/lib/classroom/plate.css');

/** The plate-scope source the floor sweep covers (ledger 0469's own list). */
const FLOOR_SWEPT = [
	'src/app.css',
	'src/lib/classroom',
	'src/lib/coin-desk',
	'src/lib/coin-market',
	'src/lib/coin-stocks',
	'src/lib/coin-balance',
	'src/lib/coin-bar',
	'src/lib/maps',
	'src/lib/notebook',
	'src/lib/shell',
	'src/lib/ui',
	'src/lib/tour',
	'src/lib/foundry',
	'src/lib/media',
	'src/lib/tournaments',
	'src/lib/calendar',
	'src/lib/certifications',
	'src/lib/feedback',
	'src/lib/ProfileMenu.svelte',
	'src/lib/CodeCounter.svelte',
	'src/lib/ShortLinkManager.svelte',
	'src/lib/PathwayPicker.svelte',
	'src/lib/PathwayChip.svelte',
	'src/lib/VersionBadge.svelte',
	'src/lib/SaveIndicator.svelte',
	'src/lib/CheckInGuidance.svelte',
	// Mounted on the admin console, a plate page, as well as in their own rooms.
	'src/lib/frc/FrcUnitOverride.svelte',
	'src/lib/frc/FrcReviewQueue.svelte',
	'src/lib/greenline/DecalReviewQueue.svelte',
	'src/lib/greenline/GreenlineDashboardCard.svelte',
	'src/routes/admin',
	'src/routes/dashboard',
	'src/routes/classroom',
	'src/routes/reference',
	'src/routes/tournaments',
	'src/routes/coin',
	'src/routes/coin-desk',
	'src/routes/coin-balance',
	'src/routes/market',
	'src/routes/maps',
	'src/routes/foundry',
	'src/routes/certifications',
	'src/routes/calendar'
];
/**
 * What the sweep leaves alone, and why. Each is somebody else's design or a
 * drawing, never a page's own label: the feedback trigger is also
 * served inside the frozen Coin Ledger; the two Armory consoles belonged to
 * another lane on the day. The launcher (`src/lib/AppLauncher.svelte`) is
 * not in the sweep at all: lane 0472 was redrawing every card on the day.
 */
const FLOOR_EXEMPT = [
	'src/lib/feedback/FeedbackTrigger.svelte',
	'src/lib/feedback/ArmoryFeedbackConsole.svelte',
	'src/lib/feedback/ArmoryIncidentConsole.svelte'
];

describe('the type scale stands on the 11px floor', () => {
	it('every step is at least 11px, and the floor step is exactly 11px', () => {
		const steps = scale(TYPO);
		expect(steps.size).toBeGreaterThanOrEqual(12);
		expect(steps.get('--fs-micro')).toBe(0.6875);
		const under = [...steps].filter(([, v]) => v * 16 < 11).map(([k, v]) => `${k} ${v}rem`);
		expect(under).toEqual([]);
		// POSITIVE CONTROL: a step under the floor is caught by the same reader.
		expect([...scale(`${TYPO}\n:root { --fs-tiny: 0.6rem; }`)].filter(([, v]) => v * 16 < 11)).toHaveLength(1);
	});

	it("the Plate's label size reads the floor rather than restating it", () => {
		expect(stripComments(PLATE)).toMatch(/--plate-label-size:\s*var\(--fs-micro, 0\.6875rem\);/);
	});

	it("the HTML kit's label parts read the floor token, which the kit declares on its page", () => {
		const kit = stripComments(read('tools/hx-kit/kit/plate.css'));
		expect(kit).toMatch(/\.idea-plate \{\s*--plate-label-size: 0\.6875rem;/);
		for (const part of ['.idea-eyebrow.idea-eyebrow {', '.idea-pad.idea-pad {', '.idea-display-label {', '.idea-chip {']) {
			const at = kit.indexOf(part);
			expect(at, part).toBeGreaterThan(-1);
			const body = kit.slice(at, kit.indexOf('}', at));
			expect(body, part).toContain('font-size: var(--plate-label-size, 0.6875rem);');
		}
		expect(kit).not.toMatch(/font-size:\s*0\.6875rem/);
	});
});

describe('lib/classroom names a step of the scale, never a literal', () => {
	const files = walk('src/lib/classroom/');
	it('no rem font-size literal under the display sizes (1.75rem)', () => {
		expect(files.length).toBeGreaterThan(100);
		const hits = files.flatMap((f) => remLiterals(read(f), 1.75).map((v) => `${f} ${v}`));
		expect(hits).toEqual([]);
		// The scale is what is used instead: a count, so a sweep that matched nothing cannot pass.
		const uses = files.reduce((n, f) => n + (read(f).match(/font-size:\s*var\(--fs-[a-z0-9]+\)/g) ?? []).length, 0);
		expect(uses).toBeGreaterThan(800);
		// POSITIVE CONTROL: a planted literal is caught.
		expect(remLiterals('.x { font-size: 0.78rem; }', 1.75)).toEqual(['0.78rem']);
	});
});

describe('nothing in the swept plate-scope source sets text under 11px', () => {
	it('every font-size literal there is 11px or more', () => {
		const files = FLOOR_SWEPT.flatMap((p) => (/\.(svelte|css)$/.test(p) ? [p] : walk(`${p}/`))).filter((f) => !FLOOR_EXEMPT.includes(f));
		expect(files.length).toBeGreaterThan(300);
		const hits = files.flatMap((f) => underFloor(read(f)).map((v) => `${f} ${v}`));
		expect(hits).toEqual([]);
		// POSITIVE CONTROLS: a planted rem and a planted px literal are both caught,
		// and the exempt files are real (an exemption for a file that is gone is removed).
		expect(underFloor('.a { font-size: 0.62rem; } .b { font-size: 10px; } .c { font-size: 0.6875rem; }')).toEqual(['0.62rem', '10px']);
		// ... and a room with its own design keeps its own sizes, by its selector.
		expect(underFloor('.gauntlet .x { font-size: 0.62rem; } .y { font-size: 0.62rem; }')).toEqual(['0.62rem']);
		for (const f of FLOOR_EXEMPT) expect(() => read(f), f).not.toThrow();
	});
});
