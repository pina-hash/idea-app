/**
 * WRITING A QUICK POST (ledger 0360, report R22), at 375 and 1440, from a
 * class with no notice up yet.
 *
 * Mr. Pina: "The amount of steps it takes me to do that should be absolutely
 * minimal." Pressing Quick post opens the composer with the box focused, this class chosen and the
 * end of the school day pressed, each end saying the time it means. The run
 * types a notice and presses Post: one call, to this class, and the board says
 * where it went and until when, after the composer has closed.
 */
import { IGNORE, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?role=teacher&posts=0',
	label: 'Quick post composer: the defaults, the ends in words, and one press to post',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header has painted' },
		{
			click: '[data-testid="quick-post-open"]',
			until: `() => !!document.querySelector('[data-testid="quick-post-composer"]')`,
			label: 'press Quick post: the composer opens'
		},
		{
			label: 'the box is focused on open, and the default end is pressed',
			evaluate: `() => {
				const box = document.querySelector('[data-testid="quick-post-text"]');
				const pressed = [...document.querySelectorAll('[data-testid="quick-post-preset"][aria-pressed="true"]')].map((b) => b.dataset.preset);
				window.__qpOpen = { focused: document.activeElement === box, pressed: pressed.join(',') };
				return JSON.stringify(window.__qpOpen);
			}`
		}
	],
	presence: [
		{ selector: '[data-testid="quick-post-composer"]', label: 'the composer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-preset"]', label: 'the seven ends', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="quick-post-target-this"]', label: 'This class', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-target-mine"]', label: 'All my classes', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-target-choose"]', label: 'Choose classes', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-open"][aria-expanded="true"].on', label: 'Quick post, lit while the composer is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="quick-post-composer"] .qp-label', label: 'a field label', min: 4.5 },
		{ selector: '[data-testid="quick-post-count"]', label: 'the character count', min: 4.5 },
		{ selector: '[data-testid="quick-post-preset"] .qp-key-hint', label: 'what an end means', min: 4.5 },
		{ selector: '[data-testid="quick-post-text"]', label: 'the box', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="quick-post-preset"]', label: 'an end', min: 44 },
		{ selector: '[data-testid="quick-post-target-mine"]', label: 'All my classes', min: 44 },
		{ selector: '[data-testid="quick-post-send"]', label: 'Post', min: 44 },
		{ selector: '[data-testid="quick-post-cancel"]', label: 'Cancel', min: 44 },
		{ selector: '[data-testid="quick-post-text"]', label: 'the box', min: 44 }
	],
	orderResult: [
		{
			label: 'focused on open, with the end of the school day pressed',
			evaluate: `() => { const o = window.__qpOpen || {}; return ['focused=' + o.focused, 'pressed=' + o.pressed]; }`,
			expected: ['focused=true', 'pressed=school-day']
		},
		{
			label: 'type, press Post: one call to this class, the composer closes, and the board says where and until when',
			evaluate: `async () => {
				const box = document.querySelector('[data-testid="quick-post-text"]');
				const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
				set.call(box, 'Special schedule today: we meet in the shop.');
				box.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 50));
				document.querySelector('[data-testid="quick-post-send"]').click();
				for (let i = 0; i < 60 && document.querySelector('[data-testid="quick-post-composer"]'); i++) await new Promise((r) => setTimeout(r, 50));
				const log = document.querySelector('[data-testid="class-header-harness"]').dataset.log || '';
				const ack = document.querySelector('[data-testid="quick-post-ack"]')?.textContent.trim() || '';
				return [
					'calls=' + log.split('|').filter(Boolean).length,
					'to=' + (log.match(/^create (\\S+)/) || [])[1],
					'composer=' + document.querySelectorAll('[data-testid="quick-post-composer"]').length,
					'notices=' + document.querySelectorAll('[data-testid="quick-post"]').length,
					'ack=' + /^Posted to 1 class, until /.test(ack)
				];
			}`,
			expected: ['calls=1', 'to=s-2', 'composer=0', 'notices=1', 'ack=true']
		}
	]
};
