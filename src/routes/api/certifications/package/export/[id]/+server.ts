import { requireCertAdmin } from '$lib/server/certifications/gate';
import { loadCurrentBundle } from '$lib/server/certifications/package-io';
import { buildPackageZip, packageZipName } from '$lib/server/certifications/package-zip';
import { UUID_RE, refuse } from '$lib/server/certifications/api';
import type { RequestHandler } from './$types';

/**
 * EXPORT ONE CERTIFICATION AS A PACKAGE ZIP (ledger 0391; `docs/CERTIFICATIONS.md`
 * "Import and export, the Claude workflow"; `PACKAGE_FORMAT.md`). Admin only,
 * because the pool travels WITH its answer keys. Every function runs on the
 * caller's own client.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	await requireCertAdmin(locals);
	const id = params.id ?? '';
	if (!UUID_RE.test(id)) return new Response(null, { status: 404 });

	const read = await loadCurrentBundle(locals.supabase, id);
	if (!read.ok) {
		return read.reason === 'not_found' ? new Response(null, { status: 404 }) : refuse(read.reason, read.message, 503);
	}
	const { bundle } = read.current;
	const zip = await buildPackageZip({ package: bundle.package }, bundle.pool, bundle.lessons);
	return new Response(zip as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${packageZipName(bundle.package.code)}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
