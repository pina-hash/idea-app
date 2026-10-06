// tests/armory-endpoints.test.ts
//
// THE AGENT'S OWN EXPECTATIONS OF ideabosco.com, PUT TO THE REAL ROUTES.
//
// pina-hash/idea-armory at b18791d tests its Windows agent against a fake
// ideabosco.com (tests/Armory.TestSupport/FakeIdeaBosco.cs) and pins that fake
// with tests/Armory.TestSupport.Tests/FakeIdeaBoscoTests.cs. This file ports
// those request and response fixtures, case by case, and sends them to the
// REAL +server.ts handlers in src/routes/api/armory, so the two sides are
// proven to answer alike rather than read alike. The C# test each block ports
// is named above it.
//
// What is faked is Supabase (`$lib/server/armory/deps`, mocked): tokens,
// membership, the connect-code table and session minting live in memory, the
// way FakeSupabase holds them in the agent's suite. The SQL behind membership
// and device registration is proven separately on a real Postgres in
// tests/db/armory-proposed.test.ts. Storage is a fake HEAD answering from a
// set of stored keys.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRateLimiter } from '../src/lib/server/rate-limit';
import type { ArmoryBackend, StoredConnectCode } from '../src/lib/server/armory/backend';
import { ArmoryBackendUnavailable } from '../src/lib/server/armory/backend';
import type { ArmoryDeps } from '../src/lib/server/armory/deps';
import { MAX_PUT_BYTES } from '../src/lib/server/armory/storage';

let deps: ArmoryDeps;
vi.mock('$lib/server/armory/deps', async (original) => ({
	...(await original<typeof import('../src/lib/server/armory/deps')>()),
	armoryDeps: () => deps
}));

const { POST: blobUrl } = await import('../src/routes/api/armory/blob-url/+server');
const { POST: start } = await import('../src/routes/api/armory/connect/start/+server');
const { POST: exchange } = await import('../src/routes/api/armory/connect/exchange/+server');

const SITE = 'https://ideabosco.com';
const ENDPOINT = 'https://acct.r2.cloudflarestorage.com';
const BUCKET = 'armory';
const ANON_KEY = 'anon-key-placeholder';
const SUPABASE_URL = 'https://example-ref.supabase.co';

const b64url = (b: Buffer) => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const secret = () => b64url(randomBytes(32));
const challengeFor = (v: string) => b64url(createHash('sha256').update(Buffer.from(v, 'ascii')).digest());
const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const randomHash = () => randomBytes(32).toString('hex');
const keyOf = (h: string) => `blobs/sha256/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`;

interface World {
	clock: number;
	tokens: Map<string, { id: string; email: string }>;
	members: Map<string, Set<string>>;
	hashes: Map<string, Set<string>>;
	codes: Map<string, StoredConnectCode>;
	devices: Array<{ id: string; owner: string; name: string }>;
	stored: Set<string>;
	heads: number;
	down: boolean;
	storageOn: boolean;
}
let w: World;

function issue(email: string): string {
	const token = 'access-' + randomUUID();
	w.tokens.set(token, { id: randomUUID(), email });
	return token;
}

function makeBackend(): ArmoryBackend {
	const guard = () => {
		if (w.down) throw new ArmoryBackendUnavailable('down');
	};
	return {
		async userFromAccessToken(token) {
			guard();
			return w.tokens.get(token) ?? null;
		},
		async isMember(token, project) {
			guard();
			const user = w.tokens.get(token);
			return !!user && (w.members.get(project)?.has(user.email) ?? false);
		},
		async hashInProject(_token, project, hash) {
			guard();
			return w.hashes.get(project)?.has(hash) ?? false;
		},
		async storeConnectCode(code) {
			guard();
			w.codes.set(code.codeHash, { ...code });
		},
		async findConnectCode(hash) {
			guard();
			const c = w.codes.get(hash);
			return c ? { ...c } : null;
		},
		async consumeConnectCode(hash) {
			guard();
			const c = w.codes.get(hash);
			if (!c || c.used) return false;
			c.used = true;
			return true;
		},
		async mintSession(email) {
			guard();
			const access = issue(email);
			return { access_token: access, refresh_token: 'refresh-' + randomUUID(), expires_at: Math.floor(w.clock / 1000) + 3600 };
		},
		async registerDevice(token, name) {
			guard();
			const user = w.tokens.get(token)!;
			const id = randomUUID();
			w.devices.push({ id, owner: user.email, name });
			return id;
		},
		publicConfig: () => ({ supabaseUrl: SUPABASE_URL + '/', anonKey: ANON_KEY })
	};
}

