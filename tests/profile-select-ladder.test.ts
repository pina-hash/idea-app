import { describe, expect, it } from 'vitest';
import { fetchUserProfile } from '../src/lib/profile';

/**
 * THE PROFILE LADDER STEPS DOWN ON A MISSING COLUMN, NEVER ON A MISSING ROW.
 *
 * `maybeSingle()` answers `data: null, error: null` for a row that is not
 * there, which is the ordinary shape of the sign-in transient the root layout
 * retries around. The ladder used to test `!data`, so that answer walked all
 * three rungs -- and the caller then slept 200ms and walked them again, which
 * is up to SIX round trips and 200ms to learn what the first rung already knew.
 *
 * THE COUNTS ARE THE ASSERTION. A test that only checked the returned value
 * passes on both the old and the new code, because both return null; what
 * changed is how many times the database was asked. Verified against the old
 * `!data` form, where the first case below reports 3 rather than 1.
 */

type Answer = { data: unknown; error: { code?: string } | null };

/** Records every select the ladder issues, and answers them in order. */
function client(answers: Answer[]) {
	const selects: string[] = [];
	let next = 0;
	return {
		selects,
		supabase: {
			from: () => ({
				select: (columns: string) => {
					selects.push(columns);
					const answer = answers[Math.min(next, answers.length - 1)];
					next++;
					return { eq: () => ({ maybeSingle: () => Promise.resolve(answer) }) };
				}
			})
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any
	};
}

const MISSING_ROW: Answer = { data: null, error: null };
const COLUMN_GONE: Answer = { data: null, error: { code: '42703' } };
const COLUMN_GONE_CACHE: Answer = { data: null, error: { code: 'PGRST204' } };
const DENIED: Answer = { data: null, error: { code: '42501' } };

describe('fetchUserProfile', () => {
	it('costs ONE round trip when the row is simply not there', async () => {
		const { selects, supabase } = client([MISSING_ROW]);
		expect(await fetchUserProfile(supabase, 'u1')).toBeNull();
		expect(selects.length).toBe(1);
	});

	it('costs ONE round trip on the happy path', async () => {
		const { selects, supabase } = client([{ data: { id: 'u1' }, error: null }]);
		const profile = await fetchUserProfile(supabase, 'u1');
		expect(profile?.id).toBe('u1');
		expect(selects.length).toBe(1);
		/* The widest rung, and it asked for the newest column. */
		expect(selects[0]).toContain('tour_completed_at');
	});

	it('costs ONE round trip on an RLS refusal, and does not retry it', async () => {
		const { selects, supabase } = client([DENIED]);
		expect(await fetchUserProfile(supabase, 'u1')).toBeNull();
		expect(selects.length).toBe(1);
	});

	/* THE POSITIVE CONTROL for all three counts above: the ladder still steps,
	   so a count of 1 means "did not need to" rather than "cannot". */
	it('DOES step down when a column is missing, and narrows each time', async () => {
		const { selects, supabase } = client([
			COLUMN_GONE,
			COLUMN_GONE_CACHE,
			{ data: { id: 'u1' }, error: null }
		]);
		const profile = await fetchUserProfile(supabase, 'u1');

		expect(selects.length).toBe(3);
		expect(selects[0]).toContain('tour_completed_at');
		expect(selects[1]).not.toContain('tour_completed_at');
		expect(selects[1]).toContain('pathway');
		expect(selects[2]).not.toContain('pathway');
		/* The legacy rung has no pathway column, so the shape is completed. */
		expect(profile?.pathway).toBeNull();
	});

	it('gives up after the narrowest rung rather than looping', async () => {
		const { selects, supabase } = client([COLUMN_GONE, COLUMN_GONE, COLUMN_GONE]);
		expect(await fetchUserProfile(supabase, 'u1')).toBeNull();
		expect(selects.length).toBe(3);
	});
});
