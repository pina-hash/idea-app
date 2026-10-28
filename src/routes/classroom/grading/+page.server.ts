import { redirect } from '@sveltejs/kit';
import { staffSections } from '$lib/classroom/staff-sections.server';
import type { PageServerLoad } from './$types';

/**
 * WHAT NEEDS GRADING, EVERY CLASS AT ONCE (ledger 0457, gap ba704a08). The
 * gate is the staff pages' one gate (a 404 for anyone who teaches nothing);
 * the read itself, `classroom_needs_grading`, re-checks the caller and lists
 * only classes they are teacher of record for.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const gate = await staffSections(supabase, claims);
	return { ...gate, me: String((claims as { email?: string }).email ?? '').toLowerCase() };
};
