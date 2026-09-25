/**
 * QUICK SNAPPING IN THE SKETCH, DRIVEN IN A REAL BROWSER. Ledger 0298, R05.
 *
 * Mr. Pina asked on 2026-09-23 for "relations and quick snapping to align
 * sketch entities". The arithmetic is pinned in
 * `tests/ideacad-solid-sketching-snap.test.ts`; what only a browser can say is
 * whether the CURSOR CUE -- a glyph and a word beside the pointer -- appears
 * where the pointer is, says the right thing, changes when Ctrl is held and
 * released, and whether the workspace's own Undo takes an inferred relation
 * away with the line that brought it.
 *
 * WHAT THIS SPEC DRIVES. A 4 x 3 rectangle opened for editing, straight on,
 * with the Line tool chosen. Then, through events dispatched at the canvas
 * (the viewport converts them with its own `editingPoint`, exactly as for a
 * mouse):
 *
 *   1. The pointer over the top edge's middle: the cue must say Midpoint, sit
 *      beside the pointer, and the panel must name the relation it will add.
 *      Ctrl pressed ON THE WINDOW with no movement: the cue must say Free and
 *      the panel "Placing freely". Ctrl released: Midpoint again.
 *   2. A press there, a press plumb above it, Enter: the sketch must gain one
 *      line, a Midpoint relation and a Vertical. Then the workspace's Undo
 *      BUTTON: both relations and the line must go together.
 *   3. The pointer left over the right edge, level with nothing, so the final
 *      state the checks read has a live "On line" cue.
 *
 * And a REAL-INPUT drag (`readoutNearPointer`, Playwright's own mouse) along
 * the top edge, which asks at every step whether the cue is there and beside
 * the pointer -- the half no dispatched event can vouch for.
 */
