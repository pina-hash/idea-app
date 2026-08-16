import { normalizeSectionRow } from '$lib/classroom/classroom';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

/**
 * What the persistent shell needs, loaded ONCE for every /classroom route.
 *
 * The section switcher has to be on screen everywhere below /classroom, so the
 * list it renders cannot be a page's own load -- it would vanish the moment you
 * opened an item. One RLS-scoped select serves both audiences with no role
 * branch in the query (the /coin-balance doctrine): classroom_sections' policy
 * already returns exactly the sections the caller may see, which is their
 * enrolled classes for a student, their own for a teacher of record, and every
 * one for an admin. This grants nothing -- it is the same read /classroom's own
 * page has always run, moved up a level.
 *
 * THE KEYS ARE PREFIXED `nav*` ON PURPOSE. Layout data and page data merge, page
 * keys winning, and several pages here legitimately return their own `sections`
 * (a manager's full list for the composer's linkage controls, an empty array for
 * a student). A shell reading `data.sections` would therefore render an empty
 * switcher on exactly the pages a student uses most. `userProfile` in the root
 * layout is named for the same reason.
 *
 * There is deliberately no auth redirect here: /classroom is in
 * hooks.server.ts authedPrefixes, so an anonymous visitor never reaches this,
 * and each page keeps its own belt-and-braces guard.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) return { navSections: [], navIsStaff: false, navIsAdmin: false };

	const [{ data: profile }, { data: sections }, admin] = await Promise.all([
		supabase.from('profiles').select('role').eq('id', claims.sub).maybeSingle(),
		supabase
			.from('classroom_sections')
			.select('id, course_id, label, block, teacher_email, active, classroom_courses(id, code, title, active)')
			.order('label'),
		isAdmin(supabase, claims.sub)
	]);

	return {
		navSections: ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
		// The domain-derived STAFF marker, which is all this decides: whether the
		// switcher offers the courses-and-setup door. Every write behind it is
		// re-checked by its own RPC.
		navIsStaff: profile?.role === 'teacher',
		navIsAdmin: admin
	};
};
