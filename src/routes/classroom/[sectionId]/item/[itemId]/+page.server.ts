import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow } from '$lib/classroom/classroom';
import { ITEM_SELECT, SECTION_SELECT } from '$lib/classroom/transports';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * One classroom item -- assignment, material or announcement. RLS-scoped like
 * the class page: an item the caller may not read (a class they are not in, or
 * a draft for a student) reads as 404, never as a distinguishable "forbidden".
 *
 * The section in the URL is cross-checked against the item's POSTINGS, so a
 * real item id cannot be framed under a class it was never posted to.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: sectionRow }, { data: itemRow }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		supabase
			.from('classroom_items')
			.select(`${ITEM_SELECT}, posted_in:classroom_postings!inner(section_id)`)
			.eq('id', params.itemId)
			.eq('posted_in.section_id', params.sectionId)
			.maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);

	if (!sectionRow || !itemRow) error(404, 'Not found');

	const canManage = manages === true;
	let sections: ReturnType<typeof normalizeSectionRow>[] = [];
	if (canManage) {
		const { data } = await supabase.from('classroom_sections').select(SECTION_SELECT);
		sections = ((data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow);
	}

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		item: normalizeItemRow(itemRow as unknown as Record<string, unknown>),
		canManage,
		sections,
		attachmentsEnabled: driveConfigured()
	};
};
