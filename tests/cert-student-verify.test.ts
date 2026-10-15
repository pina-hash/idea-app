// tests/cert-student-verify.test.ts
//
// THE PUBLIC VERIFY PAGE (ledger 0391, DECISIONS D9 and D10). Its properties
// fail silently, which is why they are a test and not only a harness:
//
//   - the five states' words come from `VERIFY_WORDS` and ONLY a found record
//     draws the facts and the "Check it yourself" payload;
//   - no email reaches the markup in any state (the payload carries a hash);
//   - a serial that does not normalize is "No such certificate." with NO call
//     made (the database never sees a guess that cannot be a serial);
//   - the real load calls `cert_verify` with the NORMALIZED serial, treats a
//     record whose signature does not verify as "none" without saying why,
//     and verifies a genuine signature under the server's key;
//   - over the rate limit the same page renders the one sentence.
//
// The verify route's load is driven directly with a stub client; the
// signature half uses a real Ed25519 key generated for the test.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import VerifyResult from '$lib/certifications/student/VerifyResult.svelte';
import type { VerifyView } from '$lib/certifications/student/verify';
import { VERIFY_WORDS, VERIFY_RATE_LIMITED } from '$lib/certifications/copy';
import { buildSignedPayload } from '$lib/certifications/signing-payload';
import { generateSigningKey, parseSigningKey, signPayload } from '$lib/server/certifications/signing';
import { load } from '../src/routes/certifications/verify/+page.server';
import { VERIFY_RECORD } from '../src/routes/dev/cert-certification/fixtures';

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const view = (over: Partial<VerifyView>): VerifyView => ({ state: 'idle', serial: null, typed: '', record: null, ...over });
const renderView = (v: VerifyView) => strip(render(VerifyResult, { props: { view: v } }).body);

const SERIAL = 'IDEA-7K3Q-M9XD-2HTR-W4PB';

describe('VerifyResult: one panel, the state in words, facts only for a found record', () => {
	it('the four award states carry their title and body, the facts and the payload', () => {
		for (const state of ['valid', 'suspended', 'revoked', 'expired'] as const) {
			const html = renderView(view({ state, serial: SERIAL, typed: SERIAL, record: { ...VERIFY_RECORD, status: state } }));
			expect(html, state).toContain(VERIFY_WORDS[state].title);
			expect(html, state).toContain(VERIFY_WORDS[state].body);
			expect(count(html, /data-testid="cert-verify-result"/g), state).toBe(1);
			expect(count(html, /data-testid="cert-verify-facts"/g), state).toBe(1);
			expect(count(html, /data-testid="cert-verify-payload"/g), state).toBe(1);
			expect(html, state).toContain('Ana Reyes');
			expect(html, state).toContain('Check it yourself');
			expect(html, state).toContain(`data-state="${state}"`);
		}
	});

	it('No such certificate: the sentence, no facts, no payload, no reason', () => {
		const html = renderView(view({ state: 'none', serial: SERIAL, typed: SERIAL }));
		expect(html).toContain(VERIFY_WORDS.none.title);
		expect(html).toContain(VERIFY_WORDS.none.body);
		expect(count(html, /data-testid="cert-verify-facts"/g)).toBe(0);
		expect(count(html, /data-testid="cert-verify-payload"/g)).toBe(0);
		expect(html).not.toMatch(/signature|mismatch|key id/i);
	});

	it('rate limited: the one sentence and nothing else; idle: the invitation', () => {
		const limited = renderView(view({ state: 'limited', serial: SERIAL, typed: SERIAL }));
		expect(limited).toContain(VERIFY_RATE_LIMITED);
		expect(count(limited, /data-testid="cert-verify-facts"/g)).toBe(0);
		const idle = renderView(view({ state: 'idle' }));
		expect(idle).toContain('Check a certificate');
		expect(count(idle, /data-testid="cert-verify-serial"/g)).toBe(0);
	});

	it('no email anywhere, in every state, while the payload still carries the hash', () => {
		const states: VerifyView['state'][] = ['valid', 'suspended', 'revoked', 'expired', 'none', 'limited', 'idle', 'unavailable'];
		for (const state of states) {
			const record = state === 'valid' || state === 'suspended' || state === 'revoked' || state === 'expired' ? { ...VERIFY_RECORD, status: state } : null;
			const html = renderView(view({ state, serial: SERIAL, typed: SERIAL, record }));
			expect(html, state).not.toMatch(/@[a-z0-9.-]+\.(net|edu|com)/i);
		}
		const valid = renderView(view({ state: 'valid', serial: SERIAL, typed: SERIAL, record: VERIFY_RECORD }));
		expect(valid).toContain('email_sha256');
		expect(valid).toContain(VERIFY_RECORD.signed_payload.email_sha256);
	});
});

