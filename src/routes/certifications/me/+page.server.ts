import type { PageServerLoad } from './$types';
import type { CertMeJson } from '$lib/certifications/types';
import { readCert } from '$lib/certifications/student/load';
import type { CertShellData } from '$lib/certifications/student/shell';

const SHELL: CertShellData = {
	title: 'My certifications',
	lead: 'What you have earned, what you are working on, and your history. Every award here resolves to a live, signed record you can print or verify.'
};

const EMPTY: CertMeJson = { attempts: [], awards: [], notifications_unread: 0 };

/** `cert_me` (ledger 0391). The session is re-checked here; the layout's load runs concurrently. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.claims) return { shell: SHELL, signedOut: true, unavailable: false, me: EMPTY };
	const me = await readCert<CertMeJson | null>(locals.supabase, 'cert_me');
	if (!me.ok) return { shell: SHELL, signedOut: false, unavailable: true, me: EMPTY };
	const data = me.data && typeof me.data === 'object' ? me.data : EMPTY;
	return {
		shell: SHELL,
		signedOut: false,
		unavailable: false,
		me: { attempts: Array.isArray(data.attempts) ? data.attempts : [], awards: Array.isArray(data.awards) ? data.awards : [], notifications_unread: data.notifications_unread ?? 0 }
	};
};
