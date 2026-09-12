import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { MaterialRow } from '$lib/ideacad/blade/materials';
import type { PageServerLoad } from './$types';

/**
 * THE IDEACAD MATERIAL LIBRARY CONSOLE (0208).
 *
 * MATERIALS ARE DATA, which is the whole point of this page existing: adding a
 * material used to be an edit to `DEFAULT_BLADE_CONFIG` and a deploy, and it is
 * now four numbers in a form.
 *
 * A non-admin gets 404 rather than a redirect (the /admin rule), and `/admin` is
 * deliberately not in `authedPrefixes`, so an anonymous visitor gets exactly the
 * same 404 as a signed-in student. The gate here is convenience: every write
 * goes through `ideacad_material_save_global` / `ideacad_material_set_retired`,
 * which re-check `is_admin()` inside their own bodies.
 *
 * THE READ IS A PLAIN SELECT AND RLS DOES THE FILTERING, per the repo's read
 * rule -- no `.eq('owner', null)` "for safety", because a second copy of the
 * policy is the copy that stops matching. What an admin sees here is every
 * GLOBAL material, live and retired: a retired one is exactly the row somebody
 * came here to restore, so filtering it out would make Retire a one-way door.
 *
 * CUSTOM MATERIALS ARE NOT ON THIS PAGE AND CANNOT BE. 0208's select policy is
 * `owner is null or owner = auth.uid()`, so a student's own material is invisible
 * to an admin by construction rather than by this query's choice. That is a real
 * limit for grading and it is written down in this bundle's history entry rather
 * than quietly worked around here.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	const { data, error: readError } = await supabase
		.from('ideacad_materials')
		.select('id, slug, owner, name, density_g_cm3, thicknesses_in, note, source, source_verified, retired_at')
		.order('retired_at', { ascending: true, nullsFirst: true })
		.order('name');

	return {
		/* Fails soft before 0208 is applied: an empty list plus the note, rather
		   than a page that 500s on a deployment sitting between two migrations. */
		materials: (data ?? []) as MaterialRow[],
		ready: !readError
	};
};
