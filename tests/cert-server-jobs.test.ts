// tests/cert-server-jobs.test.ts
//
// THE SCHEDULED JOBS AND THEIR DOOR (ledger 0391, DECISIONS D4). The audit
// found the repository's existing cron route checks NOTHING, so what is pinned
// here is the convention this route adopted instead: Vercel's own CRON_SECRET
// bearer when set, open when unset, a signed-in admin always. Plus vercel.json:
// the four entries are there and the autopay entry is byte-identical.

import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushHooks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('$lib/server/push', () => ({
	serviceClient: () => pushHooks.client,
	pushConfigured: () => false,
	sendPushToUsers: async () => 0
}));
vi.mock('$lib/server/admin', () => ({ isAdmin: async (_c: unknown, uid?: string | null) => uid === 'admin-uid' }));

const { CERT_JOBS, EMAIL_FLUSH_LIMIT, isCertJob, resetThrottle, runCertJob, schedulerAuthorized, throttled } = await import('../src/lib/server/certifications/jobs');
const { GET } = await import('../src/routes/api/certifications/jobs/[job]/+server');

function req(headers: Record<string, string> = {}): Request {
	return new Request('https://ideabosco.com/api/certifications/jobs/mirror', { headers });
}

function fakeAdmin(answers: Record<string, unknown>): { client: SupabaseClient; calls: { fn: string; args: unknown }[] } {
	const calls: { fn: string; args: unknown }[] = [];
	const client = {
		rpc: async (fn: string, args?: unknown) => {
			calls.push({ fn, args });
			const a = answers[fn];
			if (a instanceof Error) return { data: null, error: { code: '42501', message: a.message } };
			return { data: a ?? null, error: null };
		}
	} as unknown as SupabaseClient;
	return { client, calls };
}

beforeEach(() => {
	resetThrottle();
	delete process.env.CRON_SECRET;
});
afterEach(() => {
	delete process.env.CRON_SECRET;
	pushHooks.client = null;
});

describe('schedulerAuthorized', () => {
	it('is open when CRON_SECRET is unset, the autopay route\'s shape', () => {
		expect(schedulerAuthorized(req(), undefined)).toBe(true);
		expect(schedulerAuthorized(req(), '')).toBe(true);
	});
	it('requires Vercel\'s bearer header when CRON_SECRET is set', () => {
		expect(schedulerAuthorized(req({ authorization: 'Bearer s3cret' }), 's3cret')).toBe(true);
		expect(schedulerAuthorized(req({ authorization: 'bearer s3cret' }), 's3cret')).toBe(true);
		expect(schedulerAuthorized(req(), 's3cret')).toBe(false);
		expect(schedulerAuthorized(req({ authorization: 'Bearer wrong' }), 's3cret')).toBe(false);
		expect(schedulerAuthorized(req({ authorization: 'Bearer s3cre' }), 's3cret')).toBe(false);
		expect(schedulerAuthorized(req({ authorization: 's3cret' }), 's3cret')).toBe(false);
	});
	it('reads CRON_SECRET from the environment at call time', () => {
		process.env.CRON_SECRET = 'live';
		expect(schedulerAuthorized(req())).toBe(false);
		expect(schedulerAuthorized(req({ authorization: 'Bearer live' }))).toBe(true);
	});
});

describe('throttle', () => {
	it('lets a job run once a minute per instance', () => {
		expect(throttled('dormant', 1_000)).toBe(false);
		expect(throttled('dormant', 30_000)).toBe(true);
		expect(throttled('expiry', 30_000)).toBe(false);
		expect(throttled('dormant', 61_001)).toBe(false);
	});
});

