import { createClient as supabaseCreateClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { serviceClient } from '$lib/server/push';

/**
 * THE FRC APP MIRROR, SENDING END (ledger 0391; `docs/CERTIFICATIONS.md` "FRC
 * app mirror"; the receiving contract is frc-app's
 * `docs/IDEA_CERTIFICATIONS_SYNC.md`, whose field names and refusal shapes are
 * authoritative character for character).
 *
 * ONE RPC, THE WHOLE SNAPSHOT, EVERY TIME. `cert_mirror_snapshot()` builds the
 * contract's object in SQL (every published or retired certification, every
 * award of every status, drafts never) and this module posts it UNTOUCHED to
 * `idea_cert_sync` on the Techmen project with supabase-js, exactly as the
 * contract shows:
 *
 *     createClient(TECHMEN_SUPABASE_URL, TECHMEN_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
 *       .rpc('idea_cert_sync', { p_secret, p_snapshot })
 *
 * SUCCESS IS `error === null && data?.ok === true` AND NOTHING ELSE. A refused
 * snapshot is a 422 whose body arrives AS `error` (`error.ok === false`,
 * `error.error` the problem list); a wrong secret is SQLSTATE 28000; an
 * unapplied receiving migration is PGRST202; a bad anon key is 401. Each is
 * logged through `cert_sync_log_write` with the http status where known, the
 * counts, the source revision, the error TEXT (`error.error ?? error.message`)
 * and the duration. The request body is never logged: it carries the secret.
 *
 * THREE SECRETS, ANY ONE UNSET IS A CLEAN NO-OP: no call, no log row,
 * `{ ok: false, reason: 'not_configured' }`. Read at call time, never at import,
 * never printed. IT NEVER THROWS TO ITS CALLER: the award or catalog write it
 * follows has already committed.
 *
 * WHICH CLIENT READS THE SNAPSHOT. `cert_mirror_snapshot` and
 * `cert_sync_log_write` are granted to admin and service_role (0264), and the
 * award route fires this on the CERTIFIER'S client, who may be neither. The
 * snapshot carries every holder's address, which is why it is not granted to
 * every certifier; so the read and the log run on `serviceClient()` (the push
 * module's sanctioned reader of the service key, no new reader) when the key is
 * set, and on the given client otherwise, where an admin's works and a plain
 * certifier's is refused and reported as `reason: 'snapshot'`.
 */

export type MirrorTrigger = 'award' | 'catalog' | 'daily' | 'manual';

export type MirrorResult =
	| { ok: true; catalog_count: number; holder_count: number; remote_log_id: number | null; duration_ms: number }
	| {
			ok: false;
			reason: 'not_configured' | 'snapshot' | 'refused' | 'secret' | 'not_set_up' | 'unauthorized' | 'network' | 'error';
			message: string;
			http_status?: number | null;
	  };

export interface MirrorSnapshot {
	source_revision: string | null;
	catalog: unknown[];
	holders: unknown[];
}

type RpcAnswer = { data: unknown; error: unknown; status?: number };
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcAnswer> | Promise<RpcAnswer> };

export interface MirrorDeps {
	/** supabase-js's `createClient`, injectable for a test. */
	createClient?: (url: string, key: string, options: { auth: { persistSession: boolean } }) => RpcClient;
	/** The service client factory; null means "use the given client". */
	serviceClient?: () => SupabaseClient | null;
	now?: () => number;
}

export interface SnapshotResult {
	ok: boolean;
	snapshot: MirrorSnapshot | null;
	message: string;
}

function isSnapshot(value: unknown): value is MirrorSnapshot {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return Array.isArray(v.catalog) && Array.isArray(v.holders) && 'source_revision' in v;
}

/** `cert_mirror_snapshot()` on the given client, as the function returns it. */
export async function buildSnapshot(supabase: SupabaseClient): Promise<SnapshotResult> {
	try {
		const { data, error } = await supabase.rpc('cert_mirror_snapshot');
		if (error) {
			return { ok: false, snapshot: null, message: error.message || 'cert_mirror_snapshot refused' };
		}
		if (!isSnapshot(data)) {
			return { ok: false, snapshot: null, message: 'cert_mirror_snapshot did not answer a snapshot' };
		}
		return { ok: true, snapshot: data, message: '' };
	} catch (e) {
		return { ok: false, snapshot: null, message: (e as Error)?.message || 'cert_mirror_snapshot failed' };
	}
}

