import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendMirror, type MirrorResult } from './mirror';
import { sendCertNotifications, type NotifyResult } from './notify';

/**
 * THE FOUR SCHEDULED JOBS (ledger 0391, DECISIONS D4), each one call on the
 * SERVICE-ROLE client the route gets from `serviceClient()` in
 * `$lib/server/push.ts`, an existing sanctioned reader of the key; this module
 * builds no client and reads no key of its own.
 *
 *   mirror   the daily full resync to the FRC app (`sendMirror('daily')`)
 *   dormant  `cert_sweep_dormant`: attempts idle past the settings' days
 *   expiry   `cert_expiry_reminders`: the 30 day notice, then its emails and pushes
 *   emails   `cert_notifications_unsent`: the safety net for any notification
 *            whose email never went (the key unset at the time, a send that
 *            failed), EMAIL ONLY, because the rows may already have been pushed
 *
 * WHO MAY CALL THEM. The audit read `/api/coin/autopay`, the repository's one
 * existing cron route, looking for the scheduler check this contract was told
 * to copy, and found NONE: that route holds no credential and checks no header,
 * because `coin_autopay_run` can only pay what is owed. So the check copied
 * here is Vercel's own convention rather than an invented one: when
 * `CRON_SECRET` is set in the project, Vercel sends `Authorization: Bearer
 * <CRON_SECRET>` with every cron request and this route requires it (compared
 * in constant time); when it is UNSET the scheduler path is open exactly as the
 * autopay route is, which is safe for the same reason it is there: every job
 * is idempotent (the mirror resends the same snapshot, the sweep marks only
 * what qualifies, the reminder is keyed on its event, the flush stamps what it
 * sent), and a caller can only make the portal do its own housekeeping sooner.
 * A per-instance floor of one run a minute per job keeps a loop from being a
 * cost. A signed-in admin may always run a job by hand.
 */

export const CERT_JOBS = ['mirror', 'dormant', 'expiry', 'emails', 'daily'] as const;
/** The four jobs `daily` runs, in this order: dormancy before expiry, so a reminder never goes to an attempt just marked dormant; emails last. */
export const DAILY_STEPS = ['mirror', 'dormant', 'expiry', 'emails'] as const;
export type CertJob = (typeof CERT_JOBS)[number];

export function isCertJob(value: string | undefined | null): value is CertJob {
	return !!value && (CERT_JOBS as readonly string[]).includes(value);
}

/** How many unsent notifications one flush takes. */
export const EMAIL_FLUSH_LIMIT = 200;
/** The scheduler path runs one job at most this often per instance. */
export const JOB_MIN_INTERVAL_MS = 60_000;

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/**
 * Vercel's cron convention: `Authorization: Bearer <CRON_SECRET>` when the
 * variable is set. Unset means the scheduler path is open (the autopay shape).
 */
export function schedulerAuthorized(request: Request, secret: string | undefined = env.CRON_SECRET): boolean {
	const expected = (secret ?? '').trim();
	if (!expected) return true;
	const header = request.headers.get('authorization') ?? '';
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	if (!m) return false;
	return safeEqual(m[1].trim(), expected);
}

const lastRun = new Map<CertJob, number>();

/** True when the scheduler path ran this job inside the floor; records the run otherwise. */
export function throttled(job: CertJob, now: number = Date.now()): boolean {
	const last = lastRun.get(job);
	if (last !== undefined && now - last < JOB_MIN_INTERVAL_MS) return true;
	lastRun.set(job, now);
	return false;
}

/** Test seam: forget every recorded run. */
export function resetThrottle(): void {
	lastRun.clear();
}

export interface JobDeps {
	sendMirror?: (trigger: 'daily', client: SupabaseClient) => Promise<MirrorResult>;
	sendCertNotifications?: typeof sendCertNotifications;
}

export type JobSummary = Record<string, unknown> & { ok: boolean; job: CertJob };

function rpcFailure(job: CertJob, error: { code?: string; message?: string } | null): JobSummary {
	return { ok: false, job, reason: 'rpc_error', code: error?.code ?? null, message: error?.message ?? 'The database refused.' };
}

/**
 * Runs one job on the service client and answers a small summary with counts.
 * Never throws: a job that fails answers `ok: false` with a reason.
 */
export async function runCertJob(
	job: CertJob,
	admin: SupabaseClient,
	origin: string,
	deps: JobDeps = {}
): Promise<JobSummary> {
	const mirror = deps.sendMirror ?? ((t: 'daily', c: SupabaseClient) => sendMirror(t, c));
	const notify = deps.sendCertNotifications ?? sendCertNotifications;
	try {
		if (job === 'daily') {
			// ONE Vercel cron entry runs every job (the Hobby plan allows two cron
			// jobs a project and autopay holds one), in order, under one answer.
			const steps: Record<string, JobSummary> = {};
			let ok = true;
			for (const step of DAILY_STEPS) {
				steps[step] = await runCertJob(step, admin, origin, deps);
				if (!steps[step].ok) ok = false;
			}
			return { ok, job, steps };
		}
		if (job === 'mirror') {
			const result = await mirror('daily', admin);
			return { ...result, job, ok: result.ok };
		}
		if (job === 'dormant') {
			const { data, error } = await admin.rpc('cert_sweep_dormant');
			if (error) return rpcFailure(job, error);
			const d = (data ?? {}) as { ok?: boolean; marked?: number };
			return { ok: d.ok !== false, job, marked: typeof d.marked === 'number' ? d.marked : 0 };
		}
		if (job === 'expiry') {
			const { data, error } = await admin.rpc('cert_expiry_reminders');
			if (error) return rpcFailure(job, error);
			const d = (data ?? {}) as { ok?: boolean; notify?: unknown };
			const rows = Array.isArray(d.notify) ? d.notify : [];
			const sent: NotifyResult = await notify(rows, origin, admin);
			return { ok: d.ok !== false, job, reminders: rows.length, ...sent };
		}
		// emails
		const { data, error } = await admin.rpc('cert_notifications_unsent', { p_limit: EMAIL_FLUSH_LIMIT });
		if (error) return rpcFailure(job, error);
		const rows = Array.isArray(data) ? data : [];
		const sent: NotifyResult = await notify(rows, origin, admin, { channels: ['email'] });
		return { ok: true, job, pending: rows.length, ...sent };
	} catch (e) {
		return { ok: false, job, reason: 'error', message: (e as Error)?.message || 'The job failed.' };
	}
}
