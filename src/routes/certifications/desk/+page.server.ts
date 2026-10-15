import { requireCertifier } from '$lib/server/certifications/gate';
import type { TelemetryJson } from '$lib/certifications/types';
import { dataOrNull, loadRpc } from './desk-server';
import type { PageServerLoad } from './$types';

/** The desk: the queue and the requests from the layout's read, the telemetry from its own. */
export const load: PageServerLoad = async ({ locals, parent }) => {
	await requireCertifier(locals);
	const { desk, deskUnavailable } = await parent();
	const telemetry = await loadRpc<TelemetryJson>(locals.supabase, 'cert_telemetry');
	return {
		title: 'Desk',
		desk,
		deskUnavailable,
		telemetry: dataOrNull(telemetry),
		telemetryUnavailable: !telemetry.ok
	};
};
