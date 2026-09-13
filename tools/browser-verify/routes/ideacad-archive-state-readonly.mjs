/**
 * THE ARCHIVE WITH NO WRITE TRANSPORT HANDED IN, which is the state that proves
 * read-only is STRUCTURAL rather than a flag.
 *
 * WHY IT IS A SPEC OF ITS OWN. A count of zero controls is also what a panel
 * that rendered nothing at all reports, so an absence row is only worth
 * anything beside a positive control -- and the positive control here is the
 * other spec on the same component, `ideacad-archive.mjs`, which measures
 * 1 Archive, 1 Restore, 1 picker and 1 Stop sharing on the identical fixture.
 * The pair is the measurement; neither half is.
 *
 * AND THE LIST IS STILL THERE. That is the half an absence-only spec would
 * miss: removing the transports must remove the CONTROLS and not the reading.
 * Both rows, both reason chips and both Open buttons are asserted present here,
 * so "read-only" cannot quietly become "blank".
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-archive?state=readonly',
	label: 'IdeaCAD archive, read-only: the work is still readable and not one write control is drawn',
	widths: WIDTHS,
	prepare: [
		{
			waitFor:
				'() => document.querySelectorAll("[data-testid=\\"ideacad-archive-row\\"]").length === 2'
		}
	],
	presence: [
		/* THE READING SURVIVES. */
		{
			selector: '[data-testid="ideacad-archive-row"]',
			label: 'both documents are still listed',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="ideacad-archive-reason"]',
			label: 'and each still says why it is here',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		/* EVERY WRITE CONTROL IS ABSENT, not disabled. */
		{
			selector: '[data-testid="ideacad-archive"] select',
			label: 'the class picker, absent with no share transport',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-archive-share-note"]',
			label: 'the disclosure sentence, absent because the control it is about is',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-archive"] .rm',
			label: 'Stop sharing, absent with no unshare transport',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-archive"]',
			label: 'the words that survive, and the ones that must not',
			must: ['Archive', 'Off roster', 'Open', 'reference work'],
			mustNot: ['Restore', 'Show this to', 'Share with class', 'Stop sharing']
		}
	],
	contrast: [
		{
			selector: '[data-testid="ideacad-archive"] .who',
			label: 'the owner address is still readable with no controls beside it',
			min: 4.5
		}
	],
	tapTargets: [{ selector: '[data-testid="ideacad-archive"] .go', label: 'Open' }]
};
