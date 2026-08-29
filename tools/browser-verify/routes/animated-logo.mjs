// original array position 12 of 25 -- see ../README.md for what `order` means
export const order = 12;

export default {
	path: '/dev/animated-logo',
	label: 'Animated emblem harness',
	presence: [
		{ selector: 'h1, .note', label: 'page copy', expectPresent: 1 },
		/* The emblem is img-based, not an svg. */
		{ selector: '.idea-logo', label: 'emblem roots', expectPresent: 1 },
		{ selector: '.idea-logo img.gear', label: 'emblem gear layer', expectPresent: 1 }
	],
	contrast: [{ selector: '.note', label: 'note copy on its plate', min: 4.5 }],
	tapTargets: [{ selector: '.sfb-trigger', label: 'site feedback trigger', min: 44 }]
};
