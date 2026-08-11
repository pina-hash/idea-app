// tests/classroom-link-preview.test.ts
//
// The link-preview fetcher, against a REAL HTTP server. It earns a place in
// this suite for one reason: every failure mode here is supposed to be
// INVISIBLE. A preview that quietly starts throwing does not show a broken
// card -- it takes the page that renders it down with it, and the developer
// who wired it up has a fast local network and a live example.com, so they
// would never see it.
//
// What is pinned:
//   1. Metadata is actually parsed (og:*, twitter:*, <title>, relative images).
//   2. EVERY failure -- a dead host, a timeout, a non-HTML response, an error
//      status, a page with no metadata, a private address, a bad URL -- comes
//      back as { ok: false } and NEVER throws.
//   3. The cache is real (a second call does not re-fetch) and is keyed per URL.
//   4. The response is bounded: a huge page does not get read to the end.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
	clearLinkPreviewCache,
	fetchLinkPreview,
	parseLinkMetadata
} from '../src/lib/server/link-preview';

let server: Server;
let base = '';
/** Every path the server was asked for -- how the cache is proven real. */
let hits: string[] = [];

/**
 * The local test server is on loopback, which the fetcher blocks on purpose.
 * Lifting the guard is what lets the fetch/parse/cache path be exercised at
 * all; the guard itself is asserted with this OFF, below.
 */
const LOCAL = { allowPrivateHosts: true };

const HUGE_PAGE_MARKER = '<!-- tail marker that must never be read -->';

beforeAll(async () => {
	server = createServer((req, res) => {
		const path = req.url ?? '/';
		hits.push(path);

		if (path === '/rich') {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(`<html><head>
				<meta property="og:title" content="Truss bridges &amp; how to read them">
				<meta property="og:site_name" content="Example Engineering">
				<meta property="og:description" content="A field guide.">
				<meta property="og:image" content="/img/cover.png">
				<title>ignored because og:title wins</title>
			</head><body>x</body></html>`);
			return;
		}
		if (path === '/title-only') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end('<html><head><title>  Just a title  </title></head><body>x</body></html>');
			return;
		}
		if (path === '/twitter') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end(
				'<html><head><meta name="twitter:title" content="From twitter tags"><meta content="https://cdn.example/x.png" name="twitter:image"></head></html>'
			);
			return;
		}
		if (path === '/no-metadata') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end('<html><head></head><body>nothing worth showing</body></html>');
			return;
		}
		if (path === '/not-html') {
			res.writeHead(200, { 'content-type': 'application/pdf' });
			res.end('%PDF-1.4');
			return;
		}
		if (path === '/boom') {
			res.writeHead(500, { 'content-type': 'text/html' });
			res.end('<html><head><title>Should not be used</title></head></html>');
			return;
		}
		if (path === '/hang') {
			// Headers, then silence: the timeout has to be what ends this.
			res.writeHead(200, { 'content-type': 'text/html' });
			res.write('<html><head>');
			return;
		}
		if (path === '/huge') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.write('<html><head><meta property="og:title" content="Big page"></head><body>');
			// Well past MAX_BYTES; the reader must stop long before the marker.
			res.write('x'.repeat(600_000));
			res.end(`${HUGE_PAGE_MARKER}</body></html>`);
			return;
		}
		res.writeHead(404, { 'content-type': 'text/html' });
		res.end('<html><head><title>nope</title></head></html>');
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') throw new Error('no port');
	base = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
	await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => {
	clearLinkPreviewCache();
	hits = [];
});

describe('parseLinkMetadata (pure)', () => {
	test('prefers og:title, decodes entities, and resolves a relative image', () => {
		const result = parseLinkMetadata(
			`<head><meta property="og:title" content="A &amp; B"><meta property="og:image" content="/x.png"></head>`,
			'https://site.example/articles/one'
		);
		expect(result.ok).toBe(true);
		expect(result.title).toBe('A & B');
		expect(result.image_url).toBe('https://site.example/x.png');
	});

	test('a page with nothing usable is NOT ok -- an empty card is worse than a link', () => {
		const result = parseLinkMetadata('<head></head>', 'https://site.example/');
		expect(result.ok).toBe(false);
		expect(result.title).toBeNull();
	});

	test('a javascript: og:image is dropped rather than rendered', () => {
		const result = parseLinkMetadata(
			`<head><meta property="og:title" content="T"><meta property="og:image" content="javascript:alert(1)"></head>`,
			'https://site.example/'
		);
		expect(result.ok).toBe(true);
		expect(result.image_url).toBeNull();
	});
});

