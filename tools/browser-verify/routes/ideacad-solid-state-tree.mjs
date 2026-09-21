/**
 * THE DESIGN TREE, OPEN, AT BOTH WIDTHS. Ledger 0273.
 *
 * Measures a different STATE of `/dev/ideacad-solid` (`aliasOf`): the same
 * three-feature model, with the tree open (at 375 it is a slide-over behind
 * the Tree toggle; at 1440 it is the left rail and the toggle is not drawn)
 * and the Plate row pressed, so the parameter editor is on screen. Every row
 * here is about the tree; the viewport and the drag are `ideacad-solid.mjs`'s.
 *
 * WHY THE TOGGLE STEP IS AN `evaluate` AND NOT A `click`. At 1440 there is
 * no toggle to press and the tree is already visible, so a `click` step would
 * report "0 matched" and read as a defect on a width where nothing is wrong.
 * The evaluate presses the toggle when it is drawn and its `until` asks the
 * one question that matters at both widths: are the rows visible.
 */
export default {
	path: '/dev/ideacad-solid?state=tree',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the design tree, open, with a feature selected',
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
				s.fit();
				return s.model.bodies.length + ' bodies, ' + s.model.features.length + ' features';
			}`,
			until: '() => window.ideaCadSolid && window.ideaCadSolid.model.bodies.length === 1 && window.ideaCadSolid.model.features.length === 3 && !window.ideaCadSolid.busy',
			attempts: 3,
			gapMs: 500,
			waitMs: 400
		},
		{
			evaluate: `() => { const t = document.querySelector('.solid-workspace .tree-toggle'); const drawn = t && getComputedStyle(t).display !== 'none'; if (drawn && t.getAttribute('aria-expanded') !== 'true') t.click(); return drawn ? 'toggle pressed (phone)' : 'tree is the rail (no toggle drawn)'; }`,
			until: '() => { const row = document.querySelector(\'[data-testid="ideacad-feature-tree"] ol > li button.row\'); if (!row) return false; const r = row.getBoundingClientRect(); return r.width > 0 && r.height > 0; }',
			attempts: 10,
			gapMs: 200,
			waitMs: 300
		},
		/* Press the Plate row: the parameter editor opens for it and its body is selected. */
		{ click: '[data-testid="ideacad-feature-tree"] ol > li:nth-child(2) button.row', until: '() => !!document.querySelector(\'[data-testid="ideacad-feature-params"]\')', attempts: 10, gapMs: 200, waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-feature-tree"]', label: 'the design tree', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'feature rows (3)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/* A status WORD beside every glyph: three rows, three words. Colour is never the only signal. */
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li .status', label: 'status words, one per row (3)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/* The one sketch row carries the one Edit-sketch control; the extrude and the axis carry none. */
		{ selector: '[data-testid="ideacad-feature-tree"] .edit-sketch', label: 'the Edit sketch control, on the sketch row only (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-params"]', label: 'the parameter editor for the selected feature', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-param-distance"]', label: 'the extrude distance field, editable', expectPresent: 1, expectVisible: 1 },
		/* No row carries an error message on a clean build; the three status words above are the positive control. */
		{ selector: '[data-testid="ideacad-feature-tree"] .message', label: 'a feature message, absent on a clean build', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-feature-tree"]', label: 'the tree names its rows and their status', must: ['Base sketch', 'Plate', 'Spin axis', 'OK'], mustNot: ['Error'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-feature-tree"] .name', label: 'a feature name in the tree', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] .status', label: 'a status word in the tree', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] .summary', label: 'the number beside a feature name', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-params"] .label', label: 'a parameter label', min: 4.5 }
	],
	/* A STUDENT SURFACE AT EVERY WIDTH: 44px, no 24px relief. */
	tapTargets: [
		{ selector: '[data-testid="ideacad-feature-tree"] button, [data-testid="ideacad-feature-tree"] input', label: 'the design tree rows, their controls and the parameter fields', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .tree-rail', label: 'the tree rail', reserved: null }],
	ignoreConsole: []
};