export default {
	path: '/dev/ideacad-solid?state=snap',
	label: 'IdeaCAD: sketch snapping, the cursor cue and the relation it adds',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				await wait();
				if (!s.model.features.some((f) => f.id === 'sk1')) {
					const P = (id, x, y) => ({ id, type: 'point', x, y }), L = (id, a, b) => ({ id, type: 'line', a, b });
					await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Snap sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' },
						entities: [P('p0', 0, 0), P('p1', 4, 0), P('p2', 4, 3), P('p3', 0, 3), L('l0', 'p0', 'p1'), L('l1', 'p1', 'p2'), L('l2', 'p2', 'p3'), L('l3', 'p3', 'p0')],
						constraints: [{ id: 'h0', type: 'horizontal', line: 'l0' }, { id: 'v1', type: 'vertical', line: 'l1' }, { id: 'h2', type: 'horizontal', line: 'l2' }, { id: 'v3', type: 'vertical', line: 'l3' }] } }, 'Draw sketch');
					await wait();
				}
				s.editSketch('sk1');
				s.view('top');
				s.fit();
				await new Promise((r) => setTimeout(r, 300));
				s.setTool('line');
				await new Promise((r) => setTimeout(r, 200));
				return 'editing; snap line: ' + (document.querySelector('[data-testid="ideacad-sketch-snap"]') || {}).textContent;
			}`,
			until: `() => !!document.querySelector('[data-testid="ideacad-sketch-editor"]') && (document.querySelector('[data-testid="ideacad-sketch-snap"]') || {}).textContent?.includes('Hold Ctrl')`,
			attempts: 3,
			gapMs: 400,
			waitMs: 400
		},
		{
			/* THE CUE, AND CTRL ON THE KEY ALONE. Read three times: hovering the middle of the top edge, Ctrl down, Ctrl up. */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const canvas = document.querySelector('.solid-workspace canvas');
				const hover = (u, v, ctrlKey) => { const p = s.project([u, v, 0]); canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, buttons: 0, ctrlKey: !!ctrlKey })); return p; };
				const read = (pointer) => {
					const cue = document.querySelector('[data-testid="ideacad-sketch-snap-cue"]'), r = cue.getBoundingClientRect();
					const nx = Math.max(r.left, Math.min(pointer.x, r.right)), ny = Math.max(r.top, Math.min(pointer.y, r.bottom));
					return { hidden: cue.hidden, kind: cue.dataset.snap, word: cue.textContent.trim(), gap: Math.round(Math.hypot(nx - pointer.x, ny - pointer.y) * 10) / 10, note: (document.querySelector('[data-testid="ideacad-sketch-snap"]') || {}).textContent || '' };
				};
				const tick = () => new Promise((r) => setTimeout(r, 120));
				const at = hover(2.02, 3.02); await tick();
				const a = read(at);
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true, bubbles: true })); await tick();
				const b = read(at);
				window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', ctrlKey: false, bubbles: true })); await tick();
				const c = read(at);
				window.__snapCue = { a, b, c };
				return JSON.stringify(window.__snapCue);
			}`,
			until: `() => {
				const x = window.__snapCue; if (!x) return false;
				return !x.a.hidden && x.a.kind === 'midpoint' && x.a.word.includes('Midpoint') && x.a.gap <= 40
					&& x.a.note.includes('Midpoint of Line 3') && x.a.note.includes('Adds Midpoint')
					&& !x.b.hidden && x.b.kind === 'free' && x.b.word.includes('Free') && x.b.note.includes('Placing freely')
					&& !x.c.hidden && x.c.kind === 'midpoint';
			}`,
			attempts: 3,
			gapMs: 400,
			waitMs: 300
		},
		{
			/* A PRESS ON THE MIDDLE, A PRESS PLUMB ABOVE IT, ENTER, THEN THE UNDO BUTTON. Guarded, so a re-run reads the first run's result rather than drawing twice. */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				if (!window.__snapDraw) {
					const canvas = document.querySelector('.solid-workspace canvas');
					const settle = async (ms) => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); await new Promise((r) => setTimeout(r, ms)); };
					const press = (u, v) => {
						const p = s.project([u, v, 0]);
						const base = { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0 };
						canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 0 }));
						canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
						canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
					};
					const sketch = () => s.model.sketches.find((k) => k.feature === 'sk1');
					const shape = () => ({ lines: sketch().entities.filter((e) => e.type === 'line').length, constraints: sketch().constraints.map((c) => c.type) });
					const before = shape();
					press(2.02, 3.02); await new Promise((r) => setTimeout(r, 80));
					press(2.01, 4.5); await new Promise((r) => setTimeout(r, 80));
					window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
					await settle(300);
					const drawn = shape();
					const top = sketch().entities.find((e) => e.type === 'point' && Math.abs(e.x - 2) < 1e-9 && Math.abs(e.y - 3) < 1e-9);
					document.querySelector('.solid-workspace button[aria-label="Undo"]').click();
					await settle(400);
					window.__snapDraw = { before, drawn, onMiddle: !!top, undone: shape() };
				}
				return JSON.stringify(window.__snapDraw);
			}`,
			until: `() => {
				const d = window.__snapDraw; if (!d) return false;
				const count = (list, t) => list.filter((x) => x === t).length;
				return d.before.lines === 4 && d.before.constraints.length === 4
					&& d.drawn.lines === 5 && count(d.drawn.constraints, 'midpoint') === 1 && count(d.drawn.constraints, 'vertical') === 3 && d.drawn.constraints.length === 6 && d.onMiddle
					&& d.undone.lines === 4 && d.undone.constraints.length === 4 && count(d.undone.constraints, 'midpoint') === 0;
			}`,
			attempts: 3,
			gapMs: 500,
			waitMs: 400
		},
		{
			/* THE FINAL STATE THE CHECKS READ: the pointer over the right edge, level with nothing, so the cue says On line. */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				s.setTool('line');
				await new Promise((r) => setTimeout(r, 150));
				const canvas = document.querySelector('.solid-workspace canvas');
				const p = s.project([4.02, 1.1, 0]);
				canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, buttons: 0 }));
				await new Promise((r) => setTimeout(r, 150));
				const cue = document.querySelector('[data-testid="ideacad-sketch-snap-cue"]');
				return 'cue: ' + (cue.hidden ? 'hidden' : cue.dataset.snap + ' ' + JSON.stringify(cue.textContent.trim()));
			}`,
			until: `() => { const cue = document.querySelector('[data-testid="ideacad-sketch-snap-cue"]'); return !!cue && !cue.hidden && cue.dataset.snap === 'onCurve'; }`,
			attempts: 3,
			gapMs: 400,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '.solid-workspace canvas', label: 'the viewport', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-sketch-editor"]', label: 'the sketch editor panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-sketch-snap-cue"]', label: 'the cursor cue, live over an edge', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-sketch-snap"]', label: 'the snap sentence in the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Undo took the drawn line away, so the sketch is the rectangle it started as. Positive control: the panel and the cue are present on the same run. */
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'the one sketch, with nothing left behind by the undone line', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '.solid-workspace .error', label: 'the refusal banner, absent through the whole drive', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-sketch-snap-cue"]', label: 'the cue says what the press lands on', must: ['On line'] },
		{ selector: '[data-testid="ideacad-sketch-snap"]', label: 'the panel names the edge and the relation', must: ['On Line 2', 'Adds Point on line'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-sketch-snap-cue"] .word', label: 'the cue word', min: 4.5 },
		{ selector: '[data-testid="ideacad-sketch-snap"]', label: 'the snap sentence', min: 4.5 }
	],
	/* A student surface at every width. */
	tapTargets: [{ selector: '[data-testid="ideacad-sketch-editor"] .tools button', label: 'the sketch tool buttons', min: 44 }],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the viewport with the sketch' }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area chrome', reserved: null }],
	/* REAL INPUT: Playwright's own mouse pressed on the top edge and moved along it. Every step must show the cue within 40px of the pointer. */
	readoutNearPointer: [
		{
			label: 'the snap cue follows the pointer along an edge',
			readoutSelector: '[data-testid="ideacad-sketch-snap-cue"]:not([hidden])',
			fromEvaluate: '() => window.ideaCadSolid.project([1, 3, 0])',
			delta: { dx: 80, dy: 0 },
			steps: 6,
			maxPx: 40
		}
	],
	ignoreConsole: []
};
