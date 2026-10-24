// tests/connector-oauth.test.ts
//
// THE CONNECTOR'S SIGN-IN, driven through the REAL route handlers and the real
// OAuth module over the embedded database (docs/connector/DESIGN.md sections 1
// and 5): both metadata documents, the 401 shape, registration, PKCE failure,
// code reuse, refresh rotation, invalid_grant, revocation, the kill switch, an
// admin taken off the list, and consent answering 404 to a student. The MCP
// round trip at the end is the SDK's own transport answering initialize,
// tools/list and tools/call with the minted user's data.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { connectorWorld, type ConnectorWorld } from './db/connector-fixture';
import { createRateLimiter } from '../src/lib/server/rate-limit';
import type { ConnectorDeps } from '../src/lib/server/connector/deps';
import { s256 } from '../src/lib/server/connector/crypto';
import { clearClientCache, handleRegister, handleRevoke, handleToken, issueCode, validateAuthorize } from '../src/lib/server/connector/oauth';
import { handleMcp, resetMcpCaches } from '../src/lib/server/connector/mcp';

let w: ConnectorWorld;
let deps: ConnectorDeps;

vi.mock('$lib/server/connector/deps', () => ({ connectorDeps: async () => deps }));

const ORIGIN = 'https://ideabosco.test';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

beforeAll(async () => {
	w = await connectorWorld();
	deps = {
		backend: w.backend,
		now: () => Date.now(),
		random: (n) => randomBytes(n),
		fetch: (...a) => fetch(...a),
		limiter: createRateLimiter(60_000)
	};
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

function form(body: Record<string, string>): Request {
	return new Request(`${ORIGIN}/connector/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body).toString()
	});
}

async function register(): Promise<string> {
	const res = await handleRegister(
		new Request(`${ORIGIN}/connector/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK] }) }),
		deps,
		'203.0.113.9'
	);
	expect(res.status).toBe(201);
	return ((await res.json()) as { client_id: string }).client_id;
}

async function code(clientId: string, verifier: string, user = w.admin): Promise<string> {
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: CALLBACK,
		code_challenge: s256(verifier),
		code_challenge_method: 'S256',
		state: 'st-1',
		scope: 'site offline_access',
		resource: `${ORIGIN}/mcp`
	});
	const check = await validateAuthorize(q, ORIGIN, deps);
	if (!check.ok) throw new Error(check.problem);
	const to = new URL(await issueCode({ id: user.id, email: user.email }, check.request, deps));
	expect(to.origin + to.pathname).toBe(CALLBACK);
	expect(to.searchParams.get('state')).toBe('st-1');
	return to.searchParams.get('code') as string;
}

async function exchange(clientId: string, c: string, verifier: string) {
	const res = await handleToken(form({ grant_type: 'authorization_code', code: c, code_verifier: verifier, client_id: clientId, redirect_uri: CALLBACK }), deps);
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function rpc(token: string | null, body: unknown): Request {
	return new Request(`${ORIGIN}/mcp`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			'mcp-protocol-version': '2025-06-18',
			...(token ? { authorization: `Bearer ${token}` } : {})
		},
		body: JSON.stringify(body)
	});
}

const VERIFIER = 'v'.repeat(20) + 'erifier-0123456789-abcdefghijklmn';

