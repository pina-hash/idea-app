import { redirect } from '@sveltejs/kit';
import { normalizeSectionRow } from '$lib/classroom/classroom';
import { loadClassroomWork } from '$lib/classroom/student-work';
import { buildTodo, todoSections, todoSummaries, type TodoSummaries } from '$lib/classroom/todo';
import type { PageServerLoad } from './$types';

/**
 * Classroom home ("My Classes"). Signed-in tier, any role: /classroom is in
 * hooks.server.ts authedPrefixes, so anonymous visitors get the standard 303
 * to `/` (this redirect is belt-and-braces for a direct load).
 *
 * ONE RLS-scoped select serves both audiences with no role branch in the
 * query (the /coin-balance doctrine -- the filtering IS the policy, never
 * application code): classroom_sections' policy returns exactly the sections
 * the caller may see, which is their enrolled classes for a student, their
 * own sections for a teacher of record, and everything for an admin.
 *
 * WHAT EACH CLASS OWES, FOR A STUDENT (ledger 0297). A card carries how many
 * things are missing and how many are due this week, and the page carries a
 * door to the to-do with the same two numbers across every class. Both come
 * from `loadClassroomWork` and `buildTodo` -- the read and the classifier the
 * to-do page itself runs -- so a count here and the list it opens cannot
 * disagree. STAFF TAKE NO SUCH READ: the counts are a student's, a teacher's
 * classes would all be "taught" and count nothing, and an admin's section read
 * is every class in the school.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, parent }) => {
	if (!claims) redirect(303, '/');

	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', claims.sub)
		.maybeSingle();

	const isStaff = profile?.role === 'teacher';
	const email = (claims.email as string | undefined) ?? '';
	const layout = parent();

	const [{ data: sections, error }, work] = await Promise.all([
		supabase
			.from('classroom_sections')
			.select('id, course_id, label, block, teacher_email, classroom_courses(id, code, title, active)')
			.order('label'),
		isStaff
			? Promise.resolve(null)
			: loadClassroomWork(supabase, {
					userId: claims.sub,
					email,
					isAdmin: layout.then((d) => d.isAdmin === true),
					checkIns: true
				})
	]);

	let todo: TodoSummaries | null = null;
	if (work?.ready) {
		const isAdmin = (await layout).isAdmin === true;
		const rows = buildTodo({
			sections: work.sections,
			items: work.items,
			submissions: work.submissions,
			checkIns: work.checkIns,
			myEmail: email,
			isAdmin,
			clock: work.clock
		});
		todo = todoSummaries(rows, todoSections(work.sections, email, isAdmin), work.clock.today);
	}

	return {
		// Fails soft: 0082 not applied reads as a clearly-flagged "not available
		// yet" card rather than a crashed page (the /coin-balance convention).
		ready: !error,
		isStaff,
		sections: ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
		todo
	};
};
