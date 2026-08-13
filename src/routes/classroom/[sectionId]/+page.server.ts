import { error, redirect } from '@sveltejs/kit';
import { normalizeSectionRow } from '$lib/classroom/classroom';
import { SECTION_SELECT, itemsForSection, mergeInstructorMaterials } from '$lib/classroom/transports';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * One class: Stream + Classwork. Every read runs as the CALLER'S OWN session
 * with no role branch -- RLS decides what comes back (a student load simply
 * never receives drafts or a foreign section, and the attachment, link and
 * view embeds are scoped by the same policies). A section the caller may not
 * read is indistinguishable from one that does not exist, so both are 404.
 *
 * `canManage` comes from the classroom_manages_section RPC (teacher of
 * record, or admin) -- the same SECURITY DEFINER check every policy uses, so
 * the page chrome can never disagree with what the database will actually
 * allow. It gates the on-card controls; the RPCs behind them re-check it
 * regardless.
 *
 * `sections` is loaded only for a manager: it is what the composer's LINKAGE
 * controls offer ("also post to...") and what the "also posted to" line names,
 * and a student has no use for either.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: sectionRow } = await supabase
		.from('classroom_sections')
		.select(SECTION_SELECT)
		.eq('id', params.sectionId)
		.maybeSingle();
	if (!sectionRow) error(404, 'Not found');

	const [{ data: manages }, content] = await Promise.all([
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId }),
		itemsForSection(supabase, params.sectionId)
	]);

	const canManage = manages === true;
	let sections: ReturnType<typeof normalizeSectionRow>[] = [];
	let items = content.items;
	if (canManage) {
		const { data } = await supabase.from('classroom_sections').select(SECTION_SELECT);
		sections = ((data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow);
		// Instructor-only materials (0090) are fetched ONLY for a manager -- a
		// student's read never even asks the question, let alone gets an answer.
		items = await mergeInstructorMaterials(supabase, items);
	}

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage,
		sections,
		attachmentsEnabled: driveConfigured(),
		items
	};
};
