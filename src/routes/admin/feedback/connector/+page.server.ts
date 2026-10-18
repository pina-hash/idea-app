import { fail } from '@sveltejs/kit';
import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { Actions, PageServerLoad } from './$types';

/**
 * THE CONNECTOR'S GAPS (ledger 0401, docs/connector/DESIGN.md section 9): what
 * Mr. Pina asked Claude for that the site could not do, open ones first, each
 * with his words, what was tried, a status and the saved requests it produced.
 *
 * THE GATE IS THIS LOAD'S FIRST STATEMENT, as on the area's other pages (the
 * layout's call runs concurrently, so it cannot stop this read starting). The
 * database is still the boundary: connector_admin_gaps and _set_gap (0272)
 * open with is_admin(), on the admin's own session.
 */
export interface GapEval {
	seq: number;
	said: string;
	level: string;
	expected_path: string[];
	last_passed: boolean | null;
	last_run_at: string | null;
}
export interface Gap {
	id: string;
	said: string;
	missing: string;
	tried: string[];
	status: 'open' | 'built' | 'declined';
	built_ledger: string | null;
	note: string | null;
	created_at: string;
	updated_at: string;
	updated_by: string | null;
	email: string;
	model: string | null;
	evals: GapEval[];
}

const NOT_READY = 'The connector feedback list arrives with the next database update. Nothing is wrong; it is not switched on yet.';

export const load: PageServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	const { data, error } = await locals.supabase.rpc('connector_admin_gaps', { p_status: null });
	if (error) {
		return {
			gaps: [] as Gap[],
			unavailable: error.code === 'PGRST202' || error.code === '42883' ? NOT_READY : `The connector gaps could not be read: ${error.message}`
		};
	}
	return { gaps: (data ?? []) as Gap[], unavailable: null };
};

export const actions: Actions = {
	status: async ({ request, locals }) => {
		await requireFeedbackConsole(locals);
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const status = String(f.get('status') ?? '');
		const ledger = String(f.get('ledger') ?? '').trim();
		const r = await locals.supabase.rpc('connector_admin_set_gap', {
			p_id: id,
			p_status: status,
			p_ledger: ledger || null,
			p_note: null
		});
		if (r.error) return fail(400, { id, message: r.error.message });
		const out = (r.data ?? {}) as { ok?: boolean; reason?: string };
		if (!out.ok) {
			return fail(400, {
				id,
				message:
					out.reason === 'ledger'
						? 'Built needs the four digit ledger number that built it.'
						: out.reason === 'not_found'
							? 'That gap is not there any more.'
							: 'That status was not accepted.'
			});
		}
		return { id, message: status === 'built' ? `Marked built in ${ledger}.` : status === 'declined' ? 'Marked declined.' : 'Open again.' };
	}
};
