import { error, redirect } from '@sveltejs/kit';
import { loadItemDeck } from '$lib/classroom/transports';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * One item's presentation deck, full-bleed.
 *
 * RLS-SCOPED THE SAME WAY THE ITEM PAGE IS, and for the same reason: an item
 * the caller may not read (a class they are not in, or a draft for a student)
 * reads as 404, never as a distinguishable "forbidden". The section in the URL
 * is cross-checked against the item's POSTINGS, so a real item id cannot be
 * framed under a class it was never posted to.
 *
 * Note this load is only the FRAME's authorization. Every one of the deck's
 * ~30 files is authorized again, independently, by the serving proxy under the
 * same policy -- so a URL guessed straight into a deck file is refused whether
 * or not anyone ever opened this page.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: itemRow } = await supabase
		.from('classroom_items')
		.select('id, title, posted_in:classroom_postings!inner(section_id)')
		.eq('id', params.itemId)
		.eq('posted_in.section_id', params.sectionId)
		.maybeSingle();

	if (!itemRow) error(404, 'Not found');

	const deck = await loadItemDeck(supabase, params.itemId);
	if (!deck) error(404, 'Not found');
	if (!driveConfigured()) error(404, 'Not found');

	return {
		deck,
		backHref: `/classroom/${params.sectionId}/item/${params.itemId}`
	};
};
