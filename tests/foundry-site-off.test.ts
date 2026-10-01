// tests/foundry-site-off.test.ts
//
// THE WHOLE-FOUNDRY SWITCH (report c26026b0, ledger 0360), in every place it
// has to bite, and the places it must not.
//
// WHY A TEST AND NOT ONLY A HARNESS. Two halves of this fail SILENTLY. A
// switch that stopped reaching the share links leaves a "turned off" Foundry
// serving games from `apps.ideabosco.com` with nothing on any screen saying
// so; a switch that reached too far (an asset request paying a database read,
// an admin locked out of the switch) shows up as cost or as a one-way door.
//
// THE REAL CODE IS DRIVEN. The `/a/` and `/b/` handlers, the portal's three
// serve routes and `foundrySiteClosed` itself run unmodified; only the
// service-role client is a fake (the `hx-document-cache` pattern), answering
// `foundry_site_settings` and one real-looking published app, and counting
// every read so the cost claim is a number.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type SiteMode = 'open' | 'closed' | 'missing' | 'failing';

const db = vi.hoisted(() => ({
	site: 'open' as SiteMode,
	reads: [] as string[]
}));

const APP = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
const INDEX = '<!doctype html><title>Tide Clock</title><p>the real app</p>';

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		from(table: string) {
			const filters: [string, unknown][] = [];
			const builder = {
				select() {
					return builder;
				},
				eq(col: string, val: unknown) {
					filters.push([col, val]);
					return builder;
				},
				order() {
					return builder;
				},
				maybeSingle() {
					return builder;
				},
				then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
					db.reads.push(table);
					const f = Object.fromEntries(filters);
					let out: { data: unknown; error: unknown } = { data: null, error: null };
					if (table === 'foundry_site_settings') {
						if (db.site === 'missing') out = { data: null, error: { code: 'PGRST205' } };
						else if (db.site === 'failing') out = { data: null, error: { code: 'XX000' } };
						else out = { data: { closed_at: db.site === 'closed' ? '2026-10-01T08:00:00Z' : null }, error: null };
					} else if (table === 'student_app_versions') {
						out = f.id === VERSION ? { data: { id: VERSION, app_id: APP, status: 'approved' }, error: null } : out;
					} else if (table === 'student_apps') {
						out = f.id === APP
							? { data: { id: APP, published_version_id: VERSION, hidden_at: null }, error: null }
							: out;
					} else if (table === 'student_app_files') {
						const known = ['index.html', 'app.js'];
						out = f.version_id === VERSION && known.includes(String(f.path))
							? {
									data: {
										path: f.path,
										content_type: f.path === 'app.js' ? 'text/javascript' : 'text/html'
									},
									error: null
								}
							: out;
					}
					return Promise.resolve(out).then(onOk, onErr);
				}
			};
			return builder;
		},
		storage: {
			from() {
				return {
					async download(key: string) {
						db.reads.push(`storage:${key}`);
						const body = key.endsWith('app.js') ? 'console.log(1)' : INDEX;
						return { data: new Blob([body]), error: null };
					}
				};
			}
		}
	})
}));

const { GET: BUNDLE_GET } = await import('../src/routes/b/[appId]/[versionId]/[...path]/+server.ts');
const { GET: APP_GET } = await import('../src/routes/a/[appId]/[...path]/+server.ts');
const { GET: STARTER_GET } = await import('../src/routes/foundry/starter/+server.ts');
const { GET: PREVIEW_GET } = await import(
	'../src/routes/foundry/preview/[appId]/[versionId]/[...path]/+server.ts'
);
const { GET: DOWNLOAD_GET } = await import(
	'../src/routes/foundry/download/[appId]/[versionId]/+server.ts'
);
const { FOUNDRY_SITE_CACHE_MS, foundrySiteClosed, resetFoundrySiteMemo } = await import(
	'../src/lib/server/foundry-bundle.ts'
);
const {
	FOUNDRY_SITE_OFF_EFFECT,
	FOUNDRY_SITE_OFF_LEAD,
	FOUNDRY_SITE_OFF_SCOPE,
	foundryAccessFromRpc,
	foundrySiteClosedForEveryoneElse,
	foundrySiteOff
} = await import('../src/lib/foundry/access.ts');

const APPS = 'https://apps.ideabosco.com';

function bundle(appId: string, versionId: string, path = '') {
	const href = `${APPS}/b/${appId}/${versionId}/${path}`;
	return BUNDLE_GET({
		params: { appId, versionId, path },
		url: new URL(href),
		request: new Request(href)
	} as never) as Promise<Response>;
}

