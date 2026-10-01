// tests/hx-document-cache.test.ts
//
// THE `/hx/<docId>` ROUTE SERVES FROM A VERSIONED CACHE AND STILL DECIDES
// ACCESS ON EVERY REQUEST (ledger 0357).
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly: every property it
// pins fails SILENTLY. A cache that skipped the publication check on a warm hit
// would serve an unpublished worksheet and look perfect; a cache keyed on the
// document alone would serve last week's worksheet after a re-import and look
// perfect; a 304 path that read the bytes first would answer correctly and put
// the whole load back on the database. None of those reddens anything a person
// would see.
//
// It drives the REAL route handler, imported from its own file, over the REAL
// resolver module. Only the Supabase client CONSTRUCTOR is stood in for, by a
// fake PostgREST that behaves like the real builder in the one way that matters
// here: every `.then` on a builder is a request. Each request is counted, and
// so is every request whose select named the `document` column -- that count is
// the instrument, because "did it read the big column" is the whole question.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DocRow = { item_id: string; document_id: string; document: string; updated_at: string };
type ItemRow = { id: string; kind: string; published: boolean; publish_at: string | null };

const db = vi.hoisted(() => ({
	docs: [] as DocRow[],
	items: [] as ItemRow[],
	requests: [] as { table: string; columns: string }[],
	/** Resolve each request after this many ms; lets a test hold several in flight. */
	delayMs: 0
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		from(table: string) {
			let columns = '';
			const filters: [string, unknown][] = [];
			const builder = {
				select(cols: string) {
					columns = cols;
					return builder;
				},
				eq(col: string, val: unknown) {
					filters.push([col, val]);
					return builder;
				},
				maybeSingle() {
					return builder;
				},
				// A real PostgREST builder sends its request on EVERY `.then`, which
				// is the behaviour that makes awaiting one builder twice two requests.
				then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
					db.requests.push({ table, columns });
					const rows = (table === 'classroom_html_assignments' ? db.docs : db.items) as Record<
						string,
						unknown
					>[];
					const match = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
					const data = match
						? Object.fromEntries(
								columns.split(',').map((c) => [c.trim(), match[c.trim()]])
							)
						: null;
					const settle = new Promise((resolve) =>
						setTimeout(() => resolve({ data, error: null }), db.delayMs)
					);
					return settle.then(onOk, onErr);
				}
			};
			return builder;
		}
	})
}));

const { GET, HEAD } = await import('../src/routes/hx/[docId]/+server.ts');
const { _resetHxDocumentCache, _hxDocumentCacheSize, HX_CACHE_MAX_AGE_MS } = await import(
	'../src/lib/server/html-assignment-document.ts'
);

const DOC = '3f0c1a52-8c1e-4a9e-9d7b-1c2f0a6b7e01';
const ITEM = '7a1d9e04-5b6c-4f2a-8e3d-9c0b1a2f3e4d';
const V1 = '2026-09-30T15:00:00.123456+00:00';
const V2 = '2026-09-30T15:05:00.654321+00:00';
const BYTES_V1 = '<!doctype html><title>Worksheet</title><p>version one</p>';
const BYTES_V2 = '<!doctype html><title>Worksheet</title><p>version two, re-imported</p>';

function call(method: 'GET' | 'HEAD', headers: Record<string, string> = {}, docId = DOC) {
	const url = new URL(`https://ideabosco.com/hx/${docId}`);
	const event = {
		params: { docId },
		url,
		request: new Request(url, { method, headers })
	} as unknown as Parameters<typeof GET>[0];
	return (method === 'GET' ? GET : HEAD)(event) as Promise<Response>;
}

/** Requests that selected the `document` column: the big read. */
const documentReads = () =>
	db.requests.filter(
		(r) => r.table === 'classroom_html_assignments' && r.columns.split(',').some((c) => c.trim() === 'document')
	).length;

