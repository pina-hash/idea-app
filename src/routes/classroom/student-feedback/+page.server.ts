import { error, redirect } from '@sveltejs/kit';
import { parseThreads, type FeedbackThread } from '$lib/classroom/feedback/notes';
import { htmlManifestShaped } from '$lib/classroom/transports';
import { sectionTitle } from '$lib/classroom/classroom';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import type { PageServerLoad } from './$types';

/**
 * THE INSTRUCTOR'S FEEDBACK INBOX (0238, decision 60): every note on student
 * work this caller may read, in one place.
 *
 * IT 404s TO ANYBODY WHO MANAGES NO CLASS, rather than redirecting, because the
 * existence of an instructor's inbox is not a student's business, and "not
 * found" and "not yours" answer identically. WHO MANAGES IS THE DATABASE'S
 * ANSWER, never a second spelling of it here: an admin manages every class
 * (`navIsAdmin`, the server's own `is_admin()` read), and for anybody else each
 * listed class is put to `classroom_manages_section`. The gate is convenience;
 * the boundary is `classroom_feedback_list`, which answers a thread only to the
 * student it is about or to somebody who may review that student's work.
 *
 * THE KEYS ARE NESTED UNDER `feedbackInbox`, so nothing here shadows the
 * classroom layout's own keys.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, parent }) => {
	if (!claims) redirect(303, '/');
	const layout = await parent();
	const listed = layout.navSections ?? [];
	let managed = listed;
	if (layout.navIsAdmin !== true) {
		const answers = await Promise.all(
			listed.map((s) =>
				Promise.resolve(supabase.rpc('classroom_manages_section', { p_section_id: s.id })).then(
					({ data }) => data === true,
					() => false
				)
			)
		);
		managed = listed.filter((_s, i) => answers[i]);
	}
	if (!managed.length) error(404, 'Not found');

	const { data, error: listError } = await supabase.rpc('classroom_feedback_list', {});
	let threads: FeedbackThread[] | null;
	if (listError) {
		if (listError.code === 'PGRST202' || listError.code === '42883') threads = null;
		else throw listError;
	} else threads = parseThreads(data).filter((t) => t.viewer === 'teacher');

	// Each assignment's manifest, so a note's place reads as words. One read for
	// every assignment that has a note; an item that is not a ported worksheet
	// simply has no row.
	const itemIds = [...new Set((threads ?? []).map((t) => t.itemId))];
	const manifests: Record<string, HtmlAssignmentManifest> = {};
	if (itemIds.length) {
		const { data: docs } = await supabase
			.from('classroom_html_assignments')
			.select('item_id, manifest')
			.in('item_id', itemIds);
		for (const row of (docs ?? []) as { item_id: string; manifest: unknown }[]) {
			if (htmlManifestShaped(row.manifest)) manifests[row.item_id] = row.manifest as HtmlAssignmentManifest;
		}
	}

	return {
		feedbackInbox: {
			threads,
			sections: managed.map((s) => ({ id: s.id, label: sectionTitle(s) })),
			manifests
		}
	};
};