function direct(appId: string, path = '') {
	const href = `${APPS}/a/${appId}/${path}`;
	return APP_GET({
		params: { appId, path },
		url: new URL(href),
		request: new Request(href)
	} as never) as Promise<Response>;
}

const settingsReads = () => db.reads.filter((t) => t === 'foundry_site_settings').length;

beforeEach(() => {
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
	process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
	db.site = 'open';
	db.reads = [];
	resetFoundrySiteMemo();
});

/* ------------------------------------------------------- the access ladder */

describe('the site half of foundry_section_access', () => {
	it('is on when the payload carries no site keys (a database before 0230)', () => {
		const a = foundryAccessFromRpc({ open: true, closed: [] }, null);
		expect(a.site?.open).toBe(true);
		expect(foundrySiteOff(a)).toBe(false);
	});

	it('is off for a student, with the note, and exempt for an admin who is told', () => {
		const student = foundryAccessFromRpc(
			{ open: true, closed: [], site_open: false, site_note: ' Back Monday. ', site_closed_at: '2026-10-01T08:00:00Z', site_exempt: false },
			null
		);
		expect(foundrySiteOff(student)).toBe(true);
		expect(student.site?.note).toBe('Back Monday.');
		expect(foundrySiteClosedForEveryoneElse(student)).toBe(false);

		const admin = foundryAccessFromRpc(
			{ open: true, closed: [], site_open: false, site_note: null, site_closed_at: '2026-10-01T08:00:00Z', site_exempt: true },
			null
		);
		expect(foundrySiteOff(admin)).toBe(false);
		expect(foundrySiteClosedForEveryoneElse(admin)).toBe(true);
	});

	it('is not turned off by a value that is not the boolean false', () => {
		const odd = foundryAccessFromRpc({ open: true, closed: [], site_open: 'false' }, null);
		expect(foundrySiteOff(odd)).toBe(false);
	});

	it('keeps the class half failing closed on an error, and does not invent a site closure', () => {
		const err = foundryAccessFromRpc(null, { code: '57014' });
		expect(err.open).toBe(false);
		expect(foundrySiteOff(err)).toBe(false);
		const missing = foundryAccessFromRpc(null, { code: 'PGRST202' });
		expect(missing.open).toBe(true);
		expect(foundrySiteOff(missing)).toBe(false);
	});

	it('speaks without an em dash and names what it cannot stop', () => {
		for (const s of [FOUNDRY_SITE_OFF_LEAD, FOUNDRY_SITE_OFF_SCOPE, FOUNDRY_SITE_OFF_EFFECT]) {
			expect(s).not.toMatch(/—/);
		}
		expect(FOUNDRY_SITE_OFF_EFFECT).toMatch(/cannot stop/i);
		expect(FOUNDRY_SITE_OFF_EFFECT).toMatch(/share links/i);
	});
});

/* ------------------------------------------------------- the apps origin */

describe('the apps origin answers the switch, for documents only', () => {
	it('POSITIVE CONTROL: with the switch on, the real app document is served', async () => {
		const res = await bundle(APP, VERSION);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('the real app');
	});

	it('answers the same 503 for a real app, an invented one and the direct page while off', async () => {
		db.site = 'closed';
		const real = await bundle(APP, VERSION);
		const fake = await bundle('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888');
		const page = await direct(APP);
		for (const r of [real, fake, page]) expect(r.status).toBe(503);
		const [a, b, c] = await Promise.all([real.text(), fake.text(), page.text()]);
		expect(a).toContain(FOUNDRY_SITE_OFF_LEAD);
		expect(a).not.toContain('the real app');
		// Identical for every app id: the answer is a fact about the site.
		expect(b).toBe(a);
		expect(c).toBe(a);
		expect(real.headers.get('cache-control')).toBe('no-store');
		expect(real.headers.get('content-security-policy')).toBe(
			"default-src 'none'; style-src 'unsafe-inline'"
		);
	});

	it('leaves an asset alone, so a game loading forty files costs no extra read', async () => {
		db.site = 'closed';
		const asset = await bundle(APP, VERSION, 'app.js');
		expect(asset.status).toBe(200);
		expect(settingsReads()).toBe(0);
	});

	it('fails closed with the bodyless 404 when it cannot tell', async () => {
		db.site = 'failing';
		const res = await bundle(APP, VERSION);
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});

	it('serves normally on a database without the table yet', async () => {
		db.site = 'missing';
		const res = await bundle(APP, VERSION);
		expect(res.status).toBe(200);
	});
});

