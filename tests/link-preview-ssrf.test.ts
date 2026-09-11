// tests/link-preview-ssrf.test.ts
//
// THE TWO SSRF GAPS IN THE LINK PREVIEW FETCHER, AND THE ONE IT STILL HAS.
//
// `isBlockedHost` refuses loopback and the private ranges, and its own comment
// is right about why it does not resolve hostnames: a DNS answer can change
// between the check and the fetch, and the URL comes from a teacher rather than
// an anonymous stranger, so this is not the primary defence. Two things it said
// nothing about were not defence-in-depth judgements, they were holes:
//
//   1. AN IPv4-MAPPED IPv6 ADDRESS PASSED EVERY BRANCH. `::ffff:127.0.0.1` is
//      loopback; it is not the string `::1`, it does not begin `fc`/`fd`, and
//      `/^127\./` cannot match a string beginning `::ffff:`. Measured against
//      the pre-fix function: `false`.
//   2. `redirect: 'follow'` MEANT ONLY THE FIRST URL WAS EVER CHECKED. A
//      perfectly public URL that 302s to a private address was fetched, and the
//      guard never saw the address that was reached.
//
// The third -- a HOSTNAME that resolves to a private address -- is deliberately
// still open and is a decision rather than an oversight:
// `docs/decisions/entries/23-link-preview-dns-pinning.md`.
//
// THE INSTRUMENT IS THE HALF THAT WAS HARD, AND THE FIRST ATTEMPT AT IT WAS
// VACUOUS. The obvious shape -- point the fetcher at a local server with
// `allowPrivateHosts` on and assert the server never logged the hop -- proves
// nothing, and was measured proving nothing: that flag turns the guard off
// wholesale, so the hostile hop is PERMITTED and followed, and the request goes
// to an address the local server cannot see. `ok: false` then comes back
// because the metadata service is unreachable from a test container, which is
// indistinguishable from a refusal. Restoring the original `redirect: 'follow'`
// under that shape killed ONE assertion out of eight.
//
// So the fetcher here runs with the guard FULLY ON and two servers:
//
//   * a PUBLIC one, reached through a hostname the guard has no opinion about
//     (`preview-test.example`), mapped onto loopback by a `fetch` spy. This is
//     what a permitted first hop looks like.
//   * a PRIVATE one, addressed as `127.0.0.1` and therefore genuinely blocked,
//     which LOGS WHAT REACHES IT.
//
// A hop that should have been refused and was not lands on the private server
// and is counted there -- including a hop the runtime followed internally,
// which a spy on `globalThis.fetch` cannot see. That is the whole point: under
// `redirect: 'follow'` undici walks the chain inside itself, so the only
// witness that works is the destination.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
	clearLinkPreviewCache,
	fetchLinkPreview,
	isBlockedHost
} from '../src/lib/server/link-preview';

/** A name the guard has no opinion about, mapped onto the public server below. */
const PUBLIC_HOST = 'preview-test.example';
const PUBLIC_BASE = `http://${PUBLIC_HOST}`;

let publicServer: Server;
let privateServer: Server;
let publicPort = 0;
let privatePort = 0;

/** Paths the PUBLIC server was asked for. */
let publicHits: string[] = [];
/**
 * Paths the PRIVATE server was asked for. THIS IS THE INSTRUMENT: it is
 * addressed as `127.0.0.1`, so with the guard working nothing may ever reach
 * it, and anything that does got past a check that should have stopped it.
 */
let privateHits: string[] = [];
/** Every URL handed to `fetch`, so a refusal before any request is observable. */
let requested: string[] = [];

/** Where `/hop-to` sends the next request. Set per test. */
let hopTarget = '';
let chainDepth = 0;

let realFetch: typeof globalThis.fetch;

const PAGE = '<html><head><title>Reached</title></head><body>x</body></html>';

