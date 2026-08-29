// tests/gauntlet-post-run-analysis-wiring.test.ts
//
// 0150: the three post-run comparisons that were built and never connected.
//
// WHY A TEST RATHER THAN A HARNESS PASS. The defect this file exists for is not
// that the panel looked wrong -- it looked FINE. `selfHistory`, `classStats` and
// the add-in's summary all have graceful empty states ("This is your first
// recorded attempt", "No class comparison yet", a mass derived from the level's
// density), so a mount that stops passing any of them renders a complete,
// plausible panel with the feature silently gone. That is exactly the silent
// regression CLAUDE.md reserves a test for, and it is how the feature sat
// invisible in production while a dev harness exercised all of it.
//
// So there are two halves here, and the second is the one that would have
// caught the original bug:
//   1. BEHAVIOUR: the component actually reads each prop (present vs absent,
//      both directions, on the real component).
//   2. THE MOUNT: the shipping route passes them. A component that reads a prop
//      nobody hands it is the state this bundle found.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import PostRunAnalysis from '../src/lib/gauntlet/PostRunAnalysis.svelte';
import type { RunEvent, TelemetryTargets } from '../src/lib/gauntlet';

const ROUTE_DIR = join(process.cwd(), 'src/routes/gauntlet/speedrun/[id]');
const PAGE = readFileSync(join(ROUTE_DIR, '+page.svelte'), 'utf8');
const LOAD = readFileSync(join(ROUTE_DIR, '+page.server.ts'), 'utf8');

const targets: TelemetryTargets = {
	targetVolumeMm3: 52000,
	densityGcm3: 2.7,
	targetMassLevel: 140.4,
	massUnit: 'g',
	unitSystem: 'MMGS',
	parTime: 600,
	parFeatures: 6
};

/**
 * A stream shaped like the add-in's: a start, two features far enough apart to
 * be the longest dwell, a snapshot carrying the final volume, and an end.
 */
function stream(): RunEvent[] {
	return [
		{ seq: 1, t_ms: 0, event_type: 'run_start', payload: {} },
		{ seq: 2, t_ms: 1000, event_type: 'feature_add', payload: { name: 'Boss-Extrude1' } },
		{ seq: 3, t_ms: 41000, event_type: 'feature_add', payload: { name: 'Cut-Extrude1' } },
		{ seq: 4, t_ms: 42000, event_type: 'snapshot', payload: { volume_mm3: 50000, feature_count: 2 } },
		{ seq: 5, t_ms: 43000, event_type: 'run_end', payload: { is_correct: true } }
	];
}

const html = (props: Record<string, unknown>) =>
	render(PostRunAnalysis, { props: { events: stream(), targets, ...props } }).body;

/**
 * Just the stat-tile row. Scoping matters here rather than being tidiness: the
 * longest dwell in this fixture is also 40.0s and is printed in the dwell bars,
 * so a whole-document `not.toContain('40.0s')` would fail against a correct
 * render and pass only by accident on a different fixture.
 */
const statsOf = (out: string) => {
	const i = out.indexOf('class="pra-stats');
	const j = out.indexOf('pra-coach', i);
	expect(i).toBeGreaterThan(-1);
	expect(j).toBeGreaterThan(i);
	return out.slice(i, j);
};

// ---------------------------------------------------------------------------
// 1. The add-in summary: the two fields the events cannot give.
// ---------------------------------------------------------------------------
describe('the run-analysis summary supplies what the event stream cannot', () => {
	it('shows the DERIVED mass, labelled as an estimate, with no summary', () => {
		const out = html({ analysis: null });
		// 50000mm3 x 2.7 g/cm3 = 135g, which is volume x the LEVEL's density.
		expect(out).toContain('135');
		expect(out).toContain('Est. mass');
		expect(out).not.toContain('Measured mass');
	});

	it('prefers the MEASURED mass and moves the label with it', () => {
		// The number SolidWorks evaluated for the part the student actually built.
		// It differs from the estimate precisely when the material is wrong, which
		// is the case the derived figure cannot see.
		const out = html({ analysis: { computed_mass: 372.5, mass_unit: 'g', active_ms: null, idle_ms: null } });
		expect(out).toContain('372.5');
		expect(out).toContain('Measured mass');
		expect(out).not.toContain('Est. mass');
		// POSITIVE CONTROL for the pair: the estimate is genuinely gone, not
		// merely relabelled beside the measured value.
		expect(out).not.toContain('>135<');
	});

	it('prefers the add-in\'s own active/idle accounting over the event-gap estimate', () => {
		// The estimate reads gaps over 8s as idle: the 40s feature gap is idle and
		// the rest active, so the panel says roughly 40.0s idle / 3.0s active.
		const estimated = statsOf(html({ analysis: null }));
		expect(estimated).toContain('40.0s');
		expect(estimated).toContain('3.0s');
		expect(estimated).toContain('(est.)');

		// The add-in accrued 12s active / 31s idle at its own tick, with a 4s
		// threshold. Different numbers under the same label, which is the reason
		// the summary is read at all.
		const measured = statsOf(
			html({ analysis: { computed_mass: null, mass_unit: null, active_ms: 12000, idle_ms: 31000 } })
		);
		expect(measured).toContain('12.0s');
		expect(measured).toContain('31.0s');
		expect(measured).not.toContain('(est.)');
		// The estimate is REPLACED, not shown beside the measured pair.
		expect(measured).not.toContain('40.0s');
		expect(measured).not.toContain('3.0s');
	});

	it('ignores a partial summary rather than mixing the two accountings', () => {
		// active_ms with no idle_ms would otherwise render 12s active beside a 0s
		// idle that nobody measured.
		const out = statsOf(
			html({ analysis: { computed_mass: null, mass_unit: null, active_ms: 12000, idle_ms: null } })
		);
		expect(out).toContain('(est.)');
		expect(out).toContain('40.0s');
		expect(out).not.toContain('12.0s');
	});
});