/* ------------------------------------------------------------- the cost */

describe('one read per instance per window, and no longer', () => {
	it('answers from the memo inside the window and reads again after it', async () => {
		const t0 = 1_000_000;
		db.site = 'closed';
		expect(await foundrySiteClosed(APP, t0)).toBe(true);
		expect(await foundrySiteClosed(APP, t0 + 1_000)).toBe(true);
		expect(await foundrySiteClosed(APP, t0 + FOUNDRY_SITE_CACHE_MS - 1)).toBe(true);
		expect(settingsReads()).toBe(1);
		db.site = 'open';
		expect(await foundrySiteClosed(APP, t0 + FOUNDRY_SITE_CACHE_MS + 1)).toBe(false);
		expect(settingsReads()).toBe(2);
	});

	it('does not remember a failure', async () => {
		db.site = 'failing';
		expect(await foundrySiteClosed(APP, 5)).toBeNull();
		expect(await foundrySiteClosed(APP, 6)).toBeNull();
		expect(settingsReads()).toBe(2);
	});

	it('is on, with no read at all, where there is no service key', async () => {
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		db.site = 'closed';
		expect(await foundrySiteClosed(APP, 7)).toBe(false);
		expect(settingsReads()).toBe(0);
	});
});

/* ----------------------------------------------------- the portal routes */

function sessionClient(site: Record<string, unknown>) {
	return {
		rpc: async (fn: string) => {
			if (fn === 'foundry_section_access') {
				return { data: { ok: true, open: true, closed: [], ...site }, error: null };
			}
			if (fn === 'is_admin') return { data: site.site_exempt === true, error: null };
			return { data: null, error: { code: 'PGRST202' } };
		},
		from: () => ({
			select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
		})
	};
}

const OFF = { site_open: false, site_note: 'Back on Monday.', site_closed_at: '2026-10-01T08:00:00Z', site_exempt: false };
const OFF_ADMIN = { ...OFF, site_exempt: true };
const ON = { site_open: true, site_note: null, site_closed_at: null, site_exempt: false };

function portal(handler: (e: never) => unknown, href: string, params: Record<string, string>, site: Record<string, unknown>) {
	return handler({
		params,
		url: new URL(href),
		request: new Request(href),
		locals: { claims: { sub: 'u-1', email: 's@boscotech.net' }, supabase: sessionClient(site) }
	} as never) as Promise<Response>;
}

describe('the three portal serve routes refuse a student while it is off', () => {
	const P = 'https://ideabosco.com';

	it('starter: 503 with the note while off, the file while on, and the file for an admin', async () => {
		const off = await portal(STARTER_GET as never, `${P}/foundry/starter`, {}, OFF);
		expect(off.status).toBe(503);
		const body = await off.text();
		expect(body).toContain(FOUNDRY_SITE_OFF_LEAD);
		expect(body).toContain('Back on Monday.');

		const on = await portal(STARTER_GET as never, `${P}/foundry/starter`, {}, ON);
		expect(on.status).toBe(200);
		const admin = await portal(STARTER_GET as never, `${P}/foundry/starter`, {}, OFF_ADMIN);
		expect(admin.status).toBe(200);
	});

	it('download and preview: 503 before anything about the app is resolved', async () => {
		const dl = await portal(
			DOWNLOAD_GET as never,
			`${P}/foundry/download/${APP}/${VERSION}`,
			{ appId: APP, versionId: VERSION },
			OFF
		);
		expect(dl.status).toBe(503);
		const pv = await portal(
			PREVIEW_GET as never,
			`${P}/foundry/preview/${APP}/${VERSION}/`,
			{ appId: APP, versionId: VERSION, path: '' },
			OFF
		);
		expect(pv.status).toBe(503);
		// POSITIVE CONTROL: with it on, the same calls are not the switch's refusal.
		const dlOn = await portal(
			DOWNLOAD_GET as never,
			`${P}/foundry/download/${APP}/${VERSION}`,
			{ appId: APP, versionId: VERSION },
			ON
		);
		expect(dlOn.status).not.toBe(503);
	});

	it('escapes the note, which an administrator typed', async () => {
		const res = await portal(STARTER_GET as never, `${P}/foundry/starter`, {}, { ...OFF, site_note: '<script>x</script>' });
		const body = await res.text();
		expect(body).not.toContain('<script>x');
		expect(body).toContain('&lt;script&gt;');
	});
});