beforeAll(async () => {
	publicServer = createServer((req, res) => {
		const path = req.url ?? '/';
		publicHits.push(path);

		if (path === '/hop-to') {
			res.writeHead(302, { location: hopTarget });
			res.end();
			return;
		}
		if (path.startsWith('/chain')) {
			chainDepth += 1;
			res.writeHead(302, { location: `${PUBLIC_BASE}/chain${chainDepth}` });
			res.end();
			return;
		}
		if (path === '/rel') {
			// A RELATIVE Location, which is legal, and which a hand-rolled
			// follower has to resolve against the hop that ISSUED it rather than
			// against the URL the walk started from.
			res.writeHead(302, { location: '/page' });
			res.end();
			return;
		}
		if (path === '/page') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end(
				'<html><head><title>Reached</title>' +
					'<meta property="og:image" content="cover.png"></head><body>x</body></html>'
			);
			return;
		}
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(PAGE);
	});

	privateServer = createServer((req, res) => {
		privateHits.push(req.url ?? '/');
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end('<html><head><title>INTERNAL SECRET</title></head><body>x</body></html>');
	});

	await new Promise<void>((r) => publicServer.listen(0, '127.0.0.1', r));
	await new Promise<void>((r) => privateServer.listen(0, '127.0.0.1', r));
	const pub = publicServer.address();
	const priv = privateServer.address();
	if (!pub || typeof pub === 'string' || !priv || typeof priv === 'string') {
		throw new Error('no address');
	}
	publicPort = pub.port;
	privatePort = priv.port;

	// THE SPY IS A NAME MAPPING, NOT A GUARD. It rewrites the public test
	// hostname onto loopback so a PERMITTED host is reachable, records every URL
	// the module asks for, and refuses to dial anything else -- so a test never
	// depends on the container's own network, and a mutation that reaches for a
	// real address fails fast instead of timing out.
	realFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		requested.push(raw);
		const u = new URL(raw);
		if (u.hostname === PUBLIC_HOST) {
			u.hostname = '127.0.0.1';
			u.port = String(publicPort);
			return realFetch(u.href, init);
		}
		if (u.hostname === '127.0.0.1') return realFetch(raw, init);
		throw new Error(`the test refuses to dial ${u.host}`);
	}) as typeof globalThis.fetch;
});

afterAll(async () => {
	globalThis.fetch = realFetch;
	await new Promise<void>((r) => publicServer.close(() => r()));
	await new Promise<void>((r) => privateServer.close(() => r()));
});

beforeEach(() => {
	clearLinkPreviewCache();
	publicHits = [];
	privateHits = [];
	requested = [];
	chainDepth = 0;
});

/** The private server's own address, which the guard blocks. */
const privateUrl = (path: string) => `http://127.0.0.1:${privatePort}${path}`;

