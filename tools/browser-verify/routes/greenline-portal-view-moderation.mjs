/**
 * THE TEACHER'S QUEUE WITH NOTHING IN IT.
 *
 * `?view=moderation` with no `seed` is the harness's store at rest: no track has
 * been submitted and no decal uploaded, which is exactly the state a teacher
 * opens the real `/greenline/moderation` in on most days. It is measured
 * BECAUSE it is the boring one: an empty queue and a queue that failed to load
 * looked identical here until this bundle, and "nothing is waiting" is the
 * answer a teacher acts on most often. Both panels now say it in words, and
 * these rows are what stop that sentence quietly disappearing.
 *
 * The seeded twin is `greenline-portal-view-moderation-seed-pending.mjs`; the
 * two together are the queue's two halves, and every absence row here has its
 * positive control there.
 */
export default {
	path: '/dev/greenline-portal?view=moderation',
	label: 'GREENLINE moderation -- both queues, empty and saying so',
	presence: [
		/* The empty states themselves. These are the rows that would have been
		   impossible to write before: the track panel said "No published
		   community tracks yet" in the faint tone a failed load uses, and the
		   decal queue said one short sentence in `--dim`. Both are real copy
		   now and both are asserted PRESENT AND VISIBLE, because an empty queue
		   that renders nothing is the ambiguity this lane exists to remove. */
		{ selector: '[data-testid="mod-tracks-empty"]', label: 'track queue says it is empty, deliberately', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '[data-testid="mod-tracks-empty"] b', label: 'and leads with the sentence, not a fragment', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="decal-queue-empty"]', label: 'decal queue says it is empty, deliberately', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '[data-testid="decal-queue-empty"] b', label: 'and leads with the sentence too', expectPresent: 1, expectVisible: 1 },
		/* BOTH QUEUES ARE ON ONE SURFACE. This is the structural half of the
		   fix: GREENLINE takes two kinds of submission that wait on a teacher,
		   and the page named for moderating them carried one. If either
		   heading goes missing, half of what is waiting has gone back to being
		   somewhere nobody is prompted to look. */
		{ selector: '[data-testid="dev-mod-tracks-h"]', label: 'tracks section heading', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="dev-mod-decals-h"]', label: 'decals section heading', expectPresent: 1, expectVisible: 1 },
		/* The absence half, whose positive control is the seeded spec: with
		   nothing submitted there is no row and no status chip to act on. */
		{ selector: '[data-testid^="mod-row-"]', label: 'no track rows at rest', expectPresent: 0, expectVisible: 0, maxPresent: 0 },
		{ selector: '.gdq-item', label: 'no decal rows at rest', expectPresent: 0, expectVisible: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="mod-pending-count"]',
			label: 'the count line, which must read at zero as well',
			/* ZERO IS SAID OUT LOUD. The panel used to append "N awaiting
			   review" only above zero, so a broken count and an empty queue
			   printed the same string. With no tracks at all the toolbar reads
			   the total; the seeded spec asserts the pending clause. */
			must: ['0 tracks']
		},
		{
			selector: '[data-testid="decal-queue-empty"]',
			label: 'the decal empty sentence says what approval is FOR',
			/* Not decoration: this sentence is the one that tells a teacher why
			   a student may be looking at their own decal and believing it is
			   public. */
			must: ['No decals are awaiting review', 'own garage', 'after you approve it']
		}
	],
	contrast: [
		{ selector: '[data-testid="mod-tracks-empty"] b', min: 4.5, label: 'empty-queue lead line' },
		{ selector: '[data-testid="decal-queue-empty"] b', min: 4.5, label: 'empty decal-queue lead line' },
		{ selector: '[data-testid="decal-queue-empty"] span', min: 4.5, label: 'empty decal-queue sentence' },
		{ selector: '[data-testid="mod-pending-count"]', min: 4.5, label: 'the count line' }
	],
	tapTargets: [
		/* The sort controls are the only interactive thing on an empty queue,
		   and they were 26px. This panel's root declares no instructor-only
		   density class, so IDEA_INTERFACE_STANDARDS 10 gives it no 24px
		   exception at any width. */
		{ selector: '.tm-sort', label: 'queue sort controls', min: 44 }
	]
};
