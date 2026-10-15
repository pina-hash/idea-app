// tests/cert-server-award-route.test.ts
//
// THE AWARD ROUTE, DRIVEN AS THE REAL POST HANDLER (ledger 0391, DECISIONS D9),
// against a scripted supabase client that records every call. What fails
// invisibly: an award prepared with no signing key (an event written for
// nothing), a serial that did not match the format, a signature over different
// bytes than the payload stored, a key_id computed from the wrong bytes. The
// signature is checked with node:crypto directly, never with the module's own
// verifier, and the email hash with node's sha256.

import { createHash, createPrivateKey, createPublicKey, verify as nodeVerify } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIAL_RE } from '../src/lib/certifications/serial';
import { canonicalPayload } from '../src/lib/certifications/signing-payload';
import type { SignedPayload } from '../src/lib/certifications/types';
import { CERT_SIGNING_INVALID_MESSAGE, CERT_SIGNING_UNSET_MESSAGE } from '../src/lib/certifications/copy';

const hooks = vi.hoisted(() => ({ notified: 0, notifyCalls: [] as unknown[], mirrorCalls: [] as string[] }));
vi.mock('$lib/server/certifications/notify', () => ({
	sendCertNotifications: async (notify: unknown, origin: string) => {
		hooks.notifyCalls.push({ notify, origin });
		return { attempted: 1, emailed: 1, pushed: 0, notified: hooks.notified, unstamped: 0, errors: 0 };
	}
}));
vi.mock('$lib/server/certifications/mirror', () => ({
	sendMirror: async (trigger: string) => {
		hooks.mirrorCalls.push(trigger);
		return { ok: false, reason: 'not_configured', message: 'x' };
	}
}));

const { POST } = await import('../src/routes/api/certifications/award/+server');

const SEED = Buffer.from('a1'.repeat(32), 'hex');
const PKCS8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]);
const privateKey = createPrivateKey({ key: PKCS8, format: 'der', type: 'pkcs8' });
const publicKey = createPublicKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const SPKI = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
const KEY_ID = createHash('sha256').update(SPKI.subarray(SPKI.length - 32)).digest('hex').slice(0, 8);

const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const record = {
	attempt_id: ATTEMPT,
	student: { email: 'wren.hollis@boscotech.net', name: 'Wren Hollis' },
	certification: { id: '55555555-5555-4555-8555-555555555555', code: 'MILL-1', name: 'Manual Mill Level 1', level: 1, category: 'Machining' },
	revision_id: '66666666-6666-4666-8666-666666666666',
	awarded_at: '2026-10-15T20:00:00.123+00:00',
	expires_at: null,
	certifier: { email: 'apina@boscotech.edu', name: 'Mr. Pina' }
};

interface Script {
	cert_is_certifier?: boolean;
	cert_award_prepare?: unknown;
	cert_award_commit?: unknown | ((args: Record<string, unknown>) => unknown);
}
function client(script: Script) {
	const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
	const supabase = {
		rpc: async (fn: string, args?: Record<string, unknown>) => {
			calls.push({ fn, args });
			if (fn === 'cert_is_certifier') return { data: script.cert_is_certifier ?? true, error: null };
			if (fn === 'cert_award_prepare') return { data: script.cert_award_prepare ?? { ok: true, record }, error: null };
			if (fn === 'cert_award_commit') {
				const a = script.cert_award_commit;
				return { data: typeof a === 'function' ? (a as (x: Record<string, unknown>) => unknown)(args ?? {}) : (a ?? { ok: true, award: { id: 'aw', serial: args?.p_serial }, notify: [{ id: 'n' }] }), error: null };
			}
			return { data: null, error: { code: 'PGRST202', message: `no ${fn}` } };
		}
	} as unknown as SupabaseClient;
	return { supabase, calls };
}

