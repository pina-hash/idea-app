/**
 * The connector's collaborators, gathered in one place so every route is a few
 * lines and a test can hand the REAL handlers a backend over the embedded
 * cluster. The Supabase backend is the only one production ever builds: the
 * local one loads only in dev with CONNECTOR_BACKEND=local-pg and
 * CONNECTOR_LOCAL_PG_URL set (tools/connector/local-backend.mjs sets both up
 * for an MCP Inspector run).
 */
import { randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { createRateLimiter, type RateLimiter } from '$lib/server/rate-limit';
import { supabaseConnectorBackend } from './backend';
import type { ConnectorBackend } from './types';

export interface ConnectorDeps {
	backend: ConnectorBackend;
	now(): number;
	random(n: number): Buffer;
	fetch: typeof fetch;
	limiter: RateLimiter;
}

const limiter = createRateLimiter(60_000);
let local: Promise<ConnectorBackend> | null = null;

export async function connectorDeps(): Promise<ConnectorDeps> {
	let backend: ConnectorBackend;
	if (dev && env.CONNECTOR_BACKEND === 'local-pg' && env.CONNECTOR_LOCAL_PG_URL) {
		local ??= import('./backend-local').then((m) => m.localPgBackendFromUrl(env.CONNECTOR_LOCAL_PG_URL as string));
		backend = await local;
	} else {
		backend = supabaseConnectorBackend();
	}
	return {
		backend,
		now: () => Date.now(),
		random: (n) => randomBytes(n),
		fetch: (...args) => fetch(...args),
		limiter
	};
}
