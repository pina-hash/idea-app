/**
 * THE SPAM FINE PROMPT AND THE REWARD CONTROL (ledger 0432) on the feedback
 * console, as /admin/feedback draws them, with made-up accounts: one that
 * burst (5i¢) and one whose evidence points away from the owner (a shared
 * lab computer and a nine-hour sign-in), which asks "Fine anyway". Nothing is
 * pressed: the measurement is that both cards and their keys are there, that
 * nothing overflows at 375px, and that every key clears 44px.
 */
export default {
	path: '/dev/feedback?view=console&spam=1',
	label: 'Feedback console with the spam fine prompt and the reward control',
	presence: [
		{ selector: '[data-testid="spam-fine-prompt"]', label: 'the spam card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="spam-fine-account"]', label: 'one card per account', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="spam-fine-doubts"]', label: 'doubts only where the evidence points away', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="spam-fine-go"]', label: 'a Fine key per account', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="spam-burst-sentence"]', label: 'the burst rule in one sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'button[data-testid^="fbc-reward-"]', label: 'the reward control on student reports', expectPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="spam-fine-prompt"]', label: 'the amounts and the wording', must: ['Fine 5i¢', 'Fine anyway, 1i¢', 'A burst is 3 or more spam reports', 'shared lab computer', 'Nothing is fined until you press Fine.'] }
	],
	tapTargets: [
		{ selector: '[data-testid="spam-fine-prompt"] button', label: 'the spam card keys', min: 44 },
		{ selector: 'button[data-testid^="fbc-reward-"]', label: 'the reward key', min: 44 }
	],
	contrast: [{ selector: '.sfp-doubts strong', label: 'the doubt line', min: 4.5 }]
};
