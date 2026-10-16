/**
 * THE SAME CARDS UNDER SPACE WHITE, which is where report 54b43698 was filed.
 */
import { FORCE_THEME } from './_hover-ink.mjs';
import base, { TEACHER_FOLDED } from './home-feed-mode-teacher-state-attention.mjs';

export default {
	...base,
	path: '/dev/home-feed?mode=teacher&state=attention&theme=space-white',
	label: 'Teacher class cards, folded, under Space White: the attention count reads on its wash',
	prepare: [...TEACHER_FOLDED, FORCE_THEME('space-white')],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 }, ...base.presence]
};
