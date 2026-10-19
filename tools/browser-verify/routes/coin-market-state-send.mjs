import { hydrated } from './_coin-market.mjs';

/** Send coins with a PIN set: a classmate picked, an amount, a message, the private choice priced, and the PIN. */
export default {
	path: '/dev/coin-market-state-send',
	aliasOf: '/dev/coin-market?pin=1',
	label: 'IDEA Market: the transfer sheet, filled in',
	prepare: [
		...hydrated(),
		{ click: '[data-testid="mk-send-open"]', until: '() => !!document.querySelector("[data-testid=\\"mk-send-amount\\"]")' },
		{ click: '[data-testid="mk-send-person"]', until: '() => !!document.querySelector("[data-testid=\\"mk-send-person\\"][aria-selected=\\"true\\"]")' },
		{
			evaluate:
				'() => { const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }; set("[data-testid=\\"mk-send-amount\\"]", "2"); set("[data-testid=\\"mk-send-message\\"]", "For the sanding"); const p = document.querySelector("[data-testid=\\"mk-send-private\\"]"); if (p && !p.checked) p.click(); set("[data-testid=\\"mk-send-pin\\"]", "1234"); return true; }'
		}
	],
	presence: [
		{ selector: '[data-testid="mk-send-pin"]', label: 'the PIN box', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-send-private"]', label: 'the private choice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-send-go"]', label: 'Send', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-send-locked"]', label: 'not locked', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="mk-transfer-sheet"]', label: 'the private fee is priced in words', must: ['10%', '0.20'] },
		{ selector: '[data-testid="mk-send-room"]', label: "today's room is said", must: ['Sent today 4i¢ of 20i¢'] }
	],
	tapTargets: [{ selector: '[data-testid="mk-transfer-sheet"] button', label: 'every key in the sheet', min: 44 }],
	contrast: [{ selector: '[data-testid="mk-transfer-sheet"] label, [data-testid="mk-transfer-sheet"] p', label: 'sheet words', min: 4.5 }]
};
