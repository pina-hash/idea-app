import type { FoundryManagedSection } from '$lib/foundry/access';
import type { PageServerLoad } from './$types';

/**
 * THE SECTION MANAGER'S OWN CONTROL (0173, decision 01).
 *
 * NO GATE HERE, AND THAT IS DELIBERATE RATHER THAN AN OMISSION.
 * `foundry_manageable_sections()` returns exactly the sections
 * `classroom_manages_section` says the caller manages, so somebody who manages
 * nothing gets an EMPTY LIST and the page says so in words. There is nothing to
 * refuse that the function has not already refused, and a route-level check
 * would be a second statement of the same rule.
 *
 * IT IS NOT A SURFACE WHOSE EXISTENCE IS SECRET, so it does not take the 404
 * treatment `/foundry/review` does: every student can see that classes exist
 * and that teachers run them. What they cannot do is read a roster or close
 * anything, and neither of those is on this page.
 *
 * A MISSING RPC IS AN EMPTY LIST, NOT A BROKEN ROOM. A deployment between 0172
 * and 0173 is a real state; on it the page renders its own empty sentence.
 *
 * AND A CLOSURE MUST NEVER REACH THIS PAGE, WHICH IS A FIX RATHER THAN A
 * PREFERENCE. The layout used to render the refusal in place of every route
 * under /foundry, this one included. Instructors enroll themselves in their
 * own sections to see the class the way a student does (0138 says so in the
 * roster rules), and `foundry_section_access` reads ENROLLMENTS and exempts
 * only ADMINS -- so a section manager who is not also an admin, closing their
 * own class, locked themselves out of the only control that reopens it. A
 * one-way door with a Restore nothing could ever press. `classes` is
 * therefore deliberately absent from `FOUNDRY_CLOSURE_BLOCKS`, and the
 * absence is the mechanism: there is no exemption here to forget, because
 * there is no gate here to exempt from.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { data, error: err } = await locals.supabase.rpc('foundry_manageable_sections');
	if (err || !data) return { sections: [] as FoundryManagedSection[] };
	return { sections: data as FoundryManagedSection[] };
};
