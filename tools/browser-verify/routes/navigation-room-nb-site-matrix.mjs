import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/navigation-room-nb?site=matrix',
	label: 'The pending primitive in the notebook room under Matrix (.nb-root in .cr-root)',
	widths: WIDTHS,
	/*
		THE ROOM WITH THE RECORD. `SaveIndicator` measured 3.65:1 here and
		`VersionBadge` 3.20:1, both on grounds nobody had put them on. `Pending`
		reads `var(--pending-ink, var(--text-2))`, and the room's `--text-2` is
		the SITE theme's own now, so "the hook is doing the work" is a claim
		about every site theme, checked here on each.

		GENERALIZED (ledger 0297, package F4a) from "all three notebook plates".
		A plate was an attribute on the wrapper, so three wrappers on one page
		could carry three plates. The room follows the SITE theme now, which
		lives on <html> and cannot differ between two wrappers, so the three
		readings are three routes: this one, and its siblings under the default and space-white.
		`contrast` reports the worst match, and with one room per page nothing
		collapses two grounds into one number.
	*/
	prepare: [
		{ waitFor: '() => document.documentElement.getAttribute("data-theme") === "matrix"', timeoutMs: 5_000 }
	],
	presence: [
		{ selector: '[data-testid="nb-room"].nb-root[data-site="matrix"]', label: 'the notebook room, under Matrix', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-nb-theme]', label: 'a plate attribute (must be absent: there are no plates)', expectPresent: 0 },
		{ selector: '.pending', label: 'two mounts', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 }
	],
	contrast: [
		{ selector: '.nb-root .card .pending', label: 'pending label, Matrix', min: 4.5 }
	]
};
