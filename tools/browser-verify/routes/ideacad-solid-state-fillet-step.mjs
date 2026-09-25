/**
 * A ROUND THAT LEAVES A FLAT STEP SAYS SO ON ITS ROW. Report R06, ledger 0298.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): a 4 x 3 x 1 plate and
 * one round of 0.2 in on its four top edges, the commonest round there is. The
 * vertical corner edges are left sharp, and at each of the four corners the
 * kernel builds a ball and closes it with a small flat face instead of blending
 * the two rounds into each other (measured in
 * `tests/ideacad-solid-fillet-corner.test.ts`). The round is BUILT: the row
 * carries a warning, not an error, and names the way to a smooth corner.
 *
 * What is measured: exactly one status word in the tree, on the round's row
 * (the Plate row is the quiet control); the warning sentence is on screen
 * under the row, whole, and reads at 4.5:1 on the tree's own ground; nothing
 * in the tree rail is covered. At 375 and 960 the tree is a slide-over behind
 * its toggle, which the evaluate presses when it is drawn, exactly as
 * `ideacad-solid-state-tree.mjs` does.
 */
export default {
	path: '/dev/ideacad-solid?state=fillet-step',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: a round on four top edges, warned that it leaves a flat step at each corner',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			evaluate: `async () => {
				const s = window.ideaCadSolid;
				const wait = async () => { for (let i = 0; i < 400 && s.busy; i++) await new Promise((r) => setTimeout(r, 25)); };
				await wait();
				if (s.model.features.some((f) => f.id === 'fl1')) return 'already built';
				const entities = [
					{ id: 'p1', type: 'point', x: 0, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 0 }, { id: 'p3', type: 'point', x: 4, y: 3 }, { id: 'p4', type: 'point', x: 0, y: 3 },
					{ id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' }
				];
				await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Base sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities, constraints: [] } }, 'Draw sketch'); await wait();
				await s.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Plate', type: 'extrude', sketch: 'sk1', distance: 1, operation: 'new' } }, 'Extrude'); await wait();
				const b = s.model.bodies[0];
				const edges = b.edges.filter((e) => e.faces.includes('ex1.end')).map((e) => ({ body: b.id, faces: e.faces, ordinal: e.ordinal, hint: { curve: e.curve, mid: e.mid, length: e.length } }));
				await s.apply({ type: 'add-feature', feature: { id: 'fl1', name: 'Round top', type: 'fillet', edges, radius: 0.2 } }, 'Fillet'); await wait();
				s.view('iso'); s.fit();
				return edges.length + ' edges rounded, row ' + s.model.features.find((f) => f.id === 'fl1').status;
			}`,
			until: '() => { const s = window.ideaCadSolid; return !!s && !s.busy && s.model.features.some((f) => f.id === "fl1" && f.status === "warning"); }',
			attempts: 3,
			gapMs: 500,
			waitMs: 400
		},
		{
			evaluate: `() => { const t = document.querySelector('.solid-workspace .tree-toggle'); const drawn = t && getComputedStyle(t).display !== 'none'; if (drawn && t.getAttribute('aria-expanded') !== 'true') t.click(); return drawn ? 'toggle pressed (phone)' : 'tree is the rail (no toggle drawn)'; }`,
			until: '() => { const m = document.querySelector(\'[data-testid="ideacad-feature-tree"] [data-row="fl1"] > p.message\'); if (!m) return false; const r = m.getBoundingClientRect(); return r.width > 0 && r.height > 0; }',
			attempts: 10,
			gapMs: 200,
			waitMs: 300
		}
	],
	presence: [
		/* Three features; the sketch is folded inside the Plate it makes, so two rows are on screen. */
		{ selector: '[data-testid="ideacad-feature-tree"] ol > li', label: 'feature rows: the Plate and the round on screen, the sketch folded inside the Plate (3 present, 2 visible)', expectPresent: 3, maxPresent: 3, expectVisible: 2, maxVisible: 2 },
		/* One status word in the whole tree, and it is the round's. The Plate row beside it is the quiet control. */
		{ selector: '[data-testid="ideacad-feature-tree"] .status', label: 'a status word anywhere in the tree (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] [data-row="fl1"] > .line .status', label: "the round's own status word", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-feature-tree"] [data-row="ex1"] > .line .status', label: 'a status word on the Plate, absent', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-feature-tree"] li.warning[data-row="fl1"] > p.message[role="status"]', label: 'the warning sentence under the round, as a status and not an alert', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* A warning is not a refusal: no one-click fix is offered, because the round was built. */
		{ selector: '[data-testid="ideacad-tree-fix"]', label: 'a refusal fix, absent', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-feature-tree"] [data-row="fl1"] > .line .status', label: 'the status word', must: ['Warning'], mustNot: ['Error'] },
		{ selector: '[data-testid="ideacad-feature-tree"] [data-row="fl1"] > p.message', label: 'the whole sentence, in words and with the way forward', must: ['At 4 corners this round meets edges left sharp, and IdeaCAD cannot blend them yet, so it leaves a small flat step at each. Add those sharp edges to this round for smooth corners.'], mustNot: ['kernel', 'vertex blend', 'Id('] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-feature-tree"] li.warning > p.message', label: 'the warning sentence', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-tree"] [data-row="fl1"] > .line .status', label: 'the status word', min: 4.5 }
	],
	layoutSanity: [{ root: '.solid-workspace .tree-rail', label: 'the tree rail, with the warning sentence under the round', reserved: null }],
	ignoreConsole: []
};
