import { error, redirect } from '@sveltejs/kit';
import { loadCalendar } from '$lib/server/calendar/load';
import type { PageServerLoad } from './$types';

/**
 * ONE CLASS'S CALENDAR (ledger 0439): the person's own calendar narrowed to
 * this class, plus the school's days. A class the caller cannot read is a 404,
 * exactly as the class page answers; the events themselves come from
 * `calendar_feed`, which never holds a class the caller is not in.
 */
export const load: PageServerLoad = async ({ params, url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const { data: section } = await supabase
		.from('classroom_sections')
		.select('id, label')
		.eq('id', params.sectionId)
		.maybeSingle();
	if (!section) error(404, 'Not found');
	return {
		sectionId: params.sectionId,
		sectionLabel: String((section as { label?: string }).label ?? ''),
		calendar: await loadCalendar(supabase, url)
	};
};
