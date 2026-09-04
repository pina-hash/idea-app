/**
 * THE PUBLIC VIEWER'S TRANSPORTS, against a recording client.
 *
 * The DATABASE half of these paths is proved in
 * `tests/db/maps-viewer-anonymous.test.ts` against a real Postgres with the
 * real policies. What is proved here is what the MODULE does with the answer
 * -- the half the PostgREST shim cannot reach, because it models `select` and
 * `rpc` and no write verb at all.
 *
 * THE MISS LOG IS THE REASON THIS FILE EXISTS. It is best-effort
 * instrumentation on a surface that must never notice it, so its failure is
 * unreportable BY DESIGN -- which means nothing on screen would ever tell
 * anybody it had started throwing. That is exactly the silent regression an
 * automated test is for.
 */

import { describe, expect, it, vi } from 'vitest';
import { mapsViewerTransports, type MapsPublicClient } from '$lib/maps/transports';

interface Recorded {
	table: string;
	values: Record<string, unknown>;
}

function recordingClient(options: {
	rpc?: (name: string, args?: Record<string, unknown>) => { data: unknown; error: unknown };
	insert?: (table: string, values: Record<string, unknown>) => void;
} = {}) {
	const inserts: Recorded[] = [];
	const rpcCalls: { name: string; args?: Record<string, unknown> }[] = [];
	const client = {
		from(table: string) {
			return {
				insert(values: Record<string, unknown>) {
					options.insert?.(table, values);
					inserts.push({ table, values });
					return Promise.resolve({ data: null, error: null });
				},
				select() {
					return Promise.resolve({ data: [], error: null });
				}
			};
		},
		rpc(name: string, args?: Record<string, unknown>) {
			rpcCalls.push({ name, args });
			return Promise.resolve(options.rpc?.(name, args) ?? { data: [], error: null });
		}
	};
	return { client: client as unknown as MapsPublicClient, inserts, rpcCalls };
}

describe('search', () => {
	it('calls maps_search by its real name and parameters', async () => {
		const { client, rpcCalls } = recordingClient();
		await mapsViewerTransports(client).search('caliper', 5);
		expect(rpcCalls).toEqual([{ name: 'maps_search', args: { p_query: 'caliper', p_limit: 5 } }]);
	});

	it('answers an empty array rather than null when the function returns nothing', async () => {
		const { client } = recordingClient({ rpc: () => ({ data: null, error: null }) });
		const outcome = await mapsViewerTransports(client).search('nothing');
		expect(outcome.ok).toBe(true);
		if (outcome.ok) expect(outcome.data).toEqual([]);
	});

	it('reports a failure in the reader\'s terms, and marks a transient one retryable', async () => {
		const permanent = recordingClient({
			rpc: () => ({ data: null, error: { code: '42501', message: 'permission denied' } })
		});
		const transient = recordingClient({
			rpc: () => ({ data: null, error: { code: '40001', message: 'serialization failure' } })
		});
		const a = await mapsViewerTransports(permanent.client).search('x');
		const b = await mapsViewerTransports(transient.client).search('x');
		expect(a.ok).toBe(false);
		expect(b.ok).toBe(false);
		if (a.ok || b.ok) return;
		// The map is not gone; the search did not run. The sentence says which,
		// so nobody reloads the page over it -- and it names neither our tables
		// nor Postgres.
		expect(a.message).toBe('The search did not run. Try again in a moment.');
		expect(a.message).not.toMatch(/permission|maps_|postgres/i);
		expect(a.retryable).toBe(false);
		expect(b.retryable).toBe(true);
	});
});

describe('the miss log', () => {
	it('writes the query and the count to maps_search_log', async () => {
		const { client, inserts } = recordingClient();
		await mapsViewerTransports(client).log?.('  hex key  ', 3);
		expect(inserts).toEqual([
			{ table: 'maps_search_log', values: { query: 'hex key', result_count: 3 } }
		]);
	});

	it('clamps to what the column accepts rather than sending a refusal', async () => {
		const { client, inserts } = recordingClient();
		const tx = mapsViewerTransports(client);
		// 0162 caps `query` at 400 characters and refuses a blank; `result_count`
		// must be a non-negative integer. Sending a value the CHECK would refuse
		// is a throw on a surface that must not notice one.
		await tx.log?.('x'.repeat(1000), 4.7);
		await tx.log?.('   ', 0);
		expect(inserts).toHaveLength(1);
		expect((inserts[0].values.query as string).length).toBe(400);
		expect(inserts[0].values.result_count).toBe(4);
		// A negative count is the other end of the same CHECK.
		await tx.log?.('real query', -1);
		expect(inserts[1].values.result_count).toBe(0);
	});

	it('swallows a throw, because the search must not be able to fail on the log', async () => {
		const boom = {
			from() {
				throw new Error('storage is on fire');
			},
			rpc() {
				return Promise.resolve({ data: [], error: null });
			}
		} as unknown as MapsPublicClient;
		await expect(mapsViewerTransports(boom).log?.('anything', 1)).resolves.toBeUndefined();
	});

	it('never asks for the row back, because anon holds INSERT and no SELECT', async () => {
		// `.select()` after an insert is what PostgREST turns into a RETURNING,
		// and `anon` has no select grant on this table -- so asking would turn
		// every logged query into a permission error nobody would ever see.
		const select = vi.fn();
		const client = {
			from() {
				return {
					insert: () => Promise.resolve({ data: null, error: null }),
					select
				};
			},
			rpc: () => Promise.resolve({ data: [], error: null })
		} as unknown as MapsPublicClient;
		await mapsViewerTransports(client).log?.('q', 0);
		expect(select).not.toHaveBeenCalled();
	});
});
