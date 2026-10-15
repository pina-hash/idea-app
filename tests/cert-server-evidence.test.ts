// tests/cert-server-evidence.test.ts
//
// THE TWO EVIDENCE ROUTES (ledger 0391), driven as the real handlers. The
// size refusal must come BEFORE any database call and must state the size and
// the limit; the key must be `<attempt>/<uuid>.<ext>` with nothing typed in it;
// the download must be a signed URL carrying `download=` and every refusal the
// same bodyless 404.

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	CERT_EVIDENCE_BUCKET,
	CERT_EVIDENCE_MAX_BYTES,
	EVIDENCE_PATH_RE,
	evidenceDownloadName,
	evidencePath,
	evidenceTooLarge
} from '../src/lib/server/certifications/evidence';

const { POST } = await import('../src/routes/api/certifications/evidence/sign/+server');
const { GET } = await import('../src/routes/api/certifications/evidence/[...path]/+server');

const ATTEMPT = '77777777-7777-4777-8777-777777777777';
const OTHER = '88888888-8888-4888-8888-888888888888';

function fake(opts: { attempts?: { id: string; state: string }[]; uploadError?: { statusCode: number; message: string }; signError?: boolean } = {}) {
	const rpcs: string[] = [];
	const storage: { bucket: string; method: string; args: unknown[] }[] = [];
	const supabase = {
		rpc: async (fn: string) => {
			rpcs.push(fn);
			if (fn === 'cert_me') return { data: { attempts: opts.attempts ?? [{ id: ATTEMPT, state: 'active' }], awards: [], notifications_unread: 0 }, error: null };
			return { data: null, error: { message: 'unexpected' } };
		},
		storage: {
			from: (bucket: string) => ({
				createSignedUploadUrl: async (path: string) => {
					storage.push({ bucket, method: 'createSignedUploadUrl', args: [path] });
					if (opts.uploadError) return { data: null, error: opts.uploadError };
					return { data: { path, token: 'tok', signedUrl: `https://example.supabase.co/upload/${path}?token=tok` }, error: null };
				},
				createSignedUrl: async (path: string, ttl: number, options: unknown) => {
					storage.push({ bucket, method: 'createSignedUrl', args: [path, ttl, options] });
					if (opts.signError) return { data: null, error: { message: 'Object not found' } };
					return { data: { signedUrl: `https://example.supabase.co/sign/${path}?download=x` }, error: null };
				}
			})
		}
	} as unknown as SupabaseClient;
	return { supabase, rpcs, storage };
}

