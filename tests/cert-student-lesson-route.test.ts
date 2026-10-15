// tests/cert-student-lesson-route.test.ts
//
// THE LESSON ROUTE SERVES A DOCUMENT UNDER `/hx/`'S OWN HEADERS (ledger 0391,
// DECISIONS D3). Every claim here fails silently in use: a header set that
// drifted from the classroom's would render identically while isolating
// nothing, and a 404 that turned into a 403 would confirm a lesson id exists.
//
// The REAL handler is driven with a stub `locals.supabase.rpc`:
//
//   - 200 with EXACTLY the header set `hxDocumentHeaders(hxPortalOrigin(...))`
//     gives for the same request (asserted as equality over the whole set,
//     plus the ETag and Content-Length the route adds), and the body is the
//     stored bytes unchanged;
//   - the CSP carries the sandbox directive built from HX_SANDBOX_FLAGS and
//     never `allow-same-origin`;
//   - 404, bodyless, for no session, a handle that is not a uuid, a null
//     answer and an RPC error, and for every method but GET and HEAD;
//   - 304 on a matching If-None-Match (weak form included), with no body;
//   - HEAD answers the headers and no body, and `cert_lesson_document` is
//     called with `{ p_id }` and nothing else.
import { describe, expect, it } from 'vitest';
import { HX_SANDBOX_FLAGS } from '$lib/classroom/html-assignment/bridge';
import { hxDocumentHeaders, hxPortalOrigin } from '../src/routes/hx/_headers';
import { fallback, GET, HEAD } from '../src/routes/certifications/lesson/[lessonId]/+server';

const ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03';
const DOC = '<!doctype html><html><head><title>Speeds</title></head><body><p>RPM = SFM x 3.82 / D</p></body></html>';
const ROW = { id: ID, title: 'Speeds and feeds', document: DOC, updated_at: '2026-10-10T17:00:00Z', manifest: {} };

type Answer = { data: unknown; error: { code?: string; message: string } | null };

function event(opts: { id?: string; claims?: boolean; method?: string; answer?: Answer; headers?: Record<string, string> }) {
	const calls: { fn: string; args: unknown }[] = [];
	const url = new URL(`http://localhost/certifications/lesson/${opts.id ?? ID}`);
	const request = new Request(url, { method: opts.method ?? 'GET', headers: opts.headers ?? {} });
	return {
		calls,
		event: {
			params: { lessonId: opts.id ?? ID },
			url,
			request,
			locals: {
				claims: opts.claims === false ? null : { sub: 'u-1', email: 'ana@boscotech.net' },
				supabase: {
					rpc(fn: string, args: unknown) {
						calls.push({ fn, args });
						return Promise.resolve(opts.answer ?? { data: ROW, error: null });
					}
				}
			}
		}
	};
}

const run = (handler: typeof GET, e: ReturnType<typeof event>) => handler(e.event as never);

/** The header set `/hx/` would send for this request, with nothing configured (dev and preview). */
function expectedHeaders(): Headers {
	delete process.env.PUBLIC_HX_PORTAL_ORIGIN;
	delete process.env.PUBLIC_HX_SANDBOX_ORIGIN;
	return hxDocumentHeaders(hxPortalOrigin(undefined, undefined, 'http://localhost'));
}

describe('a lesson the caller may read', () => {
	it('answers 200 with the identical header set hxDocumentHeaders gives, plus an ETag and the length', async () => {
		const e = event({});
		const res = await run(GET, e);
		expect(res.status).toBe(200);
		const want = expectedHeaders();
		const got = new Headers(res.headers);
		for (const [k, v] of want.entries()) expect(got.get(k), k).toBe(v);
		// The route adds exactly two of its own.
		const extra = [...got.keys()].filter((k) => !want.has(k)).sort();
		expect(extra).toEqual(['content-length', 'etag']);
		expect(got.get('etag')).toMatch(/^"hx-[A-Za-z0-9_-]+"$/);
		expect(Number(got.get('content-length'))).toBe(new TextEncoder().encode(DOC).byteLength);
		expect(await res.text()).toBe(DOC);
		expect(e.calls).toEqual([{ fn: 'cert_lesson_document', args: { p_id: ID } }]);
	});

	it('the CSP sandboxes the document with the one shared flag set and never allow-same-origin', async () => {
		const res = await run(GET, event({}));
		const csp = res.headers.get('content-security-policy') ?? '';
		expect(csp.startsWith(`sandbox ${HX_SANDBOX_FLAGS}`)).toBe(true);
		expect(csp).not.toContain('allow-same-origin');
		expect(csp).toContain("connect-src 'none'");
		expect(csp).toContain("form-action 'none'");
		expect(csp).toContain('frame-ancestors http://localhost');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	it('a matching If-None-Match is a 304 with no body, strong or weak', async () => {
		const first = await run(GET, event({}));
		const etag = first.headers.get('etag')!;
		for (const header of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
			const e = event({ headers: { 'if-none-match': header } });
			const res = await run(GET, e);
			expect(res.status, header).toBe(304);
			expect(res.body, header).toBeNull();
			expect(res.headers.get('etag'), header).toBe(etag);
			expect(res.headers.get('content-security-policy'), header).toBe(first.headers.get('content-security-policy'));
		}
		// A different tag is a fresh 200 (the positive control).
		const stale = await run(GET, event({ headers: { 'if-none-match': '"hx-somethingelse"' } }));
		expect(stale.status).toBe(200);
		// A re-import moves updated_at and so the tag.
		const moved = await run(GET, event({ answer: { data: { ...ROW, updated_at: '2026-10-11T09:00:00Z' }, error: null } }));
		expect(moved.headers.get('etag')).not.toBe(etag);
	});

	it('HEAD answers the headers and no body, and still asks the database', async () => {
		const e = event({ method: 'HEAD' });
		const res = await run(HEAD, e);
		expect(res.status).toBe(200);
		expect(res.body).toBeNull();
		expect(res.headers.get('content-security-policy')).toBe(expectedHeaders().get('content-security-policy'));
		expect(res.headers.get('etag')).toMatch(/^"hx-/);
		expect(e.calls.length).toBe(1);
	});
});

describe('one bodyless 404 for everything refused', () => {
	const refused = async (res: Response) => {
		expect(res.status).toBe(404);
		expect(res.body).toBeNull();
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('content-security-policy')).toBeNull();
	};

	it('no session: refused before the database is asked', async () => {
		const e = event({ claims: false });
		await refused(await run(GET, e));
		expect(e.calls).toEqual([]);
	});

	it('a handle that is not a uuid: refused before the database is asked', async () => {
		for (const bad of ['worksheet', 'probe', '../../etc', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c0', '']) {
			const e = event({ id: bad });
			await refused(await run(GET, e));
			expect(e.calls, bad).toEqual([]);
		}
	});

	it('a null answer (unknown, or a draft the caller does not certify) and an RPC error', async () => {
		await refused(await run(GET, event({ answer: { data: null, error: null } })));
		await refused(await run(GET, event({ answer: { data: { id: ID, title: 'x' }, error: null } })));
		await refused(await run(GET, event({ answer: { data: null, error: { code: 'PGRST202', message: 'no function' } } })));
		await refused(await run(GET, event({ answer: { data: null, error: { code: '42501', message: 'denied' } } })));
	});

	it('a method that is not GET or HEAD', async () => {
		for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			await refused(await run(fallback, event({ method })));
		}
	});
});
