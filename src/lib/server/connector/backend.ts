/**
 * THE CONNECTOR'S SUPABASE BACKEND, and the ONE place under
 * src/lib/server/connector/ that reads `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * The service role is used for exactly two things, as docs/connector/DESIGN.md
 * section 1 states: the connector_* tables (no client role may touch them; the
 * migration grants them to service_role alone) and `mintSession`, which turns
 * a connection into a Supabase session for the user on its token row (the
 * Armory pattern: `auth.admin.generateLink` then `verifyOtp` on a fresh anon
 * client, src/lib/server/armory/backend.ts). Every tool call then runs through
 * `rpc` and `select`, which carry THAT user's access token, so auth.uid(),
 * current_user_email(), is_admin() and every policy see that user and nobody
 * else. tests/connector-service-role.test.ts holds this file to it.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { auditRowFromDb } from './audit-row';
import {
	ConnectorUnavailable,
	type ClientRecord,
	type Confirmation,
	type ConnectorBackend,
	type DbError,
	type DbResult,
	type NewToken,
	type SelectSpec,
	type StoredCode,
	type TokenRow,
	type UploadSlot,
	type UserSession
} from './types';

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function serviceClient(): SupabaseClient {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new ConnectorUnavailable('SUPABASE_SERVICE_ROLE_KEY is not set.');
	return createClient(PUBLIC_SUPABASE_URL, key, { auth: NO_SESSION });
}

function userClient(accessToken: string): SupabaseClient {
	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${accessToken}` } },
		auth: NO_SESSION
	});
}

function unavailable(error: { message?: string } | null | undefined): never {
	throw new ConnectorUnavailable(error?.message ?? 'The connector store is not reachable.');
}

const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null);
const iso = (t: number): string => new Date(t).toISOString();

/** What a nightly replay's runs are recorded as, in place of a model's name. */
export const REPLAY_MODEL = 'nightly replay';

/** The private bucket a chat's file waits in (0290); no client role reaches it. */
export const CONNECTOR_UPLOAD_BUCKET = 'connector-uploads';

function uploadSlot(r: Record<string, unknown>): UploadSlot {
	return {
		id: String(r.id),
		userId: String(r.user_id),
		filename: String(r.filename),
		contentType: (r.content_type as string | null) ?? null,
		maxBytes: Number(r.max_bytes),
		sizeBytes: r.size_bytes === null || r.size_bytes === undefined ? null : Number(r.size_bytes),
		expiresAt: ms(r.expires_at as string) ?? 0,
		uploadedAt: ms(r.uploaded_at as string | null)
	};
}

const TOKEN_COLUMNS =
	'id, user_id, email, client_id, label, scope, access_expires_at, refresh_expires_at, revoked_at, last_used_at';

type TokenDbRow = {
	id: string;
	user_id: string;
	email: string;
	client_id: string;
	label: string;
	scope: string;
	access_expires_at: string;
	refresh_expires_at: string;
	revoked_at: string | null;
	last_used_at: string | null;
};

function tokenRow(r: TokenDbRow): TokenRow {
	return {
		id: r.id,
		userId: r.user_id,
		email: r.email,
		clientId: r.client_id,
		label: r.label,
		scope: r.scope,
		accessExpiresAt: Date.parse(r.access_expires_at),
		refreshExpiresAt: Date.parse(r.refresh_expires_at),
		revokedAt: ms(r.revoked_at),
		lastUsedAt: ms(r.last_used_at)
	};
}

function dbError(e: { code?: string; message?: string; details?: string | null; hint?: string | null }): DbError {
	return { code: e.code, message: e.message ?? 'Something went wrong.', details: e.details ?? null, hint: e.hint ?? null };
}

