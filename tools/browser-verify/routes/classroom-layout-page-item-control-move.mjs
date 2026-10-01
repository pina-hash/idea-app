/**
 * THE NEGATIVE CONTROL FOR "THE WORK SLOT WAS NEVER MOVED" (ledger 0360,
 * report R23). The item-page specs read the worksheet frame's own load count
 * and expect 1 after a reorder. This proves the counter can see a move: the
 * work slot's node is moved by hand, the way a single keyed list over every
 * panel would move it, and the frame reloads -- 2 loads. That reload is the
 * whole reason `PanelStack` renders the anchor outside both lists.
 */
import { IGNORE, READY } from './_classroom-layout.mjs';

export default {
	path: '/dev/classroom-layout?page=item&control=move',
	label: 'NEGATIVE CONTROL: moving the work slot in the DOM reloads its worksheet frame',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{ waitFor: `() => document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads === '1'`, timeoutMs: 10000 },
		{
			evaluate: `() => { const a = document.querySelector('[data-testid="lh-anchor"]'); a.parentElement.insertBefore(a, a.parentElement.firstChild); return document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads; }`,
			until: `() => document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads === '2'`
		}
	],
	orderResult: [{ label: 'a moved frame is a reloaded frame', evaluate: `() => [document.querySelector('[data-testid="layout-harness"]').dataset.frameLoads]`, expected: ['2'] }],
	ignoreConsole: IGNORE
};
