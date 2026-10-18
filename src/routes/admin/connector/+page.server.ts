/**
 * /admin/connector: the IDEA Website connector's switch, its connections and
 * its audit log (docs/connector/DESIGN.md section 1). Admin tier: a non-admin
 * gets 404, never a redirect. Every read and write here is the ADMIN'S OWN
 * session calling a 0270 function that re-checks `is_admin()` in its body; the
 * connector_* tables carry no client grant at all.
 */
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isAdmin } from '$lib/server/admin';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	const tool = url.searchParams.get('tool')?.trim() || null;
	const dayRaw = url.searchParams.get('day')?.trim() || '';
	const day = DAY.test(dayRaw) ? dayRaw : null;
	const [state, audit, evals] = await Promise.all([
		supabase.rpc('connector_admin_state'),
		supabase.rpc('connector_admin_audit', { p_tool: tool, p_day: day, p_limit: 200 }),
		supabase.rpc('connector_admin_evals')
	]);
	if (state.error?.code === 'PGRST202' || audit.error?.code === 'PGRST202') {
		return { ready: false as const, tool, day, state: null, audit: [], evals: null };
	}
	if (state.error || audit.error) error(500, 'The connector could not be read.');
	// The saved requests arrive with 0272; before it, the section says so rather than failing the page.
	const savedRequests = evals.error ? null : ((evals.data ?? []) as SavedRequest[]);
	return { ready: true as const, tool, day, state: state.data as ConnectorState, audit: (audit.data ?? []) as AuditEntry[], evals: savedRequests };
};

/** One saved request (connector_evals, 0272) with its last practice replay. */
export interface SavedRequest {
	seq: number;
	said: string;
	level: 'read' | 'undo' | 'confirm' | 'refuse';
	must_happen: string | null;
	proof: string | null;
	proof_query: string | null;
	expected_path: string[];
	source: 'seed' | 'request';
	first_outcome: string | null;
	created_at: string;
	requests: number;
	last_request_at: string | null;
	runs: number;
	last_run: { passed: boolean; run_at: string; path: string[]; model: string | null; detail: Record<string, unknown> } | null;
	open_gaps: number;
}

export interface ConnectorState {
	enabled: boolean;
	updated_at: string | null;
	updated_by: string | null;
	connections: Array<{
		id: string;
		email: string;
		label: string;
		created_at: string;
		last_used_at: string | null;
		refresh_expires_at: string;
		revoked_at: string | null;
		revoked_by: string | null;
	}>;
}

export interface AuditEntry {
	id: string;
	email: string;
	tool: string;
	function_name: string;
	args: Record<string, unknown>;
	level: string;
	status: string;
	result: unknown;
	rows_written: Array<{ table: string; id: string | null; row: Record<string, unknown> }>;
	error: string | null;
	undo: unknown;
	undo_of: string | null;
	undone_by: string | null;
	started_at: string;
	finished_at: string | null;
}

async function gate(locals: App.Locals) {
	if (!locals.claims || !(await isAdmin(locals.supabase, locals.claims.sub))) error(404, 'Not found');
}

export const actions: Actions = {
	enabled: async ({ request, locals }) => {
		await gate(locals);
		const on = (await request.formData()).get('enabled') === 'true';
		const r = await locals.supabase.rpc('connector_admin_set_enabled', { p_enabled: on });
		if (r.error) return fail(400, { message: r.error.message });
		return { message: on ? 'The connector is on.' : 'The connector is off. Every connection answers signed out until it is switched back on.' };
	},
	disconnect: async ({ request, locals }) => {
		await gate(locals);
		const id = String((await request.formData()).get('id') ?? '');
		const r = await locals.supabase.rpc('connector_admin_disconnect', { p_token_id: id });
		if (r.error) return fail(400, { message: r.error.message });
		return { message: (r.data as { ok?: boolean })?.ok ? 'Disconnected.' : 'That connection was already disconnected.' };
	},
	disconnectAll: async ({ locals }) => {
		await gate(locals);
		const r = await locals.supabase.rpc('connector_admin_disconnect_all');
		if (r.error) return fail(400, { message: r.error.message });
		const n = (r.data as { disconnected?: number })?.disconnected ?? 0;
		return { message: `Disconnected ${n} ${n === 1 ? 'connection' : 'connections'}.` };
	}
};