export function supabaseConnectorBackend(): ConnectorBackend {
	return {
		kind: 'supabase',

		// ---- The service-role half: the connector_* tables. ----

		async enabled() {
			const { data, error } = await serviceClient().from('connector_settings').select('enabled').eq('id', true).maybeSingle();
			if (error) unavailable(error);
			return data ? data.enabled === true : true;
		},
		async findClient(clientId) {
			const { data, error } = await serviceClient()
				.from('connector_clients')
				.select('client_id, client_name, redirect_uris')
				.eq('client_id', clientId)
				.maybeSingle();
			if (error) unavailable(error);
			return data ? { clientId: data.client_id, clientName: data.client_name, redirectUris: data.redirect_uris } : null;
		},
		async registerClient(c: ClientRecord) {
			const { error } = await serviceClient()
				.from('connector_clients')
				.insert({ client_id: c.clientId, client_name: c.clientName, redirect_uris: c.redirectUris });
			if (error) unavailable(error);
		},
		async storeCode(c: StoredCode) {
			const { error } = await serviceClient().from('connector_codes').insert({
				code_hash: c.codeHash,
				user_id: c.userId,
				email: c.email,
				client_id: c.clientId,
				client_name: c.clientName,
				redirect_uri: c.redirectUri,
				code_challenge: c.codeChallenge,
				scope: c.scope,
				expires_at: iso(c.expiresAt)
			});
			if (error) unavailable(error);
		},
		async takeCode(codeHash, now) {
			const { data, error } = await serviceClient()
				.from('connector_codes')
				.update({ used_at: iso(now) })
				.eq('code_hash', codeHash)
				.is('used_at', null)
				.select('code_hash, user_id, email, client_id, client_name, redirect_uri, code_challenge, scope, expires_at');
			if (error) unavailable(error);
			const r = (data ?? [])[0];
			if (!r) return null;
			return {
				codeHash: r.code_hash,
				userId: r.user_id,
				email: r.email,
				clientId: r.client_id,
				clientName: r.client_name ?? '',
				redirectUri: r.redirect_uri,
				codeChallenge: r.code_challenge,
				scope: r.scope,
				expiresAt: Date.parse(r.expires_at)
			};
		},
		async createToken(t: NewToken) {
			const { data, error } = await serviceClient()
				.from('connector_tokens')
				.insert({
					user_id: t.userId,
					email: t.email,
					client_id: t.clientId,
					label: t.label,
					scope: t.scope,
					access_hash: t.accessHash,
					refresh_hash: t.refreshHash,
					access_expires_at: iso(t.accessExpiresAt),
					refresh_expires_at: iso(t.refreshExpiresAt)
				})
				.select('id')
				.single();
			if (error || !data) unavailable(error);
			return data.id as string;
		},
		async tokenByAccess(accessHash) {
			const { data, error } = await serviceClient()
				.from('connector_tokens')
				.select(TOKEN_COLUMNS)
				.eq('access_hash', accessHash)
				.maybeSingle();
			if (error) unavailable(error);
			return data ? tokenRow(data as TokenDbRow) : null;
		},
		async rotate(refreshHash, next, now) {
			// ONE STATEMENT: the row matches only while the presented refresh token
			// is the current one, unrevoked and unexpired, so a second use of the
			// same refresh token (already rotated) matches nothing.
			const { data, error } = await serviceClient()
				.from('connector_tokens')
				.update({
					access_hash: next.accessHash,
					refresh_hash: next.refreshHash,
					access_expires_at: iso(next.accessExpiresAt),
					refresh_expires_at: iso(next.refreshExpiresAt),
					last_used_at: iso(now)
				})
				.eq('refresh_hash', refreshHash)
				.is('revoked_at', null)
				.gt('refresh_expires_at', iso(now))
				.select(`${TOKEN_COLUMNS}, rotations`);
			if (error) unavailable(error);
			const row = (data ?? [])[0] as (TokenDbRow & { rotations: number }) | undefined;
			if (!row) return null;
			// The counter is bookkeeping and rides a second statement keyed on the
			// row the rotation itself matched; it decides nothing.
			await serviceClient()
				.from('connector_tokens')
				.update({ rotations: (row.rotations ?? 0) + 1 })
				.eq('id', row.id);
			return tokenRow(row);
		},
		async revokeByHash(hash, by) {
			const client = serviceClient();
			let matched = false;
			for (const column of ['access_hash', 'refresh_hash']) {
				const { data, error } = await client
					.from('connector_tokens')
					.update({ revoked_at: new Date().toISOString(), revoked_by: by })
					.eq(column, hash)
					.is('revoked_at', null)
					.select('id');
				if (error) unavailable(error);
				if ((data ?? []).length > 0) matched = true;
			}
			return matched;
		},
		async revokeToken(id, by) {
			const { error } = await serviceClient()
				.from('connector_tokens')
				.update({ revoked_at: new Date().toISOString(), revoked_by: by })
				.eq('id', id)
				.is('revoked_at', null);
			if (error) unavailable(error);
		},
		async touchToken(id, now) {
			const { error } = await serviceClient().from('connector_tokens').update({ last_used_at: iso(now) }).eq('id', id);
			if (error) unavailable(error);
		},
		async storeConfirmation(c: Confirmation) {
			const { error } = await serviceClient().from('connector_confirmations').insert({
				token_hash: c.tokenHash,
				user_id: c.userId,
				tool: c.tool,
				args_hash: c.argsHash,
				preview: c.preview ?? null,
				expires_at: iso(c.expiresAt)
			});
			if (error) unavailable(error);
		},
		async takeConfirmation(tokenHash, now) {
			const { data, error } = await serviceClient()
				.from('connector_confirmations')
				.update({ used_at: iso(now) })
				.eq('token_hash', tokenHash)
				.is('used_at', null)
				.gt('expires_at', iso(now))
				.select('token_hash, user_id, tool, args_hash, preview, expires_at');
			if (error) unavailable(error);
			const r = (data ?? [])[0];
			if (!r) return null;
			return {
				tokenHash: r.token_hash,
				userId: r.user_id,
				tool: r.tool,
				argsHash: r.args_hash,
				preview: r.preview,
				expiresAt: Date.parse(r.expires_at)
			};
		},
		async syncRegistry(rows, logTables = []) {
			if (rows.length > 0) {
				const { error } = await serviceClient()
					.from('connector_registry')
					.upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'function_name' });
				if (error) unavailable(error);
			}
			if (logTables.length > 0) {
				const { error } = await serviceClient()
					.from('connector_log_tables')
					.upsert(logTables.map((t) => ({ table_name: t, note: 'registry' })), { onConflict: 'table_name', ignoreDuplicates: true });
				if (error) unavailable(error);
			}
		},
		async setAuditUndo(auditId, undo) {
			const { error } = await serviceClient().from('connector_audit').update({ undo }).eq('id', auditId);
			if (error) unavailable(error);
		},
		async undoCandidates(userId, limit) {
			const { data, error } = await serviceClient()
				.from('connector_audit')
				.select('id, user_id, tool, function_name, args, result, rows_written, undo, undo_of, undone_by, group_key, status, started_at')
				.eq('user_id', userId)
				.eq('status', 'done')
				.is('undone_by', null)
				.is('undo_of', null)
				.order('started_at', { ascending: false })
				.limit(limit);
			if (error) unavailable(error);
			return ((data ?? []) as Record<string, unknown>[]).map(auditRowFromDb);
		},
		async mintSession(user) {
			const link = await serviceClient().auth.admin.generateLink({ type: 'magiclink', email: user.email });
			const tokenHash = link.data?.properties?.hashed_token;
			if (link.error || !tokenHash) unavailable(link.error);
			const fresh = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, { auth: NO_SESSION });
			const verified = await fresh.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
			const session = verified.data?.session;
			if (verified.error || !session) unavailable(verified.error);
			if (session.user?.id !== user.id) {
				throw new ConnectorUnavailable('The minted session belongs to a different account.');
			}
			return {
				accessToken: session.access_token,
				expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000,
				user
			};
		},

		// ---- One file from a chat (0290): the connector_uploads row and the
		// private connector-uploads bucket, which carry no client grant at all. ----

		async createUpload(slot) {
			const { data, error } = await serviceClient()
				.from('connector_uploads')
				.insert({
					user_id: slot.userId,
					token_hash: slot.tokenHash,
					filename: slot.filename,
					content_type: slot.contentType,
					max_bytes: slot.maxBytes,
					expires_at: iso(slot.expiresAt)
				})
				.select('id')
				.single();
			if (error || !data) unavailable(error);
			const id = data.id as string;
			const signed = await serviceClient().storage.from(CONNECTOR_UPLOAD_BUCKET).createSignedUploadUrl(`${slot.userId}/${id}`);
			if (signed.error || !signed.data?.signedUrl) unavailable(signed.error);
			return { id, uploadUrl: signed.data.signedUrl };
		},
		async storeUploadPart(userId, id, index, bytes) {
			const { data, error } = await serviceClient()
				.from('connector_uploads')
				.select('id, max_bytes, expires_at, size_bytes')
				.eq('id', id)
				.eq('user_id', userId)
				.maybeSingle();
			if (error) unavailable(error);
			if (!data || Date.parse(data.expires_at as string) <= Date.now()) return { ok: false, message: 'That upload is not open; start a new one.' };
			const received = Number(data.size_bytes ?? 0) + bytes.byteLength;
			if (received > Number(data.max_bytes)) return { ok: false, message: `That would pass the upload's ${data.max_bytes} bytes.` };
			const part = `${userId}/${id}.part${String(index).padStart(5, '0')}`;
			const up = await serviceClient()
				.storage.from(CONNECTOR_UPLOAD_BUCKET)
				.upload(part, bytes, { contentType: 'application/octet-stream', upsert: true });
			if (up.error) unavailable(up.error);
			await serviceClient().from('connector_uploads').update({ size_bytes: received }).eq('id', id);
			return { ok: true, received };
		},
		async replayState() {
			const evals = await serviceClient()
				.from('connector_evals')
				.select('id, seq, said, level, expected_path')
				.is('retired_at', null)
				.order('seq', { ascending: true });
			if (evals.error) unavailable(evals.error);
			const last = await serviceClient()
				.from('connector_eval_runs')
				.select('run_at')
				.eq('model', REPLAY_MODEL)
				.order('run_at', { ascending: false })
				.limit(1);
			if (last.error) unavailable(last.error);
			const who = await serviceClient()
				.from('connector_tokens')
				.select('user_id, last_used_at')
				.is('revoked_at', null)
				.order('last_used_at', { ascending: false, nullsFirst: false })
				.limit(1);
			if (who.error) unavailable(who.error);
			return {
				evals: (evals.data ?? []) as Array<{ id: string; seq: number; said: string; level: string; expected_path: string[] }>,
				lastReplayAt: last.data?.[0]?.run_at ? Date.parse(last.data[0].run_at as string) : null,
				recordAs: (who.data?.[0]?.user_id as string | undefined) ?? null
			};
		},
		async recordReplay(rows) {
			if (!rows.length) return;
			const { error } = await serviceClient()
				.from('connector_eval_runs')
				.insert(rows.map((r) => ({ eval_id: r.evalId, user_id: r.userId, passed: r.passed, path: r.path, detail: r.detail, model: REPLAY_MODEL })));
			if (error) unavailable(error);
		},
		async readUpload(userId, id) {
			const { data, error } = await serviceClient()
				.from('connector_uploads')
				.select('id, user_id, filename, content_type, max_bytes, size_bytes, expires_at, uploaded_at')
				.eq('id', id)
				.eq('user_id', userId)
				.maybeSingle();
			if (error) unavailable(error);
			if (!data) return null;
			const path = `${userId}/${id}`;
			const bucket = serviceClient().storage.from(CONNECTOR_UPLOAD_BUCKET);
			let bytes: Uint8Array | null = null;
			const file = await bucket.download(path);
			if (!file.error && file.data) {
				bytes = new Uint8Array(await file.data.arrayBuffer());
			} else {
				// Sent in numbered pieces from a chat: join them in order.
				const listed = await bucket.list(userId, { search: `${id}.part`, limit: 1000 });
				const names = (listed.data ?? []).map((f) => f.name).filter((n) => n.startsWith(`${id}.part`)).sort();
				if (!names.length) return null;
				const pieces: Uint8Array[] = [];
				for (const n of names) {
					const got = await bucket.download(`${userId}/${n}`);
					if (got.error || !got.data) return null;
					pieces.push(new Uint8Array(await got.data.arrayBuffer()));
				}
				const total = pieces.reduce((a, b) => a + b.byteLength, 0);
				bytes = new Uint8Array(total);
				let at = 0;
				for (const p of pieces) {
					bytes.set(p, at);
					at += p.byteLength;
				}
			}
			if (bytes.byteLength > Number(data.max_bytes)) return null;
			if (!data.uploaded_at) {
				await serviceClient()
					.from('connector_uploads')
					.update({ uploaded_at: new Date().toISOString(), size_bytes: bytes.byteLength, storage_path: path })
					.eq('id', id);
			}
			return { slot: uploadSlot({ ...data, size_bytes: bytes.byteLength }), bytes };
		},

		// ---- The user half: as the minted user. ----

		routeClient(session: UserSession) {
			return userClient(session.accessToken);
		},
		async signStorage(session: UserSession, bucket: string, path: string, seconds: number): Promise<DbResult<string>> {
			const { data, error } = await userClient(session.accessToken).storage.from(bucket).createSignedUrl(path, seconds);
			if (error || !data?.signedUrl) return { data: null, error: { message: error?.message ?? 'The file could not be signed.' } };
			return { data: data.signedUrl, error: null };
		},
		async rpc<T>(session: UserSession, fn: string, args: Record<string, unknown>): Promise<DbResult<T>> {
			const { data, error } = await userClient(session.accessToken).rpc(fn, args);
			if (error) return { data: null, error: dbError(error) };
			return { data: data as T, error: null };
		},
		async select<T>(session: UserSession, spec: SelectSpec): Promise<DbResult<T[]>> {
			let q = userClient(session.accessToken).from(spec.table).select(spec.columns.join(', '));
			for (const [k, v] of Object.entries(spec.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
			for (const [k, v] of Object.entries(spec.in ?? {})) q = q.in(k, v as never[]);
			for (const [k, v] of Object.entries(spec.gte ?? {})) q = q.gte(k, v);
			for (const [k, v] of Object.entries(spec.lte ?? {})) q = q.lte(k, v);
			for (const [k, dir] of spec.order ?? []) q = q.order(k, { ascending: dir === 'asc' });
			const offset = spec.offset ?? 0;
			const limit = spec.limit ?? 1000;
			const { data, error } = await q.range(offset, offset + limit - 1);
			if (error) return { data: null, error: dbError(error) };
			return { data: (data ?? []) as T[], error: null };
		}
	};
}
