/**
 * THE DESIGN TREE, OPEN, AT EVERY WIDTH. Ledger 0273; rebuilt SolidWorks-shaped
 * in ledger 0296.
 *
 * Measures a different STATE of `/dev/ideacad-solid` (`aliasOf`): the same
 * three-feature model (a sketch, the Plate extruded from it, a datum axis),
 * with the tree open (at 375 and 960 it is a slide-over behind the Tree toggle;
 * at 1440 it is the left rail and the toggle is not drawn), the Plate's caret
 * opened so its nested sketch shows, the Plate row pressed so the parameter
 * editor is on screen, and the Plate's row menu opened from its "⋯" control.
 * Every row here is about the tree; the viewport and the drag are
 * `ideacad-solid.mjs`'s.
 *
 * WHAT CHANGED IN 0296, AND WHY EACH COUNT READS AS IT DOES. The sketch the
 * Plate is made from is drawn INSIDE the Plate's row, so the feature list
 * holds two top-level rows and one nested one: `ol > li` is still three, one
 * per feature, which is the rule `ideacad-solid.mjs` pins. The reference rows
 * (Front, Top and Right planes and the Origin) are a separate list above it
 * and are not features. A quiet row carries no status word, so on a clean
 * build there are NONE; the three rows are the positive control. A row's
 * actions are one menu, and the Plate's (an extrude at the top of the tree
 * with a dependent) offers six entries.
 *
 * WHY THE TOGGLE STEP IS AN `evaluate` AND NOT A `click`. At 1440 there is
 * no toggle to press and the tree is already visible, so a `click` step would
 * report "0 matched" and read as a defect on a width where nothing is wrong.
 * The evaluate presses the toggle when it is drawn and its `until` asks the
 * one question that matters at every width: are the rows visible.
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
		/* Open the Plate's caret: its sketch is drawn under it. */
		{ click: '[data-testid="ideacad-feature-tree"] [data-row="ex1"] > .line button.caret', until: '() => { const c = document.getElementById(\'ideacad-tree-children-ex1\'); return !!c && !c.hidden; }', attempts: 10, gapMs: 200, waitMs: 200 },
		/* Press the Plate row: the parameter editor opens for it and its body is selected. */
		{ click: '[data-testid="ideacad-feature-tree"] [data-row="ex1"] > .line button.row', until: '() => !!document.querySelector(\'[data-testid="ideacad-feature-params"]\')', attempts: 10, gapMs: 200, waitMs: 300 },
		/* Open the Plate's row menu from its "⋯" control. */
		{ click: '[data-testid="ideacad-feature-tree"] [data-row="ex1"] > .line button.row-more', until: '() => !!document.querySelector(\'[data-testid="ideacad-context-menu"]\')', attempts: 10, gapMs: 200, waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-feature-tree"]', label: 'the design tree', expectPresent: 1, expectVisible: 1 },
		/* One li per feature, the nested sketch included; the caret opened it, so all three are visible. */
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'feature rows, one per feature, the nested sketch included (3)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="ideacad-feature-tree"] ol.children > li[data-row="sk1"]', label: 'the sketch, drawn inside the Plate that is made from it (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] button.caret', label: 'one caret, on the one row with a nested sketch (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The reference geometry every part has, above the features and not counted as features. */
		{ selector: '[data-testid="ideacad-feature-tree"] .refs > li', label: 'Front, Top and Right planes and the Origin (4)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="ideacad-feature-tree"] .refs button.eye', label: 'an eye on every reference row (4)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		/* A quiet row: no status word on a clean build. The three visible rows above are the positive control. */
		{ selector: '[data-testid="ideacad-feature-tree"] .status', label: 'a status word, absent on a clean build', expectPresent: 0 },
		/* The selected row's one menu control, and no other row's. */
		{ selector: '[data-testid="ideacad-feature-tree"] button.row-more', label: 'the menu control, on the selected row only (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The row's menu is the workspace's one right-click menu, the same one the viewport opens. */
		{ selector: '[data-testid="ideacad-context-menu"] [role="menuitem"]', label: "the Plate's menu: parameters, rename, suppress, up, down, delete (6)", expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		/* The flat tree's written-out action buttons and their reasons are gone. */
		{ selector: '[data-testid="ideacad-feature-tree"] .actions, [data-testid="ideacad-feature-tree"] .edit-sketch', label: 'the old per-row action buttons, absent', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-feature-params"]', label: 'the parameter editor for the selected feature', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-param-distance"]', label: 'the extrude distance field, editable', expectPresent: 1, expectVisible: 1 },
		/* No row carries an error message on a clean build; the rows above are the positive control. */
		{ selector: '[data-testid="ideacad-feature-tree"] .message', label: 'a feature message, absent on a clean build', expectPresent: 0 },
		/* This workspace cannot roll back yet, so there is no bar at all: presence of a transport is presence of a control. */
		/* The workspace rolls back (ledger 0296, stage W3), so the tree draws its bar. */
		{ selector: '[data-testid="ideacad-rollback-bar"]', label: 'the rollback bar, at the end of the tree (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-feature-tree"]', label: 'the tree names its planes and its rows, and says nothing about rows that are fine', must: ['Front Plane', 'Top Plane', 'Right Plane', 'Origin', 'Base sketch', 'Plate', 'Spin axis'], mustNot: ['Error', 'Draw a shape'] },
		{ selector: '[data-testid="ideacad-context-menu"]', label: "the Plate's menu names its moves and its delete", must: ['Move up', 'Delete'], mustNot: [] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-feature-tree"] .name', label: 'a feature or plane name in the tree', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] .summary', label: 'the number beside a feature name', min: 4.5 },
		{ selector: '[data-testid="ideacad-context-menu"] [role="menuitem"] .label', label: 'a menu entry', min: 4.5 },
		{ selector: '[data-testid="ideacad-context-menu"] [role="menuitem"] .label small', label: "a refused menu entry's reason", min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-params"] .label', label: 'a parameter label', min: 4.5 }
	],
	/* A STUDENT SURFACE AT EVERY WIDTH: 44px, no 24px relief. */
	tapTargets: [
		{ selector: '[data-testid="ideacad-feature-tree"] button, [data-testid="ideacad-feature-tree"] input, [data-testid="ideacad-feature-tree"] select, [data-testid="ideacad-context-menu"] button', label: 'the design tree rows, carets, eyes, menu, its entries and the parameter fields', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .tree-rail', label: 'the tree rail', reserved: null }],
	ignoreConsole: []
};
