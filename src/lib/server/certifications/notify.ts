import type { SupabaseClient } from '@supabase/supabase-js';
import { pushConfigured, sendPushToUsers, serviceClient } from '$lib/server/push';
import { emailConfigured, sendEmail, type EmailResult } from '$lib/server/email';
import { renderCertEmail } from '$lib/server/email/cert';
import { NOTIFICATION_KINDS, type NotificationKind } from '$lib/certifications/types';

/**
 * THE ONE SENDER OF A CERTIFICATION NOTIFICATION (ledger 0391, DECISIONS D2).
 *
 * Every `cert_*` write that notifies somebody returns a `notify` array of rows
 * in `_cert_notify`'s shape, and the SvelteKit route that made the write hands
 * that array here. The row is already in `cert_notifications` (the badge and
 * the list read it from there); this module only delivers it over the two
 * channels that need a server:
 *
 *   EMAIL  through `renderCertEmail` (surface f's templates) and `sendEmail`
 *          (the Resend transport). Not configured is a clean no-op that stamps
 *          nothing, so the daily `emails` job finds the row still unsent and
 *          delivers it once the key exists.
 *   PUSH   through `sendPushToUsers` on `serviceClient()`, the push module's
 *          own sanctioned reader of the service key, for rows that carry a
 *          `user_id`. Not configured, or no device: nothing, silently.
 *
 * It then stamps `emailed_at` / `pushed_at` through `cert_notifications_mark_sent`
 * so a flush never sends twice, and records a FAILED send (a refusal, a network
 * failure) through `cert_error_log` with the notification id, the kind and the
 * reason, NEVER the key and NEVER the message body.
 *
 * IT NEVER THROWS. The write it follows has already committed; a delivery
 * problem must not make a committed award, review or seat decision read as
 * failed. Every step is wrapped, and the return value is counts.
 *
 * THE STAMP MAY NEED THE SERVICE CLIENT. `cert_notifications_mark_sent` is
 * granted to admin and service_role (0264), and the route hands over the
 * CALLER'S client, who may be a plain certifier. So the stamp is tried on the
 * given client first and, when that is refused, on `serviceClient()`; without
 * either the row stays unstamped and the daily flush may send the email a
 * second time, which is reported, not hidden.
 */

/** One row as `_cert_notify` returns it; `recipient_name` is optional and is read off the payload. */
export interface CertNotifyRow {
	id: string;
	email: string;
	user_id?: string | null;
	kind: NotificationKind | string;
	title: string;
	body: string;
	href: string;
	payload?: Record<string, unknown> | null;
	created_at?: string;
}

export type NotifyChannel = 'email' | 'push';

export interface NotifyDeps {
	sendEmail?: typeof sendEmail;
	emailConfigured?: typeof emailConfigured;
	pushConfigured?: typeof pushConfigured;
	serviceClient?: typeof serviceClient;
	sendPushToUsers?: typeof sendPushToUsers;
	renderCertEmail?: typeof renderCertEmail;
	/** Which channels to use; the daily email flush passes `['email']` so a row already pushed is not pushed again. */
	channels?: NotifyChannel[];
}

export interface NotifyResult {
	/** Rows that were well formed enough to attempt. */
	attempted: number;
	emailed: number;
	pushed: number;
	/** Rows that reached at least one channel. */
	notified: number;
	/** Rows whose stamp could not be written on any client. */
	unstamped: number;
	errors: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads whatever a function handed back into rows, dropping anything malformed. */
export function readNotifyRows(value: unknown): CertNotifyRow[] {
	if (!Array.isArray(value)) return [];
	const out: CertNotifyRow[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const r = item as Record<string, unknown>;
		if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) continue;
		if (typeof r.email !== 'string' || !r.email.includes('@')) continue;
		if (typeof r.kind !== 'string' || typeof r.title !== 'string' || typeof r.body !== 'string') continue;
		if (typeof r.href !== 'string') continue;
		out.push({
			id: r.id,
			email: r.email.trim().toLowerCase(),
			user_id: typeof r.user_id === 'string' && UUID_RE.test(r.user_id) ? r.user_id : null,
			kind: r.kind,
			title: r.title,
			body: r.body,
			href: r.href,
			payload: r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {},
			created_at: typeof r.created_at === 'string' ? r.created_at : undefined
		});
	}
	return out;
}

