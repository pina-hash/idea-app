/**
 * A file dropped on the composer reaches the box built for it (ledger 0297,
 * package ITEM; report 21): a photograph to Files, a spec to the spec
 * importer, a ported document to its own box, a zip to the choice. Each drop
 * is a real DragEvent with a real DataTransfer on the title field, which the
 * browser's own drag pipeline did not produce; tests/dom pins the same routing
 * in happy-dom, and this is where the destination's position can be asked.
 */
export default {
	path: '/dev/composer-drop',
	label: 'Composer drop routing: every file to its own box, and into view',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'.composer input[type="text"]\')' },
		{
			evaluate: `async () => {
				const out = [];
				for (const kind of ['png', 'spec', 'html', 'pictures']) {
					await window.__composerDrop(kind);
					await new Promise((r) => setTimeout(r, 700));
					out.push(kind);
				}
				return out.join(',');
			}`,
			until: '() => document.querySelectorAll(\'[data-testid="zip-choice"]\').length === 1'
		}
	],
	orderResult: [
		{
			label: 'each box received its own file, and the Files list only the photograph',
			evaluate: `() => {
				const s = window.__composerState();
				return [
					'files: ' + (s.files ?? []).join(','),
					'spec: ' + (s.spec.includes('schemaVersion') ? 'in the importer' : 'missing'),
					'document: ' + (s.html + s.htmlIssues > 0 ? 'judged by its box' : 'missing'),
					'zip: ' + s.zips.map((z) => z[0]).join(',')
				];
			}`,
			expected: [
				'files: bench.png',
				'spec: in the importer',
				'document: judged by its box',
				'zip: Image gallery (3 pictures)'
			]
		},
		{
			label: 'the last box a drop went to is on screen',
			evaluate: `() => {
				const all = document.querySelectorAll('[data-testid="zip-choice"]');
				const el = all[all.length - 1];
				if (!el) return ['absent'];
				const b = el.getBoundingClientRect();
				return [b.top < innerHeight && b.bottom > 0 ? 'in view' : 'off screen'];
			}`,
			expected: ['in view']
		}
	],
	tapTargets: [{ selector: '[data-testid="zip-choice"] button', label: 'the zip choice buttons', min: 44 }],
	contrast: [{ selector: '[data-testid="zip-choice-why"]', label: 'why a choice is absent', min: 4.5 }]
};
