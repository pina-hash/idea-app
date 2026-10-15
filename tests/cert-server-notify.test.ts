// tests/cert-server-notify.test.ts
//
// THE ONE NOTIFICATION SENDER (ledger 0391). What fails silently here: an email
// that went out and was never stamped (sent again by the flush), a stamp written
// for an email that never went, a push that re-pushed a row the flush was only
// meant to email, and a failed send that logged the message body or the key.
// Every transport is injected; the real `renderCertEmail` is used.

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readNotifyRows, sendCertNotifications, type NotifyDeps } from '../src/lib/server/certifications/notify';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';

const rows = () => [
	{ id: A, email: 'Wren.Hollis@boscotech.net', user_id: null, kind: 'awarded', title: 'You earned MILL-1', body: 'Your certificate is ready.', href: '/certifications/me', payload: { serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB', recipient_name: 'Wren Hollis' }, created_at: '2026-10-15T20:00:00Z' },
	{ id: B, email: 'casey.r@boscotech.net', user_id: USER_B, kind: 'review_returned', title: 'Your guided project was reviewed', body: 'Pass. Nice work.', href: '/certifications/MILL-1', payload: {}, created_at: '2026-10-15T20:01:00Z' }
];

interface Fake {
	client: SupabaseClient;
	calls: { fn: string; args: Record<string, unknown> | undefined }[];
}
function fake(refuse: (fn: string) => boolean = () => false, throwOn: (fn: string) => boolean = () => false): Fake {
	const calls: Fake['calls'] = [];
	const client = {
		rpc: async (fn: string, args?: Record<string, unknown>) => {
			calls.push({ fn, args });
			if (throwOn(fn)) throw new Error('boom');
			if (refuse(fn)) return { data: null, error: { code: '42501', message: 'permission denied' } };
			return { data: { ok: true }, error: null };
		}
	} as unknown as SupabaseClient;
	return { client, calls };
}

function deps(over: Partial<NotifyDeps> & { emails?: { to: string; subject: string; html: string; text: string }[]; pushes?: { ids: string[]; payload: unknown }[] } = {}): NotifyDeps & { emails: NonNullable<typeof over.emails>; pushes: NonNullable<typeof over.pushes> } {
	const emails = over.emails ?? [];
	const pushes = over.pushes ?? [];
	const admin = { rpc: async () => ({ data: { ok: true }, error: null }) } as unknown as SupabaseClient;
	return {
		emails,
		pushes,
		emailConfigured: () => true,
		sendEmail: async (m) => {
			emails.push(m);
			return { ok: true, id: 'em_1' };
		},
		pushConfigured: () => true,
		serviceClient: () => admin,
		sendPushToUsers: async (_c, ids, payload) => {
			pushes.push({ ids, payload });
			return 1;
		},
		...over
	};
}

describe('readNotifyRows', () => {
	it('keeps well formed rows, lowercases the address, drops anything malformed', () => {
		const read = readNotifyRows([...rows(), { id: 'nope' }, null, 'x', { id: A, email: 'no-at', kind: 'x', title: 't', body: 'b', href: '/' }]);
		expect(read).toHaveLength(2);
		expect(read[0].email).toBe('wren.hollis@boscotech.net');
		expect(read[1].user_id).toBe(USER_B);
		expect(readNotifyRows(null)).toEqual([]);
		expect(readNotifyRows({})).toEqual([]);
	});
});

describe('sendCertNotifications', () => {
	it('emails every row, pushes the ones with a user, and stamps each channel with exactly the ids it delivered', async () => {
		const db = fake();
		const d = deps();
		const result = await sendCertNotifications(rows(), 'https://ideabosco.com', db.client, d);
		expect(result).toMatchObject({ attempted: 2, emailed: 2, pushed: 1, notified: 2, unstamped: 0, errors: 0 });
		expect(d.emails.map((e) => e.to)).toEqual(['wren.hollis@boscotech.net', 'casey.r@boscotech.net']);
		expect(d.emails[0].subject).toBe('You earned MILL-1');
		expect(d.emails[0].text).toContain('https://ideabosco.com/certifications/me');
		expect(d.emails[0].text).toContain('Wren Hollis');
		expect(d.pushes).toEqual([{ ids: [USER_B], payload: { title: 'Your guided project was reviewed', body: 'Pass. Nice work.', url: '/certifications/MILL-1', tag: 'cert-review_returned' } }]);
		const stamps = db.calls.filter((c) => c.fn === 'cert_notifications_mark_sent').map((c) => c.args);
		expect(stamps).toEqual([{ p_ids: [A, B], p_channel: 'email' }, { p_ids: [B], p_channel: 'push' }]);
		expect(db.calls.some((c) => c.fn === 'cert_error_log')).toBe(false);
	});

	it('with email not configured nothing is emailed and nothing is stamped as emailed, while the push still goes', async () => {
		const db = fake();
		const d = deps({ emailConfigured: () => false });
		const result = await sendCertNotifications(rows(), 'https://ideabosco.com', db.client, d);
		expect(result).toMatchObject({ emailed: 0, pushed: 1, notified: 1 });
		expect(d.emails).toHaveLength(0);
		const stamps = db.calls.filter((c) => c.fn === 'cert_notifications_mark_sent').map((c) => c.args);
		expect(stamps).toEqual([{ p_ids: [B], p_channel: 'push' }]);
	});

	it('channels: ["email"] never pushes, which is what the daily flush needs', async () => {
		const db = fake();
		const d = deps({ channels: ['email'] });
		const result = await sendCertNotifications(rows(), 'https://ideabosco.com', db.client, d);
		expect(result).toMatchObject({ emailed: 2, pushed: 0 });
		expect(d.pushes).toHaveLength(0);
		expect(db.calls.filter((c) => c.fn === 'cert_notifications_mark_sent').map((c) => c.args?.p_channel)).toEqual(['email']);
	});

	it('a refused send is logged with the id, the kind and the reason, never the body or the key, and is not stamped', async () => {
		const db = fake();
		const KEY = 're_secret_key_value';
		const d = deps({
			sendEmail: async (m) => (m.to.startsWith('casey') ? { ok: false, reason: 'refused', message: `Domain not verified ${KEY}` } : { ok: true, id: 'x' })
		});
		const result = await sendCertNotifications(rows(), 'https://ideabosco.com', db.client, d);
		expect(result).toMatchObject({ emailed: 1, errors: 1 });
		const log = db.calls.find((c) => c.fn === 'cert_error_log');
		expect(log).toBeTruthy();
		expect(log?.args).toMatchObject({ p_where: 'certifications.notify.email', p_detail: { notification_id: B, kind: 'review_returned', reason: 'refused' } });
		const serialized = JSON.stringify(log?.args);
		expect(serialized).not.toContain('Pass. Nice work.');
		expect(serialized).toContain(KEY); // the provider sentence is logged as given: the TRANSPORT redacts, this layer relays
		const stamps = db.calls.filter((c) => c.fn === 'cert_notifications_mark_sent').map((c) => c.args);
		expect(stamps[0]).toEqual({ p_ids: [A], p_channel: 'email' });
	});

	it('falls back to the service client to stamp when the caller\'s client is refused, and reports when neither takes it', async () => {
		const refused = fake((fn) => fn === 'cert_notifications_mark_sent');
		const adminCalls: { fn: string; args: unknown }[] = [];
		const admin = { rpc: async (fn: string, args: unknown) => (adminCalls.push({ fn, args }), { data: { ok: true }, error: null }) } as unknown as SupabaseClient;
		const ok = await sendCertNotifications(rows(), 'https://ideabosco.com', refused.client, deps({ serviceClient: () => admin, channels: ['email'] }));
		expect(ok).toMatchObject({ emailed: 2, unstamped: 0 });
		expect(adminCalls).toEqual([{ fn: 'cert_notifications_mark_sent', args: { p_ids: [A, B], p_channel: 'email' } }]);

		const none = fake((fn) => fn === 'cert_notifications_mark_sent');
		const bad = await sendCertNotifications(rows(), 'https://ideabosco.com', none.client, deps({ serviceClient: () => null, channels: ['email'] }));
		expect(bad).toMatchObject({ emailed: 2, unstamped: 2 });
		expect(none.calls.some((c) => c.fn === 'cert_error_log' && c.args?.p_where === 'certifications.notify.mark_sent')).toBe(true);
	});

	it('never throws: a client whose every call throws, a renderer that throws, and garbage input all come back as counts', async () => {
		const throwing = fake(() => false, () => true);
		const result = await sendCertNotifications(rows(), 'https://ideabosco.com', throwing.client, deps({ renderCertEmail: () => { throw new Error('template'); } }));
		expect(result).toMatchObject({ attempted: 2, emailed: 0, errors: 2 });
		expect(await sendCertNotifications(undefined, 'https://ideabosco.com', throwing.client, deps())).toMatchObject({ attempted: 0, notified: 0 });
		expect(await sendCertNotifications('nonsense', 'https://ideabosco.com', throwing.client, deps())).toMatchObject({ attempted: 0 });
	});
});
