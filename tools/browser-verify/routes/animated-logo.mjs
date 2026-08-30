// original array position 12 of 25 -- see ../README.md for what `order` means
export const order = 12;

export default {
	path: '/dev/animated-logo',
	label: 'Animated emblem harness',
	presence: [
		/* A DELIBERATE FLOOR, and the only one left on this route: the claim is
		   "the page has copy on it", not a headcount of paragraphs (measured 3). */
		{ selector: 'h1, .note', label: 'page copy (floor: at least one heading or note)', expectPresent: 1 },
		/* The emblem is img-based, not an svg. FOUR MOUNTS, MEASURED -- this
		   read `expectPresent: 1` and was passing on 4, so the harness's own
		   fixture could have lost three of them without a word. */
		{ selector: '.idea-logo', label: 'emblem roots (4 mounts)', expectPresent: 4, maxPresent: 4 },
		{ selector: '.idea-logo img.gear', label: 'emblem gear layer (one per mount)', expectPresent: 4, maxPresent: 4 }
	],
	contrast: [{ selector: '.note', label: 'note copy on its plate', min: 4.5 }],
	tapTargets: [{ selector: '.sfb-trigger', label: 'site feedback trigger', min: 44 }]
};
