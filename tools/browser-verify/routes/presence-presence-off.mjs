/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE NEGATIVE CONTROL FOR EVERY PRESENCE ASSERTION, AND IT IS A REAL
 * DEPLOYMENT STATE RATHER THAN A CONTRIVED ONE.
 *
 * `?presence=off` hands `GradingConsole` no presence transport, which is
 * exactly what a deployment sitting before `0200` produces: the RPC does not
 * exist, the transport's `PGRST202` rung answers null, and the console must draw
 * no presence anywhere.
 *
 * WHY THIS MATTERS MORE THAN A SPEC USUALLY DOES. A console that drew the region
 * regardless would tell an instructor that every student was AWAY -- a
 * confident, false statement about a child, on the surface a teacher acts from,
 * when the truth is that nobody asked. So the absence is measured on the
 * rendered page, not only in the DOM suite: 0 lines, 0 chips, 0 notes against
 * the at-rest spec's 5, 4 and 1 on the identical fixture.
 *
 * AND THE ROSTER IS ASSERTED PRESENT IN THE SAME BREATH. Without it, a console
 * that failed to load at all would satisfy every zero above and read as a
 * correct degradation.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/presence?presence=off',
	label: 'Presence: with no transport the region is gone entirely, and the roster is not',
	widths: WIDTHS,
	presence: [
		{ selector: '[data-testid="presence-line"]', label: 'presence lines (none)', expectPresent: 0 },
		{ selector: '[data-testid="presence-chip"]', label: 'presence chips (none)', expectPresent: 0 },
		{ selector: '[data-testid="presence-note"]', label: 'the coverage sentence (none)', expectPresent: 0 },
		{ selector: '[data-testid="presence-never"]', label: 'the never-opened line (none)', expectPresent: 0 },
		{
			/* THE POSITIVE CONTROL. Five roster rows, exactly as the at-rest spec
			   measures, so the zeros above are a removed REGION and not a console
			   that never rendered. */
			selector: '.roster-row',
			label: 'the roster itself, unchanged',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5,
			maxVisible: 5
		}
	]
};
