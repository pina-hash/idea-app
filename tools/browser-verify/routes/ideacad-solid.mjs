/**
 * THE SOLID MODELER WITH A FEATURE GRAPH, MEASURED. Ledger 0273.
 *
 * `/dev/ideacad-solid` mounts the REAL `SolidWorkspace` over an in-memory
 * transport and a real kernel in a real worker. Its prepare steps press
 * "+ New document", then build a small model through the dev hook the
 * workspace exposes (`window.ideaCadSolid`): a rectangle-with-a-hole sketch on
 * XY, an extrude, and a reference axis -- three features, one body -- so the
 * design tree has rows with three different types, the viewport has a body to
 * drag, and the reference layer has something to label.
 *
 * WHAT IS CLAIMED HERE, AND WHY EACH ROW IS A COUNT. The tree lists every
 * feature (3 rows, 3 status words, 1 Edit-sketch control on the 1 sketch row
 * and 0 on the others); the viewport is a drawn canvas rather than a cleared
 * one (`canvasContent`); every control clears 44px at both widths on a
 * student surface with no 24px relief; nothing scrolls sideways; and A DRAG
 * READS AT THE POINTER -- `readoutNearPointer` presses the top face's
 * projected centre and drags 80px, which is the one claim of the dimensional
 * surface no static check can make.
 *
 * THE TREE AT 375 IS A SLIDE-OVER behind the Tree toggle, so its rows are
 * present at both widths and visible only once the toggle is pressed. This
 * spec asserts the rows are PRESENT (`expectVisible: 0`, a floor of zero, so
 * the row says nothing about visibility) and keeps the viewport clear for the
 * drag; `ideacad-solid-state-tree.mjs` opens the tree and measures the rows,
 * their words, their tap targets and the parameter editor at both widths.
 */
export default {
	path: '/dev/ideacad-solid',
	label: 'IdeaCAD: the solid modeler with its design tree',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				await wait();
				if (s.model.bodies.length) return 'already built';
				const entities = [
					{ id: 'p1', type: 'point', x: 0, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 0 }, { id: 'p3', type: 'point', x: 4, y: 3 }, { id: 'p4', type: 'point', x: 0, y: 3 },
					{ id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' },
					{ id: 'c', type: 'point', x: 2, y: 1.5 }, { id: 'k', type: 'circle', center: 'c', radius: 0.6 }
				];
				await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Base sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities, constraints: [] } }, 'Draw sketch'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Plate', type: 'extrude', sketch: 'sk1', distance: 1, operation: 'new' } }, 'Extrude'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'ax1', name: 'Spin axis', type: 'axis', definition: { kind: 'datum', axis: 'Z' } } }, 'Add axis'); await wait();
				s.select({ bodyId: s.model.bodies[0].id, kind: 'face', id: s.model.bodies[0].faces.find((f) => f.id === 'ex1.end').id });
				s.fit();
				return s.model.bodies.length + ' bodies, ' + s.model.features.length + ' features';
			}`,
			until: '() => window.ideaCadSolid && window.ideaCadSolid.model.bodies.length === 1 && window.ideaCadSolid.model.features.length === 3 && !window.ideaCadSolid.busy',
			attempts: 3,
			gapMs: 500,
			waitMs: 600
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-feature-tree"]', label: 'the design tree (present; visibility is the tree-state spec)', expectPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'feature rows (3, present)', expectPresent: 3, maxPresent: 3, expectVisible: 0 },
		{ selector: '.solid-workspace canvas', label: 'the 3D viewport', expectPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace .tools', label: 'the tool palette', expectPresent: 1, expectVisible: 1 },
		/* The view control names every standard view in words; the sketch-plane select it replaced is gone (a plane is pressed, or picked, instead). */
		{ selector: '[data-testid="ideacad-view-controls"] .row button', label: 'the view control buttons, words not glyphs (at least Fit, Iso and Front before anything folds)', expectPresent: 3, expectVisible: 3 },
		{ selector: '.solid-workspace .view-tools select', label: 'the retired XY/XZ/YZ select, absent', expectPresent: 0 },
		/* The corner triad's slot, bottom-left; the world-origin axes it replaced are not in the DOM to count, so the pixels are canvasContent's. */
		{ selector: '[data-testid="ideacad-triad"]', label: 'the corner triad slot', expectPresent: 1, maxPresent: 1 },
		/* A part with features shows no start cue; the positive control is the empty-part state spec. */
		{ selector: '[data-testid="ideacad-empty-cue"]', label: 'the empty-part cue, absent once there are features', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-replay"]', label: 'the replay readout, drawn after the axis replayed (dev only)', expectPresent: 1 },
		/* No refusal is on screen after a clean build. Positive control: the tree above rendered. */
		{ selector: '.solid-workspace .error', label: 'the refusal banner, absent on a clean build', expectPresent: 0 }
	],
	textContains: [
		{ selector: '.solid-workspace footer', label: 'the footer counts', must: ['1 body', '3 features', 'inches'] }
	],
	contrast: [
		{ selector: '.solid-workspace footer span', label: 'the footer counts', min: 4.5 },
		{ selector: '.solid-workspace .right-tools button', label: 'a panel toggle', min: 4.5 }
	],
	/* A STUDENT SURFACE AT EVERY WIDTH: 44px, no 24px relief, and the palette's icon buttons are in the sweep. */
	tapTargets: [
		{ selector: '.solid-workspace header button, .solid-workspace .tools button, .solid-workspace .view-tools .row button, .solid-workspace .right-tools button', label: 'the workspace chrome: header, palette, view control and panel toggles', min: 44 }
	],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the 3D viewport' }],
	/* The work area only: the tree rail is a closed slide-over at 375 and its rows are zero-box by design there. */
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area chrome', reserved: null }],
	/* THE DRAG. Press the projected centre of the top face (selected by the
	   prepare step, so the select tool pushes it) and pull 80px: the readout
	   must float beside the pointer the whole way. */
	readoutNearPointer: [
		{
			label: 'a face push reads at the pointer',
			readoutSelector: '.solid-workspace .measure',
			fromEvaluate: '() => window.ideaCadSolid.project([2.8, 0.6, 1])',
			delta: { dx: 0, dy: -80 },
			steps: 6,
			maxPx: 40
		}
	],
	ignoreConsole: []
};