describe('metadata and the 401', () => {
	it('serves both metadata documents from the real routes', async () => {
		const pr = await import('../src/routes/.well-known/oauth-protected-resource/mcp/+server');
		const as = await import('../src/routes/.well-known/oauth-authorization-server/+server');
		const prBody = await (await pr.GET({ url: new URL(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`) } as never)).json();
		expect(prBody).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN], scopes_supported: ['site', 'offline_access'], bearer_methods_supported: ['header'] });
		const asBody = await (await as.GET({ url: new URL(`${ORIGIN}/.well-known/oauth-authorization-server`) } as never)).json();
		expect(asBody).toMatchObject({
			issuer: ORIGIN,
			authorization_endpoint: `${ORIGIN}/connector/authorize`,
			token_endpoint: `${ORIGIN}/connector/token`,
			registration_endpoint: `${ORIGIN}/connector/register`,
			revocation_endpoint: `${ORIGIN}/connector/revoke`,
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
			client_id_metadata_document_supported: true
		});
	});

	it('answers a request with no bearer 401, pointing at the resource metadata', async () => {
		const route = await import('../src/routes/mcp/+server');
		const res = await route.POST({ request: rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' }), url: new URL(`${ORIGIN}/mcp`) } as never);
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
	});

	it('the practice endpoint answers 401 with its OWN metadata, which names /mcp/practice as the resource under the same sign-in', async () => {
		const route = await import('../src/routes/mcp/practice/+server');
		const res = await route.POST({ request: rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' }), url: new URL(`${ORIGIN}/mcp/practice`) } as never);
		expect(res.status).toBe(401);
		const pointer = /resource_metadata="([^"]+)"/.exec(res.headers.get('www-authenticate') ?? '')?.[1];
		expect(pointer).toBe(`${ORIGIN}/mcp/practice/oauth-protected-resource`);
		const meta = await import('../src/routes/mcp/practice/oauth-protected-resource/+server');
		const body = await (await meta.GET({ url: new URL(pointer!) } as never)).json();
		expect(body).toMatchObject({ resource: `${ORIGIN}/mcp/practice`, authorization_servers: [ORIGIN] });
		// The real connector's metadata still names /mcp.
		const real = await import('../src/routes/.well-known/oauth-protected-resource/mcp/+server');
		expect((await (await real.GET({ url: new URL(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`) } as never)).json()).resource).toBe(`${ORIGIN}/mcp`);
	});

	it('refuses a registration that would send codes anywhere but Claude or this computer', async () => {
		const res = await handleRegister(
			new Request(`${ORIGIN}/connector/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }) }),
			deps,
			'203.0.113.10'
		);
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toBe('invalid_redirect_uri');
	});
});

describe('the code and the tokens', () => {
	let clientId: string;
	let access: string;
	let refresh: string;

	beforeAll(async () => {
		clientId = await register();
	});

	it('a wrong PKCE verifier is invalid_grant, and the code is gone afterwards', async () => {
		const c = await code(clientId, VERIFIER);
		const bad = await exchange(clientId, c, 'x'.repeat(50));
		expect(bad).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
		const after = await exchange(clientId, c, VERIFIER);
		expect(after).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
	});

	it('a good exchange issues opaque tokens once; reusing the code is invalid_grant', async () => {
		const c = await code(clientId, VERIFIER);
		const ok = await exchange(clientId, c, VERIFIER);
		expect(ok.status).toBe(200);
		expect(ok.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
		access = ok.body.access_token as string;
		refresh = ok.body.refresh_token as string;
		expect(access).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const stored = await w.db.sql(`select access_hash, refresh_hash from public.connector_tokens where email = $1`, [w.admin.email]);
		expect(JSON.stringify(stored.rows)).not.toContain(access);
		const again = await exchange(clientId, c, VERIFIER);
		expect(again).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
	});

	it('answers MCP initialize, tools/list and tools/call as the connected admin', async () => {
		resetMcpCaches();
		const init = await handleMcp(rpc(access, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }), ORIGIN, deps);
		expect(init.status).toBe(200);
		expect(init.headers.get('mcp-session-id')).toBeNull();
		const initBody = (await init.json()) as { result: { serverInfo: { name: string } } };
		expect(initBody.result.serverInfo.name).toBe('IDEA Website');
		const list = (await (await handleMcp(rpc(access, { jsonrpc: '2.0', id: 2, method: 'tools/list' }), ORIGIN, deps)).json()) as { result: { tools: Array<{ name: string }> } };
		const names = list.result.tools.map((t) => t.name);
		expect(names).toEqual(expect.arrayContaining(['coin_transact', 'mark_feedback', 'create_post', 'find_student', 'site_call', 'site_find_tool', 'undo_last']));
		const call = (await (await handleMcp(rpc(access, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_classes', arguments: {} } }), ORIGIN, deps)).json()) as { result: { content: Array<{ text: string }> } };
		expect(JSON.parse(call.result.content[0].text).classes.map((c: { class: string }) => c.class).sort()).toEqual(['IDEA209H · Block 2', 'IDEA209H · Block 4']);
	});

	it('a refresh rotates both tokens; the old refresh token is then invalid_grant and the old access token 401', async () => {
		const res = await handleToken(form({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }), deps);
		expect(res.status).toBe(200);
		const next = (await res.json()) as { access_token: string; refresh_token: string };
		expect(next.refresh_token).not.toBe(refresh);
		const stale = await handleToken(form({ grant_type: 'refresh_token', refresh_token: refresh }), deps);
		expect(stale.status).toBe(400);
		expect(((await stale.json()) as { error: string }).error).toBe('invalid_grant');
		const oldAccess = await handleMcp(rpc(access, { jsonrpc: '2.0', id: 4, method: 'tools/list' }), ORIGIN, deps);
		expect(oldAccess.status).toBe(401);
		access = next.access_token;
		refresh = next.refresh_token;
		const rotations = await w.db.sql(`select rotations from public.connector_tokens where email = $1 and revoked_at is null`, [w.admin.email]);
		expect(rotations.rows.map((r) => r.rotations)).toContain(1);
	});

	it('the kill switch answers 401 while off and nothing once back on', async () => {
		await w.db.sql(`update public.connector_settings set enabled = false`);
		const off = await handleMcp(rpc(access, { jsonrpc: '2.0', id: 5, method: 'tools/list' }), ORIGIN, deps);
		expect(off.status).toBe(401);
		expect(off.headers.get('www-authenticate')).toContain('switched off');
		await w.db.sql(`update public.connector_settings set enabled = true`);
		const on = await handleMcp(rpc(access, { jsonrpc: '2.0', id: 6, method: 'tools/list' }), ORIGIN, deps);
		expect(on.status).toBe(200);
	});

	it('revocation answers 200 and the token then answers 401; an unknown token is also 200', async () => {
		const res = await handleRevoke(form({ token: refresh }), deps);
		expect(res.status).toBe(200);
		const after = await handleMcp(rpc(access, { jsonrpc: '2.0', id: 7, method: 'tools/list' }), ORIGIN, deps);
		expect(after.status).toBe(401);
		const unknown = await handleRevoke(form({ token: 'nothing-like-a-token' }), deps);
		expect(unknown.status).toBe(200);
		const dead = await handleToken(form({ grant_type: 'refresh_token', refresh_token: refresh }), deps);
		expect(dead.status).toBe(400);
	});

	it('an admin taken off the list is refused on the next call and the connection is revoked', async () => {
		const c = await code(clientId, VERIFIER);
		const ok = await exchange(clientId, c, VERIFIER);
		resetMcpCaches();
		await w.db.sql(`delete from public.app_admins where email = $1`, [w.admin.email]);
		try {
			const res = await handleMcp(rpc(ok.body.access_token as string, { jsonrpc: '2.0', id: 8, method: 'tools/list' }), ORIGIN, deps);
			expect(res.status).toBe(401);
			const row = await w.db.sql(`select revoked_by from public.connector_tokens where revoked_at is not null order by revoked_at desc limit 1`);
			expect(row.rows[0].revoked_by).toBe('no longer a site admin');
		} finally {
			await w.db.sql(`insert into public.app_admins (email, granted_by) values ($1, 'test')`, [w.admin.email]);
		}
	});
});

describe('consent', () => {
	async function loadAs(claims: { sub: string; email: string } | null, isAdmin: boolean) {
		const page = await import('../src/routes/connector/authorize/+page.server');
		const clientId = await register();
		const url = new URL(`${ORIGIN}/connector/authorize`);
		for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: s256(VERIFIER), code_challenge_method: 'S256', state: 's' })) url.searchParams.set(k, v);
		const locals = { claims, supabase: { rpc: async () => ({ data: isAdmin, error: null }) } };
		return page.load({ url, locals } as never);
	}

	it('answers 404 to a student session and renders the card for an admin', async () => {
		await expect(loadAs({ sub: w.student.id, email: w.student.email }, false)).rejects.toMatchObject({ status: 404 });
		const admin = (await loadAs({ sub: w.admin.id, email: w.admin.email }, true)) as { request: { clientName: string; redirectHost: string } };
		expect(admin.request).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai' });
	});

	it('shows a signed-out visitor the sign-in panel, never a 404 and never a redirect', async () => {
		const out = (await loadAs(null, false)) as { signedIn: boolean; request: unknown };
		expect(out.signedIn).toBe(false);
		expect(out.request).not.toBeNull();
	});

	it('refuses an authorize request for an unknown client on the page, never redirecting', async () => {
		clearClientCache();
		const q = new URLSearchParams({ response_type: 'code', client_id: 'nobody', redirect_uri: CALLBACK, code_challenge: s256(VERIFIER), code_challenge_method: 'S256' });
		const check = await validateAuthorize(q, ORIGIN, deps);
		expect(check.ok).toBe(false);
		expect('redirect' in check ? check.redirect : undefined).toBeUndefined();
	});
});
