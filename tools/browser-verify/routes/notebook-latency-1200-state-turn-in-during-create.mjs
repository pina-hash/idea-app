/**
 * TURN IN PRESSED WHILE THE FIRST AUTOSAVE IS STILL ON ITS WAY TURNS IN EVERY
 * WORD IN THE BOX (ledger 0298 review).
 *
 * The companion of `notebook-latency-1200.mjs`, which settles on Saved and
 * reads the store. This one drives the consequence that spec only reasons
 * about: the autosave's CREATE used to advance the baseline to the words ON
 * SCREEN when its answer came back, so words typed during that round trip read
 * as already saved -- and a Turn in pressed right then waited for the create,
 * found nothing unsaved, and turned the entry in without them. Nothing on
 * screen said so: the box was cleared and "Entry turned in." was shown.
 *
 * It is a different code path from the settle one, which is why it is its own
 * spec: here the second write is sent by `SaveState.saveNow()` (the click's
 * flush) or by `continueSaved`'s own `persistNote`, never by the machine's
 * settle re-run alone.
 *
 * THE CLICK WAITS ON THE WRITE ITSELF, NEVER ON A CONSTANT. The first words
 * are typed, the step polls until the indicator reads `writing` AND the last
 * request in the log is the create, and only then types again and presses
 * Turn in -- and throws if the create had already landed, because the check
 * would then pass on the broken code for the wrong reason.
 */
const FIRST = 'First words of the entry.';
const DURING = 'Typed during the create, then turned in.';

const WAIT_AUTOPICK = {
	waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
	timeoutMs: 15_000
};

const WAIT_EDITOR = {
	waitFor: '() => !!document.querySelector(\'[data-testid="nb-compose"] [data-testid="note-editor-input"]\')',
	timeoutMs: 20_000
};

const TYPE_DURING_CREATE_THEN_TURN_IN = `async () => {
	const input = document.querySelector('[data-testid="nb-compose"] [data-testid="note-editor-input"]');
	const ind = () => document.querySelector('[data-testid="nb-compose"] .save-ind')?.className ?? '(no indicator)';
	const logLines = () => (document.querySelector('[data-testid="dev-log"]')?.textContent ?? '').split('\\n');
	const lastRequest = () => logLines().filter((l) => /^(POST|RPC) /.test(l.trim())).pop() ?? '';
	input.focus();
	document.execCommand('insertText', false, ${JSON.stringify(FIRST)});
	if (!(input.textContent || '').includes(${JSON.stringify(FIRST)})) throw new Error('the editor did not take the first words');
	const t0 = performance.now();
	while (!/\\bwriting\\b/.test(ind())) {
		if (performance.now() - t0 > 5000) throw new Error('no write went out within 5s; the indicator read ' + ind());
		await new Promise((r) => setTimeout(r, 25));
	}
	const departed = Math.round(performance.now() - t0);
	if (!/POST \\/api\\/notebook\\/note /.test(lastRequest())) throw new Error('the write on the wire is not the create: ' + lastRequest().trim());
	await new Promise((r) => setTimeout(r, 150));
	if (!/\\bwriting\\b/.test(ind())) throw new Error('the create landed before the second words could be typed; the indicator read ' + ind());
	input.focus();
	document.execCommand('insertText', false, ${JSON.stringify(' ' + DURING)});
	if (!(input.textContent || '').includes(${JSON.stringify(DURING)})) throw new Error('the editor did not take the words typed during the create');
	const button = document.querySelector('[data-testid="nb-compose"] [data-testid="nb-turn-in"]') ?? document.querySelector('[data-testid="nb-turn-in"]');
	if (!button) throw new Error('no Turn in button');
	if (button.disabled) throw new Error('Turn in is disabled while the create is in flight');
	if (!/\\bwriting\\b/.test(ind())) throw new Error('the create landed before Turn in could be pressed; the indicator read ' + ind());
	button.click();
	return 'create departed ' + departed + 'ms after the first words; typed during it and pressed Turn in while it was still in flight';
}`;

const WAIT_TURNED_IN = `async () => {
	const t0 = performance.now();
	for (;;) {
		const ok = document.querySelector('.feedback.ok')?.textContent ?? '';
		const err = document.querySelector('.feedback.error')?.textContent ?? '';
		if (err) throw new Error('Turn in reported: ' + err.trim());
		if (/turned in/i.test(ok)) return 'turned in after ' + Math.round(performance.now() - t0) + 'ms: ' + ok.trim();
		if (performance.now() - t0 > 15000) throw new Error('Turn in never finished; the notice read ' + JSON.stringify(ok));
		await new Promise((r) => setTimeout(r, 100));
	}
}`;

export default {
	path: '/dev/notebook?latency=1200&state=turn-in-during-create',
	aliasOf: '/dev/notebook?latency=1200',
	label: 'Notebook composer on a slow connection: Turn in pressed while the first autosave is on its way turns in every word',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		{ evaluate: TYPE_DURING_CREATE_THEN_TURN_IN },
		{ evaluate: WAIT_TURNED_IN }
	],
	presence: [
		{ selector: '.feedback.ok', label: 'the turned-in notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.feedback.error', label: 'no error notice', expectPresent: 0, maxPresent: 0 }
	],
	orderResult: [
		{
			label: 'the entry was turned in holding the words typed during the create, and nothing unsent is left in the mirror',
			evaluate: `() => {
				const log = (document.querySelector('[data-testid="dev-log"]')?.textContent ?? '').split('\\n');
				const submitAt = log.findIndex((l) => l.includes('RPC notebook_submit_entry'));
				const before = submitAt < 0 ? [] : log.slice(0, submitAt);
				const held = before.filter((l) => l.includes('-> holds')).pop() ?? '';
				const creates = log.filter((l) => /POST \\/api\\/notebook\\/note /.test(l)).length;
				const slots = Object.keys(localStorage).filter((k) => k.startsWith('notebook_draft_mirror:u-self:'));
				return [
					submitAt >= 0 ? 'the entry was turned in' : 'NO TURN IN WAS SENT',
					held.includes(${JSON.stringify(DURING)}) ? 'the last write before the turn-in holds the words typed during the create' : 'TURNED IN HOLDING ' + held.trim(),
					creates === 1 ? 'exactly one entry was created' : creates + ' CREATES',
					slots.length === 0 ? 'no unsent writing left in the mirror' : 'MIRROR STILL HOLDS ' + JSON.stringify(slots)
				];
			}`,
			expected: [
				'the entry was turned in',
				'the last write before the turn-in holds the words typed during the create',
				'exactly one entry was created',
				'no unsent writing left in the mirror'
			]
		}
	],
	/* The fixture photos have no bytes behind the real proxy, so their
	   thumbnails 401 (notebook.mjs ignores the same line). */
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
