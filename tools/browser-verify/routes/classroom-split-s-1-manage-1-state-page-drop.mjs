/**
 * A FILE DROPPED ON THE CLASS PAGE OPENS NEW POST WITH IT (report R01,
 * 2026-09-28), on the REAL ClassView and the REAL composer, owned by the
 * harness layout exactly as the section layout owns them.
 *
 *   1. While a file is dragged over the class page it says so IN WORDS, on
 *      screen wherever the page is scrolled (not only an outline).
 *   2. Letting a spec `.json` go opens New post as an ASSIGNMENT with the spec
 *      in its importer, and nothing on the Files list.
 *
 * A student's page takes no drop at all; that absence is pinned in
 * tests/dom/composer-drop-edit-mount.test.ts against the manager mount of the
 * same fixture. WHAT IS DISPATCHED IS A SYNTHETIC DROP: a real DragEvent with a
 * real DataTransfer and a real File, which the browser's own drag pipeline did
 * not produce.
 */
const SPEC = JSON.stringify({
	schemaVersion: 1,
	meta: { assignmentId: 'truss-02', title: 'PAGE-DROP-SENTINEL', totalPoints: 10 },
	modules: [{ id: 'm1', title: 'Truss', points: 10, blocks: [{ type: 'textField', id: 'b1', prompt: 'Member force.' }] }]
});

export default {
	path: '/dev/classroom-split/s-1?manage=1&state=page-drop',
	aliasOf: '/dev/classroom-split/s-1?manage=1',
	label: 'R01: a file dragged over the class page says where it goes, and a dropped spec opens New post as an assignment',
	prepare: [{ waitFor: '() => !!document.querySelector(\'.classroom-page [data-testid="new-post"]\')', timeoutMs: 20000 }],
	orderResult: [
		{
			label: 'dragging a file over the page: the words are on screen, and the page does not move',
			evaluate: `async () => {
				const page = document.querySelector('.classroom-page');
				const row = page.querySelector('[data-testid="item-row"]') ?? page;
				const before = page.getBoundingClientRect().height;
				const dt = new DataTransfer();
				dt.items.add(new File(['x'], 'bench.png', { type: 'image/png' }));
				for (const t of ['dragenter', 'dragover']) row.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
				await new Promise((r) => setTimeout(r, 200));
				const label = page.querySelector('[data-testid="class-page-drop-overlay"] .page-drop-label');
				const r = label ? label.getBoundingClientRect() : null;
				const out = [
					label ? label.textContent.trim() : 'NO WORDS',
					r && r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.left >= 0 && r.right <= innerWidth ? 'on screen' : 'off screen',
					Math.abs(page.getBoundingClientRect().height - before) < 1 ? 'page height unchanged' : 'page height moved'
				];
				row.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt }));
				await new Promise((r) => setTimeout(r, 100));
				out.push(page.querySelector('[data-testid="class-page-drop-overlay"]') ? 'words stay after leaving' : 'words gone after leaving');
				return out;
			}`,
			expected: ['Drop to start a new post with these files', 'on screen', 'page height unchanged', 'words gone after leaving']
		},
		{
			label: 'dropping a spec opens New post as an assignment, the spec in its importer and nothing on Files',
			evaluate: `async () => {
				const page = document.querySelector('.classroom-page');
				const row = page.querySelector('[data-testid="item-row"]') ?? page;
				const dt = new DataTransfer();
				dt.items.add(new File([${JSON.stringify(SPEC)}], 'truss-02.json', { type: 'application/json' }));
				for (const t of ['dragenter', 'dragover', 'drop']) row.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
				for (let i = 0; i < 40; i++) {
					if ((document.querySelector('[data-testid="spec-paste"]')?.value ?? '').includes('PAGE-DROP-SENTINEL')) break;
					await new Promise((r) => setTimeout(r, 100));
				}
				const files = [...document.querySelectorAll('.compose-card .fup[data-role="attachment"] .fup-name')].map((n) => n.textContent.trim());
				return [
					document.querySelector('.compose-card .composer') ? 'New post open' : 'no composer',
					'kind: ' + (document.querySelector('.compose-card .kind.active')?.textContent.trim() ?? 'none'),
					(document.querySelector('[data-testid="spec-paste"]')?.value ?? '').includes('PAGE-DROP-SENTINEL') ? 'spec in the importer' : 'spec missing',
					'files: ' + files.length
				];
			}`,
			expected: ['New post open', 'kind: Assignment', 'spec in the importer', 'files: 0']
		}
	]
};
