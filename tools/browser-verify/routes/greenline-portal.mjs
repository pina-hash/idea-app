/**
 * THE TITLE SCREEN, AND THE ENTRY POINT THAT DID NOT EXIST.
 *
 * A teacher who opened GREENLINE was told nothing about either review queue.
 * The only way to the track panel was one link on `/dashboard` in a card that
 * carried no count, so a submission could sit for a week with a working queue at
 * one end and nobody prompted to open it at the other.
 *
 * The real route passes `onModeration` only for an admin, so ABSENCE is the
 * mechanism and the harness's `staff` toggle is what makes both halves drivable
 * without auth. The badge carries the COUNT and carries it AT ZERO too: a badge
 * that vanishes when nothing is waiting cannot be told from one that broke,
 * which is the ambiguity this whole lane exists because nobody could resolve.
 */
export default {
	path: '/dev/greenline-portal',
	label: 'GREENLINE title -- the staff moderation entry and its count',
	prepare: [
		/* THE TITLE SCREEN HAS A ONE-TIME ENTRANCE CASCADE, and the last
		   element in it starts at 1.26s. `waitForApp` returns on painted-and-
		   settled markup well before that, so a run that measured immediately
		   reported the two editor entries as `present but NOT visible
		   (opacity:0)` -- a real animation read as a real defect. That is the
		   instrument, not the page, and CLAUDE.md's own prescription is to let
		   animations RUN and settle on a timeout rather than to cancel them
		   (cancelling freezes them at frame one and manufactures the same
		   reading). The predicate asks the elements themselves, so it is
		   correct whatever the delays become, and the reported milliseconds
		   say how long the cascade actually took. */
		{
			waitFor: '() => [...document.querySelectorAll(".tt-builder, .tt-moderation, .tt-start")].every((e) => parseFloat(getComputedStyle(e).opacity) > 0.99)',
			timeoutMs: 8000
		}
	],
	presence: [
		{ selector: '[data-testid="title-moderation"]', label: 'the moderation entry (staff on)', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '[data-testid="title-moderation"] .tt-mod-count', label: 'and it carries a count, not just a word', expectPresent: 1, expectVisible: 1 },
		/* The controls it sits beside, so a regression that removed the whole
		   menu could not read as "the moderation entry is correctly absent". */
		{ selector: '.tt-builder', label: 'the two editor entries beside it (control)', expectPresent: 2, expectVisible: 2 },
		{ selector: '.tt-start', label: 'START still the primary action', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="title-moderation"]',
			label: 'the badge at rest, which is the ZERO reading',
			/* Nothing has been submitted in the harness's store at rest, so this
			   is the sentence a teacher sees on a normal day. It has to be a
			   sentence rather than an absence. */
			must: ['MODERATION', 'NOTHING AWAITING REVIEW']
		}
	],
	contrast: [
		{ selector: '[data-testid="title-moderation"] .tt-mod-label', min: 4.5, label: 'the MODERATION label' },
		{ selector: '[data-testid="title-moderation"] .tt-mod-count', min: 4.5, label: 'the count beside it' }
	],
	tapTargets: [
		{ selector: '[data-testid="title-moderation"]', label: 'the moderation entry', min: 44 },
		/* Brought to the floor in the same pass, because a bundle that adds a
		   control to a surface brings the surface it touched into compliance
		   (IDEA_INTERFACE_STANDARDS 12). These were 26px, 26px and 38.4px. */
		{ selector: '.tt-builder', label: 'TRACK EDITOR / PIECE EDITOR', min: 44 },
		{ selector: '.tt-feedback', label: 'SEND FEEDBACK', min: 44 },
		{ selector: '.tt-gear', label: 'the settings gear', min: 44 }
	]
};
