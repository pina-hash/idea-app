/**
 * READABLE NAMES FOR WHAT A MATE NAMES. A face's stored id is its
 * construction name (`<feature id>.<role>`, `naming.ts`), which is exactly
 * what a reference needs and exactly what a student should never have to read:
 * "Body 1, f8daa0329cd1e.wall (face)" becomes "Plate, hole wall". The words
 * come from the ROLE the creating feature gave the face, the feature's type and
 * the face's surface kind; an ordinal survives as a number so two walls of one
 * pattern stay told apart. Pure, and read off the projection and the manifest.
 */
import type { BodyProjection, EntityRef, ModelProjection, SolidManifest, Selection } from '../types';
import { edgeId, vertexId } from '../naming';

type Ctx = { model: ModelProjection; manifest: SolidManifest };
const ROUND = new Set(['cylinder', 'cone']);
const n1 = (text: string | undefined) => { const n = Number(text); return Number.isInteger(n) ? String(n + 1) : ''; };
const bodyName = (ctx: Ctx, id: string) => ctx.model.bodies.find((b) => b.id === id)?.name ?? ctx.manifest.bodies.find((b) => b.id === id)?.name ?? 'A body';

/** The words for one face id on a body: its role in the feature that made it, and its shape when the role says nothing. */
export function faceWord(ctx: Ctx, body: BodyProjection | undefined, id: string): string {
	const face = body?.faces.find((f) => f.id === id);
	const round = face ? ROUND.has(face.kind) : false, flat = face?.kind === 'plane';
	const shape = round ? 'round face' : flat ? 'flat face' : face?.kind === 'sphere' ? 'ball face' : 'face';
	const [base, ordinal] = id.split('~'), dot = base.indexOf('.');
	const fid = dot > 0 ? base.slice(0, dot) : '', role = dot > 0 ? base.slice(dot + 1).split('.') : [];
	const type = ctx.manifest.features.find((f) => f.id === fid)?.type;
	const suffix = ordinal !== undefined && n1(ordinal) ? ` (${n1(ordinal)})` : '';
	let word: string;
	switch (role[0]) {
		case 'wall': word = type === 'hole' ? 'hole wall' : `${round ? 'round' : 'side'} wall`; break;
		case 'bottom': word = type === 'hole' ? 'hole bottom' : 'bottom face'; break;
		case 'hole': word = `hole wall ${n1(role[1])}`.trim(); break;
		case 'start': word = 'start face'; break;
		case 'end': word = 'end face'; break;
		case 'side': word = `${round ? 'round' : 'side'} face ${n1(role[1])}`.trim(); break;
		case 'rev': word = `${round ? 'round' : 'turned'} face ${n1(role[1])}`.trim(); break;
		case 'blend': word = 'fillet face'; break;
		case 'bevel': word = 'chamfer face'; break;
		case 'corner': word = 'corner patch'; break;
		case 'inner': word = 'inside face'; break;
		case 'face': word = `${shape} ${n1(role[1])}`.trim(); break;
		default: word = shape;
	}
	return word + suffix;
}
/** A pick, as a student reads it: "Plate, hole wall", "Pin, circular edge of top face", "Front plane". */
export function selectionWords(ctx: Ctx, s: Selection): string {
	if (s.kind === 'reference') { const r = ctx.model.references.find((x) => x.feature === s.id); return `${r?.name ?? 'Reference'} (${r?.kind ?? 'reference'})`; }
	const body = ctx.model.bodies.find((b) => b.id === s.bodyId), name = bodyName(ctx, s.bodyId);
	if (s.kind === 'face') return `${name}, ${faceWord(ctx, body, s.id)}`;
	if (s.kind === 'edge') {
		const e = body?.edges.find((x) => x.id === s.id);
		const curve = e?.curve === 'CIRCLE' ? 'circular edge' : e?.curve === 'LINE' ? 'straight edge' : 'edge';
		const on = e?.faces.find((f) => body?.faces.find((x) => x.id === f)?.kind !== 'plane') ?? e?.faces[0];
		return on ? `${name}, ${curve} of ${faceWord(ctx, body, on)}` : `${name}, ${curve}`;
	}
	if (s.kind === 'vertex') return `${name}, corner`;
	return name;
}
/** A stored mate side, in the same words. A side the model no longer has says so. */
export function refWords(ctx: Ctx, r: EntityRef): string {
	if (r.kind === 'reference') { const ref = ctx.model.references.find((x) => x.feature === r.feature); return ref ? `${ref.name} (${ref.kind})` : `${ctx.manifest.features.find((f) => f.id === r.feature)?.name ?? 'A reference'} (missing)`; }
	if (r.kind === 'body') return bodyName(ctx, r.body);
	if (r.kind === 'sketch-entity') return `${ctx.manifest.features.find((f) => f.id === r.feature)?.name ?? 'A sketch'} entity`;
	const body = ctx.model.bodies.find((b) => b.id === r.body);
	if (r.kind === 'face') return selectionWords(ctx, { kind: 'face', bodyId: r.body, id: r.name });
	if (r.kind === 'edge') { const id = edgeId(r.faces, r.ordinal); return body?.edges.some((e) => e.id === id) ? selectionWords(ctx, { kind: 'edge', bodyId: r.body, id }) : `${bodyName(ctx, r.body)}, edge (missing)`; }
	const id = vertexId(r.faces, r.ordinal);
	return body?.vertices.some((v) => v.id === id) ? `${bodyName(ctx, r.body)}, corner` : `${bodyName(ctx, r.body)}, corner (missing)`;
}
