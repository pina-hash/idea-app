/**
 * BLENDS AND WALLS: fillet, chamfer and shell, re-expressed as replayable
 * features with persistent names (`naming.ts`: a blend is `<fid>.blend.<A>|<B>`,
 * a bevel `<fid>.bevel.<A>|<B>`, a shell's inner face `<fid>.inner.<source>`).
 *
 * THIS MODULE IS THE BLENDS-AND-FEATURES SURFACE'S, together with `extra.ts`
 * (hole, draft, sweep, loft, rib). Tangent propagation, face-to-all-edges
 * selection, per-face shell thickness and the rest are decided here; the
 * kernel calls available are listed in `kernel/remus.ts`.
 */
import type { ExecutorContext } from './context';
import type { FeatureOf } from '../types';
import { surfaceKey } from '../naming';
import { dot, vector } from '../math';
import { carryBySurface, finite, json, positive } from './core';

/** Edges resolved for a blend, deduplicated, grouped by body. Blends cannot cross bodies. */
function blendEdges(ctx: ExecutorContext, edges: FeatureOf<'fillet'>['edges']) {
	if (!edges.length) throw Error('Select at least one edge.');
	const resolved = edges.map((e) => ctx.resolveEdge(e));
	const bodyIds = new Set(resolved.map((r) => r.body.id));
	if (bodyIds.size !== 1) throw Error('Round or bevel edges on one body at a time.');
	return { body: resolved[0].body, handles: [...new Set(resolved.map((r) => r.handle))] };
}
export function fillet(ctx: ExecutorContext, f: FeatureOf<'fillet'>) {
	const k = ctx.k, radius = positive(f.radius, 'radius');
	const { body, handles } = blendEdges(ctx, f.edges);
	if (f.variable) {
		const end = positive(f.variable.end, 'radius');
		const spec = handles.map((edge) => ({ edge, law: f.variable!.law ?? 'linear', start: radius, end }));
		const sources = [...k.getSolidFaces(body.solid)];
		const solid = k.filletVariable(body.solid, JSON.stringify(spec));
		ctx.replaceBody(body, solid, { carry: carryBySurface(ctx, sources), between: 'blend' });
		return;
	}
	ctx.replaceBody(body, ctx.journal(k.filletJournaled(body.solid, new Uint32Array(handles), radius)), { between: 'blend' });
}
export function chamfer(ctx: ExecutorContext, f: FeatureOf<'chamfer'>) {
	const k = ctx.k, d1 = positive(f.distance, 'distance');
	const { body, handles } = blendEdges(ctx, f.edges);
	if (f.angle !== undefined) {
		const angle = finite(f.angle, 'angle');
		if (!(angle > 0 && angle < 90)) throw Error('Use a chamfer angle between 0 and 90 degrees.');
		const sources = [...k.getSolidFaces(body.solid)];
		const solid = k.chamferDistanceAngle(body.solid, new Uint32Array(handles), d1, angle * Math.PI / 180);
		ctx.replaceBody(body, solid, { carry: carryBySurface(ctx, sources), between: 'bevel' });
		return;
	}
	const d2 = f.distance2 !== undefined ? positive(f.distance2, 'distance') : d1;
	ctx.replaceBody(body, ctx.journal(k.chamferJournaled(body.solid, new Uint32Array(handles), d1, d2)), { between: 'bevel' });
}

export function shell(ctx: ExecutorContext, f: FeatureOf<'shell'>) {
	const k = ctx.k, thickness = positive(f.thickness, 'thickness');
	const body = ctx.body(f.body);
	const open = f.openFaces.map((face) => ctx.resolveFace(face).handle);
	const sources = [...k.getSolidFaces(body.solid)].map((face) => ({ face, name: ctx.faceName(face), kind: k.getSurfaceType(face), params: json(k.getAnalyticSurfaceParams(face)), key: surfaceKey(k, face) }));
	const solid = k.shell(body.solid, thickness, new Uint32Array(open));
	/* Outer faces keep their surfaces; an inner face is its source's offset with the normal turned inward. */
	const carry = (face: number): string | undefined => {
		const key = surfaceKey(k, face);
		const same = sources.find((s) => s.key === key); if (same?.name) return same.name;
		const kind = k.getSurfaceType(face), params = json(k.getAnalyticSurfaceParams(face));
		if (kind === 'plane') {
			const n = vector(params.normal), d = params.d as number;
			const src = sources.find((s) => s.kind === 'plane' && dot(vector(s.params.normal), n) < -0.999 && Math.abs(d - (thickness - (s.params.d as number))) < 1e-6);
			if (src?.name) return `${f.id}.inner.${src.name}`;
		}
		if (kind === 'cylinder') {
			const src = sources.find((s) => s.kind === 'cylinder' && Math.abs(Math.abs((s.params.radius as number) - (params.radius as number)) - thickness) < 1e-6);
			if (src?.name) return `${f.id}.inner.${src.name}`;
		}
		return undefined;
	};
	ctx.replaceBody(body, solid, { carry, between: 'inner' });
}