describe('the host predicate itself, in both directions', () => {
	// ASSERTED DIRECTLY RATHER THAN INFERRED. Through `fetchLinkPreview` a
	// refused address and an unreachable one both answer `{ ok: false }`, so the
	// result alone cannot tell a policy decision from a network failure. Every
	// host claim that needs BOTH directions is made here, with no network at all.
	//
	// The hostnames are written the way `URL` hands them over -- bracketed and
	// canonicalized for IPv6 -- because that is the only form the guard is ever
	// called with.
	const asUrlWouldGiveIt = (raw: string): string => new URL(`http://${raw}/`).hostname;

	test('every private and loopback literal is blocked, in every spelling', () => {
		const blocked = [
			'127.0.0.1',
			'127.1.2.3',
			'10.0.0.1',
			'192.168.1.10',
			'172.16.0.1',
			'172.31.255.255',
			'169.254.169.254',
			'0.0.0.0',
			'localhost',
			'foo.localhost',
			'metadata.internal',
			'[::1]',
			'[0:0:0:0:0:0:0:1]',
			'[::]',
			'[fc00::1]',
			'[fd12:3456:789a::1]',
			'[fcff::1]',
			// THE GAP: an IPv4 address hiding inside an IPv6 literal.
			'[::ffff:127.0.0.1]',
			'[::ffff:7f00:1]',
			'[0:0:0:0:0:ffff:127.0.0.1]',
			'[::ffff:169.254.169.254]',
			'[::ffff:10.0.0.1]',
			'[::ffff:192.168.1.10]',
			'[::ffff:172.20.0.1]',
			'[::127.0.0.1]',
			'[::169.254.169.254]',
			// `URL` canonicalizes these two to `127.0.0.1` before the guard runs,
			// so they were never a gap. Pinned so a future normalizer cannot
			// quietly lose them.
			asUrlWouldGiveIt('2130706433'),
			asUrlWouldGiveIt('0x7f000001')
		];
		const leaked = blocked.filter((h) => !isBlockedHost(h));
		expect(leaked).toEqual([]);
		// The case count, so a sweep that generated nothing cannot pass.
		expect(blocked).toHaveLength(28);
	});

	test('a public host is NOT blocked, which is what stops the fix being "refuse everything"', () => {
		const allowed = [
			'ideabosco.com',
			'example.com',
			'en.wikipedia.org',
			PUBLIC_HOST,
			'8.8.8.8',
			'1.1.1.1',
			// The edges of each private range, from the outside.
			'172.15.0.1',
			'172.32.0.1',
			'11.0.0.1',
			'192.169.1.1',
			'169.253.0.1',
			'[2606:4700:4700::1111]',
			'[2001:4860:4860::8888]',
			// A PUBLIC IPv4-mapped address must be judged as the IPv4 address it
			// carries, not refused for being bracketed.
			'[::ffff:8.8.8.8]',
			// THE fc/fd FALSE POSITIVE. The old guard tested that IPv6 prefix
			// against the BARE hostname, so every public name beginning with those
			// two letters was refused -- measured, all four answered true. It only
			// ever over-blocked, so nothing was exposed, but a teacher linking one
			// got no card and nothing said why.
			'fcc.gov',
			'fdn.fr',
			'fc-barcelona.example',
			'fdic.gov'
		];
		const wronglyBlocked = allowed.filter((h) => isBlockedHost(h));
		expect(wronglyBlocked).toEqual([]);
		expect(allowed).toHaveLength(18);
	});

	test('a bracketed host that is not a valid IPv6 address fails CLOSED', () => {
		// There is no legitimate reason for one, and "cannot parse it" must never
		// mean "fetch it".
		for (const h of ['[nonsense]', '[::ffff:999.1.1.1]', '[1:2:3::4::5]', '[]', '[12345::1]']) {
			expect([h, isBlockedHost(h)]).toEqual([h, true]);
		}
	});
});

