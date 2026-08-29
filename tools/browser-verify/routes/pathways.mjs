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
		/* The room stage is a fixture that can silently stop being a room: if
		   `viewport.css`'s import were dropped, `.gt-root` would still be in the
		   markup and every reading below would quietly describe the portal
		   plate again. The contrast rows are what catch the colour; this catches
		   the mount. */
		{ selector: '.gt-stage .gt-root main.gauntlet', label: 'GAUNTLET room stage', expectPresent: 1 },
		{ selector: '.gt-stage span.pathway-chip', label: 'chips inside .gt-root', expectPresent: 6 },
		/* DELIBERATELY UNANCHORED: the total across every stage, room one
		   included, which is why the count reads higher than it did before the
		   `.gt-root` stage went in (19 -> 25 at the time of writing). It is a
		   floor, and what it is a floor ON is "the page rendered chips at all". */
		{ selector: 'span.pathway-chip', label: 'pathway chips (all stages)', expectPresent: 6 },
		{ selector: '.chip-grid .chip-cell', label: 'one cell per pathway', expectPresent: 6 },
		{ selector: '.pwp-overlay', label: 'picker overlay (dismissed)', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'h1 on its plate', min: 4.5 },
		{ selector: '.harness p.note', label: 'note copy', min: 4.5 },
		/* ANCHORED AWAY FROM THE ROOM STAGE, or this row silently absorbs it.
		   `contrast` reports the WORST match, so an unanchored selector would
		   fold the two rooms' chips into one number and the row below would be
		   measuring a population this one already covers -- two rows, one
		   answer, and no way to see which room moved. */
		{ selector: '.harness .stage:not(.gt-stage) span.pathway-chip .pw-label', label: 'chip label on its fill', min: 4.5 },
		/* THE SAME CHIP IN THE OTHER ROOM IT SHIPS IN. `PathwayChip`'s fill is
		   12% alpha over whatever is behind it, so its ratio is a property of
		   the GROUND and not of the chip -- and `.gt-root` re-points `--bg0`,
		   `--bg1` and `--bg2` to the viewport's own near-black. The row above
		   measures the portal plate (`/dashboard`); this one measures
		   `/gauntlet/leaderboard`. Neither number is inferable from the other,
		   which is exactly why the harness now mounts both. */
		{ selector: '.gt-stage span.pathway-chip .pw-label', label: 'chip label inside .gt-root', min: 4.5 },
		{ selector: '.gt-stage .lb-name', label: 'leaderboard name inside .gt-root', min: 4.5 }
	],
	tapTargets: [{ selector: '.harness .controls button', label: 'harness controls', min: 44 }]
};