describe('runCertJob', () => {
	it('names exactly the four jobs plus the combined daily one', () => {
		expect([...CERT_JOBS]).toEqual(['mirror', 'dormant', 'expiry', 'emails', 'daily']);
		expect(isCertJob('daily')).toBe(true);
		expect(isCertJob('mirror')).toBe(true);
		expect(isCertJob('nope')).toBe(false);
		expect(isCertJob(undefined)).toBe(false);
	});

	it('dormant calls cert_sweep_dormant and answers the count', async () => {
		const db = fakeAdmin({ cert_sweep_dormant: { ok: true, marked: 3 } });
		expect(await runCertJob('dormant', db.client, 'https://ideabosco.com')).toEqual({ ok: true, job: 'dormant', marked: 3 });
	});

	it('expiry sends the reminders it is handed, on the admin client, over both channels', async () => {
		const notify = { ok: true, notify: [{ id: 'x' }] };
		const db = fakeAdmin({ cert_expiry_reminders: notify });
		const seen: unknown[] = [];
		const summary = await runCertJob('expiry', db.client, 'https://ideabosco.com', {
			sendCertNotifications: async (rows, origin, client, d) => {
				seen.push({ rows, origin, same: client === db.client, channels: d?.channels });
				return { attempted: 1, emailed: 1, pushed: 0, notified: 1, unstamped: 0, errors: 0 };
			}
		});
		expect(summary).toMatchObject({ ok: true, job: 'expiry', reminders: 1, emailed: 1, notified: 1 });
		expect(seen).toEqual([{ rows: notify.notify, origin: 'https://ideabosco.com', same: true, channels: undefined }]);
	});

	it('emails flushes cert_notifications_unsent over EMAIL ONLY', async () => {
		const unsent = [{ id: 'a' }, { id: 'b' }];
		const db = fakeAdmin({ cert_notifications_unsent: unsent });
		const seen: unknown[] = [];
		const summary = await runCertJob('emails', db.client, 'https://ideabosco.com', {
			sendCertNotifications: async (rows, _o, _c, d) => {
				seen.push({ rows, channels: d?.channels });
				return { attempted: 2, emailed: 2, pushed: 0, notified: 2, unstamped: 0, errors: 0 };
			}
		});
		expect(db.calls[0]).toEqual({ fn: 'cert_notifications_unsent', args: { p_limit: EMAIL_FLUSH_LIMIT } });
		expect(summary).toMatchObject({ ok: true, job: 'emails', pending: 2, emailed: 2 });
		expect(seen).toEqual([{ rows: unsent, channels: ['email'] }]);
	});

	it('mirror resyncs with trigger daily', async () => {
		const db = fakeAdmin({});
		const triggers: string[] = [];
		const summary = await runCertJob('mirror', db.client, 'https://ideabosco.com', {
			sendMirror: async (t) => (triggers.push(t), { ok: true, catalog_count: 1, holder_count: 2, remote_log_id: 5, duration_ms: 10 })
		});
		expect(triggers).toEqual(['daily']);
		expect(summary).toMatchObject({ ok: true, job: 'mirror', catalog_count: 1, holder_count: 2 });
	});

	it('daily runs mirror, dormant, expiry and emails in that order under one answer', async () => {
		const db = fakeAdmin({ cert_sweep_dormant: { ok: true, marked: 1 }, cert_expiry_reminders: { ok: true, notify: [] }, cert_notifications_unsent: [] });
		const order: string[] = [];
		const summary = await runCertJob('daily', db.client, 'https://ideabosco.com', {
			sendMirror: async (t) => (order.push('mirror:' + t), { ok: true, catalog_count: 0, holder_count: 0, remote_log_id: null, duration_ms: 1 }),
			sendCertNotifications: async (rows, _o, _c, d) => {
				order.push('notify:' + (d?.channels?.join(',') ?? 'both') + ':' + (Array.isArray(rows) ? rows.length : -1));
				return { attempted: 0, emailed: 0, pushed: 0, notified: 0, unstamped: 0, errors: 0 };
			}
		});
		expect(order).toEqual(['mirror:daily', 'notify:both:0', 'notify:email:0']);
		expect(db.calls.map((c) => c.fn)).toEqual(['cert_sweep_dormant', 'cert_expiry_reminders', 'cert_notifications_unsent']);
		expect(summary).toMatchObject({ ok: true, job: 'daily' });
		const steps = (summary as unknown as { steps: Record<string, { ok: boolean; job: string }> }).steps;
		expect(Object.keys(steps)).toEqual(['mirror', 'dormant', 'expiry', 'emails']);
		expect(steps.dormant).toMatchObject({ ok: true, marked: 1 });
	});

	it('a refused function is ok false with the code, never a throw', async () => {
		const db = fakeAdmin({ cert_sweep_dormant: new Error('permission denied') });
		expect(await runCertJob('dormant', db.client, 'x')).toEqual({ ok: false, job: 'dormant', reason: 'rpc_error', code: '42501', message: 'permission denied' });
	});
});

