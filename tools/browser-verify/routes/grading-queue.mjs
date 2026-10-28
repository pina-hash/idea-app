export default {
	path: '/dev/grading-queue',
	label: 'Needs grading, every class at once, with a class left out and brought back (ledger 0457)',
	/*
		THE REAL `GradingQueue` over an in-memory read of four classes. The claim
		that matters is the exclusion: pressing Leave out on Block 4 takes that
		class and its students off the page and lists it under Left out, and
		Show again brings it back. Both directions are pressed here.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(\'[data-testid="queue-class"]\').length === 4' },
		{
			evaluate: `() => { try { localStorage.removeItem('idea.grading.queueExclude'); } catch {} return 'cleared'; }`
		}
	],
	presence: [
		{ selector: '[data-testid="queue-class"]', label: 'a card per class with work waiting', expectPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="queue-item"]', label: 'a row per waiting assignment', expectPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="queue-grade"]', label: 'a Grade link per row', expectPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="queue-leave-out"]', label: 'a Leave out key per class', expectPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="queue-left-out"]', label: 'no Left out bar before anything is left out', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="queue-total"]', label: 'the waiting total', min: 4.5 },
		{ selector: '.queue-meta', label: 'the due line of a row', min: 4.5 }
	],
	textContains: [
		{ selector: '[data-testid="queue-total"]', label: 'the total counts every waiting student', must: ['16 students waiting'] }
	],
	orderResult: [
		{
			/* LEAVE OUT, THEN SHOW AGAIN, by pressing the real keys. Block 4's
			   students must be absent after the first press and present after the
			   second, and the total must move by exactly its four. */
			evaluate: `async () => {
				const wait = (f) => new Promise((ok, no) => { const t0 = Date.now(); const tick = () => { if (f()) ok(true); else if (Date.now() - t0 > 4000) no(new Error('timed out')); else setTimeout(tick, 30); }; tick(); });
				const cards = () => [...document.querySelectorAll('[data-testid="queue-class"]')];
				const b4 = cards().find((c) => c.textContent.includes('Block 4'));
				if (!b4) return { ok: false, why: 'no Block 4 card' };
				b4.querySelector('[data-testid="queue-leave-out"]').click();
				await wait(() => cards().length === 3);
				const gone = !document.body.textContent.includes('Park, Jay') && !cards().some((c) => c.textContent.includes('Block 4'));
				const listed = (document.querySelector('[data-testid="queue-left-out"]')?.textContent ?? '').includes('Block 4');
				const total1 = document.querySelector('[data-testid="queue-total"]').textContent.trim();
				document.querySelector('[data-testid="queue-bring-back"]').click();
				await wait(() => cards().length === 4);
				const back = cards().some((c) => c.textContent.includes('Block 4'));
				const total2 = document.querySelector('[data-testid="queue-total"]').textContent.trim();
				return ['gone ' + gone, 'listed ' + listed, total1, 'back ' + back, total2];
			}`,
			expected: ['gone true', 'listed true', '12 students waiting', 'back true', '16 students waiting'],
			label: 'Leave out removes Block 4 and its students; Show again brings them back'
		}
	]
};
