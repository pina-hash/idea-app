import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { renderCertEmail } from '$lib/server/email/cert';
import { EMAIL_FIXTURES, EMAIL_KINDS, isEmailKind } from './fixtures';

/**
 * THE EMAIL HARNESS (ledger 0391, surface f). Dev only: 404 in production,
 * no auth, no Supabase, no send. Every notification kind is rendered HERE,
 * on the server, through the REAL `renderCertEmail` over its fixture input,
 * and the page shows each one in two sandboxed frames (a phone width and a
 * desktop width) beside its subject and its plain-text part. `?kind=<kind>`
 * renders only that one. `?signed=1` hands the page a MOCK SESSION, the
 * /dev/armory shape, so the header's ProfileMenu renders.
 */
export const prerender = false;

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('kind');
	const kind = isEmailKind(wanted) ? wanted : null;
	const kinds = kind ? [kind] : [...EMAIL_KINDS];
	const emails = kinds.map((k) => {
		const input = EMAIL_FIXTURES[k];
		const rendered = renderCertEmail(input);
		return { kind: k, to: input.to, title: input.title, subject: rendered.subject, html: rendered.html, text: rendered.text };
	});
	const base = { kind, kinds: [...EMAIL_KINDS], emails };
	if (url.searchParams.get('signed') !== '1') return base;
	return {
		...base,
		claims: { sub: 'mock-cert-admin', email: 'apina@boscotech.edu' },
		userProfile: {
			id: 'mock-cert-admin',
			email: 'apina@boscotech.edu',
			full_name: 'Mr. Pina',
			display_name: null,
			avatar_url: null,
			avatar: 'preset:hex',
			role: 'teacher',
			section_id: null,
			pathway: 'IDEA',
			preferences: {}
		}
	};
};
