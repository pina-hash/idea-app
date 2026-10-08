/**
 * POSTING A NOTICE WITH FILES (ledger 0368, report R04), at 375 and 1440.
 *
 * The composer offers the classroom's one upload panel (no `accept`), the
 * teacher stages two pictures and a file the in-memory upload refuses, and
 * presses Post: ONE create, then the uploads onto that notice, in order. The
 * refused file stays with its sentence, the composer says one file did not
 * attach, and "Attach the rest" sends it to the SAME notice: still one create.
 */
import { IGNORE, READY } from './_class-header.mjs';

const FLOW = `async () => {
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const box = document.querySelector('[data-testid="quick-post-text"]');
	const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
	set.call(box, 'Photos from the load test.');
	box.dispatchEvent(new Event('input', { bubbles: true }));
	const input = document.querySelector('[data-testid="quick-post-composer"] input[type="file"]:not([capture])');
	const dt = new DataTransfer();
	for (const name of ['rig.png', 'span.jpg', 'fail-sheet.pdf']) dt.items.add(new File([new Uint8Array(2048)], name));
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
	await wait(100);
	const staged = document.querySelectorAll('[data-testid="quick-post-composer"] [data-testid="fup-row"]').length;
	document.querySelector('[data-testid="quick-post-send"]').click();
	/* Done when the composer says how the pass went (not while it attaches). */
	const said = () => document.querySelector('[data-testid="quick-post-posted"]')?.textContent || '';
	for (let i = 0; i < 120 && !/did not attach|every file attached/.test(said()); i++) await wait(50);
	const log = () => (document.querySelector('[data-testid="class-header-harness"]').dataset.log || '').split('|').filter(Boolean);
	const afterPost = log();
	const posted = document.querySelector('[data-testid="quick-post-posted"]')?.textContent.replace(/\\s+/g, ' ').trim() || '';
	const left = document.querySelectorAll('[data-testid="quick-post-composer"] [data-testid="fup-row"]').length;
	const tiles = document.querySelectorAll('[data-post^="qp-new"] [data-testid="attach-gallery-tile"]').length;
	document.querySelector('[data-testid="quick-post-attach-rest"]')?.click();
	for (let i = 0; i < 60 && !/every file attached/.test(said()) && document.querySelector('[data-testid="quick-post-composer"]'); i++) await wait(50);
	const afterRetry = log();
	return [
		'staged=' + staged,
		'creates=' + afterPost.filter((l) => l.startsWith('create ')).length,
		'uploads after Post=' + afterPost.filter((l) => l.startsWith('upload ')).length,
		'said one did not attach=' + /1 file did not attach/.test(posted),
		'left staged=' + left,
		'tiles on the notice=' + tiles,
		'creates after Attach the rest=' + afterRetry.filter((l) => l.startsWith('create ')).length,
		'retry went to the same notice=' + (afterRetry.filter((l) => l.startsWith('upload ')).map((l) => l.split(' ')[1]).every((id, _i, all) => id === all[0]))
	];
}`;

export default {
	path: '/dev/class-header?role=teacher&posts=0&compose=1',
	label: 'Quick post with files: one post, the uploads onto it, and a retry onto the same notice',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header has painted' },
		{ waitFor: `() => !!document.querySelector('[data-testid="quick-post-composer"] input[type="file"]')`, label: 'the composer offers the file picker', timeoutMs: 20000 }
	],
	presence: [
		{ selector: '[data-testid="quick-post-composer"] input[type="file"]:not([accept])', label: 'the plain picker, no accept (visually inside its Choose files key)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="quick-post-composer"] input[type="file"][accept]', label: 'no filtered picker', expectPresent: 0, maxPresent: 0 }
	],
	tapTargets: [{ selector: '[data-testid="quick-post-composer"] .fup-pick', label: 'Choose files', min: 44 }],
	orderResult: [
		{
			label: 'one create, two uploads land, the refused file stays, and Attach the rest goes to the same notice',
			evaluate: FLOW,
			expected: [
				'staged=3',
				'creates=1',
				'uploads after Post=3',
				'said one did not attach=true',
				'left staged=1',
				'tiles on the notice=2',
				'creates after Attach the rest=1',
				'retry went to the same notice=true'
			]
		}
	]
};