function event(body: unknown, script: Script, claims: { sub: string } | null = { sub: 'cert-uid' }) {
	const c = client(script);
	const request = new Request('https://ideabosco.com/api/certifications/award', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
	return { calls: c.calls, event: { request, url: new URL(request.url), locals: { supabase: c.supabase, claims } } as unknown as Parameters<typeof POST>[0] };
}

beforeEach(() => {
	hooks.notified = 1;
	hooks.notifyCalls.length = 0;
	hooks.mirrorCalls.length = 0;
	process.env.CERT_SIGNING_PRIVATE_KEY = SEED.toString('base64');
});
afterEach(() => {
	delete process.env.CERT_SIGNING_PRIVATE_KEY;
});

describe('POST /api/certifications/award', () => {
	it('refuses a non-certifier with 404 and calls nothing else', async () => {
		const { calls, event: e } = event({ attempt_id: ATTEMPT }, { cert_is_certifier: false });
		await expect(POST(e)).rejects.toMatchObject({ status: 404 });
		expect(calls.map((c) => c.fn)).toEqual(['cert_is_certifier']);
		const anon = event({ attempt_id: ATTEMPT }, {}, null);
		await expect(POST(anon.event)).rejects.toMatchObject({ status: 404 });
		expect(anon.calls).toHaveLength(0);
	});

	it('with no signing key answers 409 with the admin sentence and prepares NOTHING', async () => {
		delete process.env.CERT_SIGNING_PRIVATE_KEY;
		const { calls, event: e } = event({ attempt_id: ATTEMPT }, {});
		const res = await POST(e);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ ok: false, reason: 'signing_unset', message: CERT_SIGNING_UNSET_MESSAGE });
		expect(calls.map((c) => c.fn)).toEqual(['cert_is_certifier']);
		process.env.CERT_SIGNING_PRIVATE_KEY = 'garbage';
		const bad = event({ attempt_id: ATTEMPT }, {});
		const res2 = await POST(bad.event);
		expect(res2.status).toBe(409);
		expect(await res2.json()).toEqual({ ok: false, reason: 'signing_invalid', message: CERT_SIGNING_INVALID_MESSAGE });
		expect(bad.calls.map((c) => c.fn)).toEqual(['cert_is_certifier']);
	});

	it('a bad body is 400 before the key is read', async () => {
		delete process.env.CERT_SIGNING_PRIVATE_KEY;
		const { event: e } = event({ attempt_id: 'not-a-uuid' }, {});
		expect((await POST(e)).status).toBe(400);
		const { event: e2 } = event('{ not json', {});
		expect((await POST(e2)).status).toBe(400);
	});

	it('passes a prepare refusal through as 409 with its own reason, and commits nothing', async () => {
		const { calls, event: e } = event({ attempt_id: ATTEMPT }, { cert_award_prepare: { ok: false, reason: 'no_name', message: 'This student has no name on their profile yet.' } });
		const res = await POST(e);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ ok: false, reason: 'no_name', message: 'This student has no name on their profile yet.' });
		expect(calls.map((c) => c.fn)).toEqual(['cert_is_certifier', 'cert_award_prepare']);
		expect(hooks.mirrorCalls).toEqual([]);
	});

	it('signs the prepared record, commits serial, signature, key id and payload, then notifies and mirrors', async () => {
		const { calls, event: e } = event({ attempt_id: ATTEMPT }, {});
		const res = await POST(e);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(calls.map((c) => c.fn)).toEqual(['cert_is_certifier', 'cert_award_prepare', 'cert_award_commit']);
		const commit = calls[2].args!;
		expect(commit.p_attempt).toBe(ATTEMPT);
		expect(commit.p_serial).toMatch(SERIAL_RE);
		expect(commit.p_key_id).toBe(KEY_ID);
		const signed = commit.p_signed as Record<string, unknown>;
		expect(Object.keys(signed)).toEqual(['v', 'serial', 'code', 'level', 'holder_name', 'email_sha256', 'awarded_at', 'certifier_name']);
		expect(signed).toMatchObject({
			v: 1,
			serial: commit.p_serial,
			code: 'MILL-1',
			level: 1,
			holder_name: 'Wren Hollis',
			email_sha256: createHash('sha256').update('wren.hollis@boscotech.net').digest('hex'),
			awarded_at: '2026-10-15T20:00:00Z',
			certifier_name: 'Mr. Pina'
		});
		// Verified with node:crypto against the independent public key, over the canonical bytes.
		const payload = signed as unknown as SignedPayload;
		expect(nodeVerify(null, canonicalPayload(payload), publicKey, Buffer.from(commit.p_signature as string, 'base64'))).toBe(true);
		expect(nodeVerify(null, canonicalPayload({ ...payload, level: 2 }), publicKey, Buffer.from(commit.p_signature as string, 'base64'))).toBe(false);
		expect(body).toMatchObject({ ok: true, award: { id: 'aw', serial: commit.p_serial }, certificate_href: `/certifications/certificate/${commit.p_serial}`, notified: 1 });
		expect(hooks.notifyCalls).toEqual([{ notify: [{ id: 'n' }], origin: 'https://ideabosco.com' }]);
		expect(hooks.mirrorCalls).toEqual(['award']);
		// Nothing about the key leaves: the response carries no signature material beyond what the function returned.
		expect(JSON.stringify(body)).not.toContain(SEED.toString('base64'));
	});

	it('two awards never share a serial', async () => {
		const serials = new Set<string>();
		for (let i = 0; i < 5; i++) {
			const { calls, event: e } = event({ attempt_id: ATTEMPT }, {});
			await POST(e);
			serials.add(calls[2].args!.p_serial as string);
		}
		expect(serials.size).toBe(5);
	});

	it('a commit refusal (payload mismatch) is 409 as it stands, and nothing is notified or mirrored', async () => {
		const { event: e } = event({ attempt_id: ATTEMPT }, { cert_award_commit: { ok: false, reason: 'payload_mismatch', message: 'The signed payload does not match the record.' } });
		const res = await POST(e);
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ ok: false, reason: 'payload_mismatch' });
		expect(hooks.notifyCalls).toEqual([]);
		expect(hooks.mirrorCalls).toEqual([]);
	});
});
