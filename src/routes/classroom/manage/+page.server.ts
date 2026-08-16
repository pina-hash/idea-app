import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The old teacher console's URL.
 *
 * Its two halves went in different directions: a class's roster, settings and
 * content moved into that class's own tabs, and courses plus setup moved to
 * /classroom/admin. This is a REDIRECT rather than a page, so nothing is left
 * behind as a second way to do the same things -- printed links, bookmarks and
 * muscle memory still land somewhere useful.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/classroom/admin');
};
