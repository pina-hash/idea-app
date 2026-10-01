/**
 * THE PAGE-LAYOUT EDITOR UNDER SPACE WHITE (ledger 0360, report R23). The
 * classroom is in the Space White scope, so the editor's names, tags and keys
 * are measured on the light grounds too, with the class page's editor open
 * for a teacher (the one role with the posting keys piece of the header).
 */
import { IGNORE, READY, editorOpen } from './_classroom-layout.mjs';

const EDITOR = '[data-testid="panel-layout-editor-class"]';

export default {
	path: '/dev/classroom-layout?role=teacher&settings=open&theme=space-white',
	label: 'Class page as a teacher under Space White, Display settings open at its arrangement',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{ waitFor: editorOpen('class'), timeoutMs: 10000 },
		{ waitFor: '() => document.documentElement.getAttribute("data-theme") === "space-white"', timeoutMs: 5000 }
	],
	presence: [
		{ selector: `${EDITOR} [data-testid="panel-row"]`, label: "a teacher's five class-page rows", expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: `${EDITOR} [data-testid="panel-piece"]`, label: "the header's three pieces, inside its row", expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: `${EDITOR} [data-panel="actions"]`, label: 'the posting keys piece, a teacher only', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: `${EDITOR} .pl-label`, label: 'section names', min: 4.5, all: true },
		{ selector: `${EDITOR} .pl-chip`, label: 'the Always shown and In the class header tags', min: 4.5, all: true },
		{ selector: `${EDITOR} .btn`, label: 'every editor key', min: 4.5, all: true },
		{ selector: '[data-testid="settings-arrange-class"] .disc-meta', label: 'the arrangement summary', min: 4.5 }
	],
	tapTargets: [{ selector: `${EDITOR} button`, label: 'every editor control', min: 44 }],
	ignoreConsole: IGNORE
};
