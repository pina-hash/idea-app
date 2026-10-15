// tests/cert-server-mirror.test.ts
//
// THE FRC MIRROR'S SENDING END (ledger 0391), against a stubbed Techmen client.
// The contract (`frc-app/docs/IDEA_CERTIFICATIONS_SYNC.md`) says where each
// answer lands in supabase-js and the shapes are reproduced here character for
// character: only `error === null && data?.ok === true` is a success, a 422
// arrives AS `error` with `error.error` the problem list, a wrong secret is
// SQLSTATE 28000. The snapshot `cert_mirror_snapshot` answered must reach the
// RPC untouched, and the request body must never reach the log.

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sendMirror, type MirrorDeps } from '../src/lib/server/certifications/mirror';

const URL_ = 'https://techmen-example.supabase.co';
const ANON = 'anon-key-not-real';
const SECRET = 'cafe'.repeat(16);

const snapshot = () => ({
	source_revision: 'idea-certs-2026-10-15T20:00:00Z',
	catalog: [{ code: 'SAFE-1', name: 'Shop Safety', level: 1, category: 'Safety', definition: null, allows: null, does_not_allow: null, prerequisites: [], renewal: null, active: true, sort_order: 1 }],
	holders: [
		{ serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB', email: 'wren.hollis@boscotech.net', holder_name: 'Wren Hollis', code: 'SAFE-1', status: 'active', awarded_at: '2026-10-15T20:00:00Z', awarded_by_name: 'Mr. Pina', expires_at: null },
		{ serial: 'IDEA-AAAA-BBBB-CCCC-DDDD', email: 'casey.r@boscotech.net', holder_name: 'Casey R', code: 'SAFE-1', status: 'revoked', awarded_at: '2026-09-15T16:00:00-07:00', awarded_by_name: 'Mr. Pina', expires_at: null }
	]
});

interface Fake {
	client: SupabaseClient;
	calls: { fn: string; args: unknown }[];
	logs: Record<string, unknown>[];
}

function fakeSupabase(snap: unknown): Fake {
	const calls: Fake['calls'] = [];
	const logs: Record<string, unknown>[] = [];
	const client = {
		rpc: async (fn: string, args?: Record<string, unknown>) => {
			calls.push({ fn, args });
			if (fn === 'cert_mirror_snapshot') return { data: snap, error: null };
			if (fn === 'cert_sync_log_write') {
				logs.push(args?.p as Record<string, unknown>);
				return { data: { ok: true }, error: null };
			}
			return { data: null, error: { message: `unexpected ${fn}` } };
		}
	} as unknown as SupabaseClient;
	return { client, calls, logs };
}

function techmen(answer: { data: unknown; error: unknown; status?: number } | (() => never)) {
	const made: { url: string; key: string; options: unknown }[] = [];
	const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
	const createClient: NonNullable<MirrorDeps['createClient']> = (url, key, options) => {
		made.push({ url, key, options });
		return {
			rpc: async (fn: string, args: Record<string, unknown>) => {
				rpcs.push({ fn, args });
				if (typeof answer === 'function') answer();
				return answer as { data: unknown; error: unknown; status?: number };
			}
		};
	};
	return { createClient, made, rpcs };
}

beforeEach(() => {
	process.env.TECHMEN_SUPABASE_URL = URL_;
	process.env.TECHMEN_SUPABASE_ANON_KEY = ANON;
	process.env.TECHMEN_CERT_SYNC_SECRET = SECRET;
});
afterEach(() => {
	delete process.env.TECHMEN_SUPABASE_URL;
	delete process.env.TECHMEN_SUPABASE_ANON_KEY;
	delete process.env.TECHMEN_CERT_SYNC_SECRET;
});

const noService = { serviceClient: () => null };

describe('sendMirror', () => {
	it('posts the snapshot untouched with the contract\'s client options and logs a success', async () => {
		const snap = snapshot();
		const db = fakeSupabase(snap);
		const remote = techmen({ data: { ok: true, catalog_count: 1, holder_count: 2, synced_at: 'x', log_id: 41 }, error: null, status: 200 });
		let t = 1000;
		const result = await sendMirror('award', db.client, { ...noService, createClient: remote.createClient, now: () => (t += 37) });
		expect(result).toEqual({ ok: true, catalog_count: 1, holder_count: 2, remote_log_id: 41, duration_ms: 37 });
		expect(remote.made).toEqual([{ url: URL_, key: ANON, options: { auth: { persistSession: false } } }]);
		expect(remote.rpcs).toHaveLength(1);
		expect(remote.rpcs[0].fn).toBe('idea_cert_sync');
		expect(remote.rpcs[0].args.p_secret).toBe(SECRET);
		// The very object the function answered, not a copy and not reshaped.
		expect(remote.rpcs[0].args.p_snapshot).toBe(snap);
		expect(remote.rpcs[0].args.p_snapshot).toEqual(snapshot());
		expect(db.logs).toHaveLength(1);
		expect(db.logs[0]).toMatchObject({ trigger: 'award', ok: true, http_status: 200, catalog_count: 1, holder_count: 2, source_revision: snap.source_revision, error: null, remote_log_id: 41 });
		expect(JSON.stringify(db.logs[0])).not.toContain(SECRET);
	});

	it('a refused snapshot (422, the body as error) is logged with the problem list and never the request body', async () => {
		const snap = snapshot();
		const db = fakeSupabase(snap);
		const remote = techmen({ data: null, error: { ok: false, error: '2 problem(s): holders[1] (IDEA-AAAA-BBBB-CCCC-DDDD): status ...', problem_count: 2, log_id: 42 }, status: 422 });
		const result = await sendMirror('catalog', db.client, { ...noService, createClient: remote.createClient });
		expect(result).toMatchObject({ ok: false, reason: 'refused', http_status: 422 });
		if (result.ok) return;
		expect(result.message).toContain('2 problem(s)');
		expect(db.logs[0]).toMatchObject({ trigger: 'catalog', ok: false, http_status: 422, catalog_count: 1, holder_count: 2, remote_log_id: 42 });
		expect(db.logs[0].error).toContain('2 problem(s)');
		expect(JSON.stringify(db.logs[0])).not.toContain(SECRET);
		expect(JSON.stringify(db.logs[0])).not.toContain('wren.hollis');
	});

	it('a wrong secret (SQLSTATE 28000) is reason secret, logged, and the secret is nowhere in the log', async () => {
		const db = fakeSupabase(snapshot());
		const remote = techmen({ data: null, error: { code: '28000', message: 'idea_cert_sync: refused' }, status: 403 });
		const result = await sendMirror('daily', db.client, { ...noService, createClient: remote.createClient });
		expect(result).toMatchObject({ ok: false, reason: 'secret', http_status: 403, message: 'idea_cert_sync: refused' });
		expect(db.logs[0]).toMatchObject({ ok: false, http_status: 403, error: 'idea_cert_sync: refused' });
		expect(JSON.stringify(db.logs)).not.toContain(SECRET);
	});

	it('an unapplied receiving migration is not_set_up, a bad anon key unauthorized, a thrown call network', async () => {
		const a = fakeSupabase(snapshot());
		expect(await sendMirror('daily', a.client, { ...noService, createClient: techmen({ data: null, error: { code: 'PGRST202', message: 'no function' }, status: 404 }).createClient })).toMatchObject({ ok: false, reason: 'not_set_up', http_status: 404 });
		const b = fakeSupabase(snapshot());
		expect(await sendMirror('daily', b.client, { ...noService, createClient: techmen({ data: null, error: { message: 'Invalid API key' }, status: 401 }).createClient })).toMatchObject({ ok: false, reason: 'unauthorized', http_status: 401 });
		const c = fakeSupabase(snapshot());
		const thrown = techmen(() => {
			throw new Error('fetch failed');
		});
		expect(await sendMirror('daily', c.client, { ...noService, createClient: thrown.createClient })).toMatchObject({ ok: false, reason: 'network', message: 'fetch failed' });
		expect(c.logs[0]).toMatchObject({ ok: false, error: 'fetch failed' });
	});

	it('any secret unset is a silent no-op: no client made, no snapshot read, no log row', async () => {
		for (const name of ['TECHMEN_SUPABASE_URL', 'TECHMEN_SUPABASE_ANON_KEY', 'TECHMEN_CERT_SYNC_SECRET']) {
			const saved = process.env[name];
			delete process.env[name];
			const db = fakeSupabase(snapshot());
			const remote = techmen({ data: { ok: true }, error: null });
			expect(await sendMirror('manual', db.client, { ...noService, createClient: remote.createClient })).toEqual({ ok: false, reason: 'not_configured', message: 'The FRC mirror is not configured on this deployment.' });
			expect(remote.made).toHaveLength(0);
			expect(db.calls).toHaveLength(0);
			expect(db.logs).toHaveLength(0);
			process.env[name] = saved;
		}
	});

	it('a snapshot the function refuses is reason snapshot, logged, and nothing is sent', async () => {
		const calls: string[] = [];
		const logs: unknown[] = [];
		const client = {
			rpc: async (fn: string, args?: Record<string, unknown>) => {
				calls.push(fn);
				if (fn === 'cert_mirror_snapshot') return { data: null, error: { code: '42501', message: 'permission denied' } };
				logs.push(args?.p);
				return { data: null, error: null };
			}
		} as unknown as SupabaseClient;
		const remote = techmen({ data: { ok: true }, error: null });
		const result = await sendMirror('award', client, { ...noService, createClient: remote.createClient });
		expect(result).toMatchObject({ ok: false, reason: 'snapshot', message: 'permission denied' });
		expect(remote.made).toHaveLength(0);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toMatchObject({ ok: false, error: 'snapshot: permission denied' });
	});

	it('reads the snapshot on the service client when one exists, so a certifier\'s own client is not asked', async () => {
		const given = fakeSupabase(snapshot());
		const service = fakeSupabase(snapshot());
		const remote = techmen({ data: { ok: true, catalog_count: 1, holder_count: 2, log_id: 1 }, error: null, status: 200 });
		const result = await sendMirror('award', given.client, { createClient: remote.createClient, serviceClient: () => service.client });
		expect(result.ok).toBe(true);
		expect(given.calls).toHaveLength(0);
		expect(service.calls.map((c) => c.fn)).toEqual(['cert_mirror_snapshot', 'cert_sync_log_write']);
	});
});
