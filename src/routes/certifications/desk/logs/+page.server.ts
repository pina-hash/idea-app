import { requireCertifier } from '$lib/server/certifications/gate';
import { laCalendarDay } from '$lib/classroom/school-calendar';
import { isRefusal } from '$lib/certifications/types';
import type { SyncLogRow } from '$lib/certifications/desk/desk';
import { dataOrNull, loadRpc } from '../desk-server';
import type { PageServerLoad } from './$types';

/**
 * LOGS: the sync log (`cert_sync_log_list(100)`) for every certifier; the
 * last seven days of events for everyone through `cert_export('events')`, and
 * for an admin the audit and error views too (`cert_export` keeps those two
 * to an admin itself). The one clock read is here and travels down as
 * `today` for the export panel's default range.
 */
type Rows = Record<string, unknown>[];

function rowsOf(value: unknown): Rows | null {
	if (!value || isRefusal(value)) return null;
	const list = Array.isArray(value) ? value : Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: unknown[] }).rows : null;
	if (!list) return null;
	return list.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r));
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	await requireCertifier(locals);
	const { isAdmin } = await parent();
	const now = new Date();
	const from = new Date(now.getTime() - 7 * 86_400_000).toISOString();
	const to = now.toISOString();
	const exportOf = (kind: string) => loadRpc<unknown>(locals.supabase, 'cert_export', { p_kind: kind, p_from: from, p_to: to });

	const [sync, events, audit, errors] = await Promise.all([
		loadRpc<SyncLogRow[]>(locals.supabase, 'cert_sync_log_list', { p_limit: 100 }),
		exportOf('events'),
		isAdmin ? exportOf('audit') : Promise.resolve(null),
		isAdmin ? exportOf('errors') : Promise.resolve(null)
	]);
	return {
		title: 'Logs',
		unavailable: !sync.ok,
		sync: dataOrNull(sync) ?? [],
		events: events.ok ? rowsOf(events.data) : null,
		audit: audit?.ok ? rowsOf(audit.data) : null,
		errors: errors?.ok ? rowsOf(errors.data) : null,
		today: laCalendarDay(now)
	};
};
