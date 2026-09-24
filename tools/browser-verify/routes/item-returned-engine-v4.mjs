import { RETURNED } from './_item-returned.mjs';

/** The same returned card on a v4 assignment; see ./item-returned.mjs. */
export default {
	path: '/dev/item-returned?engine=v4',
	label: 'A returned v4 assignment: the grade, then the comment, then the breakdown',
	...RETURNED
};
