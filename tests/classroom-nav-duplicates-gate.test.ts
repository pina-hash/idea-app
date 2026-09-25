import { describe, expect, it } from 'vitest';
import { load } from '../src/routes/classroom/[sectionId]/duplicates/+page.server';
import { classDuplicatesHref, sectionTabs, visibleSectionTabs } from '../src/lib/classroom/nav';
import { commandsFor } from '../src/lib/shell/commands';

/**
 * THE DUPLICATES DOORS ARE DOORS AND NOT A LOCK, AND THIS IS THE HALF THAT SAYS
 * SO FROM THE ROUTE'S OWN SIDE.
 *
 * `tests/classroom-nav-doors.test.ts` asserts the doors exist exactly while the
 * page does. Since ledger 0298 (report 28) those doors are the palette's
 * `class.duplicates` command and the class page's door beside Drafts -- no
 * longer a tab. That pairing says nothing about who may walk through it, and the
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

describe('the duplicates doors are not the gate', () => {
	/*
	 * GENERALIZED (ledger 0298) FROM "a non-manager is offered no tab". The
	 * page is not a tab for ANYONE now, and the door that remains in the
	 * registry is the palette command: a student is not offered it, a manager
	 * is, and neither offer is what keeps a student out.
	 */
	it('a non-manager is offered no door: no tab, and no palette command', () => {
		expect(visibleSectionTabs(sectionTabs('s-1'), false).some((t) => t.href.endsWith('/duplicates'))).toBe(false);
		const env = (role: 'student' | 'manager') => ({
			role,
			surface: 'classroom' as const,
			sectionId: 's-1',
			itemId: null,
			basePath: '/classroom',
			handlers: new Set<string>()
		});
		expect(commandsFor(env('student')).some((c) => c.id === 'class.duplicates')).toBe(false);
		// POSITIVE CONTROL: the command is in the registry and a manager is
		// offered it, pointing at the page, so the absence above is the role
		// filter and not a renamed id.
		const managers = commandsFor(env('manager')).find((c) => c.id === 'class.duplicates');
		expect(managers?.href?.({ ...env('manager') })).toBe(classDuplicatesHref('s-1'));
	});

	it('and is refused by the page itself, which never asks whether a tab was shown', async () => {
		await expect(run(false)).rejects.toMatchObject({ status: 404 });
	});

	it('POSITIVE CONTROL: a manager driving the same URL is served', async () => {
		const answer = (await run(true)) as { section: { id: string } };
		expect(answer.section.id).toBe('s-1');
	});
});
