/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE TRAINING VIDEO TRACKER (ledger 0391, surface e), on /dev/cert-watch
 * through the real `YouTubePlayer`. The harness blocks every non-loopback
 * request, so the REAL embed's API script never arrives and the state measured
 * there is the worded "did not load" one with its Reload key. The three fake
 * views drive `FakePlayer`: a saved 41% shows on the bar in words, a Continue
 * check-in opens as a 44px key in parent chrome after two played seconds, and
 * a check-in left three seconds goes missed and changes its words. Every word
 * clears 4.5:1 over the band's own ground.
 */
export default {
	path: '/dev/cert-watch',
	label: 'Certification training video: the did-not-load state, the coverage bar, a Continue check-in and a missed one',
	ignoreConsole: ['iframe_api', 'youtube', 'ERR_', 'Failed to load resource', 'net::'],
	prepare: [
		{ waitFor: `() => !!document.querySelector('[data-cert-watch-hydrated="yes"]')`, timeoutMs: 20000 },
		{ waitFor: `() => !!document.querySelector('[data-view="real"] [data-testid="cert-player-failed"]')`, timeoutMs: 20000 },
		{ waitFor: `() => !!document.querySelector('[data-view="checkin"] [data-testid="cert-player-checkin"]')`, timeoutMs: 20000 },
		{ waitFor: `() => document.querySelector('[data-view="missed"] [data-testid="cert-player-checkin"]')?.getAttribute('data-missed') === 'yes'`, timeoutMs: 20000 }
	],
	presence: [
		{ selector: '[data-view="real"] [data-testid="cert-player-failed"]', label: 'the real embed could not load here', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="real"] [data-testid="cert-player-reload"]', label: 'and offers Reload', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="fake"] iframe[data-fake-player]', label: 'the fake player mounted its frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="fake"] [data-testid="cert-player-coverage"] [role="progressbar"]', label: 'the coverage bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="fake"] [data-testid="cert-player-checkin"]', label: 'an idle player asks nothing (the control for the band)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="checkin"] [data-testid="cert-player-checkin"]', label: 'the Continue band', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="checkin"] [data-testid="cert-player-continue"]', label: 'one Continue key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="checkin"] [data-testid="cert-player"][data-playing="no"]', label: 'the video is paused while the band is up', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-view="missed"] [data-testid="cert-player-checkin"][data-missed="yes"]', label: 'a missed check-in says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view] .ytp-rules', label: 'the rules sentence under every player', expectPresent: 4, maxPresent: 4, expectVisible: 4 }
	],
	textContains: [
		{ selector: '[data-view="real"] [data-testid="cert-player-failed"]', label: 'the did-not-load sentence, verbatim', must: ['The player did not load. Check your connection and reload.'] },
		{ selector: '[data-view="fake"] [data-testid="cert-player-coverage-words"]', label: 'saved progress in words', must: ['41% played'] },
		{ selector: '[data-view="checkin"] [data-testid="cert-player-checkin"]', label: 'the band asks in words', must: ['Still watching', 'Continue'] },
		{ selector: '[data-view="missed"] [data-testid="cert-player-checkin"]', label: 'the missed words', must: ['stopped counting', 'Continue'] },
		{ selector: '[data-view="fake"] .ytp-rules', label: 'the rules sentence', must: ['Only time the video actually plays counts', '2x', '95%'] }
	],
	tapTargets: [
		{ selector: '[data-view="real"] [data-testid="cert-player-reload"]', label: 'Reload', min: 44 },
		{ selector: '[data-view="checkin"] [data-testid="cert-player-continue"]', label: 'Continue', min: 44 },
		{ selector: '[data-view="missed"] [data-testid="cert-player-continue"]', label: 'Continue after a miss', min: 44 },
		{ selector: '[data-view="fake"] [data-testid="cert-watch-controls"] .btn', label: 'the harness controls', min: 44 }
	],
	contrast: [
		{ selector: '[data-view="real"] [data-testid="cert-player-failed"] .ytp-words', label: 'the did-not-load words', min: 4.5 },
		{ selector: '[data-view="checkin"] [data-testid="cert-player-checkin"] .ytp-words', label: 'the band words', min: 4.5 },
		{ selector: '[data-view="missed"] [data-testid="cert-player-checkin"] .ytp-words', label: 'the missed words', min: 4.5 },
		{ selector: '[data-view="fake"] [data-testid="cert-player-coverage-words"]', label: 'the coverage words', min: 4.5 },
		{ selector: '[data-view="fake"] .ytp-rules', label: 'the rules sentence', min: 4.5 }
	]
};
