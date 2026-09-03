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
		{ selector: '.gt-stage span.pathway-chip', label: 'chips inside .gt-root', expectPresent: 6, maxPresent: 6 },
		/* DELIBERATELY UNANCHORED: the total across every stage, room one
		   included, which is why the count reads higher than it did before the
		   `.gt-root` stage went in (19 -> 25 at the time of writing). It is a
		   floor, and what it is a floor ON is "the page rendered chips at all". */
		{ selector: 'span.pathway-chip', label: 'pathway chips (all stages -- a deliberate floor, measured 25)', expectPresent: 6 },
		/* "One cell per pathway" is a count of `PATHWAYS`, which is six and is
		   fixed by `src/lib/pathways.ts`. A seventh cell means the grid grew a
		   row no chip row above accounts for. */
		{ selector: '.chip-grid .chip-cell', label: 'one cell per pathway', expectPresent: 6, maxPresent: 6 },
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
	tapTargets: [
		/*
		   THE HARNESS'S OWN CHROME, AND IT USED TO BE THE ONLY ROW HERE.
		   Measured 194.7x26.2 at both widths for weeks -- a standing finding every
		   prompt had to warn the next session about, which is exactly the noise
		   that trains a reader to skim the findings list. It was a correct
		   measurement of something that is not a product surface: these are this
		   dev page's two buttons and no student ever sees them. Fixed at source
		   (`min-height: 44px` in the page's own stylesheet, with the reasoning
		   beside it) rather than by deleting the row, so the page's chrome cannot
		   drift back under the floor unnoticed.
		*/
		{ selector: '.harness .controls button', label: 'harness controls', min: 44 },
		/*
		   AND THE ROW THIS SPEC SHOULD HAVE CARRIED ALL ALONG: a control that
		   SHIPS. `ProfileMenu` is mounted in `src/routes/+layout.svelte` and in
		   roughly twenty routes besides, so its trigger is on the header of every
		   page a student opens -- and nothing in this harness had ever measured
		   it. This page mounts the real component (see the ProfileMenu stage
		   below), which makes it the one route in the list that can.

		   IT IS RED, AND IT IS A REAL PRODUCT DEFECT RATHER THAN AN INSTRUMENT
		   ARTEFACT. Measured 44.0x34.0 here and 100.6x34.0 on `/dev/profile-menu`
		   and `/dev/home-order` -- 34px in the short dimension, at both widths, on
		   three independent routes, never inside a `<label>` and with its parent
		   `.pm-root` exactly as tall. The height is `Avatar size={30}` plus
		   `.pm-trigger`'s 2px padding, so it does NOT depend on the web font this
		   harness cannot load: the fallback-stack limit in ../README.md does not
		   qualify this number. `.pm-trigger` carries neither `.tap-44` nor
		   `.tap-reach-44`, so `tap-target` is the right instrument and there is no
		   reach to measure instead.

		   `src/lib/ProfileMenu.svelte` owns the fix and this bundle does not.
		*/
		{ selector: '.pm-trigger', label: 'ProfileMenu trigger (ships in every page header)', min: 44 }
	]
};
