/**
 * THE SAME CLASS PAGE AS ITS TEACHER: no work chips and no unit progress
 * (ledger 0297). A manager hands nothing in, so there is nothing of theirs to
 * count; the unit headings themselves are the positive control, the same
 * three the student's page counts on, and
 * `classroom-palette-s-1-manage-0-state-progress` is the student's side.
 */
import { MANAGER, READY } from './_classroom-palette.mjs';

export default {
	path: `${MANAGER}&state=progress`,
	aliasOf: MANAGER,
	label: 'Class page (teacher): no student chips and no unit progress',
	prepare: [READY],
	presence: [
		{ selector: '[data-testid="unit-group"]', label: 'unit headings (positive control)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="unit-progress"]', label: 'no unit progress for a teacher', expectPresent: 0 },
		{ selector: '[data-testid="work-status"]', label: 'no work chips for a teacher', expectPresent: 0 }
	]
};
