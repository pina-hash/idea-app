import type { PageServerLoad } from './$types';
import { HOLDERS_SENTENCE } from '$lib/certifications/copy';
import type { HoldersJson } from '$lib/certifications/types';
import { readCert } from '$lib/certifications/student/load';
import type { CertShellData } from '$lib/certifications/student/shell';

const SHELL: CertShellData = { title: 'Holders', lead: HOLDERS_SENTENCE };
const EMPTY: HoldersJson = { by_certification: [], by_person: [] };

/** `cert_holders` (ledger 0391, DECISIONS D12): names only. The session is re-checked here. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.claims) return { shell: SHELL, signedOut: true, unavailable: false, holders: EMPTY };
	const got = await readCert<HoldersJson | null>(locals.supabase, 'cert_holders');
	if (!got.ok) return { shell: SHELL, signedOut: false, unavailable: true, holders: EMPTY };
	const h = got.data && typeof got.data === 'object' ? got.data : EMPTY;
	return {
		shell: SHELL,
		signedOut: false,
		unavailable: false,
		holders: { by_certification: Array.isArray(h.by_certification) ? h.by_certification : [], by_person: Array.isArray(h.by_person) ? h.by_person : [] }
	};
};
