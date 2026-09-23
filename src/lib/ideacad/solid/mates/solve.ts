/**
 * THE ASSEMBLY SOLVER, WITH NO KERNEL IN IT. It takes every body's centre and
 * every mate's two entity frames as they stand BEFORE any mate has moved
 * anything, and answers with one rigid transform per body that moves. The
 * kernel is touched exactly twice by the caller (`features/mate.ts`): once to
 * read the frames, once to apply the transforms. Everything in between is
 * pure arithmetic, which is what makes it assertable without a WASM module.
 *
 * MATES ARE SOLVED ONE AT A TIME, IN TREE ORDER, AND EACH ONE MOVES ONE BODY.
 * Which body is `chooseMover`: never a fixed one; the one no earlier mate has
 * placed when there is such a one; when both were placed already, the one
 * placed later; and when no body anywhere is fixed and neither has been
 * placed, the FIRST body the mate names stays and the second moves to it. A
 * body an earlier mate placed moves only within the freedom those mates left
 * it: the earlier mates on that body are solved AGAIN together with the new
 * one, so a second coincident mate slides the part along the first face
 * instead of tearing it off. That is a damped Gauss-Newton over the six twist
 * parameters (`rigid.ts`), with the Jacobian taken by central differences of
 * the residuals in `constraints.ts`.
 *
 * ORIENTATION IS THE ONE PLACE A LINEAR STEP CANNOT START. Turning a face to
 * oppose another when it currently points the same way is a 180-degree move,
 * and every smooth residual has a zero gradient there. So before the iteration
 * a mate that asks for a direction is given a KICK: a finite rotation about
 * the free axis the earlier mates leave (or the shortest rotation when nothing
 * holds the body yet), through the point on that axis, and the iteration then
 * only polishes. A kick about a held axis would break an earlier mate, which
 * is why the axis comes from the null space and not from the geometry alone.
 *
 * OVER-CONSTRAINT IS REPORTED BY NAME AND MOVES NOTHING. Three cases, three
 * sentences: the body has no freedom left (`already holds it in place`); the
 * mate cannot be satisfied together with the earlier ones (`conflicts with`,
 * naming exactly the earlier mates whose removal would free it); and the mate
 * holds already without adding a constraint (`adds nothing`). In every case
 * the body is put back where the accepted mates left it.
 *
 * AFTER THE PASS, EVERY ACCEPTED MATE IS CHECKED AGAIN. A later mate that moved
 * a body an earlier mate had placed against can disturb the earlier one; the
 * earlier one is re-solved, and if it cannot be held it is reported with the
 * later mate's name rather than left silently broken.
 */
import type { EntityRef, MateKind, ModelProjection, Vec3 } from '../types';
import { add, cross, dot, scale, sub, unit } from '../math';
import { boundsCenter, frameDirection, frameFromProjection, frameOrigin, transformFrame, type EntityFrame } from './frames';
import { orientationSign, perpendicular, residual, residualReport, residualUnit, type Sign } from './constraints';
import { IDENTITY, applyMatrix, isIdentity, multiply, rotationAboutLine, twistMatrix, type Matrix } from './rigid';
import { dampedStep, norm, nullSpace, rowRank } from './linalg';
import { freeFreedom, freedomOf, type Freedom } from './freedom';

export interface AssemblyBody { id: string; name: string; fixed?: boolean; center: Vec3 }
export type MateSide = { body: string | null; frame: EntityFrame } | { error: string };
export interface AssemblyMate { feature: string; name: string; kind: MateKind; value?: number; flip?: boolean; a: MateSide; b: MateSide }
export interface AssemblyInput { bodies: AssemblyBody[]; mates: AssemblyMate[] }
export interface AssemblyResult {
	/** One row-major 4x4 per body that moved, in world coordinates. */
	transforms: Map<string, Matrix>;
	moved: string[];
	errors: { feature: string; message: string }[];
	/** How far off each mate is after the solve: inches or degrees by `units`. */
	residuals: Map<string, number>;
	units: Map<string, 'in' | 'deg'>;
	dof: Map<string, number>;
	freedom: Map<string, Freedom>;
	/** Solver time per mate, milliseconds. */
	ms: Map<string, number>;
}
/** A mate holds when every residual component is inside this, in inches or in unit-vector components. */
export const MATE_TOLERANCE = 1e-9;
const RANK_TOLERANCE = 1e-6;
const STEP = 1e-6;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type Side = { body: string | null; frame: EntityFrame };
interface Constraint { mate: AssemblyMate; a: Side; b: Side; sign: Sign; mover: string | null; index: number }
interface Placement { placedAt: Map<string, number>; ground: Set<string> }

