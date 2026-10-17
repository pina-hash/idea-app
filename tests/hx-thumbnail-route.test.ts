// tests/hx-thumbnail-route.test.ts
//
// A LIVE THUMBNAIL IS SERVED UNDER THE WORKSHEET'S OWN POLICY AND ITS OWN
// ACCESS DECISION (ledger 0396).
//
// WHY THIS FILE EXISTS: both properties fail silently. A thumbnail route that
// sent a weaker header set would render perfectly and run an author's script
// with more reach than the worksheet it came from; one that skipped the
// publication check would show a draft's thumbnail to a class and look exactly
// like a published one. Neither reddens anything a person sees.
//
// It drives the REAL `/hx/<docId>` and `/hx/<docId>/thumbnail` handlers over
// the REAL resolver, with only the Supabase client constructor stood in for
// (the fake `tests/hx-document-cache.test.ts` uses, in the same shape), and
// compares the two responses' headers as SETS rather than listing what either
// should contain: a header added to one route and not the other reddens.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DocRow = { item_id: string; document_id: string; document: string; updated_at: string };
type ItemRow = { id: string; kind: string; published: boolean; publish_at: string | null };

const db = vi.hoisted(() => ({
	docs: [] as DocRow[],
	items: [] as ItemRow[],
	requests: [] as { table: string; columns: string }[]
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
				then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
					db.requests.push({ table, columns });
					const rows = (table === 'classroom_html_assignments' ? db.docs : db.items) as Record<string, unknown>[];
					const match = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
					const data = match ? Object.fromEntries(columns.split(',').map((c) => [c.trim(), match[c.trim()]])) : null;
					return Promise.resolve({ data, error: null }).then(onOk, onErr);
				}
			};
			return builder;
		}
	})
}));

const worksheetRoute = await import('../src/routes/hx/[docId]/+server.ts');
const thumbnailRoute = await import('../src/routes/hx/[docId]/thumbnail/+server.ts');
const { _resetHxDocumentCache } = await import('../src/lib/server/html-assignment-document.ts');

const DOC = '3f0c1a52-8c1e-4a9e-9d7b-1c2f0a6b7e01';
const ITEM = '7a1d9e04-5b6c-4f2a-8e3d-9c0b1a2f3e4d';
const V1 = '2026-10-16T15:00:00.123456+00:00';

/** The author's template contents, which must arrive byte for byte. */
const TEMPLATE = '\n<style>.t{animation:s 6s linear infinite}@keyframes s{to{transform:rotate(1turn)}}</style>\n<div class="t">Gear</div>\n<script>window.__mine = 1;</script>\n';

function documentWith(thumbnail: unknown, template: string | null = TEMPLATE): string {
	const manifest = { schemaVersion: 3, kind: 'html-assignment', title: 'Gear ratios', ...(thumbnail ? { thumbnail } : {}) };
	return [
		'<!doctype html><html><head><title>Gear ratios</title>',
		`<script type="application/json" id="idea-manifest">${JSON.stringify(manifest)}</script>`,
		'</head><body><p>The worksheet.</p>',
		template === null ? '' : `<template id="idea-thumbnail">${template}</template>`,
		'</body></html>'
	].join('\n');
}

function call(route: 'worksheet' | 'thumbnail', headers: Record<string, string> = {}) {
	const url = new URL(`https://ideabosco.com/hx/${DOC}${route === 'thumbnail' ? '/thumbnail' : ''}`);
	const event = { params: { docId: DOC }, url, request: new Request(url, { method: 'GET', headers }) };
	const handler = route === 'worksheet' ? worksheetRoute.GET : thumbnailRoute.GET;
	return (handler as (e: unknown) => Promise<Response>)(event);
}

/** Every header but the two that describe these particular bytes. */
function policyHeaders(res: Response): Record<string, string> {
	const out: Record<string, string> = {};
	res.headers.forEach((v, k) => {
		if (k !== 'etag' && k !== 'content-length') out[k] = v;
	});
	return out;
}