// ---------------------------------------------------------------------------
// 2. The learning curve.
// ---------------------------------------------------------------------------
describe('selfHistory drives the learning curve', () => {
	it('says so when there is no history', () => {
		const out = html({ selfHistory: [] });
		expect(out).toContain('first recorded attempt');
	});

	it('lists prior attempts when there is', () => {
		const out = html({
			selfHistory: [
				{ created_at: '2026-08-20T15:00:00Z', elapsed_ms: 540000, result: 'passed' },
				{ created_at: '2026-08-18T15:00:00Z', elapsed_ms: 720000, result: 'failed' }
			]
		});
		expect(out).not.toContain('first recorded attempt');
		expect(out).toContain('9m 00s');
		expect(out).toContain('12m 00s');
	});
});

// ---------------------------------------------------------------------------
// 3. The class comparison, and the withheld state.
// ---------------------------------------------------------------------------
describe('classStats drives the class comparison', () => {
	it('explains the absence rather than showing an empty list', () => {
		const out = html({ classStats: null });
		expect(out).toContain('No class comparison yet');
		expect(out).toContain('describes a class rather than a person');
	});

	it('renders each median with the number of classmates behind it', () => {
		const out = html({
			classStats: {
				medianElapsedMs: 480000,
				medianFeatures: 5,
				medianStuckMs: 25000,
				peersElapsed: 11,
				peersFeatures: 9,
				peersStuck: 7
			}
		});
		expect(out).not.toContain('No class comparison yet');
		expect(out).toContain('8m 00s'); // 480000ms median
		expect(out).toContain('11 classmates');
		expect(out).toContain('9 classmates');
		expect(out).toContain('7 classmates');
	});

	it('treats an ALL-WITHHELD payload as no comparison, not an empty panel', () => {
		// This is the shape the server returns below the peer floor: an object,
		// with every median null. A truthiness check on the object alone would
		// render a heading over nothing.
		const out = html({
			classStats: {
				medianElapsedMs: null,
				medianFeatures: null,
				medianStuckMs: null,
				peersElapsed: 0,
				peersFeatures: 0,
				peersStuck: 0
			}
		});
		expect(out).toContain('No class comparison yet');
	});

	it('renders the medians that cleared and withholds the ones that did not', () => {
		const out = html({
			classStats: {
				medianElapsedMs: 480000,
				medianFeatures: null,
				medianStuckMs: null,
				peersElapsed: 11,
				peersFeatures: 0,
				peersStuck: 0
			}
		});
		expect(out).toContain('11 classmates');
		expect(out).toContain('8m 00s');
		expect(out).not.toContain('No class comparison yet');
		expect(out).not.toContain('median dwell');
	});
});

// ---------------------------------------------------------------------------
// 4. THE MOUNT. The half that would have caught the original defect.
// ---------------------------------------------------------------------------
describe('the shipping route actually hands the component its props', () => {
	const mount = PAGE.slice(PAGE.indexOf('<PostRunAnalysis'));
	const tag = mount.slice(0, mount.indexOf('/>') + 2);

	it('finds exactly one PostRunAnalysis mount on the route', () => {
		expect(PAGE.split('<PostRunAnalysis').length - 1).toBe(1);
	});

	for (const prop of ['events', 'targets', 'selfHistory', 'classStats', 'analysis']) {
		it(`passes \`${prop}\` at the real mount`, () => {
			expect(tag).toMatch(new RegExp(`(\\{${prop}\\}|${prop}=)`));
		});
	}

	it('loads selfHistory scoped to the CALLER, not just to the challenge', () => {
		// `read own attempts` also returns other people's rows to an admin, so the
		// user filter is what makes this list a learning curve rather than the
		// class's. Without it an admin's own results screen shows everyone's runs.
		expect(LOAD).toContain('gauntlet_speedrun_attempt_history');
		expect(LOAD).toMatch(/\.eq\('user_id', claims\.sub\)/);
	});

	it('asks the database for the class median and never computes one client-side', () => {
		expect(LOAD).toContain('gauntlet_class_run_stats');
		// The floor is the database's. A number here would be a second copy of it,
		// and the client-side one is the copy a client can skip.
		expect(LOAD).not.toMatch(/peers\w*\s*[<>]=?\s*\d/);
	});
});
