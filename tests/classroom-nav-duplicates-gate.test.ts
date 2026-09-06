import { describe, expect, it } from 'vitest';
import { load } from '../src/routes/classroom/[sectionId]/duplicates/+page.server';
import { sectionTabs, visibleSectionTabs } from '../src/lib/classroom/nav';

/**
 * THE DUPLICATES TAB IS A DOOR AND NOT A LOCK, AND THIS IS THE HALF THAT SAYS SO
 * FROM THE ROUTE'S OWN SIDE.
 *
 * `tests/classroom-nav-doors.test.ts` asserts the tab exists exactly while the
 * page does. That pairing says nothing about who may walk through it, and the
 * failure mode it cannot see is the one that matters: a later bundle reading
 * `visibleSectionTabs` as the access decision and quietly relaxing the page,
 * on the grounds that "a student is never offered the link anyway". That
 * regression is SILENT -- every surface still renders correctly, and the only
 * symptom is a typed URL answering.
 *
 * So this drives the REAL `load` from its own file, with the manage answer
 * under the test's control, and asserts the refusal comes from the PAGE. It is
 * 404 rather than 403 or a redirect, per the probing rule: an enrolled student
 * can legitimately read this section, so a bounce would confirm the page exists
 * and is merely off-limits.
 *
 * MUTATION-PROVEN (0086): with `if (manages !== true) error(404, ...)` opened to
 * `if (false)`, the first assertion reddens -- "promise resolved instead of
 * rejecting" -- and the page hands a non-manager the section. Restored from a
 * `cp` copy, md5 `39e8246c2171b725cc9fe8219773ea03` before and after.
 */
function client(manages: boolean) {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({ maybeSingle: async () => ({ data: { id: 's-1', title: 'IDEA209H' } }) })
			})
		}),
		rpc: async (fn: string) => {
			if (fn === 'classroom_manages_section') return { data: manages, error: null };
			return { data: { items: [] }, error: null };
		}
	};
}

const run = (manages: boolean) =>
	(load as never as (event: unknown) => unknown)({
		params: { sectionId: 's-1' },
		locals: { supabase: client(manages), claims: { sub: 'u-1' } }
	});

describe('the duplicates tab is not the gate', () => {
	it('a non-manager is offered no tab', () => {
		const offered = visibleSectionTabs(sectionTabs('s-1'), false);
		expect(offered.some((t) => t.id === 'duplicates')).toBe(false);
		// POSITIVE CONTROL: the tab really is in the set being filtered, so the
		// absence above is the predicate and not a renamed id.
		expect(sectionTabs('s-1').some((t) => t.id === 'duplicates')).toBe(true);
	});

	it('and is refused by the page itself, which never asks whether a tab was shown', async () => {
		await expect(run(false)).rejects.toMatchObject({ status: 404 });
	});

	it('POSITIVE CONTROL: a manager driving the same URL is served', async () => {
		const answer = (await run(true)) as { section: { id: string } };
		expect(answer.section.id).toBe('s-1');
	});
});
