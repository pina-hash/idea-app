/**
 * THE DESIGN TREE HARNESS, `/dev/ideacad-tree`. Ledger 0296.
 *
 * The REAL `FeatureTree` over an in-memory workspace holding a motor bracket
 * (fourteen features: nine drawn at the top level, five sketches nested under
 * the features made from them), with the two optional members the real
 * workspace does not offer yet: hover links both ways and the rollback bar.
 * The rail is the workspace's own width, so the tree is measured in the room
 * it ships in, at every width.
 *
 * THE STATE MEASURED: the Cable guide pressed and its caret opened (a sweep
 * holds TWO sketches, its path and its profile), its row menu opened from the
 * "⋯" control, and the pointer standing on the Fillet 1 face in the stand-in
 * viewport, which lights the Fillet 1 row. The Cable guide's Move up is
 * refused, because moving it carries its path sketch past the plane that path
 * is built on: the reason under the entry is the reducer's own sentence.
 */
export default {
	path: '/dev/ideacad-tree',
	label: 'IdeaCAD: the design tree harness, a bracket with nested sketches, a row menu and the rollback bar',
	prepare: [
		{ waitFor: '() => !!window.ideaCadTree && !!document.querySelector(\'[data-testid="ideacad-feature-tree"] [data-row="sw"] > .line button.row\')', timeoutMs: 30000 },
		/* Light the Fillet 1 row from the stand-in viewport. */
		{ click: '.side .point button:first-child', until: '() => !!document.querySelector(\'[data-testid="ideacad-feature-tree"] li.linked[data-row="fil"]\')', attempts: 10, gapMs: 200 },
		{ click: '[data-testid="ideacad-feature-tree"] [data-row="sw"] > .line button.caret', until: '() => { const c = document.getElementById(\'ideacad-tree-children-sw\'); return !!c && !c.hidden; }', attempts: 10, gapMs: 200 },
		{ click: '[data-testid="ideacad-feature-tree"] [data-row="sw"] > .line button.row', until: '() => !!document.querySelector(\'[data-testid="ideacad-feature-tree"] [data-row="sw"] > .line button.row-more\')', attempts: 10, gapMs: 200 },
		{ click: '[data-testid="ideacad-feature-tree"] [data-row="sw"] > .line button.row-more', until: '() => !!document.querySelector(\'[data-testid="ideacad-feature-tree"] [role="menu"]\')', attempts: 10, gapMs: 200, waitMs: 300 }
	],
	presence: [
		/* Fourteen rows, eleven drawn: the three sketches under the plate, the upright and the holes are folded away until their carets are opened. */
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'feature rows, one per feature, nested ones included (14, 11 drawn)', expectPresent: 14, maxPresent: 14, expectVisible: 11, maxVisible: 11 },
		{ selector: '[data-testid="ideacad-feature-tree"] ol.children[hidden] > li', label: 'nested rows folded away under closed carets (3)', expectPresent: 3, maxPresent: 3, expectVisible: 0, maxVisible: 0 },
		{ selector: '[data-testid="ideacad-feature-tree"] ol[aria-label="Features in order"] > li', label: 'top-level rows (9)', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="ideacad-feature-tree"] button.caret', label: 'a caret on each row holding sketches (4)', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="ideacad-feature-tree"] #ideacad-tree-children-sw > li', label: "the sweep's path and profile, opened (2)", expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-feature-tree"] .refs > li', label: 'Front, Top and Right planes and the Origin (4)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		/* Quiet rows: a status word only on the two rows that are not fine (a lost edge, a suppressed chamfer). */
		{ selector: '[data-testid="ideacad-feature-tree"] .status', label: 'status words on the error and the suppressed row only (2)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="ideacad-feature-tree"] .message', label: "the lost fillet's sentence, on its own row (1)", expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] [role="menu"] [role="menuitem"]', label: "the sweep's menu (6)", expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="ideacad-feature-tree"] [role="menu"] [data-item="up"][aria-disabled="true"] .reason', label: "the refused Move up, with the reducer's reason under it (1)", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] li.linked', label: 'the row the pointer is over in the viewport, lit (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-rollback-bar"]', label: 'the rollback bar, drawn because this workspace can roll back (1)', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-feature-tree"] [role="menu"]', label: 'the refusal is the reducer\'s sentence', must: ['Guide path uses Plane 1, so it cannot move above it.'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-feature-tree"] .name', label: 'a row name', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] .summary', label: 'the number beside a name', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] .status', label: 'a status word', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] [role="menuitem"] .word', label: 'a menu entry', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] [role="menuitem"] .reason', label: "a refused entry's reason", min: 4.5 },
		{ selector: '[data-testid="ideacad-rollback-bar"] .word', label: 'the rollback bar\'s word', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-feature-tree"] button, [data-testid="ideacad-feature-tree"] input, [data-testid="ideacad-feature-tree"] select, [data-testid="ideacad-rollback-bar"]', label: 'every control in the tree, the menu and the rollback bar', min: 44 }
	],
	layoutSanity: [{ root: '.rail', label: 'the tree rail', reserved: null }],
	ignoreConsole: []
};
