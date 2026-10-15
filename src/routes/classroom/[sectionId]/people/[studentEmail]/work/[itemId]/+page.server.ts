import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow } from '$lib/classroom/classroom';
import { studentToken } from '$lib/classroom/grading-student-url';
import { loadHtmlAssignment } from '$lib/classroom/html-assignment/load';
import { studentEmailParam } from '$lib/classroom/nav';
import { loadSectionRoster, loadStudentItemWork, SECTION_SELECT, selectItemsWithDoc } from '$lib/classroom/transports';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';
import type { PageServerLoad } from './$types';

/**
 * ONE STUDENT'S FILLED ASSIGNMENT, ALONE, ON A FULL-SCREEN PAGE (the
 * 2026-10-15 round, report 5464ceb2: "during parent teacher conferences ...
 * open their filled assignment alone on a full screen page").
 *
 * THE PAGE RESETS TO THE ROOT LAYOUT (`+page@.svelte`), the projector's shape,
 * so neither classroom layout runs for it: no item list, no hall-pass payload,
 * no roster reaches the browser, only this one student's work on this one
 * item. That also means the section layout's `canManage` is not here to ask,
 * so this load asks `classroom_manages_section` itself, exactly as the
 * projector does.
 *
 * EVERY REFUSAL IS THE SAME 404, the student page's rule: not a manager of
 * this class, a malformed address, an address with no roster row here, an
 * address that manages the class (0138), an item not posted to this class,
 * and an item that is not an assignment. "Not found" and "not yours" answer
 * identically, so nothing can be probed.
 *
 * EVERY READ OF THE STUDENT'S WORK IS PINNED TO THEIR ADDRESS
 * (`loadStudentItemWork`): attribution on a read RLS already scopes to a
 * manager, never a second authorization, and the reason this page costs what
 * the student's own page costs rather than a whole-class read.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const email = studentEmailParam(params.studentEmail);
	if (!email) error(404, 'Not found');

	const [{ data: sectionRow }, { data: itemRow }, { data: manages }, roster] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		selectItemsWithDoc((select) =>
			supabase
				.from('classroom_items')
				.select(`${select}, posted_in:classroom_postings!inner(section_id)`)
				.eq('id', params.itemId)
				.eq('posted_in.section_id', params.sectionId)
				.maybeSingle()
		),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId }),
		loadSectionRoster(supabase, params.sectionId)
	]);
	if (manages !== true || !sectionRow || !itemRow) error(404, 'Not found');
	const row = roster.ok ? roster.data.rows.find((r) => r.student_email.toLowerCase() === email) : undefined;
	if (!row || row.manages === true) error(404, 'Not found');

	const item = normalizeItemRow(itemRow as unknown as Record<string, unknown>);
	if (item.kind !== 'assignment') error(404, 'Not found');

	const [specRes, html, work, gradeToken] = await Promise.all([
		supabase.from('classroom_assignment_specs').select('spec').eq('item_id', item.id).maybeSingle(),
		// The same ladder the grading console runs, through the same function.
		loadHtmlAssignment(supabase, item, item.kind),
		loadStudentItemWork(supabase, item.id, email),
		// The grading console keeps its open student in the address as this token.
		studentToken(item.id, email)
	]);

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		item,
		spec: (specRes.data?.spec as AssignmentSpec | undefined) ?? null,
		htmlAssignment: html.htmlAssignment,
		student: {
			email,
			displayName: row.display_name || email,
			active: row.active !== false
		},
		work,
		gradeToken
	};
};
