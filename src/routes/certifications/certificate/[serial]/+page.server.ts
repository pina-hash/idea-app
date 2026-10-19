import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CERT_MARK_SRC, CERT_MARK_SRCSET } from '$lib/certifications/certificate/assets';
import { qrSvgDataUrl } from '$lib/certifications/certificate/qr';
import { CERT_PATHS, verifyUrl } from '$lib/certifications/nav';
import { normalizeSerial } from '$lib/certifications/serial';
import { isRefusal, type CertificateJson, type CertRefusal } from '$lib/certifications/types';
import { readCert } from '$lib/certifications/student/load';
import { CERT_EYEBROW, type CertShellData } from '$lib/certifications/student/shell';
import { certSiteOrigin } from '$lib/server/certifications/gate';

const shellFor = (code: string | null): CertShellData => ({
	title: 'Certificate',
	eyebrow: code ? `${CERT_EYEBROW} · ${code}` : CERT_EYEBROW,
	lead: null,
	crumbs: [
		{ href: CERT_PATHS.catalog, label: 'Certifications' },
		{ href: CERT_PATHS.me, label: 'My certifications' }
	]
});

/**
 * THE PRINTABLE CERTIFICATE (ledger 0391, surface f). A session is required
 * (404 without one: the page is the holder's, a certifier's or an admin's,
 * and `cert_certificate` answers `not_found` to anybody else, which is the
 * same 404). The serial in the address is folded to its one spelling first,
 * so a serial read off a photocopy with an O for a 0 still opens; what is not
 * a serial at all is a 404 with no call made.
 *
 * The QR code is drawn here, on the server, as a data URL the component puts
 * in an `img`: the verify URL with the request's own origin while developing
 * and the canonical host in production (`certSiteOrigin`), so a code printed
 * from production opens ideabosco.com. A `PGRST202` (the migration not
 * applied yet) renders the one "not available yet" notice; any other error
 * is thrown to the error boundary (`readCert`).
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.claims) error(404, 'Not found');
	const serial = normalizeSerial(params.serial ?? '');
	if (!serial) error(404, 'Not found');

	const got = await readCert<CertificateJson | CertRefusal | null>(locals.supabase, 'cert_certificate', { p_serial: serial });
	if (!got.ok) {
		return { shell: shellFor(null), unavailable: true, record: null as CertificateJson | null, qrSrc: '', verifyUrl: '', markSrc: CERT_MARK_SRC, markSrcset: CERT_MARK_SRCSET };
	}
	const answer = got.data;
	if (!answer || typeof answer !== 'object' || isRefusal(answer) || typeof answer.serial !== 'string') error(404, 'Not found');
	const record: CertificateJson = answer;

	const verify = verifyUrl(record.serial, certSiteOrigin(url));
	const qrSrc = await qrSvgDataUrl(verify);
	return {
		shell: shellFor(record.code),
		unavailable: false,
		record,
		qrSrc,
		verifyUrl: verify,
		markSrc: CERT_MARK_SRC,
		markSrcset: CERT_MARK_SRCSET
	};
};
