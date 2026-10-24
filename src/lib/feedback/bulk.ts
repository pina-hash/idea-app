/**
 * ONE CALL FOR A SELECTION (ledger 0432, feedback 114d8101). The three
 * feedback consoles move a selection through one `*_set_status_many` call;
 * on a database without ledger 0432's migration (PostgREST's PGRST202, or
 * Postgres's 42883) the transport falls back to one call per row through the
 * console's own one-row transport, so nothing breaks in the window between a
 * deploy and the migration landing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeedbackStatus } from './feedback';

export type BulkStatusName = 'app_feedback_set_status_many' | 'armory_app_feedback_set_status_many' | 'armory_app_incidents_set_status_many';
export type SetStatusMany = (ids: string[], status: FeedbackStatus) => Promise<{ ok: boolean; landed?: string[]; message?: string }>;

export function bulkStatusTransport(
	supabase: Pick<SupabaseClient, 'rpc'>,
	fn: BulkStatusName,
	oneRow: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>,
	after?: () => void
): SetStatusMany {
	return async (ids, status) => {
		const { data, error } = await supabase.rpc(fn, { p_ids: ids, p_status: status });
		if (error && (error.code === 'PGRST202' || error.code === '42883')) {
			const each = await Promise.all(ids.map(async (id) => ((await oneRow(id, status)).ok ? id : null)));
			return { ok: true, landed: each.filter((x): x is string => !!x) };
		}
		if (error) return { ok: false, message: error.message };
		const r = (data ?? {}) as { ok?: unknown; previous?: unknown; reason?: unknown };
		if (r.ok !== true) return { ok: false, message: r.reason === 'too_many' ? 'That is too many at once. Select fewer and try again.' : 'That batch was refused.' };
		after?.();
		return { ok: true, landed: Object.keys((r.previous ?? {}) as Record<string, unknown>) };
	};
}

/** A bulk answer as the consoles' outcome shape, so one summary line serves both paths. */
export function bulkOutcome(ids: string[], r: { ok: boolean; landed?: string[]; message?: string }) {
	const landed = new Set(r.ok ? (r.landed ?? ids) : []);
	return {
		succeededIds: ids.filter((id) => landed.has(id)),
		failedIds: ids.filter((id) => !landed.has(id)),
		firstFailureMessage: r.ok ? 'That row no longer exists.' : (r.message ?? 'That batch was refused.')
	};
}
