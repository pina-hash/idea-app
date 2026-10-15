import { env } from '$env/dynamic/private';

/**
 * THE SITE'S ONE EMAIL TRANSPORT (ledger 0391): Resend's REST API, called from
 * the server with `RESEND_API_KEY`, from the address in `CERT_EMAIL_FROM`.
 *
 * idea-app had no email service before the certification portal; the spec
 * chose Resend (free plan 3,000 a month and 100 a day, read 2026-10-15) and
 * asked that email be "a clean no-op" until Mr. Pina sets the key and verifies
 * the domain. So:
 *
 *   * Both variables are read AT CALL TIME through `$env/dynamic/private`.
 *     Either unset means `emailConfigured()` is false and `sendEmail` answers
 *     `{ ok: false, reason: 'not_configured' }` WITHOUT a network call.
 *   * The key is sent in one header and appears nowhere else: not in a result,
 *     not in a log line, not in a thrown error. A provider message that somehow
 *     carried it would be redacted before it left this module.
 *   * A 4xx is a REFUSAL (the provider considered the message and said no) and
 *     carries the provider's own sentence; a 5xx, a timeout or a thrown fetch
 *     is `network`, which a caller may retry.
 *
 * This module knows nothing about certifications: the templates are
 * `$lib/server/email/cert.ts` (surface f) and the sender that chooses what to
 * send is `$lib/server/certifications/notify.ts`.
 */

export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
}

export type EmailResult =
	| { ok: true; id: string | null }
	| { ok: false; reason: 'not_configured' | 'refused' | 'network'; message: string };

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 15_000;

/** `RESEND_API_KEY` and `CERT_EMAIL_FROM` both set. */
export function emailConfigured(): boolean {
	return !!(env.RESEND_API_KEY && env.CERT_EMAIL_FROM);
}

/** Never lets the key travel, whatever a provider echoes back. */
function withoutKey(text: string, key: string): string {
	return key && text.includes(key) ? text.split(key).join('[redacted]') : text;
}

export async function sendEmail(
	m: EmailMessage,
	fetchImpl: typeof fetch = globalThis.fetch
): Promise<EmailResult> {
	const key = env.RESEND_API_KEY ?? '';
	const from = env.CERT_EMAIL_FROM ?? '';
	if (!key || !from) {
		return {
			ok: false,
			reason: 'not_configured',
			message: 'Email is not configured on this deployment.'
		};
	}
	const to = (m.to ?? '').trim();
	if (!to || !to.includes('@')) {
		return { ok: false, reason: 'refused', message: 'The message has no recipient address.' };
	}

	const body: Record<string, unknown> = {
		from,
		to: [to],
		subject: m.subject,
		html: m.html,
		text: m.text
	};
	if (m.replyTo) body.reply_to = m.replyTo;

	let response: Response;
	try {
		response = await fetchImpl(RESEND_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
		});
	} catch (e) {
		return {
			ok: false,
			reason: 'network',
			message: withoutKey((e as Error)?.message || 'The email service did not answer.', key)
		};
	}

	let parsed: Record<string, unknown> | null = null;
	try {
		parsed = (await response.json()) as Record<string, unknown>;
	} catch {
		parsed = null;
	}

	if (response.ok) {
		const id = typeof parsed?.id === 'string' ? parsed.id : null;
		return { ok: true, id };
	}
	const providerMessage =
		typeof parsed?.message === 'string'
			? parsed.message
			: typeof parsed?.error === 'string'
				? parsed.error
				: `The email service answered HTTP ${response.status}.`;
	if (response.status >= 400 && response.status < 500) {
		return { ok: false, reason: 'refused', message: withoutKey(providerMessage, key) };
	}
	return { ok: false, reason: 'network', message: withoutKey(providerMessage, key) };
}