/* ---------------------------------------------------------------------- */
/* The real load                                                            */
/* ---------------------------------------------------------------------- */

interface Stub {
	calls: { fn: string; args: unknown }[];
	answer: unknown;
	error: { code?: string; message: string } | null;
}

function client(stub: Stub) {
	return {
		rpc(fn: string, args?: unknown) {
			stub.calls.push({ fn, args });
			if (fn === 'cert_error_log') return Promise.resolve({ data: { ok: true }, error: null });
			return Promise.resolve({ data: stub.error ? null : stub.answer, error: stub.error });
		}
	};
}

let addressSeq = 0;
async function drive(serial: string | null, stub: Stub, opts: { claims?: boolean; address?: string } = {}) {
	const url = new URL('http://localhost/certifications/verify' + (serial === null ? '' : `?serial=${encodeURIComponent(serial)}`));
	const address = opts.address ?? `10.0.0.${++addressSeq}`;
	const event = {
		url,
		locals: { supabase: client(stub), claims: opts.claims ? { sub: 'u-1', email: 'ana@boscotech.net' } : null },
		getClientAddress: () => address
	};
	return (await (load as unknown as (e: unknown) => Promise<{ view: VerifyView; status: number }>)(event)) as { view: VerifyView; status: number };
}

const stubOf = (answer: unknown, error: Stub['error'] = null): Stub => ({ calls: [], answer, error });