const documentReads = () =>
	db.requests.filter((r) => r.table === 'classroom_html_assignments' && r.columns.split(',').some((c) => c.trim() === 'document')).length;

beforeEach(() => {
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
	delete process.env.PUBLIC_HX_SANDBOX_ORIGIN;
	delete process.env.PUBLIC_HX_PORTAL_ORIGIN;
	db.docs = [{ item_id: ITEM, document_id: DOC, document: documentWith({ kind: 'html', template: 'idea-thumbnail' }), updated_at: V1 }];
	db.items = [{ id: ITEM, kind: 'assignment', published: true, publish_at: null }];
	db.requests = [];
	_resetHxDocumentCache();
});

afterEach(() => {
	delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	_resetHxDocumentCache();
});

describe('a published assignment that declares a live thumbnail', () => {
	it("is served with the worksheet's header set exactly, sandboxed and never allow-same-origin", async () => {
		const sheet = await call('worksheet');
		const thumb = await call('thumbnail');
		expect(sheet.status).toBe(200);
		expect(thumb.status).toBe(200);
		expect(policyHeaders(thumb)).toEqual(policyHeaders(sheet));
		const csp = thumb.headers.get('content-security-policy') ?? '';
		expect(csp).toMatch(/(^|;)\s*sandbox\b/);
		expect(csp).not.toContain('allow-same-origin');
		expect(Object.keys(policyHeaders(thumb)).length).toBeGreaterThan(3);
	});

	it("carries the author's template bytes unchanged inside the fixed shell, and none of the worksheet", async () => {
		const body = await (await call('thumbnail')).text();
		expect(body).toContain(TEMPLATE);
		expect(body).toContain('data-idea-thumbnail');
		expect(body).not.toContain('The worksheet.');
		expect(body).not.toContain('idea-manifest');
	});

	it('answers a matching If-None-Match with 304 and never reads the document column', async () => {
		const first = await call('thumbnail');
		const etag = first.headers.get('etag');
		expect(etag).toBeTruthy();
		// The worksheet's tag and the thumbnail's differ, so one never satisfies the other.
		expect(etag).not.toBe((await call('worksheet')).headers.get('etag'));
		db.requests = [];
		const again = await call('thumbnail', { 'if-none-match': etag! });
		expect(again.status).toBe(304);
		expect(documentReads()).toBe(0);
	});
});

describe('the access decision is the worksheet route\'s', () => {
	it('a draft is the same bodyless 404 the worksheet answers, and so is a scheduled post', async () => {
		db.items = [{ id: ITEM, kind: 'assignment', published: false, publish_at: null }];
		for (const route of ['worksheet', 'thumbnail'] as const) {
			const res = await call(route);
			expect(res.status, route).toBe(404);
			expect(await res.text(), route).toBe('');
		}
		_resetHxDocumentCache();
		db.items = [{ id: ITEM, kind: 'assignment', published: true, publish_at: '2999-01-01T00:00:00Z' }];
		expect((await call('thumbnail')).status).toBe(404);
		expect((await call('worksheet')).status).toBe(404);
	});

	it('a published post is served (the positive control for the refusals above)', async () => {
		expect((await call('thumbnail')).status).toBe(200);
	});
});

describe('a document that declares no usable live thumbnail', () => {
	for (const [label, doc] of [
		['no thumbnail key', documentWith(null)],
		['a picture thumbnail', documentWith({ kind: 'image', src: 'attachment:cover.png' })],
		['a template the document does not carry', documentWith({ kind: 'html', template: 'idea-thumbnail' }, null)],
		['an empty template', documentWith({ kind: 'html', template: 'idea-thumbnail' }, '   ')]
	] as const) {
		it(`${label}: the thumbnail 404s while the worksheet still serves`, async () => {
			db.docs = [{ item_id: ITEM, document_id: DOC, document: doc, updated_at: V1 }];
			expect((await call('worksheet')).status).toBe(200);
			const res = await call('thumbnail');
			expect(res.status).toBe(404);
			expect(await res.text()).toBe('');
		});
	}
});