describe('the jobs route', () => {
	const locals = (claims: { sub: string } | null) => ({ supabase: {} as SupabaseClient, claims });
	const event = (job: string, claims: { sub: string } | null, headers: Record<string, string> = {}) =>
		({ params: { job }, request: req(headers), url: new URL(`https://ideabosco.com/api/certifications/jobs/${job}`), locals: locals(claims) }) as unknown as Parameters<typeof GET>[0];

	it('an unknown job is 404 before anything is read', async () => {
		expect((await GET(event('nope', null))).status).toBe(404);
	});

	it('a non-admin with a wrong bearer is 404; with no secret set the scheduler path is open and the missing service client is 503', async () => {
		process.env.CRON_SECRET = 'live';
		expect((await GET(event('dormant', { sub: 'student' }, { authorization: 'Bearer wrong' }))).status).toBe(404);
		delete process.env.CRON_SECRET;
		const res = await GET(event('dormant', null));
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ ok: false, job: 'dormant', reason: 'not_configured' });
	});

	it('an admin runs a job on the service client and is never throttled', async () => {
		const db = fakeAdmin({ cert_sweep_dormant: { ok: true, marked: 1 } });
		pushHooks.client = db.client;
		process.env.CRON_SECRET = 'live';
		const first = await GET(event('dormant', { sub: 'admin-uid' }));
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({ ok: true, job: 'dormant', marked: 1 });
		const second = await GET(event('dormant', { sub: 'admin-uid' }));
		expect(second.status).toBe(200);
		// The scheduler path, right after, is throttled.
		const third = await GET(event('dormant', null, { authorization: 'Bearer live' }));
		expect(third.status).toBe(200); // the admin runs did not spend the scheduler's slot
		const fourth = await GET(event('dormant', null, { authorization: 'Bearer live' }));
		expect(fourth.status).toBe(429);
	});
});

describe('vercel.json', () => {
	it('carries ONE combined daily cron (the Hobby plan allows two a project and autopay holds one), the autopay entry byte-identical, and tabs', () => {
		const text = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
		expect(text).toContain('\t\t{ "path": "/api/coin/autopay", "schedule": "17 10 * * *" }');
		expect(text.split('\n')[1].startsWith('\t')).toBe(true);
		const parsed = JSON.parse(text) as { crons: { path: string; schedule: string }[]; git: unknown; redirects: unknown };
		expect(parsed.git).toBeTruthy();
		expect(parsed.redirects).toBeTruthy();
		const paths = parsed.crons.map((c) => c.path);
		expect(paths).toEqual(['/api/coin/autopay', '/api/certifications/jobs/daily']);
		expect(parsed.crons[1].schedule).toBe('41 10 * * *');
		// Every per-job path stays reachable by hand (an admin, or the GitHub caller), never from a cron entry of its own.
		for (const job of CERT_JOBS) if (job !== 'daily') expect(paths).not.toContain(`/api/certifications/jobs/${job}`);
		for (const c of parsed.crons) expect(c.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
		expect(new Set(parsed.crons.map((c) => c.schedule)).size).toBe(parsed.crons.length);
	});
});
