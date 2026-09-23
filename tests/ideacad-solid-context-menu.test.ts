// tests/ideacad-solid-context-menu.test.ts
//
// WHAT THE RIGHT-CLICK MENU, THE CONTEXT TOOLBAR AND THE BREADCRUMB SAY. What
// is pinned here fails SILENTLY: a crumb that names the wrong feature (an edge
// a fillet made credited to the extrude it rounded) sends a student to the
// wrong row with nothing to say so; a candidate labelled by an internal id
// ("f8daa0329cd1e.wall", F034) is a list nobody can choose from; and a row that
// cannot run and says nothing is a click that does nothing.
import { describe, expect, it } from 'vitest';
import { breadcrumb, commandItems, edgeFeature, faceFeature, faceRole, selectionLabel, sketchOf } from '../src/lib/ideacad/solid/context-menu';
import type { CommandContext } from '../src/lib/ideacad/solid/command-registry';
import type { FeatureRow, ModelProjection, Selection } from '../src/lib/ideacad/solid/types';

const row = (id: string, index: number, type: FeatureRow['type'], name: string, dependsOn: string[] = [], bodies: string[] = []): FeatureRow => ({ id, index, type, name, status: 'ok', summary: '', bodies, dependsOn, suppressed: false });
/* A sketch, the extrude that made Body 1 from it, and a fillet on one of its edges. */
const model = {
	features: [row('sk1', 0, 'sketch', 'Sketch 1'), row('ex1', 1, 'extrude', 'Extrude 1', ['sk1'], ['ex1#0']), row('fi1', 2, 'fillet', 'Fillet 1', ['ex1'], ['ex1#0'])],
	bodies: [{ id: 'ex1#0', name: 'Body 1', createdBy: 'ex1', faces: [{ id: 'ex1.end' }, { id: 'ex1.side.2' }, { id: 'fi1.blend.ex1.end|ex1.side.2' }], edges: [{ id: 'edge:ex1.end|ex1.side.2', faces: ['ex1.end', 'ex1.side.2'] }, { id: 'edge:ex1.side.2|fi1.blend.ex1.end|ex1.side.2', faces: ['ex1.side.2', 'fi1.blend.ex1.end|ex1.side.2'] }], vertices: [] }],
	references: [{ feature: 'ax1', name: 'Spin axis', kind: 'axis', origin: [0, 0, 0], size: 1 }],
	sketches: [{ feature: 'sk1', name: 'Sketch 1' }]
} as unknown as ModelProjection;
const s = (kind: Selection['kind'], id: string, bodyId = 'ex1#0'): Selection => ({ bodyId, kind, id });

describe('names are the model\'s own', () => {
	it('a face is credited to the feature that made it, an edge to the LATER of its two faces\' features', () => {
		expect(faceFeature(model, 'ex1#0', 'ex1.end')?.name).toBe('Extrude 1');
		expect(faceFeature(model, 'ex1#0', 'fi1.blend.ex1.end|ex1.side.2')?.name).toBe('Fillet 1');
		expect(edgeFeature(model, 'ex1#0', 'edge:ex1.side.2|fi1.blend.ex1.end|ex1.side.2')?.name).toBe('Fillet 1');
		/* Positive control: an edge between two extrude faces is the extrude's. */
		expect(edgeFeature(model, 'ex1#0', 'edge:ex1.end|ex1.side.2')?.name).toBe('Extrude 1');
		expect(sketchOf(model, model.features[1])?.name).toBe('Sketch 1');
		expect(sketchOf(model, model.features[0])).toBeUndefined();
	});
	it('every kind reads as words, never as an id', () => {
		const labels = [s('face', 'ex1.end'), s('edge', 'edge:ex1.end|ex1.side.2'), s('vertex', 'v'), s('body', 'ex1#0'), s('sketch', 'sk1', ''), s('reference', 'datum:XZ', ''), s('reference', 'ax1', '')].map((x) => selectionLabel(model, x));
		expect(labels).toEqual(['End face of Extrude 1', 'Edge of Extrude 1', 'Corner of Body 1', 'Body 1', 'Sketch 1', 'Front plane', 'Spin axis']);
		/* Two faces of one feature never read the same. */
		expect(['ex1.end', 'ex1.start', 'ex1.side.2', 'ex1.hole.0.3', 'fi1.blend.ex1.end|ex1.side.2', 'ex1.end~1', 'legacy-a.face.4'].map(faceRole)).toEqual(['End face', 'Start face', 'Side face 3', 'Hole wall', 'Fillet face', 'End face', 'Face 5']);
		for (const l of labels) expect(l).not.toMatch(/ex1|#|edge:|datum:/);
	});
});

describe('the breadcrumb', () => {
	const words = (list: ReturnType<typeof breadcrumb>) => list.map((c) => c.label);
	it('a face: the face, the feature that made it, that feature\'s sketch, the body', () => {
		const crumbs = breadcrumb(model, s('face', 'ex1.end'));
		expect(words(crumbs)).toEqual(['End face', 'Extrude 1', 'Sketch 1', 'Body 1']);
		/* Each crumb selects what it names: the face itself, the tree row's own selection, the body. */
		expect(crumbs[0].selections).toEqual([s('face', 'ex1.end')]);
		expect(crumbs[1].selections).toEqual([{ bodyId: 'ex1#0', kind: 'body', id: 'ex1#0' }, { bodyId: '', kind: 'feature', id: 'ex1' }]);
		expect(crumbs[2].selections).toEqual([{ bodyId: '', kind: 'sketch', id: 'sk1' }]);
		expect(crumbs[3].selections).toEqual([{ bodyId: 'ex1#0', kind: 'body', id: 'ex1#0' }]);
	});
	it('an edge a fillet made leads to the fillet, which has no sketch; a body leads to what made it; a sketch to what used it', () => {
		expect(words(breadcrumb(model, s('edge', 'edge:ex1.side.2|fi1.blend.ex1.end|ex1.side.2')))).toEqual(['Edge', 'Fillet 1', 'Body 1']);
		expect(words(breadcrumb(model, s('body', 'ex1#0')))).toEqual(['Body 1', 'Extrude 1', 'Sketch 1']);
		expect(words(breadcrumb(model, s('sketch', 'sk1', '')))).toEqual(['Sketch 1', 'Extrude 1', 'Body 1']);
		expect(words(breadcrumb(model, s('reference', 'datum:XY', '')))).toEqual(['Top plane']);
	});
});

describe('menu rows from the registry', () => {
	const ctx = { selections: [s('face', 'ex1.end')], canNormalTo: true, canWrite: true, canUndo: false, canRedo: false, hiddenBodies: 0 } as unknown as CommandContext;
	it('a row carries the command\'s name, icon and key, and a reason when it cannot run, so a click never does nothing silently', () => {
		const ran: string[] = [];
		const rows = commandItems(['extrude', 'select-tangent', 'show-bodies', 'no-such-command'], ctx, new Map([['extrude', ['e']]]), (c) => ran.push(c.id));
		expect(rows.map((r) => r.id)).toEqual(['extrude', 'select-tangent', 'show-bodies']);
		expect(rows[0]).toMatchObject({ label: 'Extrude', keys: 'E', reason: null });
		expect(rows[0].icon).toMatch(/^M/);
		expect(rows[1].reason).toBe('Takes an edge');
		expect(rows[2].reason).toBe('Nothing is hidden');
		rows[0].run?.(); rows[1].run?.();
		expect(ran).toEqual(['extrude', 'select-tangent']);
	});
});
