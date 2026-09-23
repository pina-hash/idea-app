/**
 * THE FILLET PANEL, WITH A ROUND THAT DID NOT FIT. Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): the 2 x 2 x 1 box
 * "Start from a box" makes, the Fillet tool, the top front edge picked, and a
 * 3 in radius typed and pressed. The kernel refuses it; the row keeps the 3 in
 * the student typed and the panel says, in words, that the largest that fits
 * is 0.999 in (the box is 1 in tall), with one button that uses it.
 *
 * What is measured: the panel carries labels, values and the refusal's own
 * sentence and NOT the instruction prose it used to open with (`mustNot`);
 * the kernel's own text ("blend cliff", "Id(") reaches no student; the edge
 * sets one pick grows into are offered as buttons; every control clears
 * 44 px; nothing in the panel column is covered. Run it at 960 as well
 * (`--width 960`): half of a 1920 screen is where the column meets the
 * view controls.
 */
/** Every operable control, less the ones inside a CLOSED disclosure, which is folded away on purpose and asserted present-but-not-visible above. */
const INTERACTIVE_SHOWN = 'button, a[href], input:not(.disc-body[data-open="false"] input), select:not(.disc-body[data-open="false"] select), textarea, summary, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])';
export default {
	path: '/dev/ideacad-solid?state=fillet',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the fillet panel, a refused round offering the largest radius that fits',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: '() => window.ideaCadSolid.model.bodies.length === 1 && !window.ideaCadSolid.busy', attempts: 10, gapMs: 300 },
		{
			evaluate: `() => {
				const s = window.ideaCadSolid, b = s.model.bodies[0];
				const e = b.edges.find((x) => Math.abs(x.mid[1] + 1) < 1e-6 && Math.abs(x.mid[2] - 1) < 1e-6);
				s.setTool('fillet'); s.select({ bodyId: b.id, kind: 'edge', id: e.id });
				return e.id;
			}`,
			until: '() => !!document.querySelector(\'[data-testid="ideacad-edge-sets"]\')'
		},
		{
			evaluate: `() => {
				const box = document.querySelector('[data-testid="ideacad-fillet-radius"]');
				box.value = '3'; box.dispatchEvent(new Event('input', { bubbles: true }));
				document.querySelector('[data-testid="ideacad-fillet-apply"]').click();
				return 'pressed';
			}`,
			until: '() => !!document.querySelector(\'[data-testid="ideacad-blend-fix"]\') && !window.ideaCadSolid.busy',
			attempts: 20,
			gapMs: 400
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-feature-panel"][data-mode="fillet"]', label: 'the fillet panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-edge-sets"] button', label: 'the edge sets one pick grows into: Loop and All on a box', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-blend-refusal"]', label: 'the refused round, beside its way forward', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-blend-fix"]', label: 'the one-click largest radius that fits', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-fillet-variable-end"]', label: 'variable radius, folded away until asked for', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
		/* The design tree's refused row offers the same way forward. The tree is always mounted and is a slide-over below 1024px, so only its presence is width-independent; at 1440 it measured 102.5x44 with 13px from its text to each side (round 2 merge). */
		{ selector: '[data-testid="ideacad-tree-fix"]', label: 'the refused row in the tree, offering the same largest radius', expectPresent: 1, maxPresent: 1, expectVisible: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-feature-panel"]', label: 'labels, values and the refusal in words, and none of the instructions or kernel text', must: ['1 edge', 'Radius', 'Tangent propagation', 'Variable radius', 'That radius is too big for this edge. The largest that fits here is 0.999 in.', 'Use 0.999 in'], mustNot: ['Shift-click', 'drag any selected edge', 'Propagate along tangent edges', 'blend cliff', 'Id(', 'available radius'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-blend-refusal"] p', label: 'the refusal sentence and the name above it', min: 4.5 },
		{ selector: '[data-testid="ideacad-feature-picks"] .count', label: 'the pick count', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-feature-panel"] button, [data-testid="ideacad-feature-panel"] label.toggle, [data-testid="ideacad-feature-panel"] input', label: 'every fillet control, measured at its box', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .panels', label: 'the panel column with the fillet panel open', reserved: null, interactive: INTERACTIVE_SHOWN }],
	ignoreConsole: []
};
