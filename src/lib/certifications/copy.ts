/**
 * Sentences more than one certification surface reads. One spelling each, so
 * the certification page, the desk, the emails and the verify page cannot
 * drift apart. American spelling; no em dashes; no weekday names in anything a
 * student reads (dates are formatted by `formatCertDate` in `./status`).
 */
import type { AwardShownStatus } from './types';

export const PORTAL_NAME = 'IDEA Certifications';
export const PORTAL_TAGLINE = 'Proof that you can do it alone.';

/** Shown to an admin when the award is pressed with no signing key set. */
export const CERT_SIGNING_UNSET_MESSAGE =
	'This award was not recorded. The server has no signing key (CERT_SIGNING_PRIVATE_KEY is not set), so a certificate could not be signed. Set the key in the server environment and press Award again. Nothing is ever awarded unsigned.';

export const CERT_SIGNING_INVALID_MESSAGE =
	'This award was not recorded. CERT_SIGNING_PRIVATE_KEY is set but is not a valid Ed25519 key (PKCS8 PEM or a 32 byte base64 seed). Fix the value and press Award again.';

/** On the autonomous project page, above the form. */
export const OUTSIDE_HELP_SENTENCE =
	'This project is done alone. Outside help of any kind, including from another student, a mentor, or an AI tool, voids the attempt.';

/** Under every training video. */
export const WATCH_RULES_SENTENCE =
	'Only time the video actually plays counts. Skipping ahead does not count the footage you skipped, speeds above 2x are blocked, and a Continue check that sits unanswered for a minute stops the clock until you come back. A video counts once you have played at least 95% of it.';

/** On the exam lobby and the exam screen. */
export const EXAM_LOCKDOWN_SENTENCE =
	'This exam is taken in the room with your proctor. One question at a time, with no going back. Leaving the tab, the window or full screen is recorded and shown to your proctor as it happens. Copy, paste and right click are off. A score of 100% passes.';

export const EXAM_RELEASE_WAITING_SENTENCE =
	'Your exam opens when your proctor presses Release on their own device. A release lasts 10 minutes.';

export const COOLDOWN_SENTENCE = (dateWords: string) =>
	`You can take this exam again on ${dateWords}. Use the time on the study guide and the practice quiz.`;

/** The verify page's five states, in words the public reads. */
export const VERIFY_WORDS: Record<AwardShownStatus | 'none', { title: string; body: string }> = {
	valid: {
		title: 'Valid',
		body: 'This certificate is genuine and in good standing.'
	},
	suspended: {
		title: 'Suspended',
		body: 'This certificate is genuine but is suspended at this time.'
	},
	revoked: {
		title: 'Revoked',
		body: 'This certificate was issued and has since been revoked.'
	},
	expired: {
		title: 'Expired',
		body: 'This certificate was genuine and has passed its expiry date.'
	},
	none: {
		title: 'No such certificate.',
		body: 'Nothing on record matches that serial. Check the characters and try again.'
	}
};

export const VERIFY_RATE_LIMITED = 'Too many checks from this connection. Try again in a minute.';

export const AWARD_CONFIRM_TITLE = 'Record this award';
export const AWARD_CONFIRM_SENTENCE =
	'This records a permanent, signed award under a new serial. It cannot be undone, only suspended or revoked with a written reason. Check every line.';
export const AWARD_BUTTON_WORD = 'Award';
export const AWARD_LOCKED_SENTENCE = 'The award lights up when every required part is checked.';

export const REVIEW_FEEDBACK_REQUIRED = 'A fail needs written feedback so the next attempt is better.';

export const HOLDERS_SENTENCE = 'Who holds what. Names only; proof is on the verify page.';

export const DORMANT_SENTENCE = (days: number) =>
	`An attempt with no activity for ${days} days is marked dormant. It is never deleted; doing anything on it brings it back.`;

export const WITHDRAW_SENTENCE =
	'Withdrawing keeps your history. You can start again later with a fresh attempt and a fresh clock.';

export const NO_NAME_SENTENCE =
	'This student has no name on their profile yet, and a certificate needs one. Ask them to set their name, then come back.';

export const EXPIRY_UNSET_SENTENCE =
	'This certification expires on the school-year date, and that date is not set or has passed. Set it in the engine settings, then come back.';
