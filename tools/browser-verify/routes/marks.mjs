/**
 * The eleven app marks and the FRC icon, measured in BOTH reduced-motion
 * states.
 *
 * These glyphs are on the portal home page, which is the first screen a student
 * sees, and not one of them was mounted in any dev route until `/dev/marks`
 * existed -- so the rule every one of them has to satisfy had never been
 * measured on any of them. See the route's own header for the three CLAUDE.md
 * passages it is asserting, and `checks.mjs`'s `motionSweep` for why the
 * cancelled state is the hard half and how it is reached.
 *
 * ONE `motion` ENTRY PER MARK, so a failure names the mark; the check's own rows
 * name the ELEMENT inside it. A glyph with nine animated paths where eight
 * settle and one does not passes any whole-component check and still shows a
 * reduced-motion reader a broken mark, so the assertion is per element and the
 * report prints every animated element's resting opacity and transform.
 *
 * `expect: 'never'` on FRC is the OTHER direction, and it is asserted in the
 * running phase on purpose: under reduce an animation that is merely gated is
 * indistinguishable from no animation at all, which is exactly the thing FIRST's
 * guidelines forbid this mark from having.
 */
const GATED = [
	'vanguard',
	'gauntlet',
	'greenline',
	'coins',
	'classroom',
	'notebook',
	'tournament',
	'coin-desk',
	'dashboard',
	'admin',
	'foundry'
];

export default {
	path: '/dev/marks',
	label: 'App marks: the reduced-motion gate, both directions',
	/*
	 * `maxPresent` PINS THE ROSTER, AND THAT IS THE POINT RATHER THAN A COST.
	 * `GATED` above is a hand-maintained list of eleven ids; the `motion` sweep
	 * below covers exactly what is in it. As a FLOOR, `expectPresent: 12` went
	 * on passing at 13 mark cells -- so a twelfth gated mark added to the page
	 * and forgotten here would be swept by nothing and reported by nothing. The
	 * ceiling is what turns that into a red row. A mark added on purpose is one
	 * line here and one line in `GATED`, which is the pair that has to move
	 * together anyway.
	 */
	presence: [
		{ selector: '.harness [data-mark]', label: 'mark cells', expectPresent: 12, maxPresent: 12 },
		/* Every mark ships at 34px on the launcher card as well as at reading
		   size, and a glyph that only survives at 96px is a glyph nobody sees. */
		{ selector: '.harness [data-mark] .icon.sm', label: 'launcher-size mounts', expectPresent: 12, maxPresent: 12 },
		{ selector: '.harness [data-mark]:not(.frc) svg', label: 'component marks are svg', expectPresent: 22, maxPresent: 22 },
		{ selector: '.harness [data-mark].frc img', label: 'FRC stays an unmodified image', expectPresent: 2, maxPresent: 2 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'page heading', min: 4.5 },
		{ selector: '.harness .note', label: 'note copy', min: 4.5 },
		{ selector: '.harness figcaption', label: 'mark captions', min: 4.5 }
	],
	motion: [
		...GATED.map((id) => ({ selector: `[data-mark="${id}"]`, label: `${id} mark`, expect: 'gated' })),
		{ selector: '[data-mark="frc"]', label: 'FRC mark (never animated)', expect: 'never' }
	]
};
