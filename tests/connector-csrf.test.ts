// tests/connector-csrf.test.ts
//
// THE CROSS-SITE FORM CHECK STILL HOLDS EVERYWHERE BUT THE TWO OAUTH PATHS.
// svelte.config.js turns SvelteKit's built-in check off only because
// `connectorCsrfGuard` restates it and runs first in hooks.server.ts; this file
// fails if the guard stops refusing a cross-origin form post (a student bundle
// on apps.ideabosco.com is same-site, so its form posts would carry the session
// cookies), if it starts refusing the token endpoint, or if either half of the
// wiring moves.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CSRF_EXEMPT_PATHS, csrfForbidden } from '../src/lib/server/connector/csrf';

const ORIGIN = 'https://ideabosco.com';
const req = (path: string, init: { origin?: string | null; type?: string; method?: string }) =>
	new Request(`${ORIGIN}${path}`, {
		method: init.method ?? 'POST',
		headers: {
			...(init.type ? { 'content-type': init.type } : {}),
			...(init.origin ? { origin: init.origin } : {})
		},
		body: 'a=1'
	});

describe('the restated check', () => {
	it('refuses a cross-origin and an origin-less form post to an ordinary route', () => {
		for (const origin of ['https://apps.ideabosco.com', 'https://evil.example', null]) {
			for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain;charset=utf-8']) {
				const r = req('/classroom/abc?/save', { origin, type });
				expect(csrfForbidden(r, new URL(r.url)), `${origin} ${type}`).toBe(true);
			}
		}
	});

	it('lets a same-origin form post, a JSON post and a GET through', () => {
		const same = req('/classroom/abc?/save', { origin: ORIGIN, type: 'application/x-www-form-urlencoded' });
		const json = req('/api/feedback', { origin: 'https://evil.example', type: 'application/json' });
		const get = new Request(`${ORIGIN}/classroom`, { headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' } });
		for (const r of [same, json, get]) expect(csrfForbidden(r, new URL(r.url))).toBe(false);
	});

	it('exempts exactly the token and revocation endpoints, origin-less', () => {
		expect([...CSRF_EXEMPT_PATHS].sort()).toEqual(['/connector/revoke', '/connector/token']);
		for (const p of CSRF_EXEMPT_PATHS) {
			const r = req(p, { origin: null, type: 'application/x-www-form-urlencoded' });
			expect(csrfForbidden(r, new URL(r.url))).toBe(false);
		}
		const authorize = req('/connector/authorize?/connect', { origin: 'https://evil.example', type: 'application/x-www-form-urlencoded' });
		expect(csrfForbidden(authorize, new URL(authorize.url))).toBe(true);
	});
});

describe('the wiring', () => {
	const config = readFileSync(fileURLToPath(new URL('../svelte.config.js', import.meta.url)), 'utf8');
	const hooks = readFileSync(fileURLToPath(new URL('../src/hooks.server.ts', import.meta.url)), 'utf8');

	it('the built-in check is off only together with the guard running first', () => {
		expect(config).toMatch(/csrf:\s*\{\s*trustedOrigins:\s*\['\*'\]\s*\}/);
		expect(hooks).toMatch(/export const handle: Handle = sequence\(connectorCsrfGuard,/);
	});
});
