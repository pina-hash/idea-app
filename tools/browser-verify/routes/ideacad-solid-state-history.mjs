/**
 * THE HISTORY SLIDER AND THE ROLLBACK BAR, IN THE WORKSPACE. Ledger 0296, stage
 * W3.
 *
 * Measures a STATE of `/dev/ideacad-solid` (`aliasOf`): a four-feature part (a
 * sketch, the Plate extruded from it, a sketch on the Plate's top, the Boss
 * extruded from that), then the history slider along the bottom pressed back
 * to step 2 (the Plate alone, drawn from the meshes kept after one replay, no
 * kernel asked) and "Roll back here" pressed, so the rollback bar stands after
 * the Plate and the Boss rows are drawn rolled back.
 *
 * WHAT EACH COUNT SAYS. The slider is one group with Start, Back, Play, Next,
 * Stop, the scrubber and the speed: seven controls, every one 44px at both
 * widths. After "Roll back here" the button is gone (the step on screen IS the
 * bar), the bar exists once, and the two Boss rows (the sketch nested under
 * the Boss, and the Boss) are the rolled-back ones. The manifest keeps all four
 * features: the bar is where the student is looking, never an edit.
 *
 * THE SLIDER IS ITS OWN GRID ROW between the work area and the footer, so the
 * layout sweep over the section asks that nothing in it overlaps and nothing
 * sits outside the document.
 */
export default {
	path: '/dev/ideacad-solid?state=history',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the history slider and the rollback bar, rolled back to the second step',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				await wait();
				if (s.model.features.length) return 'already built';
				const rect = (x0, y0, w, h) => [{ id: 'p0', type: 'point', x: x0, y: y0 }, { id: 'p1', type: 'point', x: x0 + w, y: y0 }, { id: 'p2', type: 'point', x: x0 + w, y: y0 + h }, { id: 'p3', type: 'point', x: x0, y: y0 + h }, { id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }];
				await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Base sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: rect(-2, -1.5, 4, 3), constraints: [] } }, 'Draw sketch'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Plate', type: 'extrude', sketch: 'sk1', distance: 0.5, operation: 'new' } }, 'Extrude'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'sk2', name: 'Boss sketch', type: 'sketch', plane: { kind: 'face', face: { body: 'ex1#0', name: 'ex1.end' } }, entities: rect(-0.5, -0.5, 1, 1), constraints: [] } }, 'Draw sketch'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'ex2', name: 'Boss', type: 'extrude', sketch: 'sk2', distance: 1, operation: 'add', target: 'ex1#0' } }, 'Extrude'); await wait();
				s.fit();
				return s.model.features.length + ' features';
			}`,
			until: '() => window.ideaCadSolid && window.ideaCadSolid.model.features.length === 4 && !window.ideaCadSolid.busy',
			attempts: 3,
			gapMs: 500,
			waitMs: 400
		},
		/* Back twice: step 3, then step 2, drawn from the kept meshes. */
		{ click: '[data-testid="ideacad-history-slider"] [data-control="back"]', until: '() => { const o = document.querySelector(\'[data-testid="ideacad-history-slider"] .count\'); return !!o && o.textContent.trim().startsWith(\'3\'); }', attempts: 10, gapMs: 250, waitMs: 200 },
		{ click: '[data-testid="ideacad-history-slider"] [data-control="back"]', until: '() => { const o = document.querySelector(\'[data-testid="ideacad-history-slider"] .count\'); return !!o && o.textContent.trim().startsWith(\'2\') && window.ideaCadSolid.drawn().faces === 6; }', attempts: 10, gapMs: 250, waitMs: 200 },
		/* Roll back here: the bar stands after the Plate. */
		{ click: '[data-testid="ideacad-rollback-here"]', until: '() => window.ideaCadSolid.model.rollbackIndex === 2 && !window.ideaCadSolid.busy', attempts: 10, gapMs: 250, waitMs: 300 },
		{
			evaluate: `() => { const t = document.querySelector('.solid-workspace .tree-toggle'); const drawn = t && getComputedStyle(t).display !== 'none'; if (drawn && t.getAttribute('aria-expanded') !== 'true') t.click(); return drawn ? 'toggle pressed (phone)' : 'tree is the rail (no toggle drawn)'; }`,
			until: '() => { const bar = document.querySelector(\'[data-testid="ideacad-rollback-bar"]\'); if (!bar) return false; const r = bar.getBoundingClientRect(); return r.width > 0 && r.height > 0; }',
			attempts: 10,
			gapMs: 200,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-history-slider"]', label: 'the history slider (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-history-slider"] button, [data-testid="ideacad-history-slider"] input, [data-testid="ideacad-history-slider"] select', label: 'Start, Back, Play, Next, Stop, the scrubber and the speed (7)', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="ideacad-rollback-here"]', label: 'Roll back here, gone once the bar stands at the step on screen (0)', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-rollback-bar"]', label: 'the rollback bar in the tree (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Two rolled-back rows, the Boss and the sketch folded inside it; the fold is closed, so one is on screen. */
		{ selector: '[data-testid="ideacad-feature-tree"] li.rolled-back', label: 'the Boss and its folded sketch, drawn rolled back (2, 1 on screen)', expectPresent: 2, maxPresent: 2, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-history-slider"]', label: 'the slider says which step is showing and what it is', must: ['2 / 4', 'Plate', 'Start', 'Play', 'Stop'], mustNot: ['Error'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-history-slider"] .count', label: 'the step count', min: 4.5 },
		{ selector: '[data-testid="ideacad-history-slider"] .ctl span', label: 'a slider control word', min: 4.5 }
	],
	/* A STUDENT SURFACE AT EVERY WIDTH: 44px, no 24px relief. */
	tapTargets: [
		{ selector: '[data-testid="ideacad-history-slider"] button, [data-testid="ideacad-history-slider"] select, [data-testid="ideacad-rollback-bar"]', label: 'the slider controls and the rollback bar', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .history-bar', label: 'the history bar', reserved: null }],
	ignoreConsole: []
};
