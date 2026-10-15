import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CERT_MARK_SRC, CERT_MARK_SRCSET } from '$lib/certifications/certificate/assets';
import { qrSvgDataUrl } from '$lib/certifications/certificate/qr';
import { verifyUrl } from '$lib/certifications/nav';
import { CERTIFICATE_RECORDS, CERTIFICATE_STATES, isCertificateState, type CertificateState } from './fixtures';

/**
 * THE CERTIFICATE HARNESS (ledger 0391, surface f). Dev only: 404 in
 * production, no auth, no Supabase. The REAL `CertificatePage` over a fixture
 * record in every state (`valid`, `valid-dated`, `expired`, `suspended`,
 * `revoked`, `long-name`), one per `?state=` or all stacked under
 * `[data-view]`, each with a REAL QR code drawn here exactly as the route
 * draws it. `?signed=1` hands the page a MOCK SESSION, the /dev/armory shape,
 * so the header's ProfileMenu renders.
 */
export const prerender = false;

export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('state');
	const state: CertificateState | null = isCertificateState(wanted) ? wanted : null;
	const states = state ? [state] : [...CERTIFICATE_STATES];
	const views = await Promise.all(
		states.map(async (s) => {
			const record = CERTIFICATE_RECORDS[s];
			const verify = verifyUrl(record.serial);
			return { state: s, record, verifyUrl: verify, qrSrc: await qrSvgDataUrl(verify) };
		})
	);
	const base = { state, views, markSrc: CERT_MARK_SRC, markSrcset: CERT_MARK_SRCSET };
	if (url.searchParams.get('signed') !== '1') return base;
	return {
		...base,
		claims: { sub: 'mock-cert-user', email: 'ana.reyes@boscotech.net' },
		userProfile: {
			id: 'mock-cert-user',
			email: 'ana.reyes@boscotech.net',
			full_name: 'Ana Reyes',
			display_name: null,
			avatar_url: null,
			avatar: 'preset:hex',
			role: 'student',
			section_id: null,
			pathway: 'IDEA',
			preferences: {}
		}
	};
};
