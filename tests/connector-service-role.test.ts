// tests/connector-service-role.test.ts
//
// THE SERVICE ROLE IS IN ONE FILE, FOR TWO THINGS (docs/connector/DESIGN.md
// section 1). Under src/lib/server/connector/, `SUPABASE_SERVICE_ROLE_KEY` and
// the service client appear only in backend.ts, and there only inside the
// connector_* table functions and `mintSession`; every call that touches
// student data goes through `rpc` and `select`, which build the USER's client.
// The routes never read the key at all.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'src/lib/server/connector');

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? files(p) : [p];
	});
}

/** A function body by its key in the backend's object literal, up to the next method. */
function method(src: string, name: string): string {
	const start = src.search(new RegExp(`\\n\\t\\tasync ${name}\\b`));
	if (start < 0) return '';
	const rest = src.slice(start + 1);
	const next = rest.slice(1).search(/\n\t\tasync [a-zA-Z]+(<[^>]*>)?\(/);
	return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('the connector\'s service role', () => {
	const code = files(DIR).filter((f) => /\.(ts|js|svelte)$/.test(f));

	it('is named in backend.ts and nowhere else under the connector', () => {
		const naming = code.filter((f) => /SUPABASE_SERVICE_ROLE_KEY|serviceClient\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(DIR.length + 1));
		expect(naming).toEqual(['backend.ts']);
	});

	it('is used only by the connector_* table functions and mintSession, never by rpc or select', () => {
		const src = readFileSync(join(DIR, 'backend.ts'), 'utf8');
		const methods = [...src.matchAll(/\n\t\tasync ([a-zA-Z]+)/g)].map((m) => m[1]);
		expect(methods.length).toBeGreaterThan(15);
		const using = methods.filter((m) => method(src, m).includes('serviceClient()'));
		const allowed = [
			'enabled', 'findClient', 'registerClient', 'storeCode', 'takeCode', 'createToken', 'tokenByAccess', 'rotate',
			'revokeByHash', 'revokeToken', 'touchToken', 'storeConfirmation', 'takeConfirmation', 'syncRegistry',
			'setAuditUndo', 'undoCandidates', 'mintSession', 'createUpload', 'storeUploadPart', 'readUpload', 'replayState', 'recordReplay'
		];
		expect(using.filter((m) => !allowed.includes(m))).toEqual([]);
		expect(using.length).toBeGreaterThanOrEqual(10);
		for (const m of ['rpc', 'select']) {
			const body = method(src, m);
			expect(body.length, `found ${m}`).toBeGreaterThan(0);
			expect(body).not.toContain('serviceClient');
			expect(body).toContain('userClient(session.accessToken)');
		}
		// Every service-role table read or write names a connector_ table.
		const tables = [...src.matchAll(/serviceClient\(\)[\s\n]*\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
		expect(tables.length).toBeGreaterThan(10);
		expect(tables.filter((t) => !t.startsWith('connector_'))).toEqual([]);
		// The one bucket it touches is the chat-upload bucket (0290, ledger 0422).
		const buckets = [...src.matchAll(/serviceClient\(\)\s*\.storage\.from\(([A-Za-z_']+)\)/g)].map((m) => m[1]);
		expect(buckets.length).toBeGreaterThanOrEqual(2);
		expect(new Set(buckets)).toEqual(new Set(['CONNECTOR_UPLOAD_BUCKET']));
	});

	it('is never read by a connector route', () => {
		const routes = ['src/routes/mcp', 'src/routes/connector', 'src/routes/.well-known', 'src/routes/admin/connector'].flatMap((d) => files(join(ROOT, d)));
		expect(routes.length).toBeGreaterThanOrEqual(9);
		expect(routes.filter((f) => /SUPABASE_SERVICE_ROLE_KEY|dynamic\/private/.test(readFileSync(f, 'utf8')))).toEqual([]);
	});
});
