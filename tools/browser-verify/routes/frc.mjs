// original array position 21 of 25 -- see ../README.md for what `order` means
export const order = 21;

export default {
	path: '/dev/frc',
	label: 'FRC Training shell nav, admin state (widest header configuration)',
	/*
		REGRESSION GUARD FOR c04e448. `.frc-nav` stayed `nowrap` even though
		`.frc-header` itself already wraps, so the nav's own min-content (two
		links, the admin "View as student" toggle, the rank badge, the
		profile menu) forced the header wider than a 375px viewport --
		silently, because `body` clips horizontal overflow. `min-width: 0`
		alone did NOT fix this shape: it only let the row shrink below that
		sum, and the overflow reappeared one flex level down, on the rank
		badge's own nowrap text. `flex-wrap: wrap` on `.frc-nav` is what
		actually converged (0px overflow at 375px, unchanged at 1440px).

		This route's default state already carries the widest nav with no
		prepare step: `rankCount={count}` is 0, not null, so the badge
		renders, and `simulateTeacher` (adminOverride) defaults true, so the
		admin toggle renders too.
	*/
	presence: [
		{ selector: '.frc-header', label: 'FRC header', expectPresent: 1 },
		{ selector: '.frc-nav', label: 'FRC nav', expectPresent: 1 },
		{ selector: '.frc-nav .frc-view-toggle', label: 'admin "View as student" toggle', expectPresent: 1 },
		{ selector: '.frc-nav .rank-chip', label: 'rank badge (chip)', expectPresent: 1 }
	],
	/*
		ONE LINE AT >=1024px IS THE OUTCOME, ASSERTED DIRECTLY -- NOT A RULE
		ABOUT flex-wrap. `min-width: 0` alone had already been tried and
		converged on the WRONG outcome (zero overflow, but by forcing the
		rank badge's own text to overhang instead); `flex-wrap: wrap` is
		what made both true at once. The horizontal-scroll check already
		measured for every route covers the overflow half; this is the half
		it cannot state -- that the wrap did not cost the 1440px nav its
		single line (hand-measured at 28.7px tall in c04e448, reproduced
		here). Below 1024px the nav is EXPECTED to wrap onto more than one
		line, so the same evaluate is a deliberate no-op there rather than a
		claim it was never meant to hold.

		COMPARING EACH CHILD'S ROUNDED `top` IS NOT "ONE LINE": the three
		links, the admin toggle and the rank chip do not share one box
		height (`align-items: center` centers each against the tallest), so
		their tops differ by ~2px even sitting on the identical line --
		measured [216, 216, 216, 218, 218], two distinct rounded values from
		a single-line render. A wrapped nav's second line differs by a
		whole line-plus-gap (~35px+), so comparing the ROW'S OWN height
		against its tallest child (with a few px of slack for that same
		centering) is the discriminator that survives it.
	*/
	orderResult: [
		{
			evaluate: `() => {
				const nav = document.querySelector('.frc-nav');
				if (!nav) return [false];
				if (document.documentElement.clientWidth < 1024) return [true];
				const navH = nav.getBoundingClientRect().height;
				const maxChildH = Math.max(...[...nav.children].map((el) => el.getBoundingClientRect().height));
				return [navH <= maxChildH + 4];
			}`,
			expected: [true],
			label: '.frc-nav is one line at >=1024px (free to wrap narrower, where zero-overflow is the only claim)'
		}
	]
};