function recipientNameOf(payload: Record<string, unknown>): string | null {
	for (const key of ['recipient_name', 'holder_name', 'student_name', 'name']) {
		const v = payload[key];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return null;
}

function kindOf(kind: string): NotificationKind {
	return (NOTIFICATION_KINDS as readonly string[]).includes(kind) ? (kind as NotificationKind) : 'part_checked';
}

async function logError(
	supabase: SupabaseClient,
	where: string,
	message: string,
	detail: Record<string, unknown>
): Promise<void> {
	try {
		await supabase.rpc('cert_error_log', {
			p_where: where,
			p_message: message.slice(0, 500),
			p_detail: detail,
			p_correlation: null
		});
	} catch {
		// A failed error log is the end of the line; nothing else to do.
	}
}

/** Stamps on the given client, then the service client; false when neither took it. */
async function markSent(
	supabase: SupabaseClient,
	ids: string[],
	channel: NotifyChannel,
	service: () => SupabaseClient | null
): Promise<boolean> {
	if (!ids.length) return true;
	const args = { p_ids: ids, p_channel: channel };
	try {
		const { error } = await supabase.rpc('cert_notifications_mark_sent', args);
		if (!error) return true;
	} catch {
		// Fall through to the service client.
	}
	try {
		const admin = service();
		if (!admin) return false;
		const { error } = await admin.rpc('cert_notifications_mark_sent', args);
		return !error;
	} catch {
		return false;
	}
}

export async function sendCertNotifications(
	notify: unknown,
	origin: string,
	supabase: SupabaseClient,
	deps: NotifyDeps = {}
): Promise<NotifyResult> {
	const result: NotifyResult = { attempted: 0, emailed: 0, pushed: 0, notified: 0, unstamped: 0, errors: 0 };
	const rows = readNotifyRows(notify);
	result.attempted = rows.length;
	if (!rows.length) return result;

	const channels = new Set<NotifyChannel>(deps.channels ?? ['email', 'push']);
	const send = deps.sendEmail ?? sendEmail;
	const configured = deps.emailConfigured ?? emailConfigured;
	const pushOn = deps.pushConfigured ?? pushConfigured;
	const service = deps.serviceClient ?? serviceClient;
	const push = deps.sendPushToUsers ?? sendPushToUsers;
	const render = deps.renderCertEmail ?? renderCertEmail;
	const reached = new Set<string>();

	// EMAIL
	if (channels.has('email')) {
		let emailOn = false;
		try {
			emailOn = configured();
		} catch {
			emailOn = false;
		}
		if (emailOn) {
			const sentIds: string[] = [];
			for (const row of rows) {
				let outcome: EmailResult;
				try {
					const rendered = render({
						kind: kindOf(row.kind),
						to: row.email,
						recipientName: recipientNameOf(row.payload ?? {}),
						title: row.title,
						body: row.body,
						href: row.href,
						payload: row.payload ?? {},
						siteOrigin: origin
					});
					outcome = await send({ to: row.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
				} catch (e) {
					outcome = { ok: false, reason: 'network', message: (e as Error)?.message || 'The email could not be rendered or sent.' };
				}
				if (outcome.ok) {
					sentIds.push(row.id);
					reached.add(row.id);
					result.emailed += 1;
				} else if (outcome.reason !== 'not_configured') {
					result.errors += 1;
					await logError(supabase, 'certifications.notify.email', outcome.message, {
						notification_id: row.id,
						kind: row.kind,
						reason: outcome.reason
					});
				}
			}
			if (!(await markSent(supabase, sentIds, 'email', service))) {
				result.unstamped += sentIds.length;
				await logError(supabase, 'certifications.notify.mark_sent', 'emailed_at could not be stamped', {
					channel: 'email',
					count: sentIds.length
				});
			}
		}
	}

	// PUSH
	if (channels.has('push')) {
		let on = false;
		let admin: SupabaseClient | null = null;
		try {
			on = pushOn();
			admin = on ? service() : null;
		} catch {
			admin = null;
		}
		if (on && admin) {
			const pushedIds: string[] = [];
			for (const row of rows) {
				if (!row.user_id) continue;
				try {
					const sent = await push(admin, [row.user_id], {
						title: row.title,
						body: row.body,
						url: row.href,
						tag: `cert-${row.kind}`
					});
					if (sent > 0) {
						pushedIds.push(row.id);
						reached.add(row.id);
						result.pushed += 1;
					}
				} catch (e) {
					result.errors += 1;
					await logError(supabase, 'certifications.notify.push', (e as Error)?.message || 'push failed', {
						notification_id: row.id,
						kind: row.kind
					});
				}
			}
			if (!(await markSent(supabase, pushedIds, 'push', service))) {
				result.unstamped += pushedIds.length;
			}
		}
	}

	result.notified = reached.size;
	return result;
}
