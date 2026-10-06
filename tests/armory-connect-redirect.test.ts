// tests/armory-connect-redirect.test.ts
//
// THE ONE REDIRECT TARGET A CONNECT CODE MAY BE SENT TO, in the style of
// tests/auth-callback-next.test.ts: every refusal by name, beside the positive
// control. A connect code sent anywhere but the student's own computer is a
// session handed to whoever owns that address, so a validator tested only on
// its happy path is a validator nobody has tested.
//
// Two layers are held separately, because either alone is the thing a later
// edit could weaken: `isLoopbackCallback` judges a whole URL, and the route
// builds its URL from a PORT only (there is no host field to smuggle anything
// through), so the second block sends hostile ports to the real route.

import { randomUUID } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { isLoopbackCallback, loopbackCallbackUrl, parseConnectPort } from '../src/lib/armory/connect';
import { createRateLimiter } from '../src/lib/server/rate-limit';
import type { ArmoryDeps } from '../src/lib/server/armory/deps';

const CODE = 'A'.repeat(43);

describe('isLoopbackCallback accepts only http://127.0.0.1:<1024-65535>/callback', () => {
	const ok = [
		'http://127.0.0.1:1024/callback?state=s&code=' + CODE,
		'http://127.0.0.1:65535/callback?state=s&code=' + CODE,
		'http://127.0.0.1:51234/callback?state=abc_-1&code=' + CODE
	];
	test.each(ok)('positive control: %s', (url) => expect(isLoopbackCallback(url)).toBe(true));

	const refused: Array<[string, string]> = [
		['localhost', 'http://localhost:51234/callback?state=s&code=x'],
		['LOCALHOST upper case', 'http://LOCALHOST:51234/callback?state=s'],
		['another loopback address', 'http://127.0.0.2:51234/callback?state=s'],
		['IPv6 loopback', 'http://[::1]:51234/callback?state=s'],
		['0.0.0.0', 'http://0.0.0.0:51234/callback?state=s'],
		['decimal 127.0.0.1', 'http://2130706433:51234/callback?state=s'],
		['hex 127.0.0.1', 'http://0x7f.0.0.1:51234/callback?state=s'],
		['short 127.1', 'http://127.1:51234/callback?state=s'],
		['other host', 'http://evil.example:51234/callback?state=s'],
		['userinfo before the host', 'http://127.0.0.1@evil.example:51234/callback?state=s'],
		['userinfo naming the loopback', 'http://evil.example@127.0.0.1:51234/callback?state=s'],
		['user and password', 'http://a:b@127.0.0.1:51234/callback?state=s'],
		['host after a fragment', 'http://evil.example#@127.0.0.1:51234/callback'],
		['subdomain trick', 'http://127.0.0.1.evil.example:51234/callback?state=s'],
		['https', 'https://127.0.0.1:51234/callback?state=s'],
		['protocol-relative', '//127.0.0.1:51234/callback?state=s'],
		['no port', 'http://127.0.0.1/callback?state=s'],
		['port 0', 'http://127.0.0.1:0/callback?state=s'],
		['port 80', 'http://127.0.0.1:80/callback?state=s'],
		['port 1023', 'http://127.0.0.1:1023/callback?state=s'],
		['port 65536', 'http://127.0.0.1:65536/callback?state=s'],
		['port 99999', 'http://127.0.0.1:99999/callback?state=s'],
		['leading-zero port', 'http://127.0.0.1:01024/callback?state=s'],
		['another path', 'http://127.0.0.1:51234/steal?state=s'],
		['path traversal', 'http://127.0.0.1:51234/callback/../x?state=s'],
		['backslash', 'http:\\\\127.0.0.1:51234/callback?state=s'],
		['a fragment', 'http://127.0.0.1:51234/callback?state=s#x'],
		['a tab inside', 'http://127.0.0.1:5\t1234/callback?state=s'],
		['javascript', 'javascript:alert(1)//http://127.0.0.1:51234/callback'],
		['empty', '']
	];
	test.each(refused)('refuses %s', (_name, url) => expect(isLoopbackCallback(url)).toBe(false));
	test('the refusal table is the size it says', () => expect(refused).toHaveLength(30));
});

describe('loopbackCallbackUrl builds from a port and nothing else', () => {
	test('the built URL is the canonical form', () => {
		expect(loopbackCallbackUrl(51234, 'state_-1', CODE)).toBe(`http://127.0.0.1:51234/callback?state=state_-1&code=${CODE}`);
	});
	test.each([0, 80, 1023, 65536, -1, 1.5, Number.NaN])('refuses port %s', (port) => {
		expect(loopbackCallbackUrl(port, 's', CODE)).toBeNull();
	});
	test.each([
		['"1024abc"', '1024abc'],
		['"0x400"', '0x400'],
		['" 1024"', ' 1024'],
		['"+1024"', '+1024'],
		['"1e4"', '1e4'],
		['"localhost:5000"', 'localhost:5000']
	])('parseConnectPort refuses the string %s', (_n, raw) => expect(parseConnectPort(raw)).toBeNull());
});

let deps: ArmoryDeps;
vi.mock('$lib/server/armory/deps', async (original) => ({
	...(await original<typeof import('../src/lib/server/armory/deps')>()),
	armoryDeps: () => deps
}));
const { POST: start } = await import('../src/routes/api/armory/connect/start/+server');

describe('the real start route never redirects anywhere but the loopback', () => {
	const stored: string[] = [];
	deps = {
		backend: {
			storeConnectCode: async (c: { codeHash: string }) => void stored.push(c.codeHash)
		} as unknown as ArmoryDeps['backend'],
		storage: () => null,
		now: () => Date.now(),
		limiter: createRateLimiter(),
		limits: { startPerIp: 1e6, startPerUser: 1e6, exchangePerIp: 1e6, exchangePerUser: 1e6 },
		fetch,
		randomBytes: (n) => Buffer.alloc(n, 7),
		uuid: () => randomUUID()
	};
	const send = (body: Record<string, unknown>) =>
		start({
			request: new Request('https://ideabosco.com/api/armory/connect/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ state: 'state_1', challenge: 'C'.repeat(43), device: 'Lab PC', ...body })
			}),
			locals: { claims: { sub: randomUUID(), email: 'student@boscotech.net' } },
			getClientAddress: () => '203.0.113.9'
		} as never) as Promise<Response>;

	test.each([
		['port 0', { port: 0 }],
		['port 65536', { port: 65536 }],
		['port 1023', { port: 1023 }],
		['a host in the port', { port: 'evil.example:5000' }],
		['a host field is ignored and the port alone is used', { port: 'x', host: 'evil.example' }],
		['a state that would break out of the query', { port: 50000, state: 'a&code=x#@evil.example' }],
		['a state with a slash', { port: 50000, state: 'a/b' }]
	])('%s is 400 with no Location', async (_n, body) => {
		const r = await send(body);
		expect(r.status).toBe(400);
		expect(r.headers.get('location')).toBeNull();
	});

	test('positive control: a good port is a 303 to the loopback and nowhere else, even with a host field', async () => {
		const r = await send({ port: 50000, host: 'evil.example', redirect: 'https://evil.example/' });
		expect(r.status).toBe(303);
		const location = r.headers.get('location')!;
		expect(isLoopbackCallback(location)).toBe(true);
		expect(location).not.toContain('evil');
	});
});
