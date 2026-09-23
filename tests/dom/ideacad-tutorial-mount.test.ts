// tests/dom/ideacad-tutorial-mount.test.ts
//
// THE REAL `Tutorial` PANEL over a fake workspace whose model, tool and
// preferences are reactive, so a step is seen to move on because the model
// changed, exactly as it does when a student draws. What is pinned here fails
// SILENTLY in use: a step that never moves on (the panel just sits on the same
// line), progress that is not written through the preferences store (it is
// gone at the next visit), a resumed step that ticks because the document
// already held what it asks for, and a panel that offers nothing when the
// control it names is not on screen. happy-dom has no layout, so every control
// reads as off screen here, which is exactly the case the Run button is for;
// the ring on a real control is the browser spec's (`ideacad-tutorial.mjs`).
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import Tutorial from '$lib/ideacad/solid/learn/Tutorial.svelte';
import { MemoryPreferenceStore } from '$lib/ideacad/solid/preferences';
import type { Feature, FeatureRow, ModelProjection } from '$lib/ideacad/solid/types';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = Tutorial as unknown as Component<Record<string, unknown>>;
const EMPTY = (): ModelProjection => ({ bodies: [], sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false });
const row = (id: string, type: Feature['type']): FeatureRow => ({ id, index: 0, type, name: id, status: 'ok', summary: '', bodies: [], dependsOn: [], suppressed: false });
const fillet = (id: string): Feature => ({ id, name: id, type: 'fillet', edges: [], radius: 0.1 });

function harness(initial?: unknown, withPrefs = true, doc: { model?: ModelProjection; features?: Feature[] } = {}) {
	const store = new MemoryPreferenceStore(initial);
	const w = reactiveProps({ model: doc.model ?? EMPTY(), features: doc.features ?? ([] as Feature[]), tool: 'select' as string, prefs: store.current });
	store.subscribe((p) => { w.prefs = p; });
	const ran: string[] = []; let closed = 0;
	const api = {
		get model() { return w.model; }, get manifest() { return { features: w.features } as unknown as WorkspaceApi['manifest']; }, get selections() { return []; }, get canWrite() { return true; }, get busy() { return false; }, get tool() { return w.tool as WorkspaceApi['tool']; }, get editingSketch() { return null; },
		runCommand: (id: string) => { ran.push(id); },
		apply: async () => {}, select() {}, setTool() {}, editSketch() {}, setSketchPointer() {}, request: async () => { throw Error('not here'); }, project: () => ({ x: 0, y: 0 }), error() {}, guide() {}, clearGuides() {}, clip() {}, lookAt() {}, fit() {}, unproject: () => null
	} as unknown as WorkspaceApi;
	/* A getter, not a spread: a spread would copy the preferences once and the panel would never see a change. */
	if (withPrefs) Object.defineProperties(api, { prefs: { get: () => w.prefs }, setPreference: { value: (g: never, v: never) => store.set(g, v) } });
	const m = mountInto(Panel, { api, onclose: () => { closed++; } });
	mounted.push(m);
	return { m, w, store, ran, closed: () => closed };
}
const mounted: Mounted[] = [];
afterEach(async () => { for (const m of mounted.splice(0)) await m.stop(); });
const line = (m: Mounted) => m.one('[data-testid="ideacad-tutorial-step"]');

describe('the tutorial panel', () => {
	it('starts on a press, moves on when the tool is armed, and writes its progress through the preferences store', () => {
		const h = harness();
		expect(h.m.all('[data-testid="ideacad-tutorial-step"]')).toHaveLength(0);
		h.m.one<HTMLButtonElement>('[data-testid="ideacad-tutorial-start"]').click(); h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('draw-tool');
		expect(h.store.stored()).toEqual({ hints: { tutorial: { step: 'draw-tool', finished: false } } });
		h.w.tool = 'circle'; h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('draw-tool');
		h.w.tool = 'rectangle'; h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('draw-drag');
		expect(h.store.current.hints.tutorial.step).toBe('draw-drag');
	});
	it('resumed on a document that already has a fillet, "round an edge" waits for a new one', () => {
		const h = harness({ hints: { tutorial: { step: 'round-drag', finished: false } } }, true, { features: [fillet('f1')], model: { ...EMPTY(), features: [row('f1', 'fillet')] } });
		h.w.tool = 'fillet'; h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('round-drag');
		expect(h.m.one('[data-testid="ideacad-tutorial-count"]').textContent).toBe('2 of 5');
		h.w.features = [fillet('f1'), fillet('f2')]; h.w.model = { ...EMPTY(), features: [row('f1', 'fillet'), row('f2', 'fillet')] }; h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('cut-circle');
		expect(h.m.one('[data-testid="ideacad-tutorial-count"]').textContent).toBe('3 of 5');
	});
	it('offers the named command itself when its control is not on screen, and Skip, Close and a task row all do what they say', () => {
		const h = harness({ hints: { tutorial: { step: 'mate-tool', finished: false } } });
		const run = h.m.one<HTMLButtonElement>('[data-testid="ideacad-tutorial-run"]');
		expect(run.textContent?.trim()).toBe('Mate');
		run.click(); expect(h.ran).toEqual(['mate']);
		h.m.one<HTMLButtonElement>('[data-testid="ideacad-tutorial-skip"]').click(); h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('mate-pick');
		h.m.one<HTMLButtonElement>('[data-testid="ideacad-tutorial-skip"]').click(); h.m.flush();
		expect(h.store.current.hints.tutorial).toEqual({ step: null, finished: true });
		expect(line(h.m).textContent).toBe('All 5 done');
		h.m.one<HTMLButtonElement>('[data-task="cut"]').click(); h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('cut-circle');
		h.m.one<HTMLButtonElement>('[data-testid="ideacad-tutorial-close"]').click();
		expect(h.closed()).toBe(1);
	});
	it('runs for this session on a workspace with no preferences, and every step is one line with no instruction paragraph', () => {
		const h = harness(undefined, false);
		h.m.one<HTMLButtonElement>('[data-testid="ideacad-tutorial-start"]').click(); h.m.flush();
		h.w.tool = 'rectangle'; h.m.flush();
		expect(line(h.m).getAttribute('data-step')).toBe('draw-drag');
		expect(h.m.all('p')).toHaveLength(2);
		for (const p of h.m.all('p')) expect(p.textContent!.trim()).not.toMatch(/[.!?]\s+\S/);
	});
});
