/**
 * Classroom image box geometry -- the four blank-space mechanisms.
 *
 * NO NUMBER IS RETYPED HERE. The harness computes every measurement from the
 * fixtures' own intrinsic sizes and the real rendered layout, and this spec
 * asserts its VERDICTS. `expected` is therefore a list of "ok" strings whose
 * labels come from the page: a probe that stops existing changes the array
 * length and fails, rather than silently reducing what was checked.
 *
 * The raw table is printed by the `evaluate` prepare step so a passing run
 * still hands the next reader the actual pixel widths.
 */
export default {
	path: '/dev/classroom-images',
	label: 'Classroom image box geometry',
	prepare: [
		/* Nothing is measurable until every fixture has decoded: an undecoded
		   img reads naturalWidth 0, from which a fitted content box computes as
		   zero and a blank strip of zero -- a vacuous pass. */
		{ waitFor: '() => document.documentElement.hasAttribute("data-fixtures-ready")' },
		{ evaluate: '() => JSON.stringify(window.__imgBoxes(), null, 1)' },
		{ evaluate: '() => JSON.stringify(window.__imgGrids())' }
	],
	orderResult: [
		{
			label: 'no painted blank beside any image, no upscaled diagram, no empty grid track',
			evaluate: '() => window.__imgVerdicts()',
			/* 16 probes x blank, plus the four diagram upscale rows, plus three
			   grids. Written out so a probe that disappears is a failure. */
			expected: [
				'zone-portrait blank ok',
				'zone-landscape blank ok',
				'zone-square blank ok',
				'zone-diagram blank ok',
				'attach-portrait blank ok',
				'attach-landscape blank ok',
				'attach-square blank ok',
				'attach-diagram blank ok',
				'submission-portrait blank ok',
				'submission-landscape blank ok',
				'submission-square blank ok',
				'submission-diagram blank ok',
				'figure-portrait blank ok',
				'figure-landscape blank ok',
				'figure-square blank ok',
				'figure-diagram blank ok',
				'zone-diagram upscale ok',
				'attach-diagram upscale ok',
				'submission-diagram upscale ok',
				'figure-diagram upscale ok',
				'zone-edit void ok',
				'zone-two void ok',
				'zone-readonly void ok',
				'my-classes void ok'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'classroom room mounted', expectPresent: 1 },
		/* EVERY fixture rendered as a real thumbnail. 16 single-shape probes plus
		   the four-file zone mounts and the whole-document prose block. A floor
		   alone would pass over an empty page (`expectPresent` is a minimum), so
		   the count is pinned by the verdict row above, which fails on a missing
		   probe rather than on a smaller number. */
		{ selector: '[data-probe] img', label: 'probe thumbnails', expectPresent: 16, expectVisible: 16 },
		/* The refusal path still renders: a marker, and NOT an img for the file
		   that is not attached. The prose block holds four resolvable figures and
		   one refusal, so five figures and four images is the shape that proves
		   the refusal is refused rather than merely absent. */
		{ selector: '[data-refusal] .md-figure', label: 'figures in the prose block', expectPresent: 5 },
		{ selector: '[data-refusal] .md-figure-marker', label: 'refusal marker', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-refusal] .md-figure img', label: 'resolved figures in the prose block', expectPresent: 4 }
	],
	contrast: [{ selector: '.harness > h1', label: 'h1 on the classroom plate', min: 4.5 }],
	/* `.attach-name` is a `.tap-reach-44` control: its own box is the filename's
	   22.5px line and the 44px target is a pseudo-element hit area, so it is
	   measured by HIT TEST rather than by reading its height (CLAUDE.md's rule,
	   and the comment in AttachmentList.svelte beside the class). */
	tapReach: [{ selector: '.attach-list a.attach-name', label: 'attachment filename links', min: 44 }]
};
