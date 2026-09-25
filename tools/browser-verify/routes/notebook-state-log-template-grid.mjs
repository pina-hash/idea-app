import { IGNORE_PHOTO_PROXY, OPEN_FILING, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * A TEMPLATE NEVER TAKES WHAT IS ALREADY IN THE BOX, A GRID INCLUDED (ledger
 * 0298 review). A grid is an atom whose cells live in its attributes, so a box
 * holding a filled grid and nothing else has no TEXT anywhere -- and the
 * composer's first cut asked "is there text" before deciding whether a
 * template replaced the box or appended to it. One press took the student's
 * numbers. `noteIsBlank` asks of the blocks instead, and this drives the real
 * composer through exactly that case: insert a grid, put a number in it, press
 * a template, and read back that the grid and its number are still there with
 * the headings AFTER them.
 *
 * AND "Manage folders" IN THE COMPOSER BRINGS THE MANAGER ON SCREEN. It opens
 * at the head of the feed, under the composer and the list head, which at
 * phone width with the filing panel open is below the fold; the check is a
 * HIT TEST at the manager's own name field, so a manager that opened off
 * screen (or under the sticky head above 1024px) reads as a failure.
 */
export default {
	path: '/dev/notebook?state=log-template-grid',
	label: 'Notebook log composer: a template added under a grid keeps the grid; Manage folders comes into view',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		{
			click: '[data-testid="nb-compose"] [data-testid="nb-insert-grid"]',
			until: '() => !!document.querySelector(\'[data-testid="nb-compose"] [data-testid="notebook-grid"]\')',
			attempts: 12,
			waitMs: 250
		},
		{
			click: '[data-testid="nb-compose"] [data-testid="grid-cell-A1"]',
			until: '() => !!document.querySelector(\'[data-testid="nb-compose"] [data-testid="grid-input-A1"]\')'
		},
		{
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="nb-compose"] [data-testid="grid-input-A1"]');
				input.value = '42';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
				for (let i = 0; i < 40; i++) {
					await new Promise((r) => setTimeout(r, 100));
					const face = document.querySelector('[data-testid="nb-compose"] [data-testid="grid-cell-A1"]');
					if (face && face.textContent.trim() === '42') return 'A1 holds 42';
				}
				throw new Error('the grid cell never took the number');
			}`
		},
		{
			click: '[data-testid="nb-template-build-log"]',
			until: '() => /What I built/.test(document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')?.textContent ?? "")'
		},
		OPEN_FILING,
		{
			click: '[data-testid="nb-filing-manage-folders"]',
			until: '() => !!document.querySelector(\'[data-testid="folder-manager"] [data-testid="folder-name"]\')',
			/* the scroll into view is scheduled after a tick */
			waitMs: 400
		}
	],
	presence: [
		{ selector: '[data-testid="nb-compose"] [data-testid="notebook-grid"]', label: 'the grid, still in the box after the template', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="folder-manager"]', label: 'the folder manager, opened from the composer', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="nb-filing-manage-folders"]', label: 'Manage folders (in the composer)', min: 44 }],
	orderResult: [
		{
			label: 'the grid and its number survive the template, headings after it; the manager is on screen',
			evaluate: `() => {
				const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
				const kids = [...input.children];
				const gridAt = kids.findIndex((el) => !!el.querySelector('[data-testid="notebook-grid"]') || el.matches('[data-testid="notebook-grid"]'));
				const headAt = kids.findIndex((el) => el.textContent.trim() === 'What I built');
				const a1 = document.querySelector('[data-testid="nb-compose"] [data-testid="grid-cell-A1"]')?.textContent.trim();
				const name = document.querySelector('[data-testid="folder-manager"] [data-testid="folder-name"]');
				const r = name.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return [
					a1 === '42' ? 'the grid still holds 42' : 'A1 ' + JSON.stringify(a1),
					gridAt >= 0 && headAt > gridAt ? 'the headings come after the grid' : 'GRID ' + gridAt + ' HEADING ' + headAt,
					hit === name || name.contains(hit) ? 'the folder name field is on screen and takes a press' : 'HIT ' + (hit ? hit.outerHTML.slice(0, 80) : 'nothing')
				];
			}`,
			expected: [
				'the grid still holds 42',
				'the headings come after the grid',
				'the folder name field is on screen and takes a press'
			]
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