describe('GAP ONE: an IPv4 address hiding inside an IPv6 literal', () => {
	const blocked: [string, string][] = [
		['IPv4-mapped loopback, dotted', 'http://[::ffff:127.0.0.1]/admin'],
		['IPv4-mapped loopback, hex (what URL canonicalizes it to)', 'http://[::ffff:7f00:1]/admin'],
		['IPv4-mapped loopback, uncompressed', 'http://[0:0:0:0:0:ffff:127.0.0.1]/admin'],
		['IPv4-mapped loopback, uppercase hex', 'http://[::FFFF:7F00:1]/admin'],
		[
			'IPv4-mapped link-local metadata service',
			'http://[::ffff:169.254.169.254]/latest/meta-data/'
		],
		['IPv4-mapped RFC1918 10/8', 'http://[::ffff:10.0.0.1]/'],
		['IPv4-mapped RFC1918 192.168/16', 'http://[::ffff:192.168.1.10]/admin'],
		['IPv4-mapped RFC1918 172.16/12', 'http://[::ffff:172.16.0.1]/'],
		// The deprecated IPv4-COMPATIBLE form. Some stacks still route it.
		['IPv4-compatible loopback', 'http://[::127.0.0.1]/admin'],
		['IPv4-compatible metadata service', 'http://[::169.254.169.254]/latest/'],
		// Forms the old guard did already catch, kept so the fix cannot have
		// traded one for another.
		['plain IPv6 loopback', 'http://[::1]/admin'],
		['IPv6 unique-local fc00::/7', 'http://[fc00::1]/'],
		['the unspecified address', 'http://[::]/'],
		['plain loopback', 'http://127.0.0.1/admin'],
		['the metadata service', 'http://169.254.169.254/latest/meta-data/'],
		['localhost by name', 'http://localhost/whatever'],
		['decimal loopback', 'http://2130706433/'],
		['hex loopback', 'http://0x7f000001/'],
		['a non-http scheme', 'ftp://example.com/x'],
		['a garbage URL', 'not a url at all']
	];

	for (const [label, url] of blocked) {
		test(`blocks ${label}`, async () => {
			const result = await fetchLinkPreview(url);
			expect([label, result.ok]).toEqual([label, false]);
			// `ok: false` on its own is also what an unreachable host answers, so
			// each case asserts the stronger thing in the same breath: no request
			// was made at all. Without this line a guard that permitted the address
			// and then failed to connect would pass under its own name.
			expect([label, requested]).toEqual([label, []]);
		});
	}

	test('NO REQUEST IS MADE FOR ANY OF THEM, against a control that is', async () => {
		// THE POSITIVE CONTROL, and it is the whole test. `ok: false` above is
		// also what a dead host answers, so the result alone cannot tell a
		// refusal from a failure. `requested` is every URL handed to `fetch`:
		// the blocked list must add nothing to it, and a permitted URL must add
		// exactly one, in the same reading.
		for (const [, url] of blocked) await fetchLinkPreview(url);
		expect(requested).toEqual([]);

		const control = await fetchLinkPreview(`${PUBLIC_BASE}/control`);
		expect(requested).toEqual([`${PUBLIC_BASE}/control`]);
		expect(publicHits).toEqual(['/control']);
		expect(control.ok).toBe(true);
		expect(control.title).toBe('Reached');
	});

	test('the private server is reachable when nothing refuses it', async () => {
		// THE INSTRUMENT'S OWN POSITIVE CONTROL. Every "nothing reached the
		// private server" assertion below is worthless if the private server
		// could not be reached in the first place. Asked for directly through the
		// spy, bypassing the module, it answers.
		const res = await globalThis.fetch(privateUrl('/instrument-check'));
		expect(res.status).toBe(200);
		expect(privateHits).toEqual(['/instrument-check']);
	});
});

