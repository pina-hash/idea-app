import {
	ARMORY_REPORTS_NOT_READY,
	armoryReportsNotReady,
	INCIDENT_MACHINE_COLUMNS,
	parseArmoryIncidentRows,
	parseIncidentMachines,
	withIncidentMachines
} from '$lib/feedback/armory-reports';
import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { PageServerLoad } from './$types';

/**
 * THE ARMORY APP'S INCIDENTS (website requests v0.3, item 4b), admin only.
 *
 * The gate is this load's first statement for the reason the notes page gives:
 * the layout's load runs beside this one, not before it.
 *
 * THE LIST CARRIES NO REPORT. `armory_app_incidents_admin_list` projects every
 * column but `report` and a `report_bytes` beside it, because a report can be a
 * megabyte and a page of them would be tens. The page fetches a report only
 * when one is downloaded.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	const { data, error } = await locals.supabase.rpc('armory_app_incidents_admin_list', {
		p_limit: 500
	});
	if (error) {
		return {
			rows: [],
			unavailable: armoryReportsNotReady(error.code)
				? ARMORY_REPORTS_NOT_READY
				: `The Armory incidents could not be read: ${error.message}`
		};
	}
	return { rows: withIncidentMachines(parseArmoryIncidentRows(data), await readMachines(locals.supabase)), unavailable: null };
};

/**
 * THE MACHINE IDS (0236, Armory 0.3.3 item 4), read from the incidents
 * table's own stored column rather than from each report (up to 1 MiB a
 * row): admin-only by its RLS policy, the last 90 days as the list shows
 * them. A database without the column, or any failure, is no ids, never an
 * error: the console renders as it did.
 */
async function readMachines(supabase: App.Locals['supabase']) {
	try {
		const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
		const { data, error } = await supabase
			.from('armory_app_incidents')
			.select(INCIDENT_MACHINE_COLUMNS)
			.gte('created_at', since)
			.not('machine_id', 'is', null)
			.order('created_at', { ascending: false })
			.limit(1000);
		return error ? [] : parseIncidentMachines(data);
	} catch {
		return [];
	}
}