beforeEach(() => {
	w = {
		clock: Date.parse('2026-10-06T12:00:00.250Z'),
		tokens: new Map(),
		members: new Map(),
		hashes: new Map(),
		codes: new Map(),
		devices: [],
		stored: new Set(),
		heads: 0,
		down: false,
		storageOn: true
	};
	deps = {
		backend: makeBackend(),
		storage: () =>
			w.storageOn
				? { accountId: 'acct', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', bucket: BUCKET, endpoint: ENDPOINT }
				: null,
		now: () => w.clock,
		limiter: createRateLimiter(60_000),
		limits: { startPerIp: 10, startPerUser: 10, exchangePerIp: 10, exchangePerUser: 10 },
		fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
			w.heads += 1;
			expect(init?.method).toBe('HEAD');
			const url = new URL(String(input));
			const key = url.pathname.replace(`/${BUCKET}/`, '');
			return new Response(null, { status: w.stored.has(key) ? 200 : 404 });
		}) as typeof fetch,
		randomBytes: (n) => randomBytes(n),
		uuid: () => randomUUID()
	};
});

function seedProject(): { project: string; student: string; mentor: string } {
	const project = randomUUID();
	const student = `s-${randomUUID().slice(0, 8)}@boscotech.net`;
	const mentor = `m-${randomUUID().slice(0, 8)}@boscotech.edu`;
	w.members.set(project, new Set([student, mentor]));
	w.hashes.set(project, new Set());
	return { project, student, mentor };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (e: any) => unknown;
function call(handler: Handler, init: { body?: string; headers?: Record<string, string>; user?: { id: string; email: string } | null; ip?: string; path: string }): Promise<Response> {
	const request = new Request(SITE + init.path, { method: 'POST', body: init.body, headers: init.headers });
	const event = {
		request,
		locals: { claims: init.user ? { sub: init.user.id, email: init.user.email } : null },
		getClientAddress: () => init.ip ?? '203.0.113.5'
	};
	return Promise.resolve(handler(event)) as Promise<Response>;
}

const blob = (body: string, authorization?: string | null) =>
	call(blobUrl, { path: '/api/armory/blob-url', body, headers: authorization ? { authorization, 'content-type': 'application/json' } : { 'content-type': 'application/json' } });
const blobJson = (project: string, hash: string, bytes: number, method: string, token: string) =>
	blob(JSON.stringify({ projectId: project, hash, bytes, method }), 'Bearer ' + token);

const startJson = (body: unknown, email: string | null, ip?: string) =>
	call(start, {
		path: '/api/armory/connect/start',
		body: typeof body === 'string' ? body : JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
		user: email ? { id: randomUUID(), email } : null,
		ip
	});
const exchangeJson = (body: unknown, ip?: string) =>
	call(exchange, { path: '/api/armory/connect/exchange', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' }, ip });

async function issueCode(email: string, device = 'Lab PC 3'): Promise<{ code: string; verifier: string; state: string }> {
	const verifier = secret();
	const state = secret();
	const r = await startJson({ port: 51234, state, challenge: challengeFor(verifier), device }, email, '198.51.100.' + Math.floor(Math.random() * 250));
	expect(r.status).toBe(303);
	const location = new URL(r.headers.get('location')!);
	return { code: location.searchParams.get('code')!, verifier, state };
}

// ---------------------------------------------------------------------------
// Section 2: blob URLs
// ---------------------------------------------------------------------------

describe('blob-url (FakeIdeaBoscoTests: BlobUrl*)', () => {
	test('a PUT answers 200, binds the byte count, and exists follows the store', async () => {
		const { project, student } = seedProject();
		const token = issue(student);
		const hash = randomHash();
		const r = await blobJson(project, hash, 11, 'PUT', token);
		expect(r.status).toBe(200);
		const body = await r.json();
		expect(Object.keys(body).sort()).toEqual(['exists', 'expiresAt', 'headers', 'url']);
		expect(body.url.startsWith(`${ENDPOINT}/${BUCKET}/${keyOf(hash)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&`)).toBe(true);
		expect(body.url).toContain('&X-Amz-Expires=900&');
		expect(body.url).toContain('&X-Amz-SignedHeaders=content-length%3Bhost&');
		expect(body.url).toMatch(/&X-Amz-Signature=[0-9a-f]{64}$/);
		expect(body.headers).toEqual({});
		expect(body.expiresAt).toBe('2026-10-06T12:15:00.000Z'); // whole second, plus fifteen minutes
		expect(body.exists).toBe(false);
		expect(r.headers.get('cache-control')).toBe('no-store');

		w.stored.add(keyOf(hash));
		const again = await (await blobJson(project, hash, 11, 'PUT', token)).json();
		expect(again.exists).toBe(true);
		const largest = await blobJson(project, randomHash(), MAX_PUT_BYTES, 'PUT', token);
		expect(largest.status).toBe(200); // exactly 2 GiB is allowed
	});

	test('a GET needs the hash in the project versions or side versions', async () => {
		const { project, student } = seedProject();
		const other = seedProject();
		const token = issue(student);
		const version = randomHash();
		const side = randomHash();
		const elsewhere = randomHash();
		w.hashes.get(project)!.add(version).add(side);
		w.hashes.get(other.project)!.add(elsewhere);

		const get = await blobJson(project, version, 2, 'GET', token);
		expect(get.status).toBe(200);
		const body = await get.json();
		expect(body.url.startsWith(`${ENDPOINT}/${BUCKET}/${keyOf(version)}?X-Amz-Algorithm=`)).toBe(true);
		expect(body.url).toContain('&X-Amz-SignedHeaders=host&');
		expect(body.exists).toBe(false);
		w.stored.add(keyOf(version));
		expect((await (await blobJson(project, version, 2, 'GET', token)).json()).exists).toBe(true);
		expect((await blobJson(project, side, 3, 'GET', token)).status).toBe(200);
		expect((await blobJson(project, randomHash(), 3, 'GET', token)).status).toBe(403);
		expect((await blobJson(project, elsewhere, 3, 'GET', token)).status).toBe(403);
		expect((await blobJson(other.project, elsewhere, 3, 'GET', issue(other.mentor))).status).toBe(200);
	});

	test('bad bodies are 400, and a GET over 2 GiB fails only the project check', async () => {
		const { project, student } = seedProject();
		const auth = 'Bearer ' + issue(student);
		const hash = randomHash();
		const body = (o: Record<string, unknown> = {}, omit?: string) => {
			const b: Record<string, unknown> = { projectId: project, hash, bytes: 10, method: 'PUT', ...o };
			if (omit) delete b[omit];
			return JSON.stringify(b);
		};
		expect((await blob(body(), auth)).status).toBe(200);
		const bad = [
			'not json', '[]', '"text"',
			body({ projectId: 'nope' }), body({ projectId: 42 }), body({}, 'projectId'),
			body({ hash: hash.toUpperCase() }), body({ hash: hash.slice(0, 63) }), body({ hash: hash + 'a' }),
			body({ hash: 'g'.repeat(64) }), body({ hash: hash + '\n' }), body({ hash: 7 }), body({}, 'hash'),
			body({ bytes: -1 }), body({ bytes: 1.5 }), body({ bytes: '10' }), body({ bytes: true }), body({}, 'bytes'),
			body({ method: 'POST' }), body({ method: 'put' }), body({ method: 1 }), body({}, 'method'),
			body({ bytes: MAX_PUT_BYTES + 1 })
		];
		expect(bad).toHaveLength(23);
		for (const json of bad) {
			const r = await blob(json, auth);
			expect(r.status, json).toBe(400);
		}
		const bigGet = await blob(body({ bytes: MAX_PUT_BYTES + 1, method: 'GET' }), auth);
		expect(bigGet.status).toBe(403);
		expect((await bigGet.json()).error).toBe('forbidden');
	});

	test('no live token is 401, and 401 comes before 400', async () => {
		const { project, student } = seedProject();
		const json = JSON.stringify({ projectId: project, hash: randomHash(), bytes: 1, method: 'PUT' });
		const expired = issue(student);
		w.tokens.delete(expired); // what an expired token looks like from here: unknown to the auth server
		for (const authorization of [null, 'Bearer access-never-issued', 'Basic abc', 'Bearer ' + expired, 'Bearer ' + ANON_KEY, 'Bearer']) {
			const r = await blob(json, authorization);
			expect(r.status, String(authorization)).toBe(401);
			expect((await r.json()).error).toBe('unauthorized');
		}
		expect((await blob('not json', null)).status).toBe(401);
		// Positive control: the same body with a live token is not 401.
		expect((await blob(json, 'Bearer ' + issue(student))).status).toBe(200);
	});

	test('a non-member is 403, including for a project that does not exist', async () => {
		const { project } = seedProject();
		const outsider = issue('outsider@boscotech.net');
		const put = await blobJson(project, randomHash(), 1, 'PUT', outsider);
		expect(put.status).toBe(403);
		expect((await put.json()).error).toBe('forbidden');
		expect((await blobJson(randomUUID(), randomHash(), 1, 'PUT', outsider)).status).toBe(403);
	});

	test('503 armory_storage_not_configured when storage is not set, and nothing else', async () => {
		const { project, student } = seedProject();
		w.storageOn = false;
		const r = await blobJson(project, randomHash(), 1, 'PUT', issue(student));
		expect(r.status).toBe(503);
		expect(await r.text()).toBe('{"error":"armory_storage_not_configured"}');
		expect(w.heads).toBe(0);
	});

	test('an unreachable backend is 503, never a refusal', async () => {
		const { project, student } = seedProject();
		const token = issue(student);
		w.down = true;
		const r = await blobJson(project, randomHash(), 1, 'PUT', token);
		expect(r.status).toBe(503);
		expect((await r.json()).error).toBe('armory_unavailable');
	});
});

// ---------------------------------------------------------------------------
// Section 3: connecting a computer
// ---------------------------------------------------------------------------

describe('connect/start (FakeIdeaBoscoTests: ConnectStart*)', () => {
	test('redirects to the loopback callback with a one-time code kept only as its hash', async () => {
		const state = secret();
		const r = await startJson({ port: 51234, state, challenge: challengeFor(secret()), device: 'Lab PC 3' }, 'student@boscotech.net');
		expect(r.status).toBe(303);
		const location = new URL(r.headers.get('location')!);
		expect(location.protocol).toBe('http:');
		expect(location.hostname).toBe('127.0.0.1');
		expect(location.port).toBe('51234');
		expect(location.pathname).toBe('/callback');
		expect(location.searchParams.get('state')).toBe(state);
		const code = location.searchParams.get('code')!;
		expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect([...w.codes.keys()]).toEqual([sha256Hex(code)]);
		expect(JSON.stringify([...w.codes.values()])).not.toContain(code);
		const stored = [...w.codes.values()][0];
		expect(stored.expiresAt - w.clock).toBe(120_000);
		expect(stored.deviceName).toBe('Lab PC 3');
	});

	test('the confirm page form (urlencoded) gets the same 303', async () => {
		const form = new URLSearchParams({ port: '50000', state: 'state_-1', challenge: challengeFor(secret()), device: 'Lab PC 3' });
		const r = await call(start, {
			path: '/api/armory/connect/start',
			body: form.toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: randomUUID(), email: 'student@boscotech.net' }
		});
		expect(r.status).toBe(303);
		expect(r.headers.get('location')!.startsWith('http://127.0.0.1:50000/callback?state=state_-1&code=')).toBe(true);
	});

	test('bad input is 400; the edges that are allowed are allowed', async () => {
		deps.limits = { ...deps.limits, startPerIp: 1000, startPerUser: 1000 };
		const challenge = challengeFor(secret());
		const body = (o: Record<string, unknown> = {}, omit?: string) => {
			const b: Record<string, unknown> = { port: 50000, state: 'state_-1', challenge, device: 'Lab PC 3', ...o };
			if (omit) delete b[omit];
			return JSON.stringify(b);
		};
		for (const good of [body({ port: 1024 }), body({ port: 65535 }), body({ port: '50000' }), body({ state: 'a'.repeat(256) }), body({ device: 'd'.repeat(100) })]) {
			expect((await startJson(good, 'student@boscotech.net')).status, good).toBe(303);
		}
		const bad = [
			'not json', '[]',
			body({ port: 1023 }), body({ port: 65536 }), body({ port: 0 }), body({ port: -1 }), body({ port: 1.5 }), body({ port: 'abc' }), body({ port: true }), body({}, 'port'),
			body({ state: '' }), body({ state: 'a'.repeat(257) }), body({ state: 'has space' }), body({ state: 'a+b' }), body({ state: 'abc=' }), body({ state: 'abc\n' }), body({ state: 5 }), body({}, 'state'),
			body({ challenge: challenge.slice(0, 42) }), body({ challenge: challenge + 'A' }), body({ challenge: '+' + challenge.slice(1) }), body({ challenge: 1 }), body({}, 'challenge'),
			body({ device: '' }), body({ device: '   ' }), body({ device: 'd'.repeat(101) }), body({ device: 3 }), body({}, 'device')
		];
		expect(bad).toHaveLength(28);
		for (const json of bad) expect((await startJson(json, 'student@boscotech.net')).status, json).toBe(400);
		expect(w.codes.size).toBe(5);
	});

	test('no site session is 401 and stores nothing', async () => {
		const r = await startJson({ port: 50000, state: secret(), challenge: challengeFor(secret()), device: 'Lab PC' }, null);
		expect(r.status).toBe(401);
		expect((await r.json()).error).toBe('unauthorized');
		expect(w.codes.size).toBe(0);
	});

	test('rate limited per IP and per user (429), and the window slides', async () => {
		const challenge = challengeFor(secret());
		const go = async (email: string, ip?: string) =>
			(await startJson({ port: 50000, state: secret(), challenge, device: 'Lab PC' }, email, ip)).status;
		for (let i = 0; i < 10; i += 1) expect(await go('busy@boscotech.net')).toBe(303); // default: 10 a minute
		expect(await go('busy@boscotech.net')).toBe(429);

		deps.limiter.reset();
		deps.limits = { ...deps.limits, startPerIp: 1000, startPerUser: 2 };
		expect(await go('user@boscotech.net')).toBe(303);
		expect(await go('user@boscotech.net')).toBe(303);
		expect(await go('user@boscotech.net', '10.0.0.9')).toBe(429); // per user, from any address
		expect(await go('someone@boscotech.net')).toBe(303);

		deps.limits = { ...deps.limits, startPerIp: 2, startPerUser: 1000 };
		expect(await go('a@boscotech.net', '10.0.0.1')).toBe(303);
		expect(await go('b@boscotech.net', '10.0.0.1')).toBe(303);
		expect(await go('c@boscotech.net', '10.0.0.1')).toBe(429); // per address, for any user
		expect(await go('d@boscotech.net', '10.0.0.2')).toBe(303);

		w.clock += 60_000;
		expect(await go('e@boscotech.net', '10.0.0.1')).toBe(303);
	});
});

describe('connect/exchange (FakeIdeaBoscoTests: Exchange*)', () => {
	test('mints an independent session, registers the device, and answers the agent shape', async () => {
		const email = 'student@boscotech.net';
		const browser = issue(email);
		const { code, verifier } = await issueCode(email);
		const r = await exchangeJson({ code, verifier });
		expect(r.status).toBe(200);
		const body = await r.json();
		expect(Object.keys(body).sort()).toEqual(['access_token', 'anon_key', 'device_id', 'email', 'expires_at', 'refresh_token', 'supabase_url']);
		expect(body.email).toBe(email);
		expect(body.anon_key).toBe(ANON_KEY);
		expect(body.supabase_url).toBe(SUPABASE_URL); // never a trailing slash
		expect(body.expires_at).toBe(Math.floor(w.clock / 1000) + 3600); // Unix seconds, a number
		expect(body.access_token).not.toBe(browser);
		expect(w.tokens.has(browser)).toBe(true); // the browser's session is untouched
		expect(w.devices).toEqual([{ id: body.device_id, owner: email, name: 'Lab PC 3' }]);
		expect(body.device_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(r.headers.get('cache-control')).toBe('no-store');
	});

	test('bad input is 400', async () => {
		for (const json of ['not json', '[]', '{}', '{"code":"abc"}', '{"verifier":"abc"}', '{"code":1,"verifier":"abc"}', '{"code":"abc","verifier":null}', '{"code":"","verifier":"abc"}', '{"code":"abc","verifier":""}']) {
			expect((await exchangeJson(json)).status, json).toBe(400);
		}
	});

	test('unknown, reused and wrong-verifier codes are 401, and a wrong guess consumes the code', async () => {
		const email = 'student@boscotech.net';
		expect((await exchangeJson({ code: secret(), verifier: secret() })).status).toBe(401);
		const first = await issueCode(email);
		expect((await exchangeJson({ code: first.code, verifier: first.verifier })).status).toBe(200);
		expect((await exchangeJson({ code: first.code, verifier: first.verifier })).status).toBe(401);
		const guarded = await issueCode(email);
		expect((await exchangeJson({ code: guarded.code, verifier: secret() })).status).toBe(401);
		expect((await exchangeJson({ code: guarded.code, verifier: guarded.verifier })).status).toBe(401);
		expect(w.devices.filter((d) => d.owner === email)).toHaveLength(1);
	});

	test('an expired code is 410 even with a wrong verifier; one second short is fine', async () => {
		const email = 'student@boscotech.net';
		const a = await issueCode(email);
		const b = await issueCode(email);
		w.clock += 120_000;
		const wrong = await exchangeJson({ code: b.code, verifier: secret() });
		expect(wrong.status).toBe(410);
		expect((await wrong.json()).error).toBe('code_expired');
		expect((await exchangeJson({ code: a.code, verifier: a.verifier })).status).toBe(410);
		expect((await exchangeJson({ code: secret(), verifier: a.verifier })).status).toBe(401);
		const fresh = await issueCode(email);
		w.clock += 119_000;
		expect((await exchangeJson({ code: fresh.code, verifier: fresh.verifier })).status).toBe(200);
	});

	test('rate limited per IP (429) before reading the body', async () => {
		deps.limits = { ...deps.limits, exchangePerIp: 2 };
		const json = { code: 'nope', verifier: 'nope' };
		expect((await exchangeJson(json)).status).toBe(401);
		expect((await exchangeJson('{}')).status).toBe(400);
		const c = await exchangeJson(json);
		expect(c.status).toBe(429);
		expect((await c.json()).error).toBe('rate_limited');
		expect((await exchangeJson(json, '10.0.0.7')).status).toBe(401);
		w.clock += 60_000;
		expect((await exchangeJson(json)).status).toBe(401);
	});

	test('rate limited per user of the code (429), and a 429 does not consume the code', async () => {
		const email = 'student@boscotech.net';
		const codes = [await issueCode(email), await issueCode(email), await issueCode(email)];
		deps.limits = { ...deps.limits, exchangePerUser: 1 };
		expect((await exchangeJson({ code: codes[0].code, verifier: codes[0].verifier }, '10.1.0.1')).status).toBe(200);
		expect((await exchangeJson({ code: codes[1].code, verifier: codes[1].verifier }, '10.1.0.2')).status).toBe(429);
		w.clock += 60_000; // the window slides; the code has a minute of life left
		expect((await exchangeJson({ code: codes[1].code, verifier: codes[1].verifier }, '10.1.0.3')).status).toBe(200);
		expect((await exchangeJson({ code: codes[2].code, verifier: codes[2].verifier }, '10.1.0.4')).status).toBe(429);
	});
});