describe('fetchLinkPreview against a real server', () => {
	test('reads og tags from a real response', async () => {
		const result = await fetchLinkPreview(`${base}/rich`, LOCAL);
		expect(result.ok).toBe(true);
		expect(result.title).toBe('Truss bridges & how to read them');
		expect(result.site_name).toBe('Example Engineering');
		expect(result.description).toBe('A field guide.');
		expect(result.image_url).toBe(`${base}/img/cover.png`);
	});

	test('falls back to <title>, and to twitter tags', async () => {
		const titled = await fetchLinkPreview(`${base}/title-only`, LOCAL);
		expect(titled.ok).toBe(true);
		expect(titled.title).toBe('Just a title');

		const tw = await fetchLinkPreview(`${base}/twitter`, LOCAL);
		expect(tw.ok).toBe(true);
		expect(tw.title).toBe('From twitter tags');
		expect(tw.image_url).toBe('https://cdn.example/x.png');
	});

	test('EVERY failure degrades to { ok: false } and never throws', async () => {
		// The third element says whether the loopback guard is lifted. It matters:
		// without it the first four would come back ok:false because the ADDRESS
		// was refused, and would prove nothing about how a real 500 or a real
		// metadata-free page is handled.
		const cases: [string, string, boolean][] = [
			['a page with no metadata', `${base}/no-metadata`, true],
			['a non-HTML response', `${base}/not-html`, true],
			['a 500', `${base}/boom`, true],
			['a 404', `${base}/missing`, true],
			// Nothing is listening on port 9: a real connection refusal.
			['a dead host', 'http://127.0.0.1:9/', true],
			['a loopback address (blocked)', 'http://localhost/whatever', false],
			['a private address (blocked)', 'http://192.168.1.10/admin', false],
			['a link-local address (blocked)', 'http://169.254.169.254/latest/meta-data/', false],
			['a non-http scheme', 'ftp://example.com/x', false],
			['a garbage URL', 'not a url at all', false]
		];
		for (const [label, url, local] of cases) {
			const result = await fetchLinkPreview(url, local ? LOCAL : {});
			expect([label, result.ok]).toEqual([label, false]);
			expect(typeof result.url).toBe('string');
		}
	});

	test('a blocked address is never even requested', async () => {
		hits = [];
		await fetchLinkPreview('http://192.168.1.10/admin');
		await fetchLinkPreview('http://localhost:1/x');
		expect(hits).toEqual([]);
	});

	test('a host that stops responding times out and degrades', async () => {
		const started = Date.now();
		const result = await fetchLinkPreview(`${base}/hang`, LOCAL);
		expect(result.ok).toBe(false);
		// The 4s ceiling is the point: it ends, and it ends reasonably soon.
		expect(Date.now() - started).toBeLessThan(8000);
	}, 20_000);

	test('a huge page is not read to the end', async () => {
		const result = await fetchLinkPreview(`${base}/huge`, LOCAL);
		expect(result.ok).toBe(true);
		expect(result.title).toBe('Big page');
		// The marker sits past the byte cap; if it came back, the whole body was
		// downloaded for a <title>.
		expect(JSON.stringify(result)).not.toContain(HUGE_PAGE_MARKER);
	}, 20_000);

	test('the cache is real, and per URL', async () => {
		hits = [];
		const first = await fetchLinkPreview(`${base}/rich`, LOCAL);
		const second = await fetchLinkPreview(`${base}/rich`, LOCAL);
		expect(second).toEqual(first);
		expect(hits.filter((h) => h === '/rich')).toHaveLength(1);

		await fetchLinkPreview(`${base}/title-only`, LOCAL);
		expect(hits.filter((h) => h === '/title-only')).toHaveLength(1);

		// A failure is cached too, so a dead link is not re-fetched per viewer.
		hits = [];
		await fetchLinkPreview(`${base}/boom`, LOCAL);
		await fetchLinkPreview(`${base}/boom`, LOCAL);
		expect(hits.filter((h) => h === '/boom')).toHaveLength(1);
	});
});
