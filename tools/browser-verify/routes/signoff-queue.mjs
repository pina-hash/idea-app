// Ledger 0436, 0304: the sign-off queue on a phone, three teams waiting. The
// oldest is open; its taps, Approve and Send back clear the floating feedback key.
export default {
	path: '/dev/signoff-queue',
	label: 'Sign-off queue (three requests, oldest open)',
	tapTargets: [
		{ selector: '[data-testid="signoff-queue"] .sq-key', label: 'Pass and Fail keys', min: 44 },
		{ selector: '[data-testid="signoff-approve"]', label: 'Approve', min: 44 },
		{ selector: '[data-testid="signoff-send-back"]', label: 'Send back', min: 44 }
	],
	presence: [
		{ selector: '[data-testid="signoff-request"]', label: 'one request open at a time', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="signoff-queue"] .sq-rest li', label: 'the other two waiting', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="signoff-queue"] textarea', label: 'nothing to type', expectPresent: 0 }
	]
};
