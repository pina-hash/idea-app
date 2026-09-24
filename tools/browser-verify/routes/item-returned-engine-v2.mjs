import { RETURNED } from './_item-returned.mjs';

/** The same returned card on a v2 assignment; see ./item-returned.mjs. */
export default {
	path: '/dev/item-returned?engine=v2',
	label: 'A returned v2 assignment: the grade, then the comment, then the breakdown',
	...RETURNED
};
