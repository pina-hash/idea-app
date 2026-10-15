/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, THE CERTIFICATION PAGE (ledger 0391): seven states
 * stacked on /dev/cert-certification through the real `CertificationPage`.
 * What has to be true: the checklist names every part in order with a glyph
 * AND a word, a locked row says "Unlocks after <part>", Start is offered only
 * before an attempt and Withdraw only during one; a hand-in form is open only
 * for the part that is unlocked and pending (and never while a hand-in waits
 * for review); its Submit is `aria-disabled` with its reasons until every
 * required item and every box is in; a returned review shows its feedback
 * verbatim; the exam section offers "Open my exam" when one is released and
 * the cooldown sentence names a date; an Open key on the checklist lands its
 * section BELOW the sticky bar; every control clears 44px; the words clear
 * 4.5. The player inside the training section is surface e's; this spec
 * counts its mount and measures nothing inside it.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

/** Press the training state's Open key for the exam and say where the section landed against the bar. */
const JUMP = `() => {
	const a = document.querySelector('[data-view="training"] [data-testid="cert-check-row"][data-part="exam"] [data-testid="cert-check-open"]');
	if (!a) return 'NO OPEN KEY';
	a.click();
	const el = document.getElementById('kit-training-exam');
	const bar = document.querySelector('[data-testid="cert-header"]');
	if (!el || !bar) return 'NO SECTION OR BAR';
	const top = el.getBoundingClientRect().top;
	const bottom = bar.getBoundingClientRect().bottom;
	window.scrollTo({ top: 0, behavior: 'instant' });
	return [top >= bottom ? 'below the bar' : 'under the bar by ' + Math.round(bottom - top) + 'px'];
}`;

