import { requireCertifier } from '$lib/server/certifications/gate';
import { exportReadme, exportZipName, isExportKind, toCsv } from '$lib/server/certifications/exports';
import { isRefusalObject, passRefusal, refuse, rpcFailure } from '$lib/server/certifications/api';
import { buildZip } from '$lib/foundry/zip-write';
import type { RequestHandler } from './$types';

/**
 * THE BULK EXPORT (ledger 0391; `docs/CERTIFICATIONS.md` "Bulk export for
 * Claude"). `GET ?kind=&from=&to=` for a certifier (`cert_export` itself keeps
 * `audit` and `errors` to an admin and refuses everyone else with its own
 * reason, passed through). The answer is one ZIP, `cert-<kind>-<YYYYMMDD>.zip`,
 * holding `<kind>.json`, `<kind>.csv` and a README that explains the fields,
 * served as an attachment and never cached.
 */
const EXPORT_CAP = 50_000;

function instant(value: string | null, label: string): { ok: true; iso: string | null } | { ok: false; message: string } {
	if (!value) return { ok: true, iso: null };
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return { ok: false, message: `${label} must be a date or an ISO 8601 instant.` };
	return { ok: true, iso: d.toISOString() };
}

export const GET: RequestHandler = async ({ url, locals }) => {
	await requireCertifier(locals);

	const kind = url.searchParams.get('kind') ?? '';
	if (!isExportKind(kind)) return refuse('invalid_kind', 'kind must be one of the export kinds.', 400);
	const from = instant(url.searchParams.get('from'), 'from');
	if (!from.ok) return refuse('invalid_range', from.message, 400);
	const to = instant(url.searchParams.get('to'), 'to');
	if (!to.ok) return refuse('invalid_range', to.message, 400);

	const { data, error } = await locals.supabase.rpc('cert_export', { p_kind: kind, p_from: from.iso, p_to: to.iso });
	if (error) return rpcFailure(error);
	if (isRefusalObject(data)) return passRefusal(data, 404);
	const rows = (Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown } | null)?.rows) ? (data as { rows: unknown[] }).rows : []).filter(
		(r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)
	);

	const now = new Date();
	const encoder = new TextEncoder();
	const zip = await buildZip([
		{ path: `${kind}.json`, bytes: encoder.encode(JSON.stringify(rows, null, 2) + '\n') },
		{ path: `${kind}.csv`, bytes: encoder.encode(toCsv(rows)) },
		{
			path: 'README.md',
			bytes: encoder.encode(
				exportReadme({
					kind,
					count: rows.length,
					from: from.iso,
					to: to.iso,
					exportedAt: now.toISOString(),
					truncated: rows.length >= EXPORT_CAP
				})
			)
		}
	]);
	return new Response(zip as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${exportZipName(kind, now)}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