/**
 * THE MOVER RULE, stated once for the solver and for the panel's reading of the
 * projection. `a`/`b` are body ids (null for reference geometry).
 */
export function chooseMover(a: string | null, b: string | null, index: number, fixed: ReadonlySet<string>, placement: Placement): { mover: string | null; anchored?: string } {
	const movable = [a, b].filter((id): id is string => !!id && !fixed.has(id));
	if (!movable.length) return { mover: null };
	if (movable.length === 1) return { mover: movable[0] };
	const [first, second] = movable;
	const placedFirst = placement.placedAt.has(first), placedSecond = placement.placedAt.has(second);
	if (!placedFirst && !placedSecond) return { mover: second, anchored: first };
	if (placedFirst !== placedSecond) return { mover: placedFirst ? second : first };
	/* Both placed: the one placed later moves, and an anchor never moves before the body placed against it. */
	if (placement.ground.has(first) !== placement.ground.has(second)) return { mover: placement.ground.has(first) ? second : first };
	return { mover: placement.placedAt.get(second)! >= placement.placedAt.get(first)! ? second : first };
}
const list = (names: readonly string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const maxAbs = (r: readonly number[]) => r.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

class Solver {
	readonly poses = new Map<string, Matrix>();
	readonly bodies: Map<string, AssemblyBody>;
	constructor(bodies: AssemblyBody[]) { this.bodies = new Map(bodies.map((b) => [b.id, b])); }
	pose(id: string): Matrix { return this.poses.get(id) ?? [...IDENTITY]; }
	world(side: Side): EntityFrame { return side.body ? transformFrame(side.frame, this.pose(side.body)) : side.frame; }
	center(id: string): Vec3 { return applyMatrix(this.pose(id), this.bodies.get(id)?.center ?? [0, 0, 0]); }
	evaluate(c: Constraint): number[] { return residual(c.mate.kind, this.world(c.a), this.world(c.b), c.mate.value, c.sign); }
	report(c: Constraint): number { return residualReport(c.mate.kind, this.world(c.a), this.world(c.b), c.mate.value, c.sign); }
	/** Central differences of the residual over the mover's six twist parameters about its centre. */
	jacobian(c: Constraint, mover: string): number[][] {
		if (c.a.body !== mover && c.b.body !== mover) return this.evaluate(c).map(() => new Array<number>(6).fill(0));
		const pose = this.pose(mover), center = this.center(mover), rows: number[][] = [];
		for (let i = 0; i < 6; i++) {
			const omega: Vec3 = [i === 0 ? STEP : 0, i === 1 ? STEP : 0, i === 2 ? STEP : 0], v: Vec3 = [i === 3 ? STEP : 0, i === 4 ? STEP : 0, i === 5 ? STEP : 0];
			this.poses.set(mover, multiply(twistMatrix(center, omega, v), pose)); const plus = this.evaluate(c);
			this.poses.set(mover, multiply(twistMatrix(center, scale(omega, -1), scale(v, -1)), pose)); const minus = this.evaluate(c);
			plus.forEach((p, j) => { (rows[j] ??= new Array<number>(6).fill(0))[i] = (p - minus[j]) / (2 * STEP); });
		}
		this.poses.set(mover, pose);
		return rows;
	}
	rows(constraints: readonly Constraint[], mover: string): number[][] { return constraints.flatMap((c) => this.jacobian(c, mover)); }
	/** Damped Gauss-Newton on every constraint over the mover's pose. Returns the worst residual component left. */
	refine(constraints: readonly Constraint[], mover: string): number {
		/* Undamped first: a step the linearization gets exactly right (every translation) lands in one move with no
		   rotational residue; damping comes in only after a step that made things worse, and backs off after a good one. */
		let lambda = 0;
		for (let iteration = 0; iteration < 80; iteration++) {
			const r = constraints.flatMap((c) => this.evaluate(c));
			if (maxAbs(r) < MATE_TOLERANCE * 1e-3) break;
			const J = this.rows(constraints, mover), pose = this.pose(mover), center = this.center(mover), before = norm(r);
			let improved = false;
			for (let attempt = 0; attempt < 8 && !improved; attempt++) {
				let step: number[];
				try { step = dampedStep(J, r, lambda); } catch { break; }
				this.poses.set(mover, multiply(twistMatrix(center, [step[0], step[1], step[2]], [step[3], step[4], step[5]]), pose));
				if (norm(constraints.flatMap((c) => this.evaluate(c))) < before) { improved = true; lambda = lambda < 1e-9 ? 0 : lambda / 3; }
				else { this.poses.set(mover, pose); lambda = lambda ? lambda * 10 : 1e-4; }
			}
			if (!improved) break;
		}
		return maxAbs(constraints.flatMap((c) => this.evaluate(c)));
	}
	/** The direction the mover's entity must take for this mate, if the mate asks for one. */
	target(c: Constraint, mover: string): { current: Vec3; target: Vec3; anchor: Vec3 } | null {
		const moverIsA = c.a.body === mover, mine = this.world(moverIsA ? c.a : c.b), other = this.world(moverIsA ? c.b : c.a);
		const current = frameDirection(mine), reference = frameDirection(other);
		if (!current || !reference) return null;
		const s = c.sign, kind = c.mate.kind, same = mine.kind === other.kind;
		const flat = (d: Vec3, against: Vec3): Vec3 => { const p = perpendicular(d, against); return norm(p) > 1e-9 ? unit(p) : unit(perpendicular(Math.abs(against[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], against)); };
		let target: Vec3;
		if (kind === 'angle') {
			const radians = ((c.mate.value ?? 0) * Math.PI) / 180;
			const from = moverIsA ? scale(reference, s) : reference, signed = moverIsA ? current : scale(current, s);
			const w = flat(signed, from), aimed: Vec3 = [from[0] * Math.cos(radians) + w[0] * Math.sin(radians), from[1] * Math.cos(radians) + w[1] * Math.sin(radians), from[2] * Math.cos(radians) + w[2] * Math.sin(radians)];
			target = moverIsA ? aimed : scale(aimed, s);
		} else if (kind === 'perpendicular') target = same ? flat(current, reference) : scale(reference, s);
		else if (kind === 'parallel' || kind === 'coincident' || kind === 'distance' || kind === 'concentric') target = same ? scale(reference, s) : flat(current, reference);
		else return null;
		return { current, target, anchor: frameOrigin(mine) };
	}
	/** A finite rotation that brings the mover's direction toward its target without leaving the freedom the earlier mates allow. */
	kick(c: Constraint, earlier: readonly Constraint[], mover: string) {
		/* Any distance from the target is worth a finite turn: the dot-form residuals (angle, perpendicular) have no gradient at all when the two directions are parallel, however close. */
		const aim = this.target(c, mover); if (!aim || dot(aim.current, aim.target) > 1 - 1e-12) return;
		const pose = this.pose(mover);
		const turned = (origin: Vec3, axis: Vec3): { dot: number; matrix: Matrix } => {
			const cur = perpendicular(aim.current, axis), tar = perpendicular(aim.target, axis);
			if (norm(cur) < 1e-9 || norm(tar) < 1e-9) return { dot: -Infinity, matrix: pose };
			const angle = Math.atan2(dot(cross(cur, tar), axis), dot(cur, tar));
			const matrix = multiply(rotationAboutLine(origin, axis, angle), pose);
			this.poses.set(mover, matrix); const after = frameDirection(this.world(c.a.body === mover ? c.a : c.b))!; this.poses.set(mover, pose);
			return { dot: dot(after, aim.target), matrix };
		};
		let best = { dot: dot(aim.current, aim.target), matrix: pose };
		if (!earlier.length) {
			const axis = cross(aim.current, aim.target);
			best = turned(aim.anchor, norm(axis) > 1e-9 ? unit(axis) : unit(perpendicular(Math.abs(aim.current[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], aim.current)));
		} else {
			const center = this.center(mover);
			for (const twist of nullSpace(this.rows(earlier, mover), 6, RANK_TOLERANCE)) {
				const omega: Vec3 = [twist[0], twist[1], twist[2]], v: Vec3 = [twist[3], twist[4], twist[5]], w = norm(omega);
				if (w < 1e-9) continue;
				const origin = add(center, scale(cross(omega, v), 1 / (w * w)));
				const candidate = turned(origin, scale(omega, 1 / w));
				if (candidate.dot > best.dot + 1e-9) best = candidate;
			}
		}
		this.poses.set(mover, best.matrix);
	}
}

export function solveAssembly(input: AssemblyInput): AssemblyResult {
	const solver = new Solver(input.bodies);
	const fixed = new Set(input.bodies.filter((b) => b.fixed).map((b) => b.id));
	const placement: Placement = { placedAt: new Map(), ground: new Set() };
	const accepted: Constraint[] = [], errors: AssemblyResult['errors'] = [];
	const residuals = new Map<string, number>(), units = new Map<string, 'in' | 'deg'>(), ms = new Map<string, number>();
	const named = new Set<string>();
	const bodyName = (id: string) => solver.bodies.get(id)?.name ?? id;
	const record = (c: Constraint) => { residuals.set(c.mate.feature, solver.report(c)); units.set(c.mate.feature, residualUnit(c.mate.kind)); };
	const fail = (mate: AssemblyMate, message: string) => errors.push({ feature: mate.feature, message });
	/** The earlier mates whose removal would let this one hold: a dependence, or every earlier mate when the rows are independent and the geometry still refuses. */
	const involved = (earlier: readonly Constraint[], c: Constraint, mover: string): Constraint[] => {
		const rowsOf = (set: readonly Constraint[]) => solver.rows(set, mover), fresh = solver.jacobian(c, mover);
		const dependent = rowRank([...rowsOf(earlier), ...fresh], RANK_TOLERANCE) === rowRank(rowsOf(earlier), RANK_TOLERANCE);
		if (!dependent) return [...earlier];
		const culprits = earlier.filter((e) => { const rest = rowsOf(earlier.filter((x) => x !== e)); return rowRank([...rest, ...fresh], RANK_TOLERANCE) > rowRank(rest, RANK_TOLERANCE); });
		return culprits.length ? culprits : [...earlier];
	};
	input.mates.forEach((mate, index) => {
		const started = now();
		try {
			if ('error' in mate.a) throw Error(`${mate.name}: ${mate.a.error}`);
			if ('error' in mate.b) throw Error(`${mate.name}: ${mate.b.error}`);
			const a = mate.a, b = mate.b;
			if (a.body) named.add(a.body); if (b.body) named.add(b.body);
			if (!a.body && !b.body) throw Error(`${mate.name} mates two references and no body, so nothing can move. Pick a face, edge or corner on a body.`);
			if (a.body && a.body === b.body) throw Error(`${mate.name} names ${bodyName(a.body)} twice. Mate two different bodies.`);
			for (const id of [a.body, b.body]) if (id && !solver.bodies.has(id)) throw Error(`${mate.name}: the body it used (${id}) is no longer on the model.`);
			const sign = orientationSign(mate.kind, solver.world(a), solver.world(b), mate.flip);
			const choice = chooseMover(a.body, b.body, index, fixed, placement);
			const c: Constraint = { mate, a, b, sign, mover: choice.mover, index };
			const holds = () => maxAbs(solver.evaluate(c)) <= MATE_TOLERANCE;
			if (!choice.mover) {
				if (holds()) { accepted.push(c); record(c); return; }
				record(c);
				const both = a.body && b.body;
				throw Error(both ? `${mate.name} would move ${bodyName(a.body!)} or ${bodyName(b.body!)}, but both are fixed. Unfix one of them.` : `${mate.name} would move ${bodyName((a.body ?? b.body)!)}, but it is fixed. Unfix it first.`);
			}
			const mover = choice.mover, earlier = accepted.filter((x) => x.mover === mover), saved = solver.pose(mover);
			try { solver.evaluate(c); } catch (error) { throw Error(`${mate.name}: ${error instanceof Error ? error.message : String(error)}`); } /* an unsupported pairing is refused here, before anything moves */
			const earlierRows = solver.rows(earlier, mover);
			if (earlier.length && rowRank(earlierRows, RANK_TOLERANCE) >= 6) {
				record(c);
				const names = list(earlier.map((e) => e.mate.name)), hold = earlier.length === 1 ? 'holds' : 'hold';
				throw Error(holds() ? `${mate.name} adds nothing: ${names} already ${hold} ${bodyName(mover)} this way. Delete it, or mate a different face.` : `${mate.name} would move ${bodyName(mover)}, but ${names} already ${hold} it in place. Delete ${earlier.length === 1 ? 'it' : 'one of them'} first.`);
			}
			solver.kick(c, earlier, mover);
			const worst = solver.refine([...earlier, c], mover);
			if (worst > MATE_TOLERANCE) {
				solver.poses.set(mover, saved); record(c);
				const culprits = involved(earlier, c, mover), names = list(culprits.map((e) => e.mate.name));
				throw Error(earlier.length ? `${mate.name} conflicts with ${names}: ${bodyName(mover)} cannot satisfy ${culprits.length === 1 ? 'both' : 'all of them'}. Delete one of them, or change its value.` : `${mate.name} cannot be satisfied by moving ${bodyName(mover)}. Pick different faces or change its value.`);
			}
			if (earlier.length && rowRank([...solver.rows(earlier, mover), ...solver.jacobian(c, mover)], RANK_TOLERANCE) === rowRank(solver.rows(earlier, mover), RANK_TOLERANCE)) {
				const culprits = involved(earlier, c, mover), names = list(culprits.map((e) => e.mate.name));
				solver.poses.set(mover, saved); record(c);
				throw Error(`${mate.name} adds nothing: ${names} already ${culprits.length === 1 ? 'holds' : 'hold'} ${bodyName(mover)} this way. Delete it, or mate a different face.`);
			}
			accepted.push(c); record(c);
			if (!placement.placedAt.has(mover)) placement.placedAt.set(mover, index);
			if (choice.anchored && !placement.placedAt.has(choice.anchored)) { placement.placedAt.set(choice.anchored, index); placement.ground.add(choice.anchored); }
		} catch (error) { fail(mate, error instanceof Error ? error.message : String(error)); }
		finally { ms.set(mate.feature, now() - started); }
	});
	/* A later mate can disturb an earlier one on the same body: re-solve, and report what cannot be held. */
	for (let pass = 0; pass < 3; pass++) {
		let disturbed = false;
		for (const c of [...accepted]) {
			if (maxAbs(solver.evaluate(c)) <= MATE_TOLERANCE) continue;
			disturbed = true;
			const later = accepted.filter((x) => x.index > c.index && [x.a.body, x.b.body].some((id) => id && (id === c.a.body || id === c.b.body))).pop();
			const worst = c.mover ? solver.refine(accepted.filter((x) => x.mover === c.mover), c.mover) : Infinity;
			if (worst > MATE_TOLERANCE) {
				accepted.splice(accepted.indexOf(c), 1); record(c);
				fail(c.mate, `${c.mate.name} no longer holds after ${later?.mate.name ?? 'a later mate'}. Move ${later?.mate.name ?? 'it'} above it, or delete one of them.`);
			}
		}
		if (!disturbed) break;
	}
	for (const c of accepted) record(c);
	/* Freedom per body any mate names, from the accepted mates it was the mover of. */
	const dof = new Map<string, number>(), freedom = new Map<string, Freedom>();
	for (const id of named) {
		if (!solver.bodies.has(id)) continue;
		const f = fixed.has(id) ? { dof: 0, translations: 0, slides: [], turns: [] } : freedomOf(solver.rows(accepted.filter((c) => c.mover === id), id), RANK_TOLERANCE);
		const out: Freedom = f.dof === 6 && placement.ground.has(id) ? freeFreedom(true) : f;
		freedom.set(id, out); dof.set(id, out.dof);
	}
	const transforms = new Map<string, Matrix>();
	for (const [id, pose] of solver.poses) if (!isIdentity(pose)) transforms.set(id, pose);
	return { transforms, moved: [...transforms.keys()], errors, residuals, units, dof, freedom, ms };
}

/**
 * The same freedom reading, from the PROJECTION: bodies already at their solved
 * positions, mates with their status. For the panel, until the engine
 * projects the solver's own `freedom`; both go through `chooseMover` and
 * `freedomOf`, so they cannot disagree about a body.
 */
function acceptedFromProjection(model: ModelProjection) {
	const bodies = model.bodies.map((b) => ({ id: b.id, name: b.name, fixed: b.fixed, center: boundsCenter(b.bounds) }));
	const solver = new Solver(bodies);
	const fixed = new Set(bodies.filter((b) => b.fixed).map((b) => b.id));
	const placement: Placement = { placedAt: new Map(), ground: new Set() };
	const accepted: Constraint[] = [], named = new Set<string>();
	model.mates.forEach((m, index) => {
		const a = frameFromProjection(model, m.a), b = frameFromProjection(model, m.b);
		if (a?.body) named.add(a.body); if (b?.body) named.add(b.body);
		if (m.status !== 'ok' || !a || !b) return;
		const choice = chooseMover(a.body, b.body, index, fixed, placement);
		accepted.push({ mate: { feature: m.feature, name: m.feature, kind: m.kind, value: m.value, a, b }, a, b, sign: orientationSign(m.kind, a.frame, b.frame), mover: choice.mover, index });
		if (choice.mover && !placement.placedAt.has(choice.mover)) placement.placedAt.set(choice.mover, index);
		if (choice.anchored && !placement.placedAt.has(choice.anchored)) { placement.placedAt.set(choice.anchored, index); placement.ground.add(choice.anchored); }
	});
	return { solver, fixed, placement, accepted, named };
}
export function freedomFromProjection(model: ModelProjection): Map<string, Freedom> {
	const { solver, fixed, placement, accepted, named } = acceptedFromProjection(model);
	const out = new Map<string, Freedom>();
	for (const id of named) {
		if (!solver.bodies.has(id)) continue;
		let f: Freedom;
		if (fixed.has(id)) f = { dof: 0, translations: 0, slides: [], turns: [] };
		else { try { f = freedomOf(solver.rows(accepted.filter((c) => c.mover === id), id), RANK_TOLERANCE); } catch { f = freeFreedom(); } }
		out.set(id, f.dof === 6 && placement.ground.has(id) ? freeFreedom(true) : f);
	}
	return out;
}
/**
 * WHAT HOLDS ONE BODY, read off the projection: the Jacobian rows of every
 * accepted mate that body is the mover of, over the twist about its own
 * centre. `mates/motion.ts` projects a drag onto their null space. A fixed body
 * says so; a body no mate moves has no rows and is free.
 */
export function holdOf(model: ModelProjection, bodyId: string): { rows: number[][]; center: Vec3; fixed: boolean; ground: boolean } | null {
	const { solver, fixed, placement, accepted } = acceptedFromProjection(model);
	if (!solver.bodies.has(bodyId)) return null;
	let rows: number[][] = [];
	try { rows = solver.rows(accepted.filter((c) => c.mover === bodyId), bodyId); } catch { rows = []; }
	return { rows, center: solver.center(bodyId), fixed: fixed.has(bodyId), ground: placement.ground.has(bodyId) };
}
/** One proposed mate, as the panel holds it before it is added. */
export interface ProposedMate { kind: MateKind; a: EntityRef; b: EntityRef; value?: number; flip?: boolean }
/**
 * THE FREEDOM A SET OF PROPOSED MATES WOULD LEAVE, before anything is added:
 * the same `chooseMover` (first body stays, second moves, a fixed body never
 * moves) and the same `freedomOf` over the same residuals the solver will use,
 * so a joint's promised count and the solver's own report cannot disagree.
 * Answers the pairing sentence of the first mate these entities cannot take.
 */
export function proposedFreedom(model: ModelProjection, mates: readonly ProposedMate[]): { mover: string | null; freedom: Freedom } | { error: string } {
	const bodies = model.bodies.map((b) => ({ id: b.id, name: b.name, fixed: b.fixed, center: boundsCenter(b.bounds) }));
	const solver = new Solver(bodies), fixed = new Set(bodies.filter((b) => b.fixed).map((b) => b.id));
	const constraints: Constraint[] = [];
	let mover: string | null = null;
	for (const [index, m] of mates.entries()) {
		const a = frameFromProjection(model, m.a), b = frameFromProjection(model, m.b);
		if (!a || !b) return { error: 'That pick is no longer on the model. Pick it again.' };
		const choice = chooseMover(a.body, b.body, index, fixed, { placedAt: new Map(), ground: new Set() });
		mover ??= choice.mover;
		const c: Constraint = { mate: { feature: `proposed-${index}`, name: 'This mate', kind: m.kind, value: m.value, flip: m.flip, a, b }, a, b, sign: orientationSign(m.kind, a.frame, b.frame, m.flip), mover, index };
		try { solver.evaluate(c); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
		constraints.push(c);
	}
	if (!mover) return { mover: null, freedom: { dof: 0, translations: 0, slides: [], turns: [] } };
	return { mover, freedom: freedomOf(solver.rows(constraints, mover), RANK_TOLERANCE) };
}
/**
 * WHAT A MATE'S TROUBLE IS, read off the sentence this file wrote for it, so
 * the stem a row is classified by and the sentence it came from live in one
 * file: `adds nothing` is redundant; a mate that cannot hold together with
 * others (or would move a part that cannot move) is a conflict and its
 * sentence already names the other mates; anything else did not solve.
 */
export type MateTrouble = 'redundant' | 'conflict' | 'unsolved';
export function mateTrouble(message: string | undefined): MateTrouble {
	if (!message) return 'unsolved';
	if (/ adds nothing: /.test(message)) return 'redundant';
	if (/ conflicts with | no longer holds after | already holds? it in place| but both are fixed| but it is fixed/.test(message)) return 'conflict';
	return 'unsolved';
}
/**
 * DOES A PROPOSED MATE ADD ANYTHING to what already holds its moving body? The
 * magnetic snap asks this before offering a mate, so dragging a pin along the
 * hole it is already concentric with does not add a second concentric mate the
 * solver can only call redundant (F046). The moving body is `b`'s, as the snap
 * builds it; a mate that does not name a movable body adds nothing.
 */
export function addsToHold(model: ModelProjection, mate: ProposedMate): boolean {
	const { solver, fixed, accepted } = acceptedFromProjection(model);
	const a = frameFromProjection(model, mate.a), b = frameFromProjection(model, mate.b);
	if (!a || !b) return false;
	const mover = b.body && !fixed.has(b.body) ? b.body : a.body && !fixed.has(a.body) ? a.body : null;
	if (!mover || !solver.bodies.has(mover)) return false;
	const c: Constraint = { mate: { feature: 'proposed', name: 'This mate', kind: mate.kind, value: mate.value, flip: mate.flip, a, b }, a, b, sign: orientationSign(mate.kind, a.frame, b.frame, mate.flip), mover, index: accepted.length };
	try { solver.evaluate(c); } catch { return false; }
	const held = solver.rows(accepted.filter((x) => x.mover === mover), mover);
	return rowRank([...held, ...solver.jacobian(c, mover)], RANK_TOLERANCE) > rowRank(held, RANK_TOLERANCE);
}
