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

		// ---- The user half: as the minted user. ----

		routeClient(session: UserSession) {
			return userClient(session.accessToken);
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
