/**
 * A FILE DROPPED ON THE EDIT FORM GOES WHERE IT BELONGS (report R11,
 * 2026-09-28), on the REAL item page (ItemDetail) with its REAL edit layer and
 * its REAL spec importer, as a teacher editing an assignment with no ported
 * document.
 *
 *   1. A spec `.json` dropped on the title goes to the item page's own spec
 *      importer (under Instructor tools, behind the editor layer), NOT onto the
 *      Files list, and the note says it is not published yet.
 *   2. Closing the editor brings that importer into view.
 *   3. Reopened, a web page dropped on it is refused out loud (this assignment
 *      is not a ported one), and a photograph -- the positive control -- is
 *      attached.
 *
 * WHAT IS DISPATCHED IS A SYNTHETIC DROP, and a report must say so: a real
 * DragEvent carrying a real DataTransfer with real Files, which the browser's
 * own drag pipeline did not produce. It runs every handler a dragged desktop
 * file runs. tests/dom/composer-drop-edit-mount.test.ts pins the same routing
 * without layout; this is where "on screen" can be asked.
 */
const DROP = (name, type, body) => `(() => {
	const target = document.querySelector('.composer-screen .composer input[type="text"]');
	if (!target) return 'no edit form';
	const dt = new DataTransfer();
	dt.items.add(new File([${JSON.stringify(body)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
	for (const t of ['dragenter', 'dragover', 'drop']) {
		target.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
	}
	return 'dropped ${name}';
})`;

const SPEC = JSON.stringify(
	{
		schemaVersion: 1,
		meta: { assignmentId: 'load-test', title: 'EDIT-DROP-SENTINEL', totalPoints: 10 },
		modules: [
			{ id: 'm1', title: 'Load', points: 10, blocks: [{ type: 'textField', id: 'b1', prompt: 'Peak load, in newtons.' }] }
		]
	},
	null,
	2
);

const EDITOR_OPEN = '() => !!document.querySelector(\'.composer-screen .composer input[type="text"]\')';
const NOTE = '() => (document.querySelector(\'.composer-screen [data-testid="composer-drop-note"]\')?.textContent ?? "")';

export default {
	path: '/dev/classroom-split/s-1/item/i-draft?manage=1&state=edit-drop',
	aliasOf: '/dev/classroom-split/s-1/item/i-draft?manage=1',
	label: 'R11: on the edit form a spec goes to the item page importer, a web page is refused, a photo is attached',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'[data-testid="item-edit-toggle"]\')', timeoutMs: 20000 },
		{ click: '[data-testid="item-edit-toggle"]', until: EDITOR_OPEN },
		{
			evaluate: DROP('load-test.json', 'application/json', SPEC),
			until: '() => (document.querySelector(\'[data-testid="spec-paste"]\')?.value ?? "").includes("EDIT-DROP-SENTINEL")'
		}
	],
	orderResult: [
		{
			label: 'the spec reached the item page importer, the Files list stayed empty, and the note says where and that nothing is published',
			evaluate: `() => {
				const files = [...document.querySelectorAll('.composer-screen .fup[data-role="attachment"] .fup-name')].map((n) => n.textContent.trim());
				const note = (${NOTE})();
				return [
					'importer: ' + ((document.querySelector('[data-testid="spec-paste"]')?.value ?? '').includes('EDIT-DROP-SENTINEL') ? 'holds the spec' : 'missing'),
					'files: ' + files.length,
					note.includes('under Instructor tools') && note.includes('Nothing is published yet') ? 'note says where' : 'NOTE: ' + note.slice(0, 80)
				];
			}`,
			expected: ['importer: holds the spec', 'files: 0', 'note says where']
		},
		{
			label: 'closing the editor puts the importer, holding the spec, on screen',
			evaluate: `async () => {
				document.querySelector('[data-testid="composer-screen-close"]')?.click();
				for (let i = 0; i < 20 && document.querySelector('.composer-screen'); i++) await new Promise((r) => setTimeout(r, 100));
				await new Promise((r) => setTimeout(r, 400));
				const box = document.querySelector('[data-testid="spec-paste"]');
				if (!box) return ['no importer'];
				const r = box.getBoundingClientRect();
				return [document.querySelector('.composer-screen') ? 'editor still open' : 'editor closed', r.bottom > 0 && r.top < innerHeight ? 'importer in view' : 'importer off screen at ' + Math.round(r.top)];
			}`,
			expected: ['editor closed', 'importer in view']
		},
		{
			label: 'reopened: a web page is refused by name and not attached; a photograph is attached',
			evaluate: `async () => {
				const toggle = document.querySelector('[data-testid="item-edit-toggle"]');
				for (let i = 0; i < 12 && !(${EDITOR_OPEN})(); i++) { toggle.click(); await new Promise((r) => setTimeout(r, 250)); }
				(${DROP('worksheet.html', 'text/html', '<!doctype html><p>a worksheet</p>')})();
				await new Promise((r) => setTimeout(r, 400));
				const refusal = (${NOTE})();
				const refused = document.querySelector('.composer-screen [data-testid="composer-drop-note"]')?.getAttribute('data-refused') === 'true';
				(${DROP('bench.png', 'image/png', 'png')})();
				await new Promise((r) => setTimeout(r, 400));
				const files = [...document.querySelectorAll('.composer-screen .fup[data-role="attachment"] .fup-name')].map((n) => n.textContent.trim());
				return [
					refused && refusal.startsWith('worksheet.html was not attached') ? 'web page refused by name' : 'NOT REFUSED: ' + refusal.slice(0, 80),
					'files: ' + files.join(',')
				];
			}`,
			expected: ['web page refused by name', 'files: bench.png']
		}
	],
	contrast: [{ selector: '.composer-screen [data-testid="composer-drop-note"]', label: 'the drop note (the spec sent to the item page)', min: 4.5 }]
};
