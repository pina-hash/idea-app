import { error } from '@sveltejs/kit';
import { CERT_PATHS, certHref } from '$lib/certifications/nav';
import { CERT_EYEBROW } from '$lib/certifications/student/shell';
import type { CertGetJson } from '$lib/certifications/types';
import type { PageServerLoad } from './$types';

/**
 * THE EXAM PAGE'S LOAD (ledger 0391, surface e). A session is required and
 * its absence is a 404, never a redirect: a released exam's address is not
 * something this surface confirms exists to a visitor who holds no session
 * (CLAUDE.md, "Probing must reveal nothing"). Whether THIS student may open
 * THIS exam is `cert_exam_open`'s decision, made when Begin exam is pressed;
 * a stranger's press is refused there with the same `not_found` shape an
 * unknown id gets.
 *
 * `cert_get` is read for the words only (the certification's name for the
 * header, the exam topics' names for a failed result), and a failed read, or
 * a database without the function yet, costs the page nothing but the names.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.claims) error(404, 'Not found');
	if (!UUID.test(params.examId)) error(404, 'Not found');

	let certName: string | null = null;
	const topicNames: Record<string, string> = {};
	try {
		const { data } = await locals.supabase.rpc('cert_get', { p_code: params.code });
		const g = (data ?? null) as CertGetJson | null;
		if (g && typeof g === 'object') {
			if (typeof g.name === 'string') certName = g.name;
			for (const t of g.package?.exam?.topics ?? []) {
				if (t && typeof t.id === 'string' && typeof t.name === 'string') topicNames[t.id] = t.name;
			}
		}
	} catch {
		// The names are a convenience; the exam runs without them.
	}

	const certLabel = certName ?? params.code;
	return {
		examId: params.examId,
		code: params.code,
		certName,
		topicNames,
		shell: {
			title: `Exam: ${certLabel}`,
			eyebrow: `${CERT_EYEBROW} // ${params.code}`,
			lead: null,
			crumbs: [
				{ href: CERT_PATHS.catalog, label: 'Certifications' },
				{ href: certHref(params.code), label: certLabel }
			]
		}
	};
};
