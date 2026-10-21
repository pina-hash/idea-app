// tests/view-as-service-role.test.ts
//
// VIEW AS (ledger 0422): the service role is in one file, for three things.
// Under src/lib/server/view-as/, `SUPABASE_SERVICE_ROLE_KEY` and the service
// client appear only in service.ts, and there only in mintSessionFor,
// revokeSession and createTestUser. Every site read and write elsewhere runs
// on a user's own token. Plus the pure helpers the panel and the hook use.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	clampPosition,
	parseViewAs,
	placePanel,
	positionFrom,
	timeLeft,
	viewAsRefusesRequest,
	type ViewAsState
} from '../src/lib/view-as';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'src/lib/server/view-as');

describe('the view-as service role', () => {
	it('is named in service.ts and nowhere else under view-as', () => {
		const naming = readdirSync(DIR).filter((f) => /SUPABASE_SERVICE_ROLE_KEY|serviceClient\(/.test(readFileSync(join(DIR, f), 'utf8')));
		expect(naming).toEqual(['service.ts']);
	});

	it('is used by exactly the three functions that need it', () => {
		const src = readFileSync(join(DIR, 'service.ts'), 'utf8');
		const fns = [...src.matchAll(/\nexport (?:async )?function ([a-zA-Z]+)[\s\S]*?\n}/g)].map((m) => ({ name: m[1], body: m[0] }));
		const using = fns.filter((f) => f.body.includes('serviceClient()')).map((f) => f.name).sort();
		expect(using).toEqual(['createTestUser', 'mintSessionFor', 'revokeSession']);
		// The one site call made with a token is clientFor's, which carries the user's own token.
		const clientFor = fns.find((f) => f.name === 'clientFor')!.body;
		expect(clientFor).toContain('PUBLIC_SUPABASE_ANON_KEY');
		expect(clientFor).toContain('Bearer ${accessToken}');
	});

	it('is never read by a route', () => {
		const routes = ['src/routes/admin/view-as/+page.server.ts', 'src/routes/admin/test-accounts/+page.server.ts', 'src/routes/view-as/exit/+server.ts',
			'src/routes/api/admin/test-accounts/+server.ts', 'src/routes/api/admin/test-accounts/create/+server.ts', 'src/routes/api/admin/test-accounts/act/+server.ts'];
		for (const r of routes) expect(readFileSync(join(ROOT, r), 'utf8'), r).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|\/service'/);
	});
});

const STATE: ViewAsState = {
	mode: 'view', target_email: 'ana@boscotech.net', target_name: 'Ana', admin_email: 'apina@boscotech.edu', admin_name: 'Mr. Pina',
	started_at: '2026-10-21T10:00:00Z', expires_at: '2026-10-21T13:00:00Z', expired: false, test_account: false, changes: 0
};

describe('view-as helpers', () => {
	it('parses only a real answer', () => {
		expect(parseViewAs(null)).toBeNull();
		expect(parseViewAs({ mode: 'other', target_email: 'x', expires_at: 'y' })).toBeNull();
		expect(parseViewAs({ ...STATE, changes: '3' })?.changes).toBe(3);
		expect(parseViewAs({ ...STATE, target_name: '' })?.target_name).toBe('ana@boscotech.net');
	});

	it('says how long is left', () => {
		const t = Date.parse('2026-10-21T10:46:00Z');
		expect(timeLeft(STATE.expires_at, t)).toBe('2h 14m left');
		expect(timeLeft(STATE.expires_at, Date.parse('2026-10-21T12:51:00Z'))).toBe('9m left');
		expect(timeLeft(STATE.expires_at, Date.parse('2026-10-21T14:00:00Z'))).toBe('ending');
	});

	it('keeps the panel on screen and round-trips a drag', () => {
		expect(clampPosition({ x: 3, y: -1 })).toEqual({ x: 1, y: 0 });
		expect(clampPosition(null)).toEqual({ x: 0.5, y: 0.98 });
		const at = placePanel({ x: 1, y: 1 }, 300, 60, 1440, 900);
		expect(at).toEqual({ left: 1440 - 300 - 8, top: 900 - 60 - 8 });
		expect(placePanel({ x: 0, y: 0 }, 300, 60, 375, 700)).toEqual({ left: 8, top: 8 });
		const p = positionFrom(500, 300, 300, 60, 1440, 900);
		const back = placePanel(p, 300, 60, 1440, 900);
		expect(Math.abs(back.left - 500)).toBeLessThanOrEqual(1);
		expect(Math.abs(back.top - 300)).toBeLessThanOrEqual(1);
	});

	it('refuses the service-role write routes only in a read-only session (both directions)', () => {
		expect(viewAsRefusesRequest(STATE, 'POST', '/api/greenline-track-publish')).toBe(true);
		expect(viewAsRefusesRequest(STATE, 'POST', '/armory/start')).toBe(true);
		expect(viewAsRefusesRequest(STATE, 'GET', '/api/greenline-track-publish')).toBe(false);
		expect(viewAsRefusesRequest(STATE, 'POST', '/api/feedback')).toBe(false);
		expect(viewAsRefusesRequest({ ...STATE, mode: 'act' }, 'POST', '/api/greenline-track-publish')).toBe(false);
		expect(viewAsRefusesRequest({ ...STATE, mode: 'act', expired: true }, 'POST', '/api/armory/x')).toBe(true);
		expect(viewAsRefusesRequest(null, 'POST', '/api/armory/x')).toBe(false);
	});
});
