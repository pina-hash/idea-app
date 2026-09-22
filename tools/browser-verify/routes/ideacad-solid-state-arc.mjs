/**
 * THE ARC TOOL, DRIVEN IN A REAL BROWSER. Ledger 0275.
 *
 * A student reported on 2026-09-21, against build `3793ea2` from `/ideacad` at
 * 1920x919: "Arc tool isn't helpful and causes great issue." The sketch editor
 * that carries the tool had landed that same day, so he is plausibly the first
 * person to have used it. None of the forty `ideacad-*` specs drove the tool,
 * and none of the four hundred-odd assertions under `tests/` reached it
 * through a POINTER: the session tests call `session.down` directly, which is
 * the right level for arithmetic and says nothing about whether a press on the
 * canvas ever arrives.
 *
 * WHAT THIS SPEC DRIVES. NINE presses on the viewport canvas, at plane
 * coordinates put through the viewport's own `project`, drawing three arcs.
 * The first IS the report: a center, a start an inch to its right, and a third
 * press A HUNDREDTH OF AN INCH BELOW THE START, which the deployed tool
 * answered with a 359.427 degree near-circle bulging away from the press. The
 * second is a quarter turn clockwise, which that tool could not draw at all.
 * The third is the same quarter with SHIFT held on the press. The `until`
 * predicates are where the geometry is claimed, because a prepare step's
 * `until` is the one place this harness lets a spec state a measured fact
 * about the page and fail on it.
 *
 * NOTHING ON THE PATH IS REPLACED, AND AN EARLIER DRAFT OF THIS FILE CLAIMED
 * OTHERWISE. It said `canvas.setPointerCapture(e.pointerId)` -- which
 * `viewport.ts` calls when the sketch consumes a press -- must throw
 * `NotFoundError` for a pointer id belonging to no live pointer, and it stubbed
 * that method for the length of the drive. Measured instead of assumed: this
 * Chromium accepts the call for a dispatched `PointerEvent` and the drive
 * records `setPointerCapture: no` with 0 console errors, so the stub was
 * removed. The events are dispatched at the canvas, `SolidViewport` converts
 * them with its own `editingPoint`, and `SketchEditor` commits through the
 * real `api.apply`.
 *
 * WHAT IS NOT CLAIMED HERE. The kernel's refusal of an arc whose ends disagree
 * is pinned in `tests/ideacad-solid-sketching-geometry.test.ts` against the
 * real wasm, where it belongs; this spec asserts what a student SEES.
 */
