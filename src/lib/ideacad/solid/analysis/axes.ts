/**
 * WHICH AXIS AND WHICH BODIES AN INERTIA IS TAKEN ABOUT. Pure.
 *
 * SELECTION IMPLIES THE AXIS. A selected round face, a straight or circular
 * edge, or a reference axis IS an axis, read through the same
 * `frameFromSurface` / `edgeFrameFromProjection` the mate panel reads a face
 * with, so the two surfaces describe one cylinder the same way. With nothing
 * like that selected the list still offers the three world axes through the
 * Origin, the three through the subject's own center of gravity, and every
 * reference axis in the model.
 *
 * AND SELECTION IMPLIES THE BODIES. A selected face, edge, corner or body
 * names its body, so selecting a weapon's bore reads the weapon alone about
 * that bore; with nothing on a body selected, the subject is every body.
 */
import { edgeFrameFromProjection, frameFromSurface } from '../mates/frames';
import type { BodyProjection, ModelProjection, Selection, Vec3 } from '../types';
import type { Axis } from './mass';

export interface AxisChoice {
	id: string;
	label: string;
	/** The axis itself, or `through: 'cg'` when it runs through the subject's CG along `direction` (known only once the CG is). */
	axis: Axis | null;
	through?: 'cg';
	direction?: Vec3;
}

const WORLD: [string, Vec3][] = [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]];
const ON_BODY: Selection['kind'][] = ['body', 'face', 'edge', 'vertex'];

/** The axis a selection names, if it names one. */
export function axisFromSelection(model: Pick<ModelProjection, 'bodies' | 'references'>, selection: Selection): { label: string; axis: Axis } | null {
	if (selection.kind === 'reference') {
		const r = model.references.find((x) => x.feature === selection.id);
		return r && r.kind === 'axis' && r.direction ? { label: r.name, axis: { origin: r.origin, direction: r.direction } } : null;
	}
	const body = model.bodies.find((b) => b.id === selection.bodyId); if (!body) return null;
	try {
		if (selection.kind === 'face') {
			const f = body.faces.find((x) => x.id === selection.id); if (!f || !['cylinder', 'cone', 'torus'].includes(f.kind)) return null;
			const frame = frameFromSurface(f.kind, f.surface, f.center, f.normal);
			return frame.kind === 'axis' ? { label: `${body.name} round face`, axis: { origin: frame.origin, direction: frame.direction } } : null;
		}
		if (selection.kind === 'edge') {
			const e = body.edges.find((x) => x.id === selection.id); if (!e) return null;
			const frame = edgeFrameFromProjection(e);
			return frame.kind === 'axis' ? { label: `${body.name} ${e.curve === 'CIRCLE' ? 'round' : 'straight'} edge`, axis: { origin: frame.origin, direction: frame.direction } } : null;
		}
	} catch { return null; }
	return null;
}

/** Every axis on offer, selection-derived ones first. */
export function axisChoices(model: Pick<ModelProjection, 'bodies' | 'references'>, selections: readonly Selection[]): AxisChoice[] {
	const out: AxisChoice[] = [];
	for (const s of selections) {
		const found = axisFromSelection(model, s);
		if (found) out.push({ id: `sel:${s.bodyId}/${s.kind}/${s.id}`, label: found.label, axis: found.axis });
	}
	for (const [n, d] of WORLD) out.push({ id: `cg-${n}`, label: `${n.toUpperCase()} through CG`, axis: null, through: 'cg', direction: d });
	for (const [n, d] of WORLD) out.push({ id: `world-${n}`, label: `${n.toUpperCase()} axis`, axis: { origin: [0, 0, 0], direction: d } });
	for (const r of model.references) if (r.kind === 'axis' && r.direction && !out.some((c) => c.id === `sel:/reference/${r.feature}`)) out.push({ id: `ref:${r.feature}`, label: r.name, axis: { origin: r.origin, direction: r.direction } });
	return out;
}

/** The choice to show when the student has not picked one: a selected axis if there is one, else Z through the CG. */
export function defaultAxisChoice(choices: readonly AxisChoice[]): string {
	return choices.find((c) => c.id.startsWith('sel:'))?.id ?? 'cg-z';
}

/** The ids of the bodies the selection names, in model order. Empty when nothing on a body is selected. */
export function selectedBodyIds(model: Pick<ModelProjection, 'bodies'>, selections: readonly Selection[]): string[] {
	const named = new Set(selections.filter((s) => ON_BODY.includes(s.kind) && s.bodyId).map((s) => s.bodyId));
	return model.bodies.filter((b) => named.has(b.id)).map((b) => b.id);
}

/** Resolve a choice to an axis, given the subject's CG (null when unknown). */
export function resolveAxis(choice: AxisChoice | undefined, cg: Vec3 | null): Axis | null {
	if (!choice) return null;
	if (choice.axis) return choice.axis;
	return choice.through === 'cg' && cg && choice.direction ? { origin: cg, direction: choice.direction } : null;
}

export const bodiesById = (model: Pick<ModelProjection, 'bodies'>, ids: readonly string[]): BodyProjection[] => model.bodies.filter((b) => ids.includes(b.id));
