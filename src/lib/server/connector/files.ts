/**
 * A FILE FROM A CHAT, PUT WHERE THE SITE PUTS IT (ledger 0422, gap d782fd4e).
 *
 * `start_upload` hands out a slot; the chat sends the bytes (a PUT to the
 * signed address, or `upload_part` pieces); a tool then names the slot. For a
 * classroom file the tool runs the site's OWN three steps, in-process and as
 * him: the role's sign route, a PUT of the bytes to the address it signed, and
 * the role's record route. So every gate, size limit and refusal is the one a
 * person meets on the page, and nothing here decides what is allowed.
 */
import { runRouteAs, type RouteLocals, type RouteModule } from './endpoints';

/** The classroom's upload content type, as `$lib/classroom/file-upload` sends it. */
const CLASSROOM_UPLOAD_CONTENT_TYPE = 'application/octet-stream';

export type SiteFileRole = 'attachment' | 'instructor' | 'thumbnail' | 'quick-post';

const ROUTES: Record<SiteFileRole, { sign: [string, () => Promise<RouteModule>]; record: [string, () => Promise<RouteModule>] }> = {
	attachment: {
		sign: ['/api/classroom/attachment/sign', () => import('../../../routes/api/classroom/attachment/sign/+server')],
		record: ['/api/classroom/attachment', () => import('../../../routes/api/classroom/attachment/+server')]
	},
	instructor: {
		sign: ['/api/classroom/instructor-attachment/sign', () => import('../../../routes/api/classroom/instructor-attachment/sign/+server')],
		record: ['/api/classroom/instructor-attachment', () => import('../../../routes/api/classroom/instructor-attachment/+server')]
	},
	thumbnail: {
		sign: ['/api/classroom/thumbnail/sign', () => import('../../../routes/api/classroom/thumbnail/sign/+server')],
		record: ['/api/classroom/thumbnail', () => import('../../../routes/api/classroom/thumbnail/+server')]
	},
	'quick-post': {
		sign: ['/api/classroom/quick-post-file/sign', () => import('../../../routes/api/classroom/quick-post-file/sign/+server')],
		record: ['/api/classroom/quick-post-file', () => import('../../../routes/api/classroom/quick-post-file/+server')]
	}
};

export type FileOutcome = { ok: true; storageKey: string; recorded: unknown } | { ok: false; message: string };

function said(data: unknown, fallback: string): string {
	const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	return typeof d.error === 'string' ? d.error : typeof d.message === 'string' ? d.message : fallback;
}

/** The three steps of a classroom upload, as him: sign, PUT, record. */
export async function sendSiteFile(
	locals: RouteLocals,
	role: SiteFileRole,
	ownerId: string,
	filename: string,
	bytes: Uint8Array,
	record: Record<string, unknown> = {}
): Promise<FileOutcome> {
	const r = ROUTES[role];
	const sign = await runRouteAs(locals, r.sign[0], await r.sign[1](), 'POST', { item_id: ownerId, filename, size_bytes: bytes.byteLength });
	const signed = (sign.data ?? {}) as { ok?: boolean; signed_url?: string; key?: string };
	if (sign.status >= 300 || signed.ok !== true || !signed.signed_url || !signed.key) {
		return { ok: false, message: said(sign.data, `The site would not take "${filename}" (it answered ${sign.status}).`) };
	}
	const put = await fetch(signed.signed_url, { method: 'PUT', headers: { 'content-type': CLASSROOM_UPLOAD_CONTENT_TYPE }, body: bytes as unknown as BodyInit });
	if (!put.ok) return { ok: false, message: `"${filename}" did not reach storage (it answered ${put.status}).` };
	const rec = await runRouteAs(locals, r.record[0], await r.record[1](), 'POST', {
		...record,
		item_id: ownerId,
		storage_key: signed.key,
		filename,
		size_bytes: bytes.byteLength
	});
	const recorded = (rec.data ?? {}) as { ok?: boolean };
	if (rec.status >= 300 || recorded.ok !== true) return { ok: false, message: said(rec.data, `"${filename}" uploaded but could not be recorded.`) };
	return { ok: true, storageKey: signed.key, recorded: rec.data };
}

/** The text of an uploaded file, for a tool that takes a document (an HTML assignment). */
export function uploadText(bytes: Uint8Array): string {
	return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
