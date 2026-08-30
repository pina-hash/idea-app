import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/navigation-room-nb',
	label: 'The pending primitive on all three notebook plates (.nb-root)',
	widths: WIDTHS,
	/*
		THE ROOM WITH THE RECORD. `SaveIndicator` measured 3.65:1 here and
		`VersionBadge` 3.20:1, both on plates nobody had put them on. `Pending`
		reads `var(--pending-ink, var(--text-2))`, and `.nb-root` aliases
		`--text-2` onto its own per-plate `--nb-ink-soft`, so the hook is doing
		the work -- but "the hook is doing the work" is a claim about three
		plates, and this is what checks it on all three rather than on the one
		that was convenient.

		THREE WRAPPERS ON ONE PAGE IS SAFE HERE and is not safe for the room
		itself: the canvas mirror keys on the plate ATTRIBUTE, so three wrappers
		repaint one canvas three ways -- but every label below sits on its OWN
		wrapper's `--nb-surface` card, which is the ground it lands on in
		`ReviewConsole`, `DocumentationCheck` and `AdminLogPanel`. The body
		ground is not what is being measured. The ROOM still needed its own route
		away from `/dev/navigation` for exactly the reason the classroom one did.

		`contrast` REPORTS THE WORST MATCH, so one unanchored `.pending` selector
		would collapse all three plates into a single number and the two rows
		after it would be duplicates. Each row is anchored at its own plate.
	*/
	presence: [
		{ selector: '[data-testid="nb-room"].nb-root', label: 'three notebook plates mounted', expectPresent: 3, maxPresent: 3, expectVisible: 3, maxVisible: 3 },
		{ selector: '.pending', label: 'two mounts per plate, six in all', expectPresent: 6, maxPresent: 6, expectVisible: 6, maxVisible: 6 }
	],
	contrast: [
		{ selector: '.nb-root:not([data-nb-theme]) .card .pending', label: 'pending label, DEFAULT plate (console register)', min: 4.5 },
		{ selector: '.nb-root[data-nb-theme="light"] .card .pending', label: 'pending label, LIGHT plate (paper)', min: 4.5 },
		{ selector: '.nb-root[data-nb-theme="idea"] .card .pending', label: 'pending label, IDEA plate (green)', min: 4.5 }
	]
};
