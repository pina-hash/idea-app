/**
 * The Armory routes' collaborators, gathered in one place so the route files
 * stay a few lines each and a test can hand the REAL route handlers a fake
 * Supabase (vi.mock of this module) without touching anything else.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createRateLimiter, type RateLimiter } from '$lib/server/rate-limit';
import { supabaseArmoryBackend, type ArmoryBackend } from './backend';
import { armoryStorageConfig, type ArmoryStorageConfig } from './storage';
import type { ArmorySweepDeps } from './sweep';

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

/**
 * What the purge and the sweep need, and nothing else: the R2 configuration,
 * a fetch, a clock and a log line. Deliberately NOT `armoryDeps()`: those two
 * routes run on the caller's own Supabase client and must never reach the
 * backend that holds the service-role key.
 */
export function armorySweepDeps(): ArmorySweepDeps {
	return {
		storage: () => armoryStorageConfig(),
		fetch: (...args) => fetch(...args),
		now: () => Date.now(),
		log: (message) => console.error(message)
	};
}