describe('the verify load', () => {
	const previousKey = process.env.CERT_SIGNING_PRIVATE_KEY;
	beforeEach(() => {
		delete process.env.CERT_SIGNING_PRIVATE_KEY;
	});
	afterEach(() => {
		if (previousKey === undefined) delete process.env.CERT_SIGNING_PRIVATE_KEY;
		else process.env.CERT_SIGNING_PRIVATE_KEY = previousKey;
	});

	it('nothing typed is idle, and makes no call', async () => {
		const stub = stubOf({ found: false });
		const { view: v, status } = await drive(null, stub);
		expect(v.state).toBe('idle');
		expect(status).toBe(200);
		expect(stub.calls).toEqual([]);
	});

	it('a serial that cannot be one is "none" with no call made', async () => {
		const stub = stubOf({ found: false });
		for (const bad of ['IDEA-7K3Q', 'hello', 'IDEA-UUUU-UUUU-UUUU-UUUU', '1234']) {
			const { view: v } = await drive(bad, stub);
			expect(v.state, bad).toBe('none');
			expect(v.typed, bad).toBe(bad);
		}
		expect(stub.calls).toEqual([]);
		// The positive control: a well-formed serial DOES reach the database, normalized.
		const { view: v } = await drive('idea 7k3q m9xd 2htr w4pb', stub);
		expect(v.state).toBe('none');
		expect(stub.calls).toEqual([{ fn: 'cert_verify', args: { p_serial: SERIAL } }]);
	});

	it('I, L and O fold to 1 and 0 before the lookup', async () => {
		const stub = stubOf({ found: false });
		await drive('IDEA-7K3Q-M9XD-2HTR-W4PB'.replace('0', 'O').replace('1', 'I'), stub);
		expect(stub.calls[0]).toEqual({ fn: 'cert_verify', args: { p_serial: SERIAL } });
	});

	it('a record whose signature does not verify under the server key is "none", and no field says why', async () => {
		process.env.CERT_SIGNING_PRIVATE_KEY = generateSigningKey();
		const stub = stubOf({ found: true, ...VERIFY_RECORD });
		const { view: v } = await drive(SERIAL, stub);
		expect(v.state).toBe('none');
		expect(v.record).toBeNull();
		// Signed out: nothing was logged to the database (console only).
		expect(stub.calls.map((c) => c.fn)).toEqual(['cert_verify']);
	});

	it('with no server key, a found record is still "none" (nothing can be checked), logged through cert_error_log when signed in', async () => {
		const stub = stubOf({ found: true, ...VERIFY_RECORD });
		const { view: v } = await drive(SERIAL, stub, { claims: true });
		expect(v.state).toBe('none');
		expect(stub.calls.map((c) => c.fn)).toEqual(['cert_verify', 'cert_error_log']);
		const logged = stub.calls[1].args as { p_message: string; p_detail: Record<string, unknown> };
		expect(logged.p_message).toContain('server key unset');
		expect(JSON.stringify(logged)).not.toContain(SERIAL);
	});

	it('a genuine signature verifies: the status is the record\'s and the facts are handed down', async () => {
		const seed = generateSigningKey();
		process.env.CERT_SIGNING_PRIVATE_KEY = seed;
		const key = parseSigningKey(seed);
		if (!key.ok) throw new Error('fixture key did not parse');
		const payload = await buildSignedPayload({
			serial: SERIAL,
			code: 'MILL-1',
			level: 1,
			holder_name: 'Ana Reyes',
			email: 'ana.reyes@boscotech.net',
			awarded_at: '2026-11-05T21:30:00Z',
			certifier_name: 'Mr. Pina'
		});
		const signature = signPayload(payload, key.privateKey);
		const record = { ...VERIFY_RECORD, signed_payload: payload, signature, key_id: key.keyId };
		for (const status of ['valid', 'suspended', 'revoked', 'expired'] as const) {
			const stub = stubOf({ found: true, ...record, status });
			const { view: v } = await drive(SERIAL, stub);
			expect(v.state, status).toBe(status);
			expect(v.record?.holder_name, status).toBe('Ana Reyes');
			expect(v.serial, status).toBe(SERIAL);
		}
		// Tamper one field and the same signature no longer verifies: "none", never "which field".
		const tampered = stubOf({ found: true, ...record, signed_payload: { ...payload, holder_name: 'Somebody Else' } });
		const { view: bad } = await drive(SERIAL, tampered);
		expect(bad.state).toBe('none');
		// A payload naming a different serial than the one looked up is refused too.
		const other = stubOf({ found: true, ...record, signed_payload: { ...payload, serial: 'IDEA-AAAA-BBBB-CCCC-DDDD' } });
		const { view: swapped } = await drive(SERIAL, other);
		expect(swapped.state).toBe('none');
	});

	it('a database without cert_verify is "not available yet", never a 500', async () => {
		const stub = stubOf(null, { code: 'PGRST202', message: 'no function' });
		const { view: v } = await drive(SERIAL, stub);
		expect(v.state).toBe('unavailable');
	});

	it('over the per-address limit the page renders the one sentence (status 429 in the data)', async () => {
		const stub = stubOf({ found: false });
		const address = '203.0.113.9';
		let limitedAt = -1;
		for (let i = 0; i < 40; i++) {
			const { view: v, status } = await drive(SERIAL, stub, { address });
			if (v.state === 'limited') {
				limitedAt = i;
				expect(status).toBe(429);
				break;
			}
		}
		expect(limitedAt).toBe(30);
		expect(stub.calls.length).toBe(30);
		// Another address is untouched (the positive control).
		const { view: fresh } = await drive(SERIAL, stub, { address: '203.0.113.10' });
		expect(fresh.state).toBe('none');
	});
});
