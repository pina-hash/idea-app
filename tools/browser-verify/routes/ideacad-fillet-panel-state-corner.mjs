/**
 * THE FILLET PANEL'S WAYS FORWARD, FROM A REAL REFUSAL. Ledger 0296.
 *
 * `/dev/ideacad-fillet-panel?state=corner` mounts the REAL `FeaturePanel`
 * over rows and `help` recorded from the real engine and kernel: three top
 * edges of a box, rounded at 0.2 in beside a 0.999 in round they run into.
 * The row's sentence names the two edges that run into the round, the first
 * button leaves them out (and makes the size asked for), and the tiny size
 * that would fit is offered second rather than as the headline.
 *
 * It exists because the modeler's own route shows a refusal's `help` only once
 * the engine carries it onto the feature row (a request to the single
 * writer); this is the state that request unlocks, measured now.
 */
/** Every operable control, less the ones inside a CLOSED disclosure, which is folded away on purpose and asserted present-but-not-visible above. */
const INTERACTIVE_SHOWN = 'button, a[href], input:not(.disc-body[data-open="false"] input), select:not(.disc-body[data-open="false"] select), textarea, summary, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])';
export default {
	path: '/dev/ideacad-fillet-panel?state=corner',
	label: 'IdeaCAD: a refused round with two ways forward, from a real kernel refusal',
	prepare: [{ waitFor: '() => document.querySelector(\'[data-testid="ideacad-fillet-harness"]\')?.dataset.ready === "true" && !!document.querySelector(\'[data-testid="ideacad-blend-refusal"]\')' }],
	presence: [
		{ selector: '[data-testid="ideacad-blend-refusal"]', label: 'the refused round', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-blend-fix"]', label: 'the first way forward', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-blend-fix-other"]', label: 'the second way forward', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-blend-detail"]', label: 'the kernel text, a development detail', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-blend-refusal"]', label: 'the sentence names the edges and the round, and the buttons say what they do', must: ['Fillet 2', '2 of these edges run into the round from Fillet 1', 'Leave out 2 edges', 'Use 0.00881 in'], mustNot: ['Shift-click'] },
		/* The kernel's own text is in the DEVELOPMENT detail below the buttons (this harness is a dev page); the sentence a student reads carries none of it. */
		{ selector: '[data-testid="ideacad-blend-refusal"] p:last-of-type', label: 'the student sentence, apart from the development detail', must: ['2 of these edges run into the round from Fillet 1'], mustNot: ['stripes meet', 'Id(', 'vertex blend'] }
	],
	contrast: [{ selector: '[data-testid="ideacad-blend-refusal"] p', label: 'the refusal sentence and the name above it', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="ideacad-feature-panel"] button, [data-testid="ideacad-feature-panel"] label.toggle, [data-testid="ideacad-feature-panel"] input', label: 'every control in the panel', min: 44 }],
	layoutSanity: [{ root: '[data-testid="ideacad-fillet-harness"] .column', label: 'the panel column', reserved: null, interactive: INTERACTIVE_SHOWN }],
	ignoreConsole: []
};
