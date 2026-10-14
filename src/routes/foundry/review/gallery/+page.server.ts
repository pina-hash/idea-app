import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { foundryCollections, foundryOverrideMap } from '$lib/foundry/gallery-extras';
import type { FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE GALLERY'S CURATION PAGE (ledger 0380, reports c5f811e4, 762bb647 and
 * 415af89e): the details a release card shows, collections and the featured
 * row. ADMIN ONLY, 404 otherwise; the area's `+layout.server.ts` is the gate
 * and this is the same check again, defence in depth.
 *
 * FOUR READS, AS THE CALLER, each degrading on its own. A database before 0237
 * answers `PGRST202` to the three curation reads, which become `null` here and
 * render as "not available yet" on the page; the app list is the gallery's own
 * and is what the editors choose from.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	if (!(await isAdmin(locals.supabase, uid))) error(404, 'Not found');

	const [list, ovr, col, feat] = await Promise.all([
		locals.supabase.rpc('foundry_list_apps'),
		locals.supabase.rpc('foundry_gallery_overrides_read'),
		locals.supabase.rpc('foundry_collections_read', { p_everything: true }),
		locals.supabase.rpc('foundry_featured_read', { p_everything: true })
	]);
	if (list.error) error(500, list.error.message);

	const apps = ((list.data ?? []) as (FoundryAppSummary & { major_release_at?: string | null })[]).map((a) => ({
		id: a.id,
		title: a.title,
		tagline: a.tagline,
		cover_path: a.cover_path,
		major: typeof a.major_release_at === 'string' && a.major_release_at.length > 0
	}));

	return {
		uid,
		apps,
		overrides: ovr.error ? null : foundryOverrideMap(ovr.data),
		collections: col.error ? null : foundryCollections(col.data),
		featured: feat.error ? null : Array.isArray(feat.data) ? (feat.data as string[]) : []
	};
};
