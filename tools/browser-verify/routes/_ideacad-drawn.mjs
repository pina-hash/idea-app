/**
 * THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS, STATED ONCE FOR EVERY ROUTE
 * THAT MOUNTS THE BLADE EDITOR.
 *
 * `_`-prefixed, so `../routes.mjs` skips it when it reads this directory --
 * the same escape hatch `_shared.mjs` and `_theme-shared.mjs` use and the same
 * one a `+server.ts` uses for a non-route export.
 *
 * WHY A SHARED FRAGMENT RATHER THAN FOURTEEN COPIES. The editor is one
 * component mounted by fourteen route specs, and the pairs, the reserved region
 * and the canvas selector are properties of THAT COMPONENT rather than of any
 * one state. Fourteen copies is fourteen things to keep in step, which
 * CLAUDE.md's "do not duplicate a rule" is exactly about; this is the same
 * answer `SETTLE_ENTRANCE` already gives one directory over. A state that
 * genuinely differs overrides the key it needs and leaves the rest alone.
 *
 * WHICH ROUTES TAKE IT IS MEASURED, NOT ASSUMED. Every `/dev/ideacad*` spec was
 * driven at 1440 and asked for its own anchors before this file was written:
 * fourteen answer `.ideacad` 1, `canvas[data-testid="ideacad-canvas"]` 1,
 * `.status-bar` 1 and `.readouts .metric` 7, and the other eighteen -- the
 * archive, attach, shared and team panels, plus `ideacad-item-state-unavailable`
 * -- answer 0 to all four, because they mount a panel and not the editor. A
 * check pointed at an anchor that is not there is a red row nobody can fix, so
 * they do not take this.
 *
 * THE TWO SELECTORS THAT ARE MORE SPECIFIC THAN THEY LOOK, AND MEASURABLY HAVE
 * TO BE:
 *
 *  - `.status-bar .save`, never `.save`. There are TWO `.save` elements on an
 *    editor surface and the first in document order is
 *    `.header-status-compat`, the deliberately visually-hidden 1x1 duplicate at
 *    `BladeEditor.svelte:908`. `document.querySelector` takes the first, so a
 *    bare `.save` would compare the status word nobody can see and report NOT
 *    BOTH VISIBLE about a surface that is fine.
 *  - `.ideacad .eyebrow`, never `.eyebrow`. The `/dev/ideacad-item` harness
 *    draws an eyebrow of its own above the editor it mounts, so a bare
 *    selector measures the harness's chrome on six of the fourteen routes and
 *    the product's on the other eight -- two different claims wearing one name.
 */

/** The pairs that must read differently, and why each one is a pair at all. */
export const IDEACAD_PAIRS = [
	{
		/* The rail is the surface's only numeric readout, and a label that reads
		   identically to its own value is the defect this check is for: both
		   present, both visible, both clearing 4.5:1. Measured at 1440 they are
		   12px/400 Share Tech Mono against 16.8px/700 Rajdhani. */
		a: '.readouts .metric span',
		b: '.readouts .metric strong',
		label: 'a readout label against its own value',
		aLabel: 'the label',
		bLabel: 'the value'
	},
	{
		/* The status bar distinguishes on WEIGHT ALONE -- both sides are 12px
		   Share Tech Mono in the same ink, 400 against 600 -- which is the
		   narrowest real distinction on this surface and therefore the one a
		   restyle is likeliest to flatten without noticing. */
		a: '.status-bar span',
		b: '.status-bar strong',
		label: 'a status-bar label against its own value',
		aLabel: 'the label',
		bLabel: 'the value'
	},
	{
		/* And COLOUR ALONE: the eyebrow is teal and the saved-state word is ink,
		   at the same 12px/400. Measured 1.85:1 between them at 1440. */
		a: '.ideacad .eyebrow',
		b: '.status-bar .save',
		label: 'the IDEACAD eyebrow against the saved-state word',
		aLabel: 'the eyebrow',
		bLabel: 'the saved word'
	}
];

/** Spread into any spec that mounts the Blade editor. */
export const IDEACAD_DRAWN = {
	canvasContent: [
		{ selector: 'canvas[data-testid="ideacad-canvas"]', label: 'the 3D viewport' }
	],
	layoutSanity: [
		{
			label: 'the IdeaCAD console',
			/* SCOPED TO THE PRODUCT, NOT TO `.harness`. Six of these routes are
			   dev harnesses that mount the editor inside their own chrome, and a
			   finding about a harness control is a finding nobody will fix. */
			root: '.ideacad',
			reserved: '.status-bar',
			reservedLabel: 'the status bar'
		}
	],
	distinguishable: IDEACAD_PAIRS
};
