/**
 * THE FEEDBACK CONSOLE, "Both" (0230): the Fix soon list and the Long-term
 * ideas list under their own headings. See `_feedback-horizon.mjs` for the
 * fixture and what every row measures.
 */
import { HORIZON_CHECKS, HORIZON_PREPARE } from './_feedback-horizon.mjs';

export default {
	path: '/dev/feedback?view=console&horizon=both',
	aliasOf: '/dev/feedback?view=console',
	label: 'Feedback console, Both: the Fix soon list and the Long-term ideas list (0230)',
	prepare: HORIZON_PREPARE,
	...HORIZON_CHECKS
};
