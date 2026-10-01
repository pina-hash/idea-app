/**
 * A PERSON WHO HID THE VIDEOS AND THE THEME VOTE (ledger 0360, report R23). A
 * hidden panel is NOT RENDERED (so whatever it polls stops), and one quiet
 * line at the end of the page names what is hidden and offers Arrange, which
 * opens Display settings at this page's arrangement. Without that line a class
 * page with a hidden section reads as a class page without the section.
 */
import { DOM_ORDER, IGNORE, READY, editorOpen } from './_classroom-layout.mjs';

export default {
	path: '/dev/classroom-layout?page=class&preset=hidden',
	label: 'Class page as a student who hid Videos and the theme vote: gone from the page, named in one line, Arrange opens the editor',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{ click: '[data-testid="panels-hidden-arrange"]', until: editorOpen('class') }
	],
	orderResult: [
		{ label: 'the panels in DOM order, without Videos (the theme vote is a piece inside the header)', evaluate: DOM_ORDER, expected: ['banner', 'teams', 'find', 'stream'] },
		{
			label: 'Arrange opened the settings panel at the class page, with that editor open and its group heading focused',
			evaluate: `() => [document.activeElement?.id ?? '', document.querySelector('[data-testid="settings-arrange-item"]')?.getAttribute('aria-expanded') ?? 'missing']`,
			expected: ['cs-panels', 'false']
		}
	],
	presence: [
		{ selector: '.lh-main [data-panel="videos"]', label: 'Videos, hidden: not rendered', expectPresent: 0 },
		{ selector: '.lh-main [data-panel="theme"]', label: 'the theme vote, hidden: not rendered', expectPresent: 0 },
		{ selector: '.lh-main [data-panel="find"]', label: 'search, not hidden (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'the hidden-panels line', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panel-layout-editor-class"] [data-testid="panel-hidden-chip"]', label: 'the editor marks the hidden row and the hidden piece in words', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="panel-layout-editor-class"] [data-testid="panel-piece"][data-panel="theme"] [data-testid="panel-hidden-chip"]', label: 'the theme vote, marked hidden inside the header row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="lh-header-row"] [data-panel="tools"]', label: 'the class tools, not hidden (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="panels-hidden-note"]', label: 'the line names what is hidden', must: ['Hidden on this page: Class theme vote, Videos.', 'Arrange'], mustNot: ['—'] }
	],
	contrast: [{ selector: '[data-testid="panels-hidden-note"] .phn-text', label: 'the hidden-panels line', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="panels-hidden-arrange"]', label: 'Arrange', min: 44 }],
	ignoreConsole: IGNORE
};