describe('GAP TWO: every redirect hop is checked, not only the first', () => {
	test('a public URL that redirects to a private address never reaches it', async () => {
		hopTarget = privateUrl('/secrets');
		const result = await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);

		// THE ASSERTION THAT MATTERS. The private server logs everything that
		// arrives, including a hop the RUNTIME followed internally -- which is
		// what `redirect: 'follow'` does, and which a spy on `globalThis.fetch`
		// cannot see.
		expect(privateHits).toEqual([]);
		expect(result.ok).toBe(false);
		// The first hop WAS requested: it is a legitimate public URL and there is
		// no way to know where it goes without asking. Only the second must not
		// happen.
		expect(publicHits).toEqual(['/hop-to']);
		// And the refusal is not "the fetcher gave up early" -- it asked once.
		expect(requested).toEqual([`${PUBLIC_BASE}/hop-to`]);
	});

	test('a redirect to a private address is refused however the address is spelled', async () => {
		// One test rather than three, because the assertion is about the private
		// server's log, which has to be read once after all three.
		const spellings = [
			privateUrl('/secrets'),
			`http://[::ffff:127.0.0.1]:${privatePort}/mapped`,
			`http://localhost:${privatePort}/by-name`
		];
		for (const target of spellings) {
			hopTarget = target;
			clearLinkPreviewCache();
			const result = await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);
			expect([target, result.ok]).toEqual([target, false]);
		}
		expect(privateHits).toEqual([]);
		// The positive control for the same reading: three first hops DID happen.
		expect(publicHits).toEqual(['/hop-to', '/hop-to', '/hop-to']);
	});

	test('a redirect that changes scheme is refused too', async () => {
		for (const target of ['file:///etc/passwd', 'data:text/html,<script>1</script>']) {
			hopTarget = target;
			clearLinkPreviewCache();
			const result = await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);
			expect([target, result.ok]).toEqual([target, false]);
		}
		// The spy throws on anything it was not told to dial, so a scheme that
		// slipped through would show up here as an attempted request.
		expect(requested.filter((u) => !u.startsWith(PUBLIC_BASE))).toEqual([]);
	});

	test('A REDIRECT TO A PERMITTED ADDRESS IS STILL FOLLOWED', async () => {
		// THE POSITIVE CONTROL for the whole describe. Without it, "stop
		// following redirects entirely" passes every assertion above -- and
		// breaks every real link that has a canonical host.
		hopTarget = `${PUBLIC_BASE}/page`;
		const result = await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);
		expect(result.ok).toBe(true);
		expect(result.title).toBe('Reached');
		expect(publicHits).toEqual(['/hop-to', '/page']);
	});

	test('a relative Location resolves against the hop that issued it', async () => {
		const result = await fetchLinkPreview(`${PUBLIC_BASE}/rel`);
		expect(result.ok).toBe(true);
		expect(result.title).toBe('Reached');
		expect(publicHits).toEqual(['/rel', '/page']);
	});

	test('the FINAL url is what a relative og:image resolves against', async () => {
		// `res.url` under `redirect: 'manual'` reports the URL that was
		// REQUESTED, so a follower that kept reading it would resolve the image
		// against the first hop forever. `/page` serves `cover.png` relative.
		hopTarget = `${PUBLIC_BASE}/page`;
		const result = await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);
		expect(result.image_url).toBe(`${PUBLIC_BASE}/cover.png`);
	});

	test('an endless redirect chain stops, and stops soon', async () => {
		const result = await fetchLinkPreview(`${PUBLIC_BASE}/chain`);
		expect(result.ok).toBe(false);
		// Six requests: the original plus MAX_REDIRECTS hops. The CEILING is the
		// assertion -- an unbounded follower would still be going.
		expect(publicHits.length).toBeLessThanOrEqual(6);
		expect(publicHits.length).toBeGreaterThan(1);
	}, 20_000);

	test('a refused redirect is CACHED as a failure, keyed on the URL that was asked for', async () => {
		hopTarget = privateUrl('/secrets');
		await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);
		await fetchLinkPreview(`${PUBLIC_BASE}/hop-to`);
		// One request, not two: a link a class re-opens does not re-probe.
		expect(publicHits.filter((h) => h === '/hop-to')).toHaveLength(1);
		expect(privateHits).toEqual([]);
	});
});

describe('THE THIRD GAP IS STILL OPEN, AND IS PINNED AS OPEN', () => {
	test('a hostname is not resolved, so the guard has no opinion about where it points', () => {
		// This is the shape of the remaining gap, stated as the property it
		// actually is: the guard reads the literal host TEXT and nothing else.
		// `localhost` is refused because it is written down; a name that is not
		// written down is permitted whatever it resolves to, and public DNS
		// carries plenty of names that resolve to 127.0.0.1.
		//
		// If this ever reddens, DNS resolution has been added, and
		// `docs/decisions/entries/23-link-preview-dns-pinning.md` needs closing
		// rather than this test needing deleting.
		expect(isBlockedHost('localhost')).toBe(true);
		for (const name of ['localtest.me', 'vcap.me', 'lvh.me', 'anything.localho.st']) {
			expect([name, isBlockedHost(name)]).toEqual([name, false]);
		}
	});
});
