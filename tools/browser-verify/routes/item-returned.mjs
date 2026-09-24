import { RETURNED } from './_item-returned.mjs';

/**
 * The returned grade on a v1 spec assignment, as a student opens it (ledger
 * 0297, package ITEM). The comment used to sit UNDER the whole rubric
 * breakdown -- 1065px below the grade at 375 -- so the one sentence a teacher
 * wrote for this student was on the page and effectively unread. Every string
 * was present the whole time, which is why the rows here are about ORDER and
 * DISTANCE, and why the absence of the unscored rubric is paired with the
 * presence of the scored one.
 *
 * The four engines are four specs over the same harness (this one and
 * `item-returned-engine-v2/v3/v4`), because the defect was engine-shaped: v3
 * and v4 carried the grade in their payload and rendered none of it.
 */
export default {
	path: '/dev/item-returned',
	label: 'A returned v1 assignment: the grade, then the comment, then the breakdown',
	...RETURNED
};
