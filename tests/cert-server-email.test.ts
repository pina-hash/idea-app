// tests/cert-server-email.test.ts
//
// THE RESEND TRANSPORT (ledger 0391). What is asserted is the wire: the
// Authorization header is the key from the environment, the body is Resend's
// shape, an unset key makes NO request at all, a 4xx is a refusal carrying the
// provider's sentence and never the key, and a thrown fetch is `network`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESEND_ENDPOINT, emailConfigured, sendEmail } from '../src/lib/server/email';

const KEY = 're_test_key_never_a_real_credential_123';
const FROM = 'IDEA Certifications <certifications@ideabosco.com>';

type Call = { url: string; init: RequestInit };

function fakeFetch(answer: { status: number; body: unknown }, calls: Call[]): typeof fetch {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify(answer.body), {
			status: answer.status,
			headers: { 'content-type': 'application/json' }
		});
	}) as typeof fetch;
}

const message = {
	to: 'wren.hollis@boscotech.net',
	subject: 'You earned MILL-1',
	html: '<p>Hello</p>',
	text: 'Hello'
};

beforeEach(() => {
	process.env.RESEND_API_KEY = KEY;
	process.env.CERT_EMAIL_FROM = FROM;
});
afterEach(() => {
	delete process.env.RESEND_API_KEY;
	delete process.env.CERT_EMAIL_FROM;
});

describe('emailConfigured', () => {
	it('needs both variables', () => {
		expect(emailConfigured()).toBe(true);
		delete process.env.CERT_EMAIL_FROM;
		expect(emailConfigured()).toBe(false);
		process.env.CERT_EMAIL_FROM = FROM;
		delete process.env.RESEND_API_KEY;
		expect(emailConfigured()).toBe(false);
	});
});

describe('sendEmail', () => {
	it('POSTs Resend\'s shape with the key in the Authorization header', async () => {
		const calls: Call[] = [];
		const result = await sendEmail(message, fakeFetch({ status: 200, body: { id: 'em_123' } }, calls));
		expect(result).toEqual({ ok: true, id: 'em_123' });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(RESEND_ENDPOINT);
		expect(calls[0].init.method).toBe('POST');
		const headers = calls[0].init.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${KEY}`);
		expect(headers['Content-Type']).toBe('application/json');
		const body = JSON.parse(String(calls[0].init.body));
		expect(body).toEqual({ from: FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text });
	});

	it('carries reply_to only when given', async () => {
		const calls: Call[] = [];
		await sendEmail({ ...message, replyTo: 'apina@boscotech.edu' }, fakeFetch({ status: 200, body: { id: 'x' } }, calls));
		expect(JSON.parse(String(calls[0].init.body)).reply_to).toBe('apina@boscotech.edu');
	});

	it('makes no request when either variable is unset', async () => {
		const calls: Call[] = [];
		const f = fakeFetch({ status: 200, body: { id: 'x' } }, calls);
		delete process.env.RESEND_API_KEY;
		expect(await sendEmail(message, f)).toMatchObject({ ok: false, reason: 'not_configured' });
		process.env.RESEND_API_KEY = KEY;
		delete process.env.CERT_EMAIL_FROM;
		expect(await sendEmail(message, f)).toMatchObject({ ok: false, reason: 'not_configured' });
		expect(calls).toHaveLength(0);
	});

	it('a 4xx is refused with the provider\'s message, and the key never rides in it', async () => {
		const calls: Call[] = [];
		const result = await sendEmail(
			message,
			fakeFetch({ status: 422, body: { statusCode: 422, message: `Domain is not verified (${KEY})` } }, calls)
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('refused');
		expect(result.message).toContain('Domain is not verified');
		expect(result.message).not.toContain(KEY);
	});

	it('a 5xx and a thrown fetch are both network', async () => {
		const calls: Call[] = [];
		const five = await sendEmail(message, fakeFetch({ status: 503, body: { message: 'try later' } }, calls));
		expect(five).toMatchObject({ ok: false, reason: 'network' });
		const thrown = await sendEmail(message, (async () => {
			throw new Error('ECONNRESET');
		}) as unknown as typeof fetch);
		expect(thrown).toMatchObject({ ok: false, reason: 'network', message: 'ECONNRESET' });
	});

	it('refuses a message with no recipient before any request', async () => {
		const calls: Call[] = [];
		const result = await sendEmail({ ...message, to: '' }, fakeFetch({ status: 200, body: {} }, calls));
		expect(result).toMatchObject({ ok: false, reason: 'refused' });
		expect(calls).toHaveLength(0);
	});
});