function signEvent(body: unknown, f: ReturnType<typeof fake>, claims: { sub: string } | null = { sub: 'u' }) {
	const request = new Request('https://ideabosco.com/api/certifications/evidence/sign', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
	return { request, locals: { supabase: f.supabase, claims } } as unknown as Parameters<typeof POST>[0];
}
function getEvent(path: string, f: ReturnType<typeof fake>, claims: { sub: string } | null = { sub: 'u' }, name?: string) {
	const url = new URL(`https://ideabosco.com/api/certifications/evidence/${path}${name ? `?name=${encodeURIComponent(name)}` : ''}`);
	return { params: { path }, url, locals: { supabase: f.supabase, claims } } as unknown as Parameters<typeof GET>[0];
}

describe('evidence helpers', () => {
	it('keys a file by attempt and a fresh uuid, keeping only the lowercased extension', () => {
		const p = evidencePath(ATTEMPT, 'Estudio (final) café.SLDPRT', '99999999-9999-4999-8999-999999999999');
		expect(p).toBe(`${ATTEMPT}/99999999-9999-4999-8999-999999999999.sldprt`);
		expect(evidencePath(ATTEMPT, 'Makefile', '99999999-9999-4999-8999-999999999999')).toBe(`${ATTEMPT}/99999999-9999-4999-8999-999999999999`);
		expect(EVIDENCE_PATH_RE.test(p)).toBe(true);
		expect(EVIDENCE_PATH_RE.test(`${ATTEMPT}/../x`)).toBe(false);
		expect(EVIDENCE_PATH_RE.test('x/y.png')).toBe(false);
	});
	it('refuses only over the registry ceiling (45 MiB), stating the size and the limit', () => {
		expect(CERT_EVIDENCE_MAX_BYTES).toBe(47185920);
		expect(evidenceTooLarge(CERT_EVIDENCE_MAX_BYTES)).toBeNull();
		const r = evidenceTooLarge(CERT_EVIDENCE_MAX_BYTES + 1);
		expect(r?.gate).toBe('too_large');
		expect(r?.message).toContain('45.0 MB');
		expect(r?.message).toContain('the limit is 45 MB');
	});
	it('folds the download name to ASCII and falls back to the key\'s own name', () => {
		expect(evidenceDownloadName(`${ATTEMPT}/abc.sldprt`, 'Estudio (final) café.SLDPRT')).toBe('Estudio_final_cafe.SLDPRT');
		expect(evidenceDownloadName(`${ATTEMPT}/abc.sldprt`, '')).toBe('abc.sldprt');
	});
});

describe('POST /api/certifications/evidence/sign', () => {
	it('needs a session', async () => {
		const f = fake();
		expect((await POST(signEvent({ attempt_id: ATTEMPT, filename: 'a.png', size: 10 }, f, null))).status).toBe(401);
		expect(f.rpcs).toEqual([]);
	});
	it('refuses an oversized file before any call, in a sentence with the size and the limit', async () => {
		const f = fake();
		const res = await POST(signEvent({ attempt_id: ATTEMPT, filename: 'big.zip', size: 60 * 1024 * 1024 }, f));
		expect(res.status).toBe(413);
		const body = await res.json();
		expect(body).toMatchObject({ ok: false, reason: 'too_large', gate: 'too_large', retryable: false });
		expect(body.message).toContain('60.0 MB');
		expect(body.message).toContain('45 MB');
		expect(f.rpcs).toEqual([]);
		expect(f.storage).toEqual([]);
	});
	it('refuses an attempt that is not the caller\'s own open one, in words, and mints nothing', async () => {
		const f = fake({ attempts: [{ id: OTHER, state: 'active' }, { id: ATTEMPT, state: 'withdrawn' }] });
		const res = await POST(signEvent({ attempt_id: ATTEMPT, filename: 'a.png', size: 10 }, f));
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ ok: false, reason: 'not_found' });
		expect(f.rpcs).toEqual(['cert_me']);
		expect(f.storage).toEqual([]);
	});
	it('mints the signed upload URL at <attempt>/<uuid>.<ext> in the cert-evidence bucket', async () => {
		const f = fake();
		const res = await POST(signEvent({ attempt_id: ATTEMPT, filename: 'Part 1.PNG', size: 1234 }, f));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.bucket).toBe(CERT_EVIDENCE_BUCKET);
		expect(body.path).toMatch(new RegExp(`^${ATTEMPT}/[0-9a-f-]{36}\\.png$`));
		expect(EVIDENCE_PATH_RE.test(body.path)).toBe(true);
		expect(body.token).toBe('tok');
		expect(body.signedUrl).toContain(body.path);
		expect(f.storage).toEqual([{ bucket: CERT_EVIDENCE_BUCKET, method: 'createSignedUploadUrl', args: [body.path] }]);
	});
	it('a storage denial is the attempt sentence, never the classroom\'s submission one', async () => {
		const f = fake({ uploadError: { statusCode: 403, message: 'new row violates row-level security policy' } });
		const res = await POST(signEvent({ attempt_id: ATTEMPT, filename: 'a.png', size: 10 }, f));
		const body = await res.json();
		expect(body).toMatchObject({ ok: false, reason: 'denied', gate: 'denied' });
		expect(body.message).toContain('your own open attempt');
		expect(body.message).not.toContain('submission');
	});
	it('a bad body is 400', async () => {
		const f = fake();
		expect((await POST(signEvent({ attempt_id: 'nope', filename: 'a', size: 1 }, f))).status).toBe(400);
		expect((await POST(signEvent({ attempt_id: ATTEMPT, size: 1 }, f))).status).toBe(400);
	});
});

describe('GET /api/certifications/evidence/[...path]', () => {
	it('302s to a signed download URL named from ?name=, on the caller\'s own client', async () => {
		const f = fake();
		const path = `${ATTEMPT}/99999999-9999-4999-8999-999999999999.sldprt`;
		const res = await GET(getEvent(path, f, { sub: 'u' }, 'Estudio (final) café.SLDPRT'));
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toContain(path);
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(f.storage).toEqual([{ bucket: CERT_EVIDENCE_BUCKET, method: 'createSignedUrl', args: [path, 300, { download: 'Estudio_final_cafe.SLDPRT' }] }]);
	});
	it('every refusal is the same bodyless 404: no session, a malformed path, storage saying no', async () => {
		const path = `${ATTEMPT}/99999999-9999-4999-8999-999999999999.png`;
		const anon = fake();
		expect((await GET(getEvent(path, anon, null))).status).toBe(404);
		expect(anon.storage).toEqual([]);
		const bad = fake();
		expect((await GET(getEvent(`${ATTEMPT}/../secret.png`, bad))).status).toBe(404);
		expect((await GET(getEvent('anything.png', bad))).status).toBe(404);
		expect(bad.storage).toEqual([]);
		const refused = fake({ signError: true });
		const res = await GET(getEvent(path, refused));
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});
});
