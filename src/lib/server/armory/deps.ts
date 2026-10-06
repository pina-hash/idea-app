/**
 * The Armory routes' collaborators, gathered in one place so the route files
 * stay a few lines each and a test can hand the REAL route handlers a fake
 * Supabase (vi.mock of this module) without touching anything else.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createRateLimiter, type RateLimiter } from '$lib/server/rate-limit';
import { supabaseArmoryBackend, type ArmoryBackend } from './backend';
import { armoryStorageConfig, type ArmoryStorageConfig } from './storage';

export interface ConnectRateLimits {
	startPerIp: number;
	startPerUser: number;
	exchangePerIp: number;
	exchangePerUser: number;
}

/** Ten a minute on each axis: the agent's fake site's defaults (FakeIdeaBosco.ConnectRateLimits). */
export const DEFAULT_CONNECT_LIMITS: ConnectRateLimits = {
	startPerIp: 10,
	startPerUser: 10,
	exchangePerIp: 10,
	exchangePerUser: 10
};

export interface ArmoryDeps {
	backend: ArmoryBackend;
	storage(): ArmoryStorageConfig | null;
	now(): number;
	limiter: RateLimiter;
	limits: ConnectRateLimits;
	fetch: typeof fetch;
	randomBytes(n: number): Buffer;
	uuid(): string;
}

const limiter = createRateLimiter(60_000);

export function armoryDeps(): ArmoryDeps {
	return {
		backend: supabaseArmoryBackend(),
		storage: () => armoryStorageConfig(),
		now: () => Date.now(),
		limiter,
		limits: DEFAULT_CONNECT_LIMITS,
		fetch: (...args) => fetch(...args),
		randomBytes: (n) => randomBytes(n),
		uuid: () => randomUUID()
	};
}
