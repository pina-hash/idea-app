import type { TournamentEntry } from '$lib/tournaments/tournaments';

/**
 * One fixture per thumbnail state, and the URLs are chosen so the state is
 * reached the way production reaches it rather than forced.
 *
 * THE `present` URL IS SAME-ORIGIN AND THAT IS FORCED BY THE INSTRUMENT, not a
 * preference: `npm run verify:browser` blocks every non-loopback request, so a
 * real `https://<project>.supabase.co/...` thumbnail would 404 in the harness
 * and land in `failed` -- three fault tiles and no picture, which would look
 * exactly like a broken component. A static asset the dev server itself serves
 * is the only URL that can be `present` in both a browser pass and an ordinary
 * `npm run dev`. It is an absolute URL built from `location.origin`, so it goes
 * through `thumbnailSrc` on the same path a real one does rather than around it.
 *
 * THE `failed` URL IS SAME-ORIGIN TOO, for the same reason: a loopback path
 * that genuinely 404s produces a REAL `error` event from the element, where an
 * off-host URL would produce one only because the proxy refused it -- the same
 * event for a different reason, which is not the thing being demonstrated.
 */
export type ThumbFixture = {
	key: string;
	/** The state this fixture is here to produce. */
	expect: 'present' | 'absent' | 'refused' | 'failed';
	about: string;
	entry: TournamentEntry;
};

const entry = (id: string, name: string, thumbnail_url: string | null): TournamentEntry => ({
	id,
	tournament_id: '00000000-0000-4000-8000-000000000001',
	user_id: null,
	display_name: name,
	description: '',
	thumbnail_url,
	seed: null,
	created_at: '2026-09-06T12:00:00.000Z'
});

/** Built at mount, because two of the four URLs are relative to the dev origin. */
export function thumbFixtures(origin: string): ThumbFixture[] {
	return [
		{
			key: 'present',
			expect: 'present',
			about: 'An ordinary uploaded thumbnail. The bytes load and the picture is the box.',
			entry: entry(
				'00000000-0000-4000-8000-0000000000a1',
				'Present Pete',
				`${origin}/IDEA/android-chrome-512x512.png`
			)
		},
		{
			key: 'absent',
			expect: 'absent',
			about:
				'No thumbnail_url at all -- a walk-up a host typed in. NOT a fault: it draws the entrant initial, exactly as it always has.',
			entry: entry('00000000-0000-4000-8000-0000000000a2', 'Absent Ada', null)
		},
		{
			key: 'refused',
			expect: 'refused',
			about:
				'A scheme we will not hand to the browser. 0062 caps this column at 600 characters and checks nothing else, so this row is storable today. The string never reaches an src attribute.',
			entry: entry(
				'00000000-0000-4000-8000-0000000000a3',
				'Refused Rae',
				'javascript:alert(1)'
			)
		},
		{
			key: 'failed',
			expect: 'failed',
			about:
				'A web URL we did hand over, that did not load -- a deleted object, a typo, a blocked mixed-content image. The element fires error and the tile replaces it.',
			entry: entry(
				'00000000-0000-4000-8000-0000000000a4',
				'Failed Fay',
				`${origin}/IDEA/this-object-was-deleted-0076.png`
			)
		}
	];
}
