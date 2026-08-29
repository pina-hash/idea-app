// original array position 1 of 25 -- see ../README.md for what `order` means
export const order = 1;

export default {
	path: '/dev/pathways',
	label: 'Pathway identity harness',
	/* The page mounts the REAL first-login picker, whose overlay covers the
	   surface underneath. "Not now" dismisses it, which is what a student
	   does, and is the state the chips below are meant to be read in. */
	prepare: [
		{
			click: 'button.pwp-later',
			until: '() => !document.querySelector(".pwp-overlay")'
		}
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		{ selector: 'span.pathway-chip', label: 'pathway chips', expectPresent: 6 },
		{ selector: '.chip-grid .chip-cell', label: 'one cell per pathway', expectPresent: 6 },
		{ selector: '.pwp-overlay', label: 'picker overlay (dismissed)', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'h1 on its plate', min: 4.5 },
		{ selector: '.harness p.note', label: 'note copy', min: 4.5 },
		{ selector: 'span.pathway-chip .pw-label', label: 'chip label on its fill', min: 4.5 }
	],
	tapTargets: [{ selector: '.harness .controls button', label: 'harness controls', min: 44 }]
};