export default {
	path: '/dev/ideacad-solid?state=arc',
	label: 'IdeaCAD: the arc tool, nine presses on the canvas',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			/* A sketch with one point in it, opened for editing, looked at straight on, with the arc tool chosen. */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				await wait();
				if (!s.model.features.some((f) => f.id === 'sk1')) {
					await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Arc sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [{ id: 'seed', type: 'point', x: 0, y: 2.5 }], constraints: [] } }, 'Draw sketch');
					await wait();
				}
				s.editSketch('sk1');
				s.view('top');
				s.fit();
				await new Promise((r) => setTimeout(r, 300));
				s.setTool('arc');
				await new Promise((r) => setTimeout(r, 200));
				return 'editing ' + s.model.sketches.length + ' sketch(es); panel hint: ' + (document.querySelector('[data-testid="ideacad-sketch-hint"]') || {}).textContent;
			}`,
			until: '() => !!document.querySelector(\'[data-testid="ideacad-sketch-editor"]\')',
			attempts: 3,
			gapMs: 400,
			waitMs: 400
		},
		{
			/*
			 * THREE ARCS, PRESSED. The first IS the report: a third press a
			 * hundredth of an inch below the start, which the deployed tool
			 * answered with 359.427 degrees the other way round. The second is
			 * a quarter turn clockwise, which that tool could not draw at all
			 * -- it answered 270 counter-clockwise. The third is the second
			 * with SHIFT held on the press, which is the only way to ask for
			 * the long way round and is carried by the real `shiftKey` on a
			 * real event rather than by a flag set in a test.
			 */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const canvas = document.querySelector('.solid-workspace canvas');
				if (!canvas) return 'no canvas';
				const settle = async (ms) => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); await new Promise((r) => setTimeout(r, ms)); };
				{
					const press = (u, v, shiftKey) => {
						const p = s.project([u, v, 0]);
						const base = { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, shiftKey: !!shiftKey };
						canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 0 }));
						canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
						canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
					};
					const arc = async (cu, cv, su, sv, tu, tv, shiftKey) => { press(cu, cv); press(su, sv); await new Promise((r) => setTimeout(r, 80)); press(tu, tv, shiftKey); await settle(180); };
					await arc(0, 0, 1, 0, 1, -0.01);
					await arc(-4, 0, -1.5, 0, -4, -2.5);
					await arc(5, 0, 7, 0, 5, -2, true);
				}
				const sketch = s.model.sketches.find((k) => k.feature === 'sk1');
				const pt = (id) => (sketch.entities.find((e) => e.id === id) || {});
				window.__arcDrive = sketch.entities.filter((e) => e.type === 'arc').map((a) => {
					const c = pt(a.center), st = pt(a.start), en = pt(a.end);
					let sweep = Math.atan2(en.y - c.y, en.x - c.x) - Math.atan2(st.y - c.y, st.x - c.x);
					while (sweep <= 1e-12) sweep += Math.PI * 2;
					return { id: a.id, cx: c.x, cy: c.y, sweepDeg: sweep * 180 / Math.PI, startRadius: Math.hypot(st.x - c.x, st.y - c.y), endRadius: Math.hypot(en.x - c.x, en.y - c.y), start: a.start, end: a.end };
				});
				return window.__arcDrive.length + ' arc(s); sweeps ' + JSON.stringify(window.__arcDrive.map((a) => Math.round(a.sweepDeg * 1000) / 1000));
			}`,
			/*
			 * THE CLAIM, three arcs and one rule. Each has ONE radius, to one
			 * part in a million, which is where the kernel's own refusal sits;
			 * and each swept what its third press asked for. `arcSweep` here
			 * is unsigned and counter-clockwise, which is how a STORED arc
			 * reads, so the clockwise quarter reads back as 90 with its ends
			 * swapped and the Shift arc as 270 without.
			 */
			until: `() => {
				const a = window.__arcDrive;
				if (!Array.isArray(a) || a.length !== 3) return false;
				const at = (cx) => a.find((x) => Math.abs(x.cx - cx) < 1e-6);
				const round = at(0), quarter = at(-4), major = at(5);
				if (!round || !quarter || !major) return false;
				const oneRadius = (x, r) => Math.abs(x.startRadius - r) < 1e-6 && Math.abs(x.endRadius - x.startRadius) <= 1e-6 * Math.max(1, x.startRadius);
				return oneRadius(round, 1) && Math.abs(round.sweepDeg - 0.5729386) < 0.01
					&& oneRadius(quarter, 2.5) && Math.abs(quarter.sweepDeg - 90) < 0.01
					&& oneRadius(major, 2) && Math.abs(major.sweepDeg - 270) < 0.01;
			}`,
			attempts: 3,
			gapMs: 500,
			waitMs: 500
		},
		{
			/*
			 * AND THE QUARTER ARC IS BUILDABLE, which is the claim the whole
			 * bundle cashes. The chord and the extrude are applied through the
			 * dev hook rather than pressed -- they are not what is under test
			 * -- so what the kernel is handed is exactly the arc three presses
			 * produced. An arc of the kind the tool used to commit does not
			 * reach a body at all: the kernel throws `edge vertices do not
			 * agree with its authoritative curve trim`, pinned against the
			 * real wasm in `tests/ideacad-solid-sketching-geometry.test.ts`.
			 */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const quarter = window.__arcDrive.find((x) => Math.abs(x.cx + 4) < 1e-6);
				const sketch = s.model.sketches.find((k) => k.feature === 'sk1');
				const entities = sketch.entities.concat([{ id: 'chord', type: 'line', a: quarter.start, b: quarter.end }]);
				await s.apply({ type: 'set-feature', id: 'sk1', patch: { entities, constraints: sketch.constraints } }, 'Close the arc');
				for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25));
				await s.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Segment', type: 'extrude', sketch: 'sk1', distance: 1, operation: 'new' } }, 'Extrude');
				for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25));
				/* Reopened with the arc tool chosen, because the panel's hint and its tap targets are half of what this spec measures and they exist only while a sketch is open. The camera goes back to the iso view AFTER that, because opening a sketch looks straight down at its plane, and a body seen flat on is one flat shade: the raster check would read a filled canvas of almost no distinct colours and say so. */
				s.editSketch('sk1');
				s.setTool('arc');
				s.view('iso');
				s.fit();
				await new Promise((r) => setTimeout(r, 400));
				return s.model.bodies.length + ' body/bodies, volume ' + (s.model.bodies[0] ? s.model.bodies[0].volume.toFixed(4) : 'none');
			}`,
			/* A circular segment of radius 2.5 over a quarter turn, one inch thick: r^2/2 * (theta - sin theta) = 3.125 * (pi/2 - 1). */
			until: `() => {
				const b = window.ideaCadSolid.model.bodies;
				return b.length === 1 && Math.abs(b[0].volume - 3.125 * (Math.PI / 2 - 1)) < 0.01;
			}`,
			attempts: 3,
			gapMs: 500,
			waitMs: 600
		},
		{
			/*
			 * THE NOTICE, IN BOTH DIRECTIONS, which a presence check alone
			 * cannot give: the checks below run once, on the final state, so
			 * they can only say the notice is ABSENT after three good arcs.
			 * That is worth nothing without the other half. So an arc whose
			 * ends sit at different distances from its center is planted here
			 * -- the arc tool can no longer draw one, but an endpoint drag in
			 * Select still can, which is what the notice is for -- the
			 * `until` reads the sentence off the page, and then it is removed
			 * again so the final state is the one the checks describe.
			 *
			 * Its contrast was measured the same way and is NOT standing here,
			 * because contrast runs on the final state too: 5.5:1 at both
			 * widths, rgb(208, 128, 48) on rgb(25, 29, 33).
			 */
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				const sk = () => s.model.sketches.find((k) => k.feature === 'sk1');
				const planted = sk().entities.concat([
					{ id: 'bc', type: 'point', x: 0, y: -6 }, { id: 'bs', type: 'point', x: 1, y: -6 }, { id: 'be', type: 'point', x: 0, y: -3 },
					{ id: 'ba', type: 'arc', center: 'bc', start: 'bs', end: 'be' }
				]);
				await s.apply({ type: 'set-feature', id: 'sk1', patch: { entities: planted, constraints: sk().constraints } }, 'Plant a two-radius arc');
				await wait();
				await new Promise((r) => setTimeout(r, 200));
				const el = document.querySelector('[data-testid="ideacad-sketch-arc-notice"]');
				window.__arcNotice = el ? el.textContent : null;
				const back = sk().entities.filter((e) => !['bc', 'bs', 'be', 'ba'].includes(e.id));
				await s.apply({ type: 'set-feature', id: 'sk1', patch: { entities: back, constraints: sk().constraints } }, 'Remove it again');
				await wait();
				await new Promise((r) => setTimeout(r, 200));
				return 'notice while planted: ' + JSON.stringify(window.__arcNotice);
			}`,
			/* Present and saying what to do while the arc is there, gone once it is not. */
			until: `() => typeof window.__arcNotice === 'string'
				&& window.__arcNotice.includes('ends at different distances from the center')
				&& window.__arcNotice.includes('Drag an end back onto the arc')
				&& !document.querySelector('[data-testid="ideacad-sketch-arc-notice"]')`,
			attempts: 3,
			gapMs: 500,
			waitMs: 400
		}
	],
	presence: [
		{ selector: '.solid-workspace canvas', label: 'the viewport', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-sketch-editor"]', label: 'the sketch editor panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-sketch-hint"]', label: 'the tool hint', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'the sketch and the extrude it fed', expectPresent: 2, maxPresent: 2, expectVisible: 0 },
		/* Every arc three presses drew has one radius, so the sketch has nothing to report. Positive control: the panel and its hint are present on the same run, so the selector is one this page can match. */
		{ selector: '[data-testid="ideacad-sketch-arc-notice"]', label: 'the inconsistent-arc notice, absent after three ordinary arcs', expectPresent: 0 },
		{ selector: '.solid-workspace .error', label: 'the refusal banner, absent through nine presses and an extrude', expectPresent: 0 }
	],
	textContains: [
		/* The hint has to describe what the third press can actually do. It used to say "then the end", which is true in neither reading of the old code. */
		{ selector: '[data-testid="ideacad-sketch-hint"]', label: 'the arc hint', must: ['swing around to where it ends', 'Shift'] }
	],
	contrast: [{ selector: '[data-testid="ideacad-sketch-hint"]', label: 'the tool hint', min: 4.5 }],
	/* A student surface at every width. */
	tapTargets: [{ selector: '[data-testid="ideacad-sketch-editor"] .tools button', label: 'the sketch tool buttons', min: 44 }],
	/* RASTERIZED, NOT INFERRED: the arc is drawn into the viewport, so the canvas is not a cleared one. */
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the viewport with the drawn arc' }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area chrome', reserved: null }]
};
