/**
 * POST /mcp: THE CONNECTOR'S MCP ENDPOINT. Streamable HTTP, stateless, JSON
 * responses, no session ids: every request stands alone, which is what a
 * serverless function can serve. The SDK's web-standard transport
 * (`WebStandardStreamableHTTPServerTransport`, @modelcontextprotocol/sdk 1.32)
 * does the protocol; this file does who, and whether.
 *
 * On every request, before any tool runs:
 *   1. the bearer must name a live connection (no bearer, unknown, expired or
 *      revoked: 401 with the resource-metadata pointer, so Claude signs in);
 *   2. the switch on /admin/connector must be on (off: 401);
 *   3. the connection's user, AS THEMSELVES, must still be a site admin
 *      (`is_admin()` through the minted session); an address taken off the
 *      admin list has its connection revoked here and answers 401.
 * There is no identity constant anywhere: any admin may connect and each acts
 * as themselves.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { sha256Hex } from './crypto';
import type { ConnectorDeps } from './deps';
import { json, wwwAuthenticate } from './oauth';
import { registryRows, toolList } from './registry';
import { runTool, UnknownTool } from './tools';
import { ConnectorUnavailable, type ConnectorBackend, type TokenRow, type UserSession } from './types';

export const MCP_INSTRUCTIONS = [
	'This is the IDEA Website (ideabosco.com). Every call acts as the signed-in site admin, with exactly their permissions, and every change lands in the site\'s own records as theirs.',
	'Send a fresh random request_id with every change he asks for, and reuse it unchanged only when retrying that same change; pass again: true only when he asks for the same thing twice on purpose.',
	'When a tool answers ambiguous, not_found or needs_category, nothing was changed: ask him the one question it names.',
	'A change that asks first returns a preview and a confirm_token: read the preview to him and send the confirm_token only after he says yes.',
	'Running a live tournament (advancing matches, entering scores) is not available here; it stays on the site.'
].join(' ');

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, OPTIONS',
	'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
	'access-control-expose-headers': 'www-authenticate, mcp-session-id'
};

function withCors(res: Response): Response {
	const headers = new Headers(res.headers);
	for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function unauthorized(origin: string, error?: { code: string; description: string }): Response {
	return withCors(
		json(401, error ? { error: error.code, error_description: error.description } : { error: 'unauthorized', error_description: 'Sign in to use the IDEA Website connector.' }, {
			'www-authenticate': wwwAuthenticate(origin, error)
		})
	);
}

// Minted sessions, in process memory only and never stored, keyed by connection.
const sessions = new Map<string, UserSession>();
const SESSION_MARGIN_MS = 60_000;
const TOUCH_EVERY_MS = 60_000;
const SYNC_EVERY_MS = 10 * 60_000;
const synced = new Map<string, number>();

/** For tests: forget minted sessions and registry syncs. */
export function resetMcpCaches(): void {
	sessions.clear();
	synced.clear();
}

async function sessionFor(backend: ConnectorBackend, token: TokenRow, now: number): Promise<UserSession> {
	const cached = sessions.get(token.id);
	if (cached && cached.user.id === token.userId && cached.expiresAt - SESSION_MARGIN_MS > now) return cached;
	const minted = await backend.mintSession({ id: token.userId, email: token.email });
	sessions.set(token.id, minted);
	return minted;
}

async function syncRegistry(backend: ConnectorBackend, now: number): Promise<void> {
	const last = synced.get(backend.kind) ?? 0;
	if (now - last < SYNC_EVERY_MS) return;
	await backend.syncRegistry(registryRows());
	synced.set(backend.kind, now);
}

function bearerOf(request: Request): string | null {
	const m = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i.exec(request.headers.get('authorization') ?? '');
	return m ? m[1] : null;
}

const ERROR_STATUSES = new Set(['refused', 'invalid', 'needs_confirmation', 'not_available']);

export async function handleMcp(request: Request, origin: string, deps: ConnectorDeps): Promise<Response> {
	if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (request.method !== 'POST') {
		return withCors(json(405, { error: 'method_not_allowed', error_description: 'This MCP endpoint takes POST only.' }, { allow: 'POST, OPTIONS' }));
	}
	const now = deps.now();
	const bearer = bearerOf(request);
	if (!bearer) return unauthorized(origin);

	let token: TokenRow | null;
	let session: UserSession;
	try {
		token = await deps.backend.tokenByAccess(sha256Hex(bearer));
		if (!token || token.revokedAt !== null || token.accessExpiresAt <= now) {
			return unauthorized(origin, { code: 'invalid_token', description: 'This connection is signed out or expired.' });
		}
		if (!(await deps.backend.enabled())) {
			return unauthorized(origin, {
				code: 'invalid_token',
				description: 'The IDEA Website connector is switched off. Switch it on at ideabosco.com/admin/connector.'
			});
		}
		session = await sessionFor(deps.backend, token, now);
		const admin = await deps.backend.rpc<boolean>(session, 'is_admin', {});
		if (admin.error) throw new ConnectorUnavailable(admin.error.message);
		if (admin.data !== true) {
			sessions.delete(token.id);
			await deps.backend.revokeToken(token.id, 'no longer a site admin');
			return unauthorized(origin, { code: 'invalid_token', description: 'This account is not a site admin.' });
		}
		if (!token.lastUsedAt || now - token.lastUsedAt > TOUCH_EVERY_MS) await deps.backend.touchToken(token.id, now);
		await syncRegistry(deps.backend, now);
	} catch (e) {
		if (e instanceof ConnectorUnavailable) {
			return withCors(json(503, { error: 'temporarily_unavailable', error_description: 'The site could not be reached. Try again.' }));
		}
		throw e;
	}

	const liveToken = token;
	const server = new Server({ name: 'IDEA Website', version: '1.0.0' }, { capabilities: { tools: { listChanged: false } }, instructions: MCP_INSTRUCTIONS });
	server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList() }));
	server.setRequestHandler(CallToolRequestSchema, async (req) => {
		const ctx = { backend: deps.backend, session, token: liveToken, now: deps.now, random: deps.random, cache: new Map() };
		try {
			const out = await runTool(ctx, req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
			return {
				content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
				isError: ERROR_STATUSES.has(String(out.status))
			};
		} catch (e) {
			if (e instanceof UnknownTool) throw new McpError(ErrorCode.InvalidParams, e.message);
			if (e instanceof ConnectorUnavailable) {
				return { content: [{ type: 'text' as const, text: 'The site could not be reached. Nothing was changed. Try again in a moment.' }], isError: true };
			}
			throw e;
		}
	});
	const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
	await server.connect(transport);
	try {
		return withCors(await transport.handleRequest(request));
	} finally {
		await server.close().catch(() => undefined);
	}
}
