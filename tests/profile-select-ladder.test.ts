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
	   so a count of 1 means "did not need to" rather than "cannot".

	   ASSERTED AS THE RULE RATHER THAN AS A PINNED COUNT (ledger 0289). This
	   spelled out three rungs by name, which a legitimate change necessarily
	   broke the moment 0220 added a fourth -- and the repair offered each time
	   is to write down whatever the new number is, which records what last
	   happened and checks nothing. What the ladder actually promises is that
	   each rung asks for strictly LESS than the one above it and that the walk
	   terminates; both of those are now asserted directly, over however many
	   rungs there are. */
	it('DOES step down when a column is missing, and each rung is strictly narrower', async () => {
		const { selects, supabase } = client([
			COLUMN_GONE,
			COLUMN_GONE_CACHE,
			COLUMN_GONE,
			{ data: { id: 'u1' }, error: null }
		]);
		const profile = await fetchUserProfile(supabase, 'u1');

		expect(selects.length).toBeGreaterThan(1);
		const columns = selects.map((s) => s.split(',').map((c) => c.trim()));
		for (let i = 1; i < columns.length; i++) {
			const above = new Set(columns[i - 1]);
			/* STRICTLY narrower: every column this rung asks for was asked for by
			   the rung above, and it asks for fewer of them. A rung that merely
			   swapped one column for another would pass a count check and is what
			   this catches. */
			expect(columns[i].every((c) => above.has(c)), `rung ${i} asks for a new column`).toBe(
				true
			);
			expect(columns[i].length, `rung ${i} is not narrower`).toBeLessThan(columns[i - 1].length);
		}
		/* The legacy rung has no pathway column, so the shape is completed. */
		expect(profile?.pathway).toBeNull();
	});

	/* THE NEWEST COLUMN SET IS ON THE WIDEST RUNG AND ITS OWN RUNG ALONE.
	   0220's six style columns get a rung of their own rather than a fold into
	   the `tour_completed_at` one, so an unapplied 0220 does not also cost the
	   tour its column. Asserted in both directions: the widest rung carries
	   both, and the rung below it carries the tour column WITHOUT the style
	   columns. */
	it('gives the 0220 style columns their own rung, above the tour rung', async () => {
		const { selects, supabase } = client([COLUMN_GONE, { data: { id: 'u1' }, error: null }]);
		await fetchUserProfile(supabase, 'u1');

		expect(selects[0]).toContain('style_accent_color');
		expect(selects[0]).toContain('tour_completed_at');
		expect(selects[1]).not.toContain('style_accent_color');
		expect(selects[1], 'an unapplied 0220 must not cost the tour its column').toContain(
			'tour_completed_at'
		);
		/* All six travel together: they are one migration, so a rung carrying
		   some of them could only ever be a typo. */
		for (const c of [
			'style_background_type',
			'style_background_value',
			'style_accent_color',
			'style_badge',
			'style_flourish',
			'style_tagline'
		]) {
			expect(selects[0], `the widest rung is missing ${c}`).toContain(c);
		}
	});

	it('gives up after the narrowest rung rather than looping', async () => {
		/* More refusals than there are rungs: whatever the ladder's depth, it
		   must stop rather than walk forever, and it must not ask more times
		   than it has rungs. */
		const { selects, supabase } = client([COLUMN_GONE]);
		expect(await fetchUserProfile(supabase, 'u1')).toBeNull();
		expect(selects.length).toBeGreaterThan(1);
		expect(selects.length).toBeLessThan(12);
		/* The last rung asked is the narrowest one: nothing is asked after it. */
		const last = selects[selects.length - 1];
		expect(last).not.toContain('pathway');
		expect(last).not.toContain('tour_completed_at');
		expect(last).not.toContain('style_accent_color');
	});
});
