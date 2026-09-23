/**
 * THE SAME CAPTURE ON AN ITEM WITH NO CHECK-IN (ledger 0297, package F4b): the
 * entry is filed to the class with the item's title (`custom_label`) rather
 * than to a check-in pair. Everything else below is the sibling spec's.
 *
 * CAPTURE WHERE THE WORK IS: a student on an item
 * page adds two photos to the notebook in one step, and each is uploaded as a
 * draft the moment it is taken. `/dev/notebook-capture` mounts the REAL shell,
 * split, class list and ItemDetail, with the REAL NotebookCapture handed in as
 * the item route hands it; the "server" answers in memory after 150ms.
 *
 * THE PREPARE STEP DROPS TWO PNGs ONTO THE PICKER the way a laptop's file
 * dialog does (a DataTransfer assigned to the input, then `change`), and waits
 * for both to read Uploaded. What is then asserted is the whole claim:
 *   - FILED: the first photo POSTed as a DRAFT with the check-in's pair, the
 *     second onto the entry it got back (read off the harness's call log).
 *   - VISIBLE STATE: each page names its state in words and a glyph.
 *   - STRAIGHTEN IS A CHOICE AFTER THE FACT, on the latest page only: one
 *     control, on page 2 (the positive control is that it is present at all).
 *   - Turn in, Take a photo and Add photos clear 44px and hit-test to
 *     themselves (the Voice float sits at the bottom of a phone).
 */
const drop = `() => {
	const input = document.querySelector('[data-testid="capture-pick-input"]');
	const make = (seed) => new Promise((resolve) => {
		const c = document.createElement('canvas');
		c.width = 480; c.height = 360;
		const g = c.getContext('2d');
		for (let y = 0; y < 360; y += 24) for (let x = 0; x < 480; x += 24) {
			g.fillStyle = ((x + y) / 24 + seed) % 2 ? '#f0ecdc' : '#3c5078';
			g.fillRect(x, y, 24, 24);
		}
		c.toBlob((b) => resolve(new File([b], 'page' + (seed + 1) + '.png', { type: 'image/png' })), 'image/png');
	});
	return Promise.all([make(0), make(1)]).then((files) => {
		const dt = new DataTransfer();
		for (const f of files) dt.items.add(f);
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	});
}`;

export default {
	path: '/dev/notebook-capture?latency=150&item=i-2',
	label: 'Item page notebook capture on an item with no check-in (filed to the class with the item title)',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'[data-testid="capture-pick-input"]\')', timeoutMs: 30_000 },
		{ evaluate: drop },
		{
			waitFor:
				'() => [...document.querySelectorAll(\'[data-testid="capture-state"]\')].filter((e) => /Uploaded/.test(e.textContent)).length === 2',
			timeoutMs: 20_000
		}
	],
	presence: [
		{ selector: '[data-testid="capture"]', label: 'the capture block', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="capture-take"]', label: 'Take a photo', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="capture-pick"]', label: 'Add photos', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="capture-page"]', label: 'the two pages', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="capture-straighten"]', label: 'Straighten, on the latest page only', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-check-in"]', label: 'a check-in row (must be absent: this item has none)', expectPresent: 0 },
		{ selector: '[data-testid="capture-filed"]', label: 'an already-filed list (must be absent: nothing turned in yet)', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'filed as a draft against the check-in, then joined onto the entry it created; straighten sits on page 2',
			evaluate: `() => {
				const log = (window.__captureLog || []).map((l) => l.call + ' ' + l.detail);
				const straight = document.querySelector('[data-testid="capture-straighten"]');
				const page = straight ? straight.closest('[data-testid="capture-page"]').querySelector('.nbc-page-num').textContent.trim() : 'none';
				return [
					'first call: ' + (log[0] || '').replace(/page1-c[a-z0-9]{8}/, 'page1').replace(/ submitted=/, ' | submitted='),
					'second call: ' + (log[1] || '').replace(/page2-c[a-z0-9]{8}/, 'page2'),
					'calls: ' + log.length,
					'straighten on: ' + page
				];
			}`,
			expected: [
				'first call: upload page1.png section_id,custom_label,submitted | submitted=false',
				'second call: add-photo page2.png original -> e-1',
				'calls: 2',
				'straighten on: Page 2'
			]
		}
	],
	contrast: [
		{ selector: '[data-testid="capture-state"]', label: 'page state words', min: 4.5 },
		{ selector: '.nbc-page-num', label: 'page numbers', min: 4.5 },
		{ selector: '[data-testid="capture-open"]', label: 'Open in notebook', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="capture-take"]', label: 'Take a photo', min: 44 },
		{ selector: '[data-testid="capture-pick"]', label: 'Add photos', min: 44 },
		{ selector: '[data-testid="capture-turn-in"]', label: 'Turn in', min: 44 },
		{ selector: '[data-testid="capture-straighten"]', label: 'Straighten', min: 44 }
	],
	ignoreConsole: ['\\[404 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
