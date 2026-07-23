/**
 * GREENLINE track builder: EXPORT SERIALIZATION + VALIDATION REPORT.
 *
 * The core promise here: a track that validates in the tool is provably
 * LOADABLE and DRIVABLE, not just plausibly shaped. So the pass/fail gates are
 * the REAL code paths the game itself uses — the serialized JSON string is
 * parsed back through `parseTrack` (the exact load-time validator `tracks.ts`
 * runs), swept through `buildRuntime` (the exact 3D sweep physics and visuals
 * build from), probed with the real `surfaceState` (the same query the harness
 * runs every frame to decide on-ribbon / wall violation), and DRIVEN through
 * the real `LapTracker` once per lap route. The catch-plane check reads
 * `leftEdge3`/`rightEdge3` off that runtime, so the banked-ribbon authoring
 * rule is verified against the same geometry the game would collide with,
 * never against this tool's own math.
 *
 * The remaining checks are ADVISORY authoring lints from the hand-built
 * tracks' documented lessons (grade, run-off margins, loop closure, corridor
 * self-overlap) — warnings, not load failures.
 */

import { buildRuntime, LapTracker, surfaceState, type TrackRuntime } from '../track-runtime';
import { parseTrack, type TrackData, type TrackGate, type TrackVec2 } from '../track-schema';
import {
	DECK_EDGE_M,
	ELEVATED_EDGE_M,
	FLAT_MARGIN_M,
	MIN_BRANCH_SEPARATION_M,
	probeBranchGap,
	probeSurface,
	type CompiledTrack
} from './pieces';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface Check {
	status: CheckStatus;
	label: string;
	detail: string;
}

