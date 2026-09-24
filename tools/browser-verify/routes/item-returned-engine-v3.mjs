import { RETURNED } from './_item-returned.mjs';

/** The same returned card on a v3 assignment; see ./item-returned.mjs. */
export default {
	path: '/dev/item-returned?engine=v3',
	label: 'A returned v3 assignment: the grade, then the comment, then the breakdown',
	...RETURNED
};
