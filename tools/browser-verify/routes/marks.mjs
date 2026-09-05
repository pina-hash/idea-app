/**
 * Every app mark and the FRC icon, measured in BOTH reduced-motion states.
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
 *
 * =====================================================================
 * THE ROSTER IS READ FROM `$lib/marks`, AND EVERY NUMBER BELOW IS DERIVED
 * FROM ITS LENGTH. NOTHING HERE IS A LITERAL, AND THAT IS THE FIX.
 * =====================================================================
 *
 * This file used to carry `GATED`, a hand-written list of eleven ids, beside
 * `expectPresent: 12, maxPresent: 12` and `22`. `$lib/marks` held TWELVE
 * components. `MapsMark` arrived in `ca5d950`, which touched neither this file
 * nor `/dev/marks`, so the twelfth mark was mounted by nothing and swept by
 * nothing -- AND THIS SPEC WENT ON PASSING, because the page still rendered
 * eleven component cells plus FRC and twelve was exactly what the ceiling
 * allowed. The spec was green while covering eleven of twelve marks, and no
 * row anywhere said so.
 *
 * The old comment here argued that the ceiling PINNED the roster and that "a
 * mark added on purpose is one line here and one line in `GATED`, which is the
 * pair that has to move together anyway". Both halves were wrong in the same
 * way. The ceiling pins the number of cells the PAGE renders, which says
 * nothing about how many marks EXIST; and the pair did not move together,
 * which is what a pair maintained by memory does. Bumping 11 to 12 would have
 * restored coverage today and rebuilt the identical hole for the thirteenth.
 *
 * So the roster comes off disk, on both sides. `markRoster` in
 * `src/routes/dev/marks/mark-roster.js` is the ONE implementation of a mark's
 * id and the ONE thing that refuses an empty read (rule 29: a control that can
 * silently go to zero is not a control); the page globs the same directory and
 * mounts whatever it finds. The equality rows below stay EQUALITIES -- rule 33
 * is still right that a floor is an assertion that cannot fail -- but both
 * sides of each equality are now computed from the same directory listing.
 *
 * WHAT MAKES A DRIFT LOUD, which is the property the old shape lacked
 * entirely. Every mark becomes a `motion` row selecting `[data-mark="<id>"]`,
 * and `motionSweep` marks a `gated` row within threshold only when
 * `animated > 0`. A selector matching NOTHING therefore sweeps zero elements,
 * finds zero animated, and REDDENS. The failure a forgotten mark actually
 * causes -- a glyph the page never mounted -- is now the failure this spec
 * detects, where before it was the one case it could not.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { markRoster } from '../../../src/routes/dev/marks/mark-roster.js';

/** The shipping components, read from the directory the page globs. */
const MARKS_DIR = new URL('../../../src/lib/marks/', import.meta.url);
const MARKS = markRoster(readdirSync(fileURLToPath(MARKS_DIR)));

/**
 * Cells on the page: one per component mark, PLUS the hand-written FRC cell.
 * FRC is `+ 1` rather than a roster entry because it is not a component in
 * `$lib/marks` at all -- it is the official FIRST image, mounted as an `<img>`
 * because the mark may not be redrawn. It is the one thing here a number
 * legitimately stands for, and it is `1` because there is one of it.
 */
const CELLS = MARKS.length + 1;

/** Each mark is mounted twice per cell: once at 96px, once at the launcher's 34px. */
const MOUNTS_PER_CELL = 2;

export default {
	path: '/dev/marks',
	label: 'App marks: the reduced-motion gate, both directions',
	presence: [
		{
			selector: '.harness [data-mark]',
			label: `mark cells (${MARKS.length} in $lib/marks, plus FRC)`,
			expectPresent: CELLS,
			maxPresent: CELLS
		},
		/* Every mark ships at 34px on the launcher card as well as at reading
		   size, and a glyph that only survives at 96px is a glyph nobody sees. */
		{
			selector: '.harness [data-mark] .icon.sm',
			label: 'launcher-size mounts',
			expectPresent: CELLS,
			maxPresent: CELLS
		},
		{
			selector: '.harness [data-mark]:not(.frc) svg',
			label: 'component marks are svg',
			expectPresent: MARKS.length * MOUNTS_PER_CELL,
			maxPresent: MARKS.length * MOUNTS_PER_CELL
		},
		{
			selector: '.harness [data-mark].frc img',
			label: 'FRC stays an unmodified image',
			expectPresent: MOUNTS_PER_CELL,
			maxPresent: MOUNTS_PER_CELL
		}
	],
	contrast: [
		{ selector: '.harness h1', label: 'page heading', min: 4.5 },
		{ selector: '.harness .note', label: 'note copy', min: 4.5 },
		{ selector: '.harness figcaption', label: 'mark captions', min: 4.5 }
	],
	motion: [
		...MARKS.map(({ id }) => ({
			selector: `[data-mark="${id}"]`,
			label: `${id} mark`,
			expect: 'gated'
		})),
		{ selector: '[data-mark="frc"]', label: 'FRC mark (never animated)', expect: 'never' }
	]
};
