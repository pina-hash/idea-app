// original array position 25 of 25 -- see ../README.md for what `order` means
export const order = 25;

export default {
	path: '/dev/gauntlet-run',
	label: 'GAUNTLET run surfaces -- RunResults in four verdict states, SpeedrunClock in three',
	/*
		RunResults is the post-run screen for ALL SIX MODES and SpeedrunClock
		is on screen for the whole of every ranked run. Neither was reachable
		from any dev route.

		THE FLOURISH IS AN EXCLUSION WITH A POSITIVE CONTROL IN THE SAME
		MEASUREMENT. `celebrate` is `firstClear || beatPb`, so it must fire
		on exactly two of the four mounts. A clear that was SLOWER than the
		standing personal best is still a clear, and a regression that
		derived the flourish from `correct` alone would congratulate a
		student for going backwards -- and would look completely fine on
		screen. `present 2` over four mounts is the assertion; `present 4`
		for the results themselves is what stops it passing on a page that
		rendered two results.
	*/
	presence: [
		/* `maxPresent` ON EVERY ROW HERE, because every one of them is an
		   EXCLUSION wearing a count. The `maxVisible` ceilings were already
		   right about what paints; the PRESENT half was still a floor, so a
		   fifth mount, a third celebrating result or a fourth clock would have
		   satisfied all five of these rows and the paragraph above them. */
		{ selector: '.run-results', label: 'the four verdict mounts', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '.run-results.celebrate', label: 'celebrating results (first clear + PB beaten ONLY)', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '.pb-flash', label: 'the flourish banner, one per celebrating result', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '.result-banner.no', label: 'the not-cleared banner', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.sr-clock', label: 'the three clock states', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/*
			STANDBY is the state between pressing reveal and the SolidWorks
			Start macro firing -- `running` true, `serverStartMs` still
			null -- and it is the one nothing else in the repo renders. It
			must be exactly one of the three, and the live ranked clock
			must NOT be wearing it.
		*/
		{ selector: '.sr-clock.standby', label: 'standby treatment, ranked-armed-but-not-started', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.sr-clock.unranked', label: 'the calmer unranked variant', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 }
	],
	textContains: [
		/*
			The three clock labels are the student's only statement of what
			the run is worth. STANDBY and REC . RANKED are different claims
			about the same ranked clock and the fixture renders both, so
			the presence of one is not evidence of the other.
		*/
		{
			selector: '.sr-clock .sr-rec',
			label: 'clock status labels across the three states',
			must: ['STANDBY', 'REC . RANKED', 'UNRANKED']
		},
		/*
			XP comes from `xpForRun`, whose arithmetic is pinned in
			tests/gauntlet-progression.test.ts. What is asserted HERE is
			only what reaches the screen: the first-attempt first-clear
			mount is worth 15 + 120, and a repeat run of an
			already-cleared challenge banks nothing and must say so rather
			than printing "+0 XP".
		*/
		{
			selector: '[data-mount="first clear"] .run-results',
			label: 'first clear reports the run XP it earned',
			must: ['+135 XP']
		},
		{
			selector: '[data-mount="cleared slower"] .run-results',
			label: 'an already-banked run says so instead of printing +0',
			must: ['Already banked for this one'],
			mustNot: ['+0 XP']
		}
	],
	contrast: [
		{ selector: '.result-verdict', label: 'run verdict', min: 4.5 },
		{ selector: '.result-detail .key', label: 'result field labels', min: 4.5 },
		{ selector: '.result-detail .val', label: 'result field values', min: 4.5 },
		/*
			The ranked clock's chrome is the one place in GAUNTLET that
			paints crimson-adjacent ink as a matter of course (REC . RANKED
			is the live/rec reservation, legitimately). It is small mono
			type at 0.58rem on `--bg2`, which is exactly the shape of thing
			that is authored by eye and never measured.
		*/
		/*
			`:not(.standby)` IS LOAD-BEARING. The standby clock is ALSO
			`.ranked` -- standby is a state of a ranked clock, not a
			fourth kind -- so the bare descendant selector matched both
			labels and reported the WORSE of the two under the REC row's
			name, while the STANDBY row beneath reported the same figure
			again. Two rows measuring one element is how a real finding
			gets counted twice and its actual owner never named.
		*/
		{ selector: '.sr-clock.ranked:not(.standby) .sr-rec', label: 'REC . RANKED label on the clock plate', min: 4.5 },
		{ selector: '.sr-clock.unranked .sr-rec', label: 'UNRANKED label on the clock plate', min: 4.5 },
		{ selector: '.sr-clock.standby .sr-rec', label: 'STANDBY label on the clock plate', min: 4.5 }
	],
	tapTargets: [{ selector: '.run-results .btn-row .btn', label: 'post-run actions (retry / next / back)', min: 44 }]
};