export default {
	path: '/dev/cert-certification',
	label: 'IDEA Certifications: the certification page (fresh, training, guided, exam, review, cooldown, complete)',
	prepare: [...certHydrated('certification')],
	orderResult: [{ label: 'an Open key scrolls its section fully into view below the sticky bar', evaluate: JUMP, expected: ['below the bar'] }],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-view="fresh"] [data-testid="cert-start"][data-enabled="yes"]', label: 'before an attempt: a live Start', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="fresh"] [data-testid="cert-withdraw"]', label: 'and no Withdraw', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="fresh"] [data-testid="cert-form-why"]', label: 'every hand-in form says to press Start (three parts take a hand-in)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="fresh"] [data-testid="cert-submission-form"]', label: 'and no form is open', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="training"] [data-testid="cert-check-row"]', label: 'five parts on the checklist', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-view="training"] [data-testid="cert-check-row"][data-locked="yes"]', label: 'four locked behind training', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-view="training"] [data-testid="cert-withdraw"]', label: 'during an attempt: Withdraw', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="training"] [data-testid="cert-start"]', label: 'and no Start', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="training"] [data-testid="cert-video"]', label: 'two training videos', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="training"] [data-testid="cert-video"][data-done="yes"]', label: 'one watched', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="training"] [data-testid="cert-lesson"]', label: 'one lesson', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="training"] [data-testid="cert-lesson-complete"]', label: 'with its Mark lesson complete key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="training"] [data-testid="cert-quick-check"]', label: 'two quick checks after their items', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="training"] [data-testid="cert-practice"]', label: 'the practice quiz', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="training"] [data-testid="cert-mistakes"] li', label: 'two common mistakes', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="training"] [data-testid="cert-submission-form"]', label: 'training not done: no hand-in form anywhere', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="training"] [data-testid="cert-form-why"][data-reason="locked"]', label: 'and each form says what unlocks it', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="guided"] [data-testid="cert-submission-form"][data-part="guided"]', label: 'training done: the guided form is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="guided"] [data-testid="cert-submission-form"]', label: 'and it is the only open form', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-view="guided"] [data-testid="cert-submit"][aria-disabled="true"]', label: 'its Submit is dark until the form is complete', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="guided"] [data-testid="cert-submit"][disabled]', label: 'and never disabled', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="guided"] [data-testid="cert-submit-problems"] li', label: 'the reasons are listed (two required items, three boxes as one line)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="guided"] [data-testid="cert-evidence-item"]', label: 'three evidence items', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="guided"] [data-testid="cert-evidence-uploader"]', label: 'one of them a photo uploader', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="guided"] [data-testid="cert-evidence-camera"]', label: 'with a camera key beside the picker', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-view="guided"] [data-testid="cert-inspection-box"]', label: 'three self-inspection boxes', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="guided"] [data-testid="cert-step"]', label: 'five guided steps', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-view="guided"] [data-testid="cert-step"][data-fade="full"]', label: 'two shown in full', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="guided"] [data-testid="cert-step-hint"]', label: 'three hints behind a Show hint key', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="guided"] [data-testid="cert-step-hint"][aria-expanded="false"]', label: 'every hint closed on arrival', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="guided"] [data-testid="cert-outside-help"]', label: 'the autonomous project says it is done alone', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="review"] [data-testid="cert-review"]', label: 'two hand-ins in the history', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="review"] [data-testid="cert-review"][data-state="failed"]', label: 'one returned not passed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="review"] [data-testid="cert-review-feedback"]', label: 'with its feedback', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="review"] [data-testid="cert-review"][data-state="pending"]', label: 'one waiting for review', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="review"] [data-testid="cert-form-why"][data-reason="pending"]', label: 'so the form is closed and says why', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="review"] [data-testid="cert-submission-form"][data-part="guided"]', label: 'no second hand-in while one waits (the control)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="exam"] [data-testid="cert-exam-open-key"]', label: 'a released exam: Open my exam', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="exam"] [data-testid="cert-sitting-signup"], [data-view="exam"] [data-testid="cert-seat-request"]', label: 'and no seat controls while one is released', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="exam"] [data-testid="cert-submission-form"][data-part="autonomous"]', label: 'exam pending: the autonomous form stays shut', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="cooldown"] [data-testid="cert-exam-cooldown"]', label: 'a failed exam: the cooldown sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="cooldown"] [data-testid="cert-exam-attempt"][data-passed="no"]', label: 'and the attempt as a row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="cooldown"] [data-testid="cert-sitting-signup"]', label: 'no sign-up during a cooldown', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="complete"] [data-testid="cert-check-row"][data-state="done"]', label: 'complete: five done rows', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-view="complete"] [data-testid="cert-checklist-earned"]', label: 'and Earned with the date', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="complete"] [data-testid="cert-withdraw"], [data-view="complete"] [data-testid="cert-start"]', label: 'neither Start nor Withdraw (the control)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="training"] [data-testid="cert-kit-section"]', label: 'nine kit sections, every one anchored', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-view="training"] [data-testid="cert-kit-section"][id]', label: 'and every one carries an id', expectPresent: 9, maxPresent: 9 }
	],
	textContains: [
		{ selector: '[data-view="training"] [data-testid="cert-check-row"][data-part="guided"]', label: 'a locked row names what unlocks it', must: ['Guided project', 'Unlocks after Training'] },
		{ selector: '[data-view="training"] [data-testid="cert-check-row"][data-part="training"]', label: 'the next row says Next', must: ['Training', 'Next'] },
		{ selector: '[data-view="guided"] [data-testid="cert-check-row"][data-part="training"]', label: 'a done row says who checked it (itself) and when', must: ['Done', 'Checked itself off', 'October 3, 2026'] },
		{ selector: '[data-view="training"] [data-testid="cert-checklist-progress"]', label: 'progress in words', must: ['0 of 5 parts done'] },
		{ selector: '[data-view="exam"] [data-testid="cert-checklist-progress"]', label: 'progress moves', must: ['2 of 5 parts done'] },
		{ selector: '[data-view="training"] [data-testid="cert-video"][data-done="no"]', label: 'an unfinished video says how much played', must: ['43% played'] },
		{ selector: '[data-view="training"] [data-testid="cert-video"][data-done="yes"]', label: 'a finished one says Watched', must: ['Watched'] },
		{ selector: '[data-view="training"] .cert-video-rules', label: 'the watch rules sentence', must: ['speeds above 2x are blocked', '95%'] },
		{ selector: '[data-view="guided"] [data-testid="cert-submit-problems"]', label: 'the Submit reasons in words', must: ['The finished block beside the drawing is required', 'Your measured dimensions, one per line is required', '3 self-inspection boxes still unticked'] },
		{ selector: '[data-view="review"] [data-testid="cert-review-feedback"]', label: 'the feedback, verbatim', must: ['The step is 0.012 in deep', 'Resubmit when the step is in.'] },
		{ selector: '[data-view="review"] [data-testid="cert-review"][data-state="failed"]', label: 'who reviewed it and when', must: ['Fail', 'Mr. Pina', 'October 7, 2026'] },
		{ selector: '[data-view="exam"] [data-testid="cert-exam-seat"]', label: 'the booked seat in words with its time, kept above the released exam', must: ['Signed up for October 22, 2026'] },
		{ selector: '[data-view="exam"] [data-testid="cert-exam-topics"]', label: 'the topics', must: ['Workholding and setup', 'Speeds and feeds', 'Safety at the mill', 'Measurement and finishing'] },
		{ selector: '[data-view="exam"] [data-testid="cert-exam-lockdown"]', label: 'the lockdown sentence', must: ['One question at a time', '100% passes'] },
		{ selector: '[data-view="cooldown"] [data-testid="cert-exam-cooldown"]', label: 'the cooldown names a date, never a weekday', must: ['June 1, 2031'], mustNot: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
		{ selector: '[data-view="cooldown"] [data-testid="cert-exam-attempt"]', label: 'a failed attempt names the topics missed, never a question', must: ['Not passed: Speeds and feeds, Measurement and finishing'] },
		{ selector: '[data-view="complete"] [data-testid="cert-checklist-earned"]', label: 'Earned with the date', must: ['Earned November 5, 2026'] },
		{ selector: '[data-view="guided"] [data-testid="cert-outside-help"]', label: 'the outside-help sentence', must: ['Outside help of any kind', 'voids the attempt'] },
		{ selector: '[data-view="guided"] [data-testid="cert-kit-section"][data-section="checkout"]', label: 'the checkout asks for one unlisted take', must: ['one continuous, unedited take', 'unlisted'] },
		{ selector: '[data-view="training"]', label: 'no address on the page', mustNot: ['@boscotech'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-view="training"] [data-testid="cert-check-open"]', label: 'the checklist Open keys', min: 44 },
		{ selector: '[data-view="fresh"] [data-testid="cert-start"]', label: 'Start', min: 44 },
		{ selector: '[data-view="training"] [data-testid="cert-withdraw"]', label: 'Withdraw', min: 44 },
		{ selector: '[data-view="training"] .cert-kit-section .disc-trigger', label: 'the section disclosures', min: 44 },
		{ selector: '[data-view="training"] [data-testid="cert-quick-check"] .cert-choice', label: 'quick check options', min: 44 },
		{ selector: '[data-view="training"] [data-testid="cert-practice"] .cert-choice', label: 'practice quiz options', min: 44 },
		{ selector: '[data-view="training"] [data-testid="cert-lesson-complete"]', label: 'Mark lesson complete', min: 44 },
		{ selector: '[data-view="guided"] [data-testid="cert-submit"]', label: 'Submit for review', min: 44 },
		{ selector: '[data-view="guided"] .cert-uploader-pick', label: 'the picker and camera keys', min: 44 },
		{ selector: '[data-view="guided"] [data-testid="cert-self-inspection"] .cert-choice', label: 'self-inspection boxes', min: 44 },
		{ selector: '[data-view="guided"] [data-testid="cert-step-hint"]', label: 'Show hint keys', min: 44 },
		{ selector: '[data-view="exam"] [data-testid="cert-exam-open-key"]', label: 'Open my exam', min: 44 }
	],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '[data-view="training"] .cert-check-word', label: 'the part words', min: 4.5 },
		{ selector: '[data-view="training"] .cert-check-state', label: 'the state words (Next, Unlocks after)', min: 4.5 },
		{ selector: '[data-view="guided"] .cert-check-row.is-done .cert-check-state', label: 'the Done word in green', min: 4.5 },
		{ selector: '[data-view="training"] .cert-check-desc', label: 'the part descriptions', min: 4.5 },
		{ selector: '[data-view="guided"] .cert-check-meta', label: 'who checked it and when', min: 4.5 },
		{ selector: '[data-view="training"] .cert-kit-section .disc-label', label: 'the section labels', min: 4.5 },
		{ selector: '[data-view="training"] .cert-definition dd', label: 'the definition facts', min: 4.5 },
		{ selector: '[data-view="training"] .cert-definition dt', label: 'the fact labels', min: 4.5 },
		{ selector: '[data-view="training"] .cert-video-rules', label: 'the watch rules', min: 4.5 },
		{ selector: '[data-view="training"] .cert-choice-word', label: 'quiz options', min: 4.5 },
		{ selector: '[data-view="training"] .cert-prose p', label: 'the study guide', min: 4.5 },
		{ selector: '[data-view="training"] .cert-mistake-body', label: 'common mistakes', min: 4.5 },
		{ selector: '[data-view="guided"] .cert-step-title', label: 'step titles', min: 4.5 },
		{ selector: '[data-view="guided"] .cert-submission-why li', label: 'the Submit reasons', min: 4.5 },
		{ selector: '[data-view="guided"] .cert-field > label, [data-view="guided"] .cert-field > span', label: 'form labels', min: 4.5 },
		{ selector: '[data-view="review"] .cert-review-feedback', label: 'review feedback', min: 4.5 },
		{ selector: '[data-view="review"] .cert-review-who', label: 'reviewer and date', min: 4.5 },
		{ selector: '[data-view="review"] .cert-readout.is-bad', label: 'the Fail readout', min: 4.5 },
		{ selector: '[data-view="exam"] .cert-readout.is-ok', label: 'the booked seat readout', min: 4.5 },
		{ selector: '[data-view="cooldown"] .cert-notice', label: 'the cooldown notice', min: 4.5 },
		{ selector: '[data-view="training"] .cert-form-why', label: 'why a form is shut', min: 4.5 },
		{ selector: '[data-view="training"] .cert-kit-section', label: 'section edges', min: 3 },
		{ selector: '[data-view="training"] .cert-check-glyph', label: 'checklist glyph rings', min: 3 }
	]
};