beforeEach(() => {
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
	delete process.env.PUBLIC_HX_SANDBOX_ORIGIN;
	delete process.env.PUBLIC_HX_PORTAL_ORIGIN;
	db.docs = [{ item_id: ITEM, document_id: DOC, document: BYTES_V1, updated_at: V1 }];
	db.items = [{ id: ITEM, kind: 'assignment', published: true, publish_at: null }];
	db.requests = [];
	db.delayMs = 0;
	_resetHxDocumentCache();
});

afterEach(() => {
	delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	_resetHxDocumentCache();
});

describe('a published document', () => {
	it('is served cold with one read of the bytes and a strong ETag', async () => {
		const res = await call('GET');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(BYTES_V1);
		const etag = res.headers.get('etag') ?? '';
		expect(etag).toMatch(/^"hx-[A-Za-z0-9_-]{32}"$/);
		expect(res.headers.get('content-security-policy')).toContain('sandbox');
		// Cold: the bytes ride the version read, so the cold path is still two
		// requests (the document row and the item), exactly today's cost.
		expect(documentReads()).toBe(1);
		expect(db.requests.length).toBe(2);
	});

	it('is served warm from the cache, still re-checking the item, with no read of the bytes', async () => {
		await call('GET');
		db.requests = [];
		const res = await call('GET');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(BYTES_V1);
		expect(documentReads()).toBe(0);
		// Both small reads happen on every request: the row's version and the item.
		expect(db.requests.map((r) => r.table)).toEqual(['classroom_html_assignments', 'classroom_items']);
	});

	it('answers a matching If-None-Match with 304, the header set, and no read of the bytes', async () => {
		const first = await call('GET');
		const etag = first.headers.get('etag') ?? '';
		// A COLD instance -- a fresh Vercel function -- answering a revalidation
		// must not read the big column to say "you have it already".
		_resetHxDocumentCache();
		db.requests = [];
		const res = await call('GET', { 'if-none-match': etag });
		expect(res.status).toBe(304);
		expect(await res.text()).toBe('');
		expect(res.headers.get('etag')).toBe(etag);
		expect(res.headers.get('content-security-policy')).toContain('sandbox');
		expect(res.headers.get('cache-control')).toBe('private, max-age=60');
		expect(documentReads()).toBe(0);
		expect(db.requests.length).toBe(2);
		// And a warm one neither.
		await call('GET');
		db.requests = [];
		const warm = await call('GET', { 'if-none-match': etag });
		expect(warm.status).toBe(304);
		expect(documentReads()).toBe(0);
	});

	it('treats a weak tag, a tag in a list, and * as a match, and a stranger as none', async () => {
		const etag = (await call('GET')).headers.get('etag') ?? '';
		expect((await call('GET', { 'if-none-match': `W/${etag}` })).status).toBe(304);
		expect((await call('GET', { 'if-none-match': `"other", ${etag}` })).status).toBe(304);
		expect((await call('GET', { 'if-none-match': '*' })).status).toBe(304);
		const miss = await call('GET', { 'if-none-match': '"hx-somebody-else"' });
		expect(miss.status).toBe(200);
		expect(await miss.text()).toBe(BYTES_V1);
	});

	it('answers HEAD, cold or warm, with the tag and no read of the bytes', async () => {
		const cold = await call('HEAD');
		expect(cold.status).toBe(200);
		expect(documentReads()).toBe(0);
		await call('GET');
		db.requests = [];
		const res = await call('HEAD');
		expect(res.status).toBe(200);
		expect(res.headers.get('etag')).toMatch(/^"hx-/);
		expect(documentReads()).toBe(0);
	});

	it('costs ONE read of the bytes when a whole class arrives at once on a cold instance', async () => {
		db.delayMs = 20;
		const answers = await Promise.all(Array.from({ length: 21 }, () => call('GET')));
		for (const res of answers) {
			expect(res.status).toBe(200);
			expect(await res.text()).toBe(BYTES_V1);
		}
		expect(documentReads()).toBe(1);
	});
});

describe('the access decision is made on every request, warm cache or not', () => {
	it('refuses an UNPUBLISHED item with a warm cache, with or without a matching tag', async () => {
		const etag = (await call('GET')).headers.get('etag') ?? '';
		expect(_hxDocumentCacheSize()).toBe(1);
		db.items[0].published = false;
		const plain = await call('GET');
		expect(plain.status).toBe(404);
		expect(await plain.text()).toBe('');
		expect(plain.headers.get('etag')).toBeNull();
		const revalidate = await call('GET', { 'if-none-match': etag });
		expect(revalidate.status).toBe(404);
		expect((await call('HEAD')).status).toBe(404);
		// Positive control: publishing it again serves it, so the 404s above were
		// the gate and not a broken fixture.
		db.items[0].published = true;
		expect((await call('GET')).status).toBe(200);
	});

	it('refuses a SCHEDULED item (publish_at ahead) with a warm cache', async () => {
		const etag = (await call('GET')).headers.get('etag') ?? '';
		db.items[0].publish_at = '2999-01-01T00:00:00+00:00';
		expect((await call('GET')).status).toBe(404);
		expect((await call('GET', { 'if-none-match': etag })).status).toBe(404);
		db.items[0].publish_at = '2000-01-01T00:00:00+00:00';
		expect((await call('GET')).status).toBe(200);
	});

	it('refuses a removed document and a deleted item with a warm cache', async () => {
		await call('GET');
		db.docs = [];
		expect((await call('GET')).status).toBe(404);
		db.docs = [{ item_id: ITEM, document_id: DOC, document: BYTES_V1, updated_at: V1 }];
		db.items = [];
		expect((await call('GET')).status).toBe(404);
	});

	it('refuses a handle that is not a uuid without asking the database', async () => {
		const res = await call('GET', {}, 'not-a-uuid');
		expect(res.status).toBe(404);
		expect(db.requests.length).toBe(0);
	});
});

describe('a re-import is served fresh', () => {
	it('serves the new bytes, under a new tag, to a browser holding the old one', async () => {
		const oldTag = (await call('GET')).headers.get('etag') ?? '';
		db.docs[0] = { ...db.docs[0], document: BYTES_V2, updated_at: V2 };
		db.requests = [];
		const res = await call('GET', { 'if-none-match': oldTag });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(BYTES_V2);
		const newTag = res.headers.get('etag') ?? '';
		expect(newTag).not.toBe(oldTag);
		expect(documentReads()).toBe(1);
		// And the new version is now the cached one.
		db.requests = [];
		expect(await (await call('GET')).text()).toBe(BYTES_V2);
		expect(documentReads()).toBe(0);
		expect((await call('GET', { 'if-none-match': newTag })).status).toBe(304);
	});

	it('a cold instance holding nothing serves a re-import fresh to a browser holding the old tag', async () => {
		const oldTag = (await call('GET')).headers.get('etag') ?? '';
		_resetHxDocumentCache();
		db.docs[0] = { ...db.docs[0], document: BYTES_V2, updated_at: V2 };
		db.requests = [];
		const res = await call('GET', { 'if-none-match': oldTag });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(BYTES_V2);
		expect(res.headers.get('etag')).not.toBe(oldTag);
		// The revalidation read small columns first, then the bytes once.
		expect(documentReads()).toBe(1);
		expect(db.requests.length).toBe(3);
	});

	it('re-reads an entry older than the cache ceiling even when the version has not moved', async () => {
		let now = 1_000_000;
		_resetHxDocumentCache(() => now);
		await call('GET');
		db.requests = [];
		now += HX_CACHE_MAX_AGE_MS + 1;
		expect(await (await call('GET')).text()).toBe(BYTES_V1);
		expect(documentReads()).toBe(1);
	});
});
