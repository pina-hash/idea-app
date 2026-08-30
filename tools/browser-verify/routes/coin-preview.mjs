/**
 * The coin desk's read-only student preview, in the room it ships in.
 *
 * `/coin-desk/preview/+page.svelte` mounts `<StudentPreview {data} />` bare and
 * nothing else; the room comes from `/coin-desk/+layout.svelte`, which wraps
 * every area in `.cd-root` and imports `$lib/shell/split.css`. The harness gave
 * it no room at all until this spec's bundle, so every reading anyone had ever
 * taken here was of the portal plate with the split geometry missing.
 *
 * THE ABSENCE ASSERTIONS ARE THE POINT OF THE SURFACE. A preview reveals
 * nothing the caller could not already read and mutates nothing, and in this
 * codebase read-only is STRUCTURAL -- the transports that would write are not
 * handed in, so there is no write to execute. `maxVisible: 0` is the ceiling
 * `expectVisible` cannot express, and CLAUDE.md requires both directions: the
 * positive control is the `preview-body` row above them, which is what says the
 * page rendered a student's view at all rather than an empty shell that
 * trivially contains no controls.
 */
export default {
	path: '/dev/coin-preview',
	label: 'Coin desk student preview (.cd-root)',
	presence: [
		{ selector: '.cd-root .preview-banner', label: 'preview-mode banner', expectPresent: 1 },
		{ selector: '.cd-root .preview-body', label: 'the student view itself', expectPresent: 1 },
		/* The room, asserted as a mount rather than assumed from the markup: if
		   `split.css` stopped being imported, `.cd-root` would still be in the
		   DOM and every number here would quietly be the portal's again. */
		{ selector: '.cd-root', label: 'the coin desk room', expectPresent: 1 },
		{ selector: '.cd-root .preview-body form', label: 'no forms in a read-only view', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root .preview-body input[type="file"]', label: 'no file inputs', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [
		{ selector: '.cd-root .preview-banner .text', label: 'banner copy on its fill', min: 4.5 },
		{ selector: '.cd-root .preview-picker label', label: 'picker label on the room plate', min: 4.5 }
	],
	tapTargets: [{ selector: '.cd-root .preview-picker select', label: 'student picker', min: 44 }]
};