export interface ValidationReport {
	checks: Check[];
	/** True when nothing FAILED (warnings allowed). */
	ok: boolean;
	/** The exact exported JSON the parse check ran against. */
	json: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const rPts = (pts: TrackVec2[]) => pts.map((p) => ({ x: r2(p.x), z: r2(p.z) }));
const rGate = (g: TrackGate) => ({
	id: g.id,
	...(g.name ? { name: g.name } : {}),
	x: r2(g.x),
	z: r2(g.z),
	headingDeg: r2(g.headingDeg),
	halfWidth: r2(g.halfWidth),
	...(g.group ? { group: g.group } : {})
});

/**
 * The exported file contents: stable key order, numbers rounded to 2 dp (the
 * committed track files' convention), tab indentation.
 */
export function serializeTrack(t: TrackData): string {
	const s = t.surface;
	const out = {
		schemaVersion: t.schemaVersion,
		id: t.id,
		name: t.name,
		description: t.description,
		units: t.units,
		spawn: { x: r2(t.spawn.x), z: r2(t.spawn.z), headingDeg: r2(t.spawn.headingDeg) },
		surface: {
			type: 'ribbon',
			width: r2(s.width),
			...(s.widths ? { widths: s.widths.map(r2) } : {}),
			closed: s.closed,
			centerline: rPts(s.centerline),
			...(s.elevations ? { elevations: s.elevations.map(r2) } : {}),
			...(s.banking ? { banking: s.banking.map(r2) } : {}),
			...(s.branches
				? {
						branches: s.branches.map((b) => ({
							id: b.id,
							...(b.name ? { name: b.name } : {}),
							width: r2(b.width),
							...(b.widths ? { widths: b.widths.map(r2) } : {}),
							centerline: rPts(b.centerline),
							...(b.elevations ? { elevations: b.elevations.map(r2) } : {}),
							...(b.banking ? { banking: b.banking.map(r2) } : {}),
							joinStart: b.joinStart,
							joinEnd: b.joinEnd
						}))
					}
				: {})
		},
		startFinish: rGate(t.startFinish),
		checkpoints: t.checkpoints.map(rGate),
		boundaries: t.boundaries.map((b) => ({ id: b.id, closed: b.closed, points: rPts(b.points) })),
		zones: (t.zones ?? []).map((z) => ({ ...z, x: r2(z.x), z: r2(z.z), radius: r2(z.radius) })),
		props: t.props ?? []
	};
	return JSON.stringify(out, null, '\t') + '\n';
}

/** Max grade a non-jump span may carry before it draws a warning. */
const GRADE_WARN = 0.2;
/** Deck-span run-off margin ceiling (Terminal Nine used ~1.6-2 m on its deck). */
const DECK_MARGIN_MAX = 3.05;
/** Non-adjacent samples closer than this index gap never count as overlap. */
const OVERLAP_INDEX_GAP = 8;
/** Crossings with at least this much elevation difference are flyovers. */
const FLYOVER_CLEARANCE_M = 3.5;

/**
 * Drive each lap ROUTE through the real `LapTracker`. `buildRuntime` splices
 * one closed route per branch combination (`routes[0]` is the pure main line),
 * which is exactly what the AI follows, so driving them is the honest test
 * that every way around the circuit is actually lappable — including the
 * shortcut, whose gates must satisfy the same sequence steps through their
 * `group` alternatives.
 */
function simulateRoutes(
	rt: TrackRuntime,
	spawn: { x: number; z: number }
): { route: number; laps: number; rejected: number; rollUp: number; sequence: string }[] {
	return rt.routes.map((route, ri) => {
		const n = route.length;
		const tracker = new LapTracker();
		let si = 0;
		let bestD = Infinity;
		route.forEach((p, i) => {
			const d = (p.x - spawn.x) ** 2 + (p.z - spawn.z) ** 2;
			if (d < bestD) {
				bestD = d;
				si = i;
			}
		});
		const events: string[] = [];
		// A gate crossed between the SPAWN and the start/finish line is rejected
		// `not-started`, which is correct and expected — a car rolls up to the
		// line past whatever gates lie in between. Only rejections once the lap
		// is actually being timed indicate a broken sequence, so the two are
		// counted separately.
		let rollUp = 0;
		let rejected = 0;
		let prev = { x: route[si].x, z: route[si].z };
		let t = 0;
		for (let k = 1; k <= n * 2 + 6; k++) {
			const cur = route[(si + k) % n];
			for (const e of tracker.update(rt, prev, cur, t, t + 50)) {
				if (e.type === 'rejected') {
					if (e.reason === 'not-started') rollUp++;
					else rejected++;
					events.push(`rejected(${e.reason})`);
				} else events.push(e.type + ('step' in e ? `#${e.step}` : ''));
			}
			prev = { x: cur.x, z: cur.z };
			t += 50;
		}
		return { route: ri, laps: tracker.lapsCompleted, rejected, rollUp, sequence: events.join(', ') };
	});
}

export function validateCompiled(c: CompiledTrack): ValidationReport {
	const checks: Check[] = [];
	if (!c.ok || !c.track) {
		checks.push({ status: 'fail', label: 'Compile', detail: c.error ?? 'no track' });
		return { checks, ok: false, json: '' };
	}
	const json = serializeTrack(c.track);
	const pieceName = (laneIdx: number, sampleIdx: number) =>
		c.pieceLabels[c.lanes[laneIdx]?.samples[sampleIdx]?.pieceIdx] ?? '?';

	// 1. The real load-time validator, on the exact exported string.
	let parsed: TrackData | null = null;
	try {
		parsed = parseTrack(JSON.parse(json));
		checks.push({
			status: 'pass',
			label: 'parseTrack (real loader)',
			detail: `exported JSON parses: ${parsed.surface.centerline.length} main pts, ${parsed.surface.branches?.length ?? 0} branch(es), ${parsed.checkpoints.length} gate(s), ${parsed.zones?.length ?? 0} zone circle(s)`
		});
	} catch (e) {
		checks.push({
			status: 'fail',
			label: 'parseTrack (real loader)',
			detail: e instanceof Error ? e.message : String(e)
		});
	}

	// 2. The real runtime sweep, from the parsed export.
	let rt: TrackRuntime | null = null;
	if (parsed) {
		try {
			rt = buildRuntime(parsed);
			checks.push({
				status: 'pass',
				label: 'buildRuntime (real sweep)',
				detail: `${Math.round(c.totalLengthM)} m main, hasRelief ${rt.hasRelief}, ${rt.paths.length} path(s), ${rt.routes.length} lap route(s), ${rt.stepCount} sequence step(s)`
			});
		} catch (e) {
			checks.push({
				status: 'fail',
				label: 'buildRuntime (real sweep)',
				detail: e instanceof Error ? e.message : String(e)
			});
		}
	}

	// 3. Catch-plane clearance, read off the runtime's own 3D edges — the
	// authoring rule's OUTCOME, on EVERY path (branches bank too).
	if (rt) {
		let minY = Infinity;
		let worst = { path: 0, idx: 0 };
		rt.paths.forEach((p, pi) => {
			const scan = (arr: { y: number }[]) =>
				arr.forEach((q, i) => {
					if (q.y < minY) {
						minY = q.y;
						worst = { path: pi, idx: i };
					}
				});
			scan(p.leftEdge3);
			scan(p.rightEdge3);
		});
		checks.push({
			status: minY >= -0.01 ? 'pass' : 'fail',
			label: 'Low edge clears the y=0 catch plane',
			detail: `min ribbon edge y ${minY.toFixed(3)} m across ${rt.paths.length} path(s) (${pieceName(worst.path, worst.idx)})`
		});
	} else {
		checks.push({
			status: 'fail',
			label: 'Low edge clears the y=0 catch plane',
			detail: 'no runtime to read edges from'
		});
	}

	// 4. What the compiler's auto-raise actually did (info, not a gate).
	checks.push({
		status: 'info',
		label: 'Banked centerline auto-raise (hw · sin bank)',
		detail:
			c.maxRaise.value > 0.01
				? `raised up to ${c.maxRaise.value.toFixed(2)} m (${c.pieceLabels[c.maxRaise.pieceIdx] ?? '?'}) so the low edge meets the plane`
				: 'no raise needed (no ground-level banking)'
	});

	// 5. Run-off margin rule beside raised track.
	{
		const m = c.marginStats;
		const transitionNote =
			m.transitionCount > 0
				? `; transition band (${ELEVATED_EDGE_M}-${DECK_EDGE_M} m): ${m.minTransition?.toFixed(1)}-${m.maxTransition?.toFixed(1)} m across ${m.transitionCount} pts`
				: '';
		if (m.deckCount > 0) {
			const worst = m.maxDeck ?? 0;
			checks.push({
				status: worst <= DECK_MARGIN_MAX ? 'pass' : 'warn',
				label: 'Run-off margin shrinks where the track is raised',
				detail: `deck spans (edge > ${DECK_EDGE_M} m): margin ${m.minDeck?.toFixed(1)}-${worst.toFixed(1)} m across ${m.deckCount} pts (flat ${FLAT_MARGIN_M} m)${transitionNote}`
			});
		} else {
			checks.push({
				status: 'info',
				label: 'Run-off margin shrinks where the track is raised',
				detail: m.transitionCount
					? `no deck-height spans${transitionNote} (flat ${FLAT_MARGIN_M} m)`
					: `no raised spans; flat ${FLAT_MARGIN_M} m margin throughout`
			});
		}
	}

	// 6. Grade lint (jump drop faces are exempt — steep is their whole point).
	{
		let maxGrade = 0;
		let at = { lane: 0, idx: -1 };
		c.lanes.forEach((L, li) => {
			const n = L.samples.length;
			const nPairs = L.closed ? n : n - 1;
			for (let i = 0; i < nPairs; i++) {
				const a = L.samples[i];
				const b = L.samples[(i + 1) % n];
				if (a.cliff || b.cliff) continue;
				const d = Math.hypot(b.x - a.x, b.z - a.z);
				const g = Math.abs(b.elev - a.elev) / Math.max(0.5, d);
				if (g > maxGrade) {
					maxGrade = g;
					at = { lane: li, idx: i };
				}
			}
		});
		checks.push({
			status: maxGrade > GRADE_WARN ? 'warn' : 'pass',
			label: 'Grade (excluding jump drop faces)',
			detail:
				at.idx >= 0
					? `max ${(maxGrade * 100).toFixed(1)}% (${pieceName(at.lane, at.idx)})${maxGrade > GRADE_WARN ? ` — over ${GRADE_WARN * 100}%` : ''}`
					: 'flat'
		});
	}

	// 7. Loop closure.
	checks.push(
		c.closure.closed
			? {
					status: 'pass',
					label: 'Loop closure',
					detail: c.closure.snapped
						? `closed (snapped a ${c.closure.gapM.toFixed(2)} m gap)`
						: 'closed exactly'
				}
			: {
					status: 'warn',
					label: 'Loop closure',
					detail: `open: exit is ${c.closure.gapM.toFixed(1)} m / ${c.closure.headingGapDeg.toFixed(0)}° / ${c.closure.elevGapM.toFixed(1)} m elev from the start — add CLOSE LOOP (routes stay open until then)`
				}
	);

	// 8. Corridor self-overlap, WITHIN each lane. A branch running alongside
	// the main line is the whole point of a shortcut, so cross-lane proximity
	// is expected and is checked by the island probe instead.
	{
		let overlap: { lane: number; i: number; j: number } | null = null;
		outer: for (let li = 0; li < c.lanes.length; li++) {
			const L = c.lanes[li];
			const n = L.samples.length;
			for (let i = 0; i < n; i++) {
				const a = L.samples[i];
				for (let j = i + OVERLAP_INDEX_GAP; j < n; j++) {
					if (L.closed && n - (j - i) < OVERLAP_INDEX_GAP) continue;
					const b = L.samples[j];
					const dx = a.x - b.x;
					const dz = a.z - b.z;
					const lim = (a.width + b.width) * 0.425;
					if (dx * dx + dz * dz < lim * lim && Math.abs(a.elev - b.elev) < FLYOVER_CLEARANCE_M) {
						overlap = { lane: li, i, j };
						break outer;
					}
				}
			}
		}
		checks.push(
			overlap
				? {
						status: 'warn',
						label: 'Corridor self-overlap',
						detail: `${pieceName(overlap.lane, overlap.i)} crosses ${pieceName(overlap.lane, overlap.j)} with < ${FLYOVER_CLEARANCE_M} m clearance`
					}
				: {
						status: 'pass',
						label: 'Corridor self-overlap',
						detail: 'no same-level crossings within a lane (flyovers with clearance are allowed)'
					}
		);
	}

	// 9. Branch join geometry: the schema shares branch endpoints EXACTLY with
	// the main centerline, which is what makes a spliced lap route continuous.
	if (c.branchStats.length) {
		const s = c.track.surface;
		let worstJoin = 0;
		for (const b of s.branches ?? []) {
			const a0 = s.centerline[b.joinStart];
			const a1 = s.centerline[b.joinEnd];
			const b0 = b.centerline[0];
			const b1 = b.centerline[b.centerline.length - 1];
			worstJoin = Math.max(
				worstJoin,
				Math.hypot(a0.x - b0.x, a0.z - b0.z),
				Math.hypot(a1.x - b1.x, a1.z - b1.z)
			);
		}
		const lines = c.branchStats.map(
			(b) =>
				`${b.id}: ${Math.round(b.branchLengthM)} m vs ${Math.round(b.bypassedMainM)} m bypassed (${b.branchLengthM < b.bypassedMainM ? 'shortcut' : 'longer'}), join ${b.joinStart}->${b.joinEnd}`
		);
		checks.push({
			status: worstJoin < 0.02 ? 'pass' : 'fail',
			label: 'Branch join geometry',
			detail: `${lines.join('; ')}; endpoint match ${worstJoin.toFixed(3)} m`
		});
		// A pit branch must be named so the runtime recognises it: `buildRuntime`
		// fills `pitRoutes` from the branch id prefix alone, and the AI only
		// diverts onto a route in that list.
		if (rt) {
			const pitLanes = c.branchStats.filter((b) => c.lanes[b.lane].id.startsWith('pit'));
			const authoredPit = c.zones.some((z) => z.spec.kind === 'pit' && z.lane > 0);
			if (authoredPit || pitLanes.length)
				checks.push({
					status: rt.pitRoutes.length >= pitLanes.length ? 'pass' : 'warn',
					label: 'Pit lane recognised by the runtime',
					detail: `${pitLanes.map((b) => c.lanes[b.lane].id).join(', ') || 'none'} -> runtime pitRoutes [${rt.pitRoutes.join(', ')}], so the AI's pit-stop logic can divert onto it`
				});
		}
		// Separation + island: without an island a driver just cuts the lens.
		const noIsland = c.branchStats.filter((b) => !b.islandBuilt);
		checks.push({
			status: noIsland.length ? 'warn' : 'pass',
			label: 'Branch separation + boundary island',
			detail: noIsland.length
				? `${noIsland.map((b) => b.id).join(', ')} never opens a ${MIN_BRANCH_SEPARATION_M} m gap from the main line (widest ${noIsland[0].maxSeparationM.toFixed(1)} m), so no island was built — widen the split angle or lengthen the branch`
				: c.branchStats
						.map((b) => `${b.id}: opens to ${b.maxSeparationM.toFixed(1)} m clear, island built`)
						.join('; ')
		});
	}

	// 10. Checkpoints: ordering, groups, and the rule Terminal Nine learned the
	// hard way — an UNGROUPED checkpoint inside a stretch a branch bypasses can
	// never be crossed by a shortcut car, so no shortcut lap can ever complete.
	{
		const res = c.gates.resolved;
		if (!res.length) {
			checks.push({
				status: 'info',
				label: 'Checkpoints',
				detail: 'none authored; one auto placeholder emitted so parseTrack accepts the export'
			});
		} else {
			const groups = res.filter((r) => r.group).length;
			checks.push({
				status: 'pass',
				label: 'Checkpoints',
				detail: `${res.length} gate(s) over ${c.gates.stepCount} sequence step(s), ${groups} in alternative group(s)`
			});
		}
		const offenders: string[] = [];
		for (const b of c.branchStats) {
			for (const r of res) {
				if (r.lane !== 0 || r.group !== undefined) continue;
				if (r.index > b.joinStart && r.index < b.joinEnd)
					offenders.push(`${r.gate.name ?? r.specId} (inside ${b.id}'s bypass)`);
			}
		}
		if (c.branchStats.length)
			checks.push({
				status: offenders.length ? 'fail' : 'pass',
				label: 'No ungrouped checkpoint inside a bypassed stretch',
				detail: offenders.length
					? `${offenders.join(', ')} — a car taking the branch can never cross it, so that route's lap never completes. Give it a group with a gate on the branch.`
					: 'every checkpoint inside a bypassed stretch has a branch alternative'
			});
	}

	// 11. Zones: what the extents actually emitted, and that they sit on track.
	if (c.zones.length) {
		const parts = c.zones.map(
			(z) =>
				`${z.spec.kind} ${z.spec.id}: ${z.circles.length} circle(s) r${z.circles[0]?.radius ?? 0} on ${c.lanes[z.lane]?.id ?? '?'}`
		);
		checks.push({ status: 'info', label: 'Zone extents', detail: parts.join('; ') });
		// Every circle centre must be on the drivable ribbon, or the trigger is
		// unreachable. Uses the runtime's own on-ribbon test.
		if (rt) {
			const probe = probeSurface(c);
			void probe;
			let off = 0;
			const offIds: string[] = [];
			for (const z of c.zones)
				for (const circ of z.circles) {
					const r = rtOnRibbon(rt, circ.x, circ.z);
					if (!r) {
						off++;
						offIds.push(circ.id);
					}
				}
			checks.push({
				status: off === 0 ? 'pass' : 'warn',
				label: 'Zone triggers sit on the ribbon',
				detail:
					off === 0
						? `all ${c.zones.reduce((n, z) => n + z.circles.length, 0)} trigger circle(s) are on drivable surface`
						: `${off} circle(s) off the ribbon: ${offIds.slice(0, 4).join(', ')}`
			});
		}
		const pitChains = c.zones.filter((z) => z.spec.kind === 'pit' && z.circles.length > 1);
		if (pitChains.length)
			checks.push({
				status: 'warn',
				label: 'Pit box is a single trigger',
				detail: 'a pit extent emitted more than one circle; the harness would multiply the heal rate'
			});
	} else {
		checks.push({ status: 'info', label: 'Zone extents', detail: 'none authored' });
	}

	// 12. The generated boundaries, checked by ASKING the runtime rather than
	// trusting the polygon construction: every lane centerline must read
	// on-ribbon with no wall violation.
	if (rt) {
		const probes = probeSurface(c);
		const bad = probes.filter((p) => p.violations > 0 || p.offRibbon > 0);
		checks.push({
			status: bad.length ? 'fail' : 'pass',
			label: 'Every lane drives clean (real surfaceState)',
			detail: bad.length
				? bad
						.map(
							(p) =>
								`${p.laneId}: ${p.violations} wall violation(s) (worst ${p.worstViolationM.toFixed(1)} m), ${p.offRibbon} off-ribbon of ${p.samples}`
						)
						.join('; ')
				: probes.map((p) => `${p.laneId}: ${p.samples} pts clean`).join('; ')
		});
		// And the lens between branch and main must be BLOCKED, or the split is
		// decorative and a driver just cuts across it.
		const gaps = probeBranchGap(c);
		if (gaps.length) {
			const weak = gaps.filter((g) => g.blocked < g.probes * 0.9);
			checks.push({
				status: weak.length ? 'warn' : 'pass',
				label: 'Gap between branch and main is blocked',
				detail: gaps
					.map((g) => `${g.laneId}: ${g.blocked}/${g.probes} probes rejected`)
					.join('; ')
			});
		}
	}

	// 13. THE end-to-end test: drive every lap route through the real
	// LapTracker. Both the main line and each shortcut must complete a lap with
	// its checkpoints in order and no spurious rejections.
	if (rt && c.track) {
		const sims = simulateRoutes(rt, c.track.spawn);
		const failed = sims.filter((s) => s.laps < 1);
		const noisy = sims.filter((s) => s.rejected > 0);
		checks.push({
			status: failed.length ? 'fail' : noisy.length ? 'warn' : 'pass',
			label: 'Every lap route completes (real LapTracker)',
			detail: sims
				.map(
					(s) =>
						`route ${s.route}${s.route === 0 ? ' (main)' : ''}: ${s.laps} lap(s), ${s.rejected} spurious rejection(s)${s.rollUp ? `, ${s.rollUp} pre-start roll-up` : ''}`
				)
				.join('; ')
		});
		if (failed.length)
			checks.push({
				status: 'info',
				label: `Route ${failed[0].route} event trace`,
				detail: failed[0].sequence || '(no gate events at all)'
			});
	}

	return { checks, ok: !checks.some((k) => k.status === 'fail'), json };
}

/* ------------------------------------------------------------------------ */
/* Publish validation (community tracks)                                     */
/* ------------------------------------------------------------------------ */

/** Hard ceiling on total centerline samples across every path: a real track is
 * a few hundred points, so this only stops a hostile payload from making the
 * serverless publish endpoint sweep megabytes of geometry. */
const PUBLISH_MAX_POINTS = 20000;

export interface PublishValidation {
	ok: boolean;
	/** Human-readable reasons, empty when ok. */
	errors: string[];
	/** The validated TrackData (parseTrack output) when ok, else null. */
	track: TrackData | null;
}

/**
 * The authoritative gate a track must pass before it may be PUBLISHED as a
 * community track. Runs server-side in the publish endpoint AND in dev
 * harnesses, on the raw submitted JSON — deliberately the SAME real code paths
 * `validateCompiled` gates on, applied to raw TrackData (no builder document
 * needed): `parseTrack` (the exact load-time validator), `buildRuntime` (the
 * exact 3D sweep), the catch-plane clearance read off the runtime's own edges,
 * the branch join endpoint match, a real `surfaceState` drive down every
 * path's centerline, and a real `LapTracker` drive of every lap route. The
 * compiled-document lints (grade, run-off margins, self-overlap) are advisory
 * warnings in the builder and are not publish gates.
 *
 * A track that fails ANY of these is rejected outright — never stored with a
 * warning — because every other player's game client will load what publish
 * accepts.
 */
export function validatePublishTrack(raw: unknown): PublishValidation {
	const errors: string[] = [];

	// 1. The real load-time validator.
	let track: TrackData | null = null;
	try {
		track = parseTrack(typeof raw === 'string' ? JSON.parse(raw) : raw);
	} catch (e) {
		errors.push(`parseTrack: ${e instanceof Error ? e.message : String(e)}`);
		return { ok: false, errors, track: null };
	}

	// 2. The real runtime sweep.
	let rt: TrackRuntime | null = null;
	try {
		rt = buildRuntime(track);
	} catch (e) {
		errors.push(`buildRuntime: ${e instanceof Error ? e.message : String(e)}`);
		return { ok: false, errors, track: null };
	}

	const totalPts = rt.paths.reduce((n, p) => n + p.center.length, 0);
	if (totalPts > PUBLISH_MAX_POINTS) {
		errors.push(`track too large: ${totalPts} centerline samples (max ${PUBLISH_MAX_POINTS})`);
		return { ok: false, errors, track: null };
	}

	// 3. Catch-plane clearance, off the runtime's own 3D edges (the banked
	// authoring rule's OUTCOME — same threshold as the builder's check).
	let minY = Infinity;
	for (const p of rt.paths) {
		for (const q of p.leftEdge3) if (q.y < minY) minY = q.y;
		for (const q of p.rightEdge3) if (q.y < minY) minY = q.y;
	}
	if (minY < -0.01)
		errors.push(`ribbon edge dips below the y=0 catch plane (min edge y ${minY.toFixed(3)} m)`);

	// 4. Branch join geometry: endpoints must sit ON the main centerline.
	const s = track.surface;
	for (const b of s.branches ?? []) {
		const a0 = s.centerline[b.joinStart];
		const a1 = s.centerline[b.joinEnd];
		const b0 = b.centerline[0];
		const b1 = b.centerline[b.centerline.length - 1];
		const worst = Math.max(
			Math.hypot(a0.x - b0.x, a0.z - b0.z),
			Math.hypot(a1.x - b1.x, a1.z - b1.z)
		);
		if (worst >= 0.02)
			errors.push(`branch ${b.id}: join endpoints miss the main centerline by ${worst.toFixed(3)} m`);
	}

	// 5. Every path's centerline drives clean through the real surfaceState:
	// on-ribbon the whole way, zero wall violations.
	rt.paths.forEach((p, pi) => {
		let warmIdx = 0;
		let warmPath = pi;
		let offRibbon = 0;
		let violations = 0;
		for (const pt of p.center) {
			const r = surfaceState(rt, pt.x, pt.z, warmIdx, warmPath);
			warmIdx = r.warmIndex;
			warmPath = r.path;
			if (!r.state.onRibbon) offRibbon++;
			if (r.state.violation) violations++;
		}
		if (offRibbon || violations)
			errors.push(
				`path ${pi} centerline does not drive clean: ${violations} wall violation(s), ${offRibbon} off-ribbon of ${p.center.length}`
			);
	});

	// 6. Every lap route completes through the real LapTracker.
	for (const sim of simulateRoutes(rt, track.spawn)) {
		if (sim.laps < 1)
			errors.push(
				`lap route ${sim.route} never completes a lap (${sim.rejected} rejection(s)) — ${sim.sequence || 'no gate events'}`
			);
	}

	return errors.length ? { ok: false, errors, track: null } : { ok: true, errors: [], track };
}

/** On-ribbon test against the runtime, for zone placement. */
function rtOnRibbon(rt: TrackRuntime, x: number, z: number): boolean {
	// Cheap direct scan across paths: zone counts are small and this runs
	// debounced, so the warm-index fast path is not worth the bookkeeping.
	for (const p of rt.paths) {
		for (let i = 0; i < p.center.length; i++) {
			const dx = p.center[i].x - x;
			const dz = p.center[i].z - z;
			if (dx * dx + dz * dz <= p.halfWidths[i] * p.halfWidths[i]) return true;
		}
	}
	return false;
}