function errorField(error: unknown, key: string): unknown {
	return error && typeof error === 'object' ? (error as Record<string, unknown>)[key] : undefined;
}

function errorText(error: unknown): string {
	const own = errorField(error, 'error');
	if (typeof own === 'string' && own) return own;
	const message = errorField(error, 'message');
	if (typeof message === 'string' && message) return message;
	return 'idea_cert_sync failed';
}

async function writeLog(client: SupabaseClient, row: Record<string, unknown>): Promise<void> {
	try {
		await client.rpc('cert_sync_log_write', { p: row });
	} catch {
		// The log is best effort; the caller already has the result.
	}
}

export async function sendMirror(
	trigger: MirrorTrigger,
	supabase: SupabaseClient,
	deps: MirrorDeps = {}
): Promise<MirrorResult> {
	const url = env.TECHMEN_SUPABASE_URL ?? '';
	const anonKey = env.TECHMEN_SUPABASE_ANON_KEY ?? '';
	const secret = env.TECHMEN_CERT_SYNC_SECRET ?? '';
	if (!url || !anonKey || !secret) {
		return { ok: false, reason: 'not_configured', message: 'The FRC mirror is not configured on this deployment.' };
	}

	const now = deps.now ?? Date.now;
	const service = deps.serviceClient ?? serviceClient;
	let reader: SupabaseClient = supabase;
	try {
		reader = service() ?? supabase;
	} catch {
		reader = supabase;
	}

	const started = now();
	const built = await buildSnapshot(reader);
	if (!built.ok || !built.snapshot) {
		await writeLog(reader, {
			trigger,
			ok: false,
			http_status: null,
			catalog_count: 0,
			holder_count: 0,
			source_revision: null,
			error: `snapshot: ${built.message}`.slice(0, 2000),
			duration_ms: Math.max(0, now() - started),
			remote_log_id: null
		});
		return { ok: false, reason: 'snapshot', message: built.message };
	}
	const snapshot = built.snapshot;
	const counts = { catalog_count: snapshot.catalog.length, holder_count: snapshot.holders.length };

	let answer: RpcAnswer;
	try {
		const make = deps.createClient ?? (supabaseCreateClient as unknown as NonNullable<MirrorDeps['createClient']>);
		const techmen = make(url, anonKey, { auth: { persistSession: false } });
		answer = await techmen.rpc('idea_cert_sync', { p_secret: secret, p_snapshot: snapshot });
	} catch (e) {
		answer = { data: null, error: { message: (e as Error)?.message || 'network failure' }, status: 0 };
	}
	const duration_ms = Math.max(0, now() - started);
	const data = (answer.data ?? null) as Record<string, unknown> | null;

	if (answer.error === null && data?.ok === true) {
		const remote_log_id = typeof data.log_id === 'number' ? data.log_id : null;
		await writeLog(reader, {
			trigger,
			ok: true,
			http_status: answer.status ?? 200,
			catalog_count: typeof data.catalog_count === 'number' ? data.catalog_count : counts.catalog_count,
			holder_count: typeof data.holder_count === 'number' ? data.holder_count : counts.holder_count,
			source_revision: snapshot.source_revision,
			error: null,
			duration_ms,
			remote_log_id
		});
		return { ok: true, ...counts, remote_log_id, duration_ms };
	}

	const code = errorField(answer.error, 'code');
	const refusedBody = errorField(answer.error, 'ok') === false;
	let reason: Extract<MirrorResult, { ok: false }>['reason'] = 'error';
	let http_status: number | null = typeof answer.status === 'number' && answer.status > 0 ? answer.status : null;
	if (refusedBody) {
		reason = 'refused';
		http_status = http_status ?? 422;
	} else if (code === '28000') {
		reason = 'secret';
		http_status = http_status ?? 403;
	} else if (code === 'PGRST202') {
		reason = 'not_set_up';
		http_status = http_status ?? 404;
	} else if (http_status === 401) {
		reason = 'unauthorized';
	} else if (!code && (http_status === null || http_status === 0 || http_status >= 500)) {
		reason = 'network';
	}
	const message = errorText(answer.error);
	const remoteLog = errorField(answer.error, 'log_id');
	await writeLog(reader, {
		trigger,
		ok: false,
		http_status,
		...counts,
		source_revision: snapshot.source_revision,
		error: message.slice(0, 2000),
		duration_ms,
		remote_log_id: typeof remoteLog === 'number' ? remoteLog : null
	});
	return { ok: false, reason, message, http_status };
}
