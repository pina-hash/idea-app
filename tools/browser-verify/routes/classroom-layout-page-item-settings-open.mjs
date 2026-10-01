/**
 * THE PAGE-LAYOUT EDITOR, DRIVEN FROM THE KEYBOARD, ON THE ITEM PAGE (ledger
 * 0360, report R23). Display settings opened for this page; ArrowDown on the
 * Instructions grip four times carries it past the work slot, the page under
 * the dialog re-renders in the new order, and the worksheet frame in the work
 * slot is NOT reloaded (it counts its own loads). Then Reset puts the page
 * back. Every editor control clears the 44px student floor and the dialog
 * fits a 375px phone (the run's own horizontal-scroll check).
 */
import { DOM_ORDER, IGNORE, READY, editorOpen } from './_classroom-layout.mjs';

export const EDITOR = '[data-testid="panel-layout-editor-item"]';

export const OPEN_STEPS = [
	{ waitFor: READY, timeoutMs: 20000 },
	{ waitFor: editorOpen('item'), timeoutMs: 10000 },
	{ waitFor: `() => document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads === '1'`, timeoutMs: 10000 }
];

const pressDown = {
	evaluate: `() => { const g = document.querySelector('${EDITOR} [data-panel="body"] [data-testid="panel-grip"]'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); return [...document.querySelectorAll('${EDITOR} [data-testid="panel-row"]')].map((r) => r.dataset.panel).join(','); }`
};

export default {
	path: '/dev/classroom-layout?page=item&settings=open',
	label: 'Item page, Display settings open at its arrangement: ArrowDown moves Instructions past the work, the frame is not reloaded, Reset restores',
	prepare: [
		...OPEN_STEPS,
		pressDown,
		pressDown,
		pressDown,
		{
			...pressDown,
			until: `() => document.querySelector('[data-testid="layout-harness"]').dataset.order === 'deck,notebook,links,files,work,body,rubric'`
		}
	],
	orderResult: [
		{
			label: 'four ArrowDowns on the Instructions grip put it after the work, in the editor and on the page',
			evaluate: `() => [[...document.querySelectorAll('${EDITOR} [data-testid="panel-row"]')].map((r) => r.dataset.panel).join(','), document.querySelector('[data-testid="layout-harness"]').dataset.order]`,
			expected: ['deck,notebook,reference,links,files,work,body,rubric', 'deck,notebook,links,files,work,body,rubric']
		},
		{ label: 'the page under the dialog, in DOM order', evaluate: DOM_ORDER, expected: ['deck', 'notebook', 'links', 'files', 'work', 'body', 'rubric'] },
		{ label: 'the worksheet frame was not reloaded by the reorder', evaluate: `() => [document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads]`, expected: ['1'] },
		{ label: 'the grip kept focus, so the next press keeps moving the same row', evaluate: `() => [document.activeElement?.closest('[data-testid="panel-row"]')?.dataset.panel ?? 'none']`, expected: ['body'] },
		{
			label: 'Reset to default puts the page back and leaves the frame alone',
			evaluate: `() => { document.querySelector('${EDITOR} [data-testid="panel-reset"]').click(); return new Promise((r) => setTimeout(() => r([document.querySelector('[data-testid="layout-harness"]').dataset.order, document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads]), 300)); }`,
			expected: ['deck,notebook,body,links,files,work,rubric', '1']
		}
	],
	presence: [
		{ selector: 'dialog[data-testid="classroom-settings"][open]', label: 'Display settings, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${EDITOR} [data-testid="panel-row"]`, label: 'one row per item-page panel', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: `${EDITOR} [data-panel="work"] [data-testid="panel-grip"], ${EDITOR} [data-panel="work"] [data-testid="panel-toggle"]`, label: 'no grip and no toggle on the anchor row', expectPresent: 0 },
		{ selector: `${EDITOR} [data-testid="panel-grip"]`, label: 'a grip on every other row (positive control)', expectPresent: 7, maxPresent: 7, expectVisible: 7 }
	],
	contrast: [
		{ selector: `${EDITOR} .pl-label`, label: 'section names', min: 4.5, all: true },
		{ selector: `${EDITOR} .pl-chip`, label: 'the Always shown and Hidden tags', min: 4.5, all: true },
		{ selector: `${EDITOR} .btn`, label: 'every editor key', min: 4.5, all: true }
	],
	tapTargets: [{ selector: `${EDITOR} button`, label: 'every editor control, at the 44px student floor', min: 44 }],
	ignoreConsole: IGNORE
};
