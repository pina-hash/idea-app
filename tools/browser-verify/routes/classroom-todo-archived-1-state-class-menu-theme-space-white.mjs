/**
 * THE CLASSES MENU UNDER SPACE WHITE (ledger 0392, report 2f019c5b): the same
 * measurements as the spec beside this one, on the light theme's grounds.
 */
import { FORCE_THEME } from './_hover-ink.mjs';
import { ARCHIVED, ARCHIVED_READY } from './_classroom-todo.mjs';
import base, { OPEN_CLASS_MENU, CLASS_MENU_READY } from './classroom-todo-archived-1-state-class-menu.mjs';

export default {
	...base,
	path: `${ARCHIVED}&state=class-menu&theme=space-white`,
	aliasOf: ARCHIVED,
	label: 'The Classes menu under Space White',
	prepare: [ARCHIVED_READY, FORCE_THEME('space-white'), OPEN_CLASS_MENU, CLASS_MENU_READY],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 }, ...base.presence]
};
