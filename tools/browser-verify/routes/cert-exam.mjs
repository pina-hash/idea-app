/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE EXAM RUNTIME (ledger 0391, surface e): every state of `ExamRunner` and
 * the proctor's `ProctorLive`, stacked on /dev/cert-exam through the real
 * components over in-memory transports. What has to be true: the lobby has one
 * Begin exam key and both sentences; the question state has exactly one Next
 * key, which is aria-disabled (never disabled) until an answer is complete,
 * four 44px option rows and NO back control of any spelling; the failed state
 * names the missed TOPICS and the cooldown date and carries no question or
 * option text (the question state is the positive control for those strings);
 * the passed state says Passed; the expired state says to ask the proctor; the
 * live view shows four rows, one End exam key (the one in-progress exam), a
 * bad-toned flag count on the flagged row, and every word clears 4.5:1.
 */
const NEXT = `document.querySelector('[data-view="question"] [data-testid="cert-exam-next"]')`;

export default {
	path: '/dev/cert-exam',
	label: 'Certification exam runtime: lobby, a question, failed, passed, expired, and the live proctor view',
	prepare: [
		{ waitFor: `() => !!document.querySelector('[data-cert-exam-hydrated="yes"]')`, timeoutMs: 20000 },
		{ waitFor: `() => !!document.querySelector('[data-view="question"] [data-testid="cert-exam-option"]')`, timeoutMs: 10000 },
		{ evaluate: `() => 'nothing picked: aria-disabled=' + ${NEXT}?.getAttribute('aria-disabled')`, until: `() => ${NEXT}?.getAttribute('aria-disabled') === 'true'` },
		{ click: '[data-view="question"] [data-testid="cert-exam-option"]:first-child input', until: `() => ${NEXT}?.getAttribute('aria-disabled') === 'false'` }
	],
	orderResult: [
		{
			label: 'Next is never disabled, only aria-disabled',
			evaluate: `() => [${NEXT}?.disabled]`,
			expected: [false]
		},
		{
			label: 'the question state offers no control that moves backward',
			evaluate: `() => [...document.querySelectorAll('[data-view="question"] button, [data-view="question"] a')].filter((b) => /\\b(back|previous)\\b/i.test(b.textContent || '')).length`,
			expected: 0
		},
		{
			label: 'the live view has polled at least once',
			evaluate: `() => Number(document.querySelector('[data-cert-exam-hydrated]')?.getAttribute('data-live-polls')) >= 1`,
			expected: true
		}
	],
	presence: [
		{ selector: '[data-view="lobby"] [data-testid="cert-exam-begin"]', label: 'one Begin exam key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="lobby"] [data-testid="cert-exam-waiting"]', label: 'the release sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="lobby"] [data-testid="cert-exam-lockdown-words"]', label: 'the lockdown sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-next"]', label: 'exactly one Next key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-next"][aria-disabled="false"]', label: 'armed once an option is picked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-back"], [data-view="question"] [data-testid="cert-exam-back-link"]', label: 'no back control', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-option"]', label: 'four option rows', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-option"].is-picked', label: 'one picked row, lit as well as checked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-counter"]', label: 'the counter', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-remaining"]', label: 'the time remaining', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="failed"] [data-testid="cert-exam-failed"]', label: 'the failed panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="failed"] [data-testid="cert-exam-topics"] li', label: 'two missed topics', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="failed"] [data-testid="cert-exam-option"], [data-view="failed"] [data-testid="cert-exam-prompt"]', label: 'no question and no option reaches the failed state', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="failed"] [data-testid="cert-exam-cooldown"]', label: 'the cooldown sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="passed"] [data-testid="cert-exam-passed"]', label: 'the passed panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="passed"] [data-testid="cert-exam-topics"]', label: 'a pass lists no topics', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="expired"] [data-testid="cert-exam-expired"]', label: 'the expired panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="expired"] [data-testid="cert-exam-begin"]', label: 'an expired release offers no Begin', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"]', label: 'four live rows', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-view="live"] [data-testid="cert-live-end"]', label: 'End exam on the one in-progress row only', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="live"] [data-testid="cert-live-release"]', label: 'Release again on the one expired row only', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"][data-flags="2"] [data-testid="cert-live-flag-count"].is-bad', label: 'the flagged row carries a bad-toned count', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"][data-flags="0"] [data-testid="cert-live-flag-count"].is-bad', label: 'an unflagged row does not', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="live"] [data-testid="cert-live-flags"]', label: 'the flag list is in a closed Disclosure (present, hidden)', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 }
	],
	textContains: [
		{ selector: '[data-view="question"] [data-testid="cert-exam-counter"]', label: 'the counter in words', must: ['Question 1 of 5'] },
		{ selector: '[data-view="question"] [data-testid="cert-exam-question"]', label: 'the question state shows the prompt and the options (the control)', must: ['Which jaw of the mill vise is the fixed jaw?', 'The jaw at the back, away from you'], mustNot: ['Back', 'Previous'] },
		{ selector: '[data-view="question"] [data-testid="cert-exam-nav-note"]', label: 'the nav note says there is no going back', must: ['no going back'] },
		{ selector: '[data-view="failed"]', label: 'the failed state names topics, the date, and no question or option', must: ['Not this time', 'Workholding and setup', 'Speeds and feeds', 'You can take this exam again on'], mustNot: ['Which jaw', 'The jaw at the back', 'Bite in thick', 'reamer', 'parallels'] },
		{ selector: '[data-view="passed"]', label: 'the passed state', must: ['Passed', '5 of 5 correct'] },
		{ selector: '[data-view="expired"] [data-testid="cert-exam-expired-words"]', label: 'the expired sentence', must: ['This release has expired. Ask your proctor to release the exam again.'] },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"][data-state="in_progress"]', label: 'an in-progress row: name, counter, remaining, flags', must: ['Ana Reyes', 'Question 4 of 20', 'left', '2 flags', 'In progress'] },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"][data-state="released"]', label: 'a released row waits to open', must: ['Ben Okafor', 'Released, waiting to open', 'Release ends in', 'No flags'] },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"][data-state="submitted"]', label: 'a submitted row says the verdict in words', must: ['Maria Lopez', 'Passed'] },
		{ selector: '[data-view="live"] [data-testid="cert-live-row"][data-state="expired"]', label: 'an expired row', must: ['Release expired'] }
	],
	tapTargets: [
		{ selector: '[data-view="lobby"] [data-testid="cert-exam-begin"]', label: 'Begin exam', min: 44 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-option"]', label: 'the option rows', min: 44 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-next"]', label: 'Next question', min: 44 },
		{ selector: '[data-view="failed"] .cert-btn, [data-view="passed"] .cert-btn, [data-view="expired"] .cert-btn', label: 'the back links', min: 44 },
		{ selector: '[data-view="live"] .btn', label: 'every live key', min: 44 }
	],
	contrast: [
		{ selector: '[data-view="lobby"] .exam-lead', label: 'the lobby sentences', min: 4.5 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-prompt"]', label: 'the prompt', min: 4.5 },
		{ selector: '[data-view="question"] .exam-option-text', label: 'the option text', min: 4.5 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-counter"]', label: 'the counter', min: 4.5 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-remaining"]', label: 'the clock', min: 4.5 },
		{ selector: '[data-view="question"] [data-testid="cert-exam-nav-note"]', label: 'the nav note', min: 4.5 },
		{ selector: '[data-view="failed"] .exam-topic', label: 'the missed topics', min: 4.5 },
		{ selector: '[data-view="failed"] [data-testid="cert-exam-cooldown"]', label: 'the cooldown sentence', min: 4.5 },
		{ selector: '[data-view="failed"] .exam-verdict', label: 'the failed readout', min: 4.5 },
		{ selector: '[data-view="passed"] .exam-verdict', label: 'the passed readout', min: 4.5 },
		{ selector: '[data-view="expired"] [data-testid="cert-exam-expired-words"]', label: 'the expired sentence', min: 4.5 },
		{ selector: '[data-view="live"] .pl-name', label: 'student names', min: 4.5 },
		{ selector: '[data-view="live"] .pl-cert', label: 'the certification line', min: 4.5 },
		{ selector: '[data-view="live"] [data-testid="cert-live-state"]', label: 'the state readouts', min: 4.5 },
		{ selector: '[data-view="live"] [data-testid="cert-live-flag-count"]', label: 'the flag counts', min: 4.5 }
	]
};
