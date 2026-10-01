import { normalizeSectionRow } from '$lib/classroom/classroom';
import { classThemesBySection, createClassThemeTransports, type ClassTheme } from '$lib/classroom/class-theme';
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
/** `classroom_class_themes` refuses more than this many ids in one call (0225). */
const CLASS_THEME_BATCH = 200;

export const load: LayoutServerLoad = async ({ locals: { supabase, claims }, depends }) => {
	// A vote on the class page re-runs this read (and only this one) when the
	// winner changes, so the strip and My Classes repaint with the banner.
	depends('classroom:themes');
	if (!claims) return { navSections: [], navSectionsReady: false, navThemes: {}, navIsStaff: false, navIsAdmin: false };

	const [{ data: profile }, { data: sections, error: sectionsError }, admin] = await Promise.all([
		supabase.from('profiles').select('role').eq('id', claims.sub).maybeSingle(),
		supabase
			.from('classroom_sections')
			.select('id, course_id, label, block, teacher_email, active, classroom_courses(id, code, title, active)')
			.order('label'),
		isAdmin(supabase, claims.sub)
	]);

	const navSections = ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow);

	/*
	 * EVERY LISTED CLASS'S VOTED LOOK, READ ONCE (decision 45): the header
	 * strip's keys, My Classes' cards and the class banner all paint from this
	 * one read, so they cannot disagree. A deployment without 0225, or a read
	 * that failed, is NO themes -- every class renders exactly as it did before
	 * themes existed -- and never a broken page. A class nobody has voted on is
	 * absent from the map, which is the same answer.
	 */
	let navThemes: Record<string, ClassTheme> = {};
	const themeTransports = createClassThemeTransports(supabase);
	const ids = navSections.map((s) => s.id);
	// 0225 answers at most 200 classes a call, and an admin lists every class.
	for (let i = 0; i < ids.length; i += CLASS_THEME_BATCH) {
		const res = await themeTransports.themes(ids.slice(i, i + CLASS_THEME_BATCH));
		if (!res.ok) {
			navThemes = {};
			break;
		}
		Object.assign(navThemes, classThemesBySection(res.themes));
	}

	return {
		navSections,
		/*
		 * WHETHER THAT READ ANSWERED AT ALL, for the one page that renders the
		 * list as its content: My Classes (`/classroom`) used to run this exact
		 * select a second time, byte for byte, to learn the same thing (ledger
		 * 0360, report R08). It reads this list and this flag instead, which is
		 * one query fewer on every visit to /classroom and no extra hop.
		 */
		navSectionsReady: !sectionsError,
		navThemes,
		// The domain-derived STAFF marker, which is all this decides: whether the
		// switcher offers the courses-and-setup door. Every write behind it is
		// re-checked by its own RPC.
		navIsStaff: profile?.role === 'teacher',
		navIsAdmin: admin
	};
};
