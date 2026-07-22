/**
 * GREENLINE track builder: EXPORT SERIALIZATION + VALIDATION REPORT.
 *
 * The core promise here: a track that validates in the tool is provably
 * LOADABLE, not just plausibly shaped. So the pass/fail gates are the REAL
 * code paths the game itself uses — the serialized JSON string is parsed back
 * through `parseTrack` (the exact load-time validator `tracks.ts` runs) and
 * swept through `buildRuntime` (the exact 3D sweep physics and visuals build
 * from). The catch-plane clearance check reads `leftEdge3`/`rightEdge3` off
 * that runtime, so the banked-ribbon authoring rule is verified against the
 * same geometry the game would collide with, never against this tool's own
 * math.
 *
 * The remaining checks are ADVISORY authoring lints from the hand-built
 * tracks' documented lessons (grade, run-off margins, loop closure, corridor
 * self-overlap) — warnings, not load failures.
 */

import { buildRuntime } from '../track-runtime';
import { parseTrack, type TrackData, type TrackGate } from '../track-schema';
import {
	DECK_EDGE_M,
	ELEVATED_EDGE_M,
	FLAT_MARGIN_M,
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
const rPts = (pts: { x: number; z: number }[]) => pts.map((p) => ({ x: r2(p.x), z: r2(p.z) }));
const rGate = (g: TrackGate) => ({
	id: g.id,
	...(g.name ? { name: g.name } : {}),
	x: r2(g.x),
	z: r2(g.z),
	headingDeg: r2(g.headingDeg),
	halfWidth: r2(g.halfWidth)
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
			...(s.banking ? { banking: s.banking.map(r2) } : {})
		},
		startFinish: rGate(t.startFinish),
		checkpoints: t.checkpoints.map(rGate),
		boundaries: t.boundaries.map((b) => ({ id: b.id, closed: b.closed, points: rPts(b.points) })),
		zones: t.zones ?? [],
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

export function validateCompiled(c: CompiledTrack): ValidationReport {
	const checks: Check[] = [];
	if (!c.ok || !c.track) {
		checks.push({ status: 'fail', label: 'Compile', detail: c.error ?? 'no track' });
		return { checks, ok: false, json: '' };
	}
	const json = serializeTrack(c.track);
	const N = c.samples.length;
	const pieceName = (sampleIdx: number) =>
		c.pieceLabels[c.samples[sampleIdx]?.pieceIdx] ?? '?';

	// 1. The real load-time validator, on the exact exported string.
	let parsed: TrackData | null = null;
	try {
		parsed = parseTrack(JSON.parse(json));
		checks.push({
			status: 'pass',
			label: 'parseTrack (real loader)',
			detail: `exported JSON parses: ${parsed.surface.centerline.length} pts, schemaVersion ${parsed.schemaVersion}`
		});
	} catch (e) {
		checks.push({
			status: 'fail',
			label: 'parseTrack (real loader)',
			detail: e instanceof Error ? e.message : String(e)
		});
	}

	// 2. The real runtime sweep, from the parsed export.
	let rt: ReturnType<typeof buildRuntime> | null = null;
	if (parsed) {
		try {
			rt = buildRuntime(parsed);
			checks.push({
				status: 'pass',
				label: 'buildRuntime (real sweep)',
				detail: `${Math.round(c.totalLengthM)} m, hasRelief ${rt.hasRelief}, ${rt.paths.length} path(s)`
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
	// authoring rule's OUTCOME, verified against the geometry the game builds.
	if (rt) {
		let minY = Infinity;
		let minIdx = 0;
		rt.leftEdge3.forEach((p, i) => {
			if (p.y < minY) {
				minY = p.y;
				minIdx = i;
			}
		});
		rt.rightEdge3.forEach((p, i) => {
			if (p.y < minY) {
				minY = p.y;
				minIdx = i;
			}
		});
		checks.push({
			status: minY >= -0.01 ? 'pass' : 'fail',
			label: 'Low edge clears the y=0 catch plane',
			detail: `min ribbon edge y ${minY.toFixed(3)} m (${pieceName(minIdx)})`
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

	// 5. Run-off margin rule beside raised track. Deck-height edges (a fall a
	// car cannot drive back from) must have a wall-tight margin; the
	// shoulder-height transition band tapers and is reported for context.
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
		let at = -1;
		const nPairs = c.closure.closed ? N : N - 1;
		for (let i = 0; i < nPairs; i++) {
			const a = c.samples[i];
			const b = c.samples[(i + 1) % N];
			if (a.cliff || b.cliff) continue;
			const d = Math.hypot(b.x - a.x, b.z - a.z);
			const g = Math.abs(b.elev - a.elev) / Math.max(0.5, d);
			if (g > maxGrade) {
				maxGrade = g;
				at = i;
			}
		}
		checks.push({
			status: maxGrade > GRADE_WARN ? 'warn' : 'pass',
			label: 'Grade (excluding jump drop faces)',
			detail:
				at >= 0
					? `max ${(maxGrade * 100).toFixed(1)}% (${pieceName(at)})${maxGrade > GRADE_WARN ? ` — over ${GRADE_WARN * 100}%` : ''}`
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

	// 8. Corridor self-overlap (a 2D crossing with real elevation difference
	// is a legitimate flyover, so those pass).
	{
		let overlap: { i: number; j: number } | null = null;
		outer: for (let i = 0; i < N; i++) {
			const a = c.samples[i];
			for (let j = i + OVERLAP_INDEX_GAP; j < N; j++) {
				if (c.closure.closed && N - (j - i) < OVERLAP_INDEX_GAP) continue;
				const b = c.samples[j];
				const dx = a.x - b.x;
				const dz = a.z - b.z;
				const lim = (a.width + b.width) * 0.425; // 85% of the half-width sum
				if (
					dx * dx + dz * dz < lim * lim &&
					Math.abs(a.elev - b.elev) < FLYOVER_CLEARANCE_M
				) {
					overlap = { i, j };
					break outer;
				}
			}
		}
		checks.push(
			overlap
				? {
						status: 'warn',
						label: 'Corridor self-overlap',
						detail: `${pieceName(overlap.i)} crosses ${pieceName(overlap.j)} at ~(${c.samples[overlap.i].x.toFixed(0)}, ${c.samples[overlap.i].z.toFixed(0)}) with < ${FLYOVER_CLEARANCE_M} m clearance`
					}
				: {
						status: 'pass',
						label: 'Corridor self-overlap',
						detail: 'no same-level crossings (flyovers with clearance are allowed)'
					}
		);
	}

	// 9. Scope note: the placeholder gates exist only so the export loads.
	checks.push({
		status: 'info',
		label: 'Placeholder checkpoints',
		detail: `${c.track.checkpoints.length} auto-placed gate(s) so parseTrack accepts the export; the gate/zone editor is the next bundle`
	});

	return { checks, ok: !checks.some((k) => k.status === 'fail'), json };
}
