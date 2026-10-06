/**
 * WHAT THE ARMORY ROUTES ASK OF SUPABASE, as one interface, and the one real
 * implementation of it.
 *
 * THE SERVICE-ROLE KEY. This module is the Armory reader of
 * `SUPABASE_SERVICE_ROLE_KEY`, for exactly two things the contract names:
 * the connect codes (`armory_connect_codes`, which no client role can touch)
 * and minting the agent's own session (contract 3e: `auth.admin.generateLink`
 * then `verifyOtp` on a fresh client, so the agent's session is independent of
 * the browser's and neither signs the other out). Everything ELSE runs as the
 * caller: membership, the hash check and the device registration go through
 * the caller's own access token, so `current_user_email()` and RLS are the real
 * thing and the service role never answers a question about who someone is.
 *
 * Nothing here is reachable from the client bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

export interface ArmoryUser {
	id: string;
	email: string;
}

export interface StoredConnectCode {
	codeHash: string;
	userId: string;
	email: string;
	challenge: string;
	state: string;
	deviceName: string;
	expiresAt: number;
	used: boolean;
}

export interface MintedSession {
	access_token: string;
	refresh_token: string;
	expires_at: number;
}

/** A refusal the database considered, versus the backend being unreachable or unset. */
export class ArmoryBackendUnavailable extends Error {}

export interface ArmoryBackend {
	/** The signed-in user an access token belongs to, or null for any bad token. */
	userFromAccessToken(token: string): Promise<ArmoryUser | null>;
	/** `armory_is_member(project)` under the caller's own identity. */
	isMember(token: string, projectId: string): Promise<boolean>;
	/** True when `hash` is a version or side version of a file in the project (RLS-scoped). */
	hashInProject(token: string, projectId: string, hash: string): Promise<boolean>;
	storeConnectCode(code: StoredConnectCode): Promise<void>;
	findConnectCode(codeHash: string): Promise<StoredConnectCode | null>;
	/** Marks the code used; false when somebody else consumed it first. */
	consumeConnectCode(codeHash: string): Promise<boolean>;
	mintSession(email: string): Promise<MintedSession>;
	/** `armory_register_device(p_name, p_operation)` under the NEW session's identity. */
	registerDevice(accessToken: string, name: string, operation: string): Promise<string>;
	/** What the agent is told to talk to. */
	publicConfig(): { supabaseUrl: string; anonKey: string };
}

function userClient(token: string): SupabaseClient {
	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

function serviceClient(): SupabaseClient {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new ArmoryBackendUnavailable('SUPABASE_SERVICE_ROLE_KEY is not set.');
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

function unavailable(error: { message?: string; code?: string } | null): never {
	throw new ArmoryBackendUnavailable(error?.message ?? 'Armory is not reachable.');
}

/** A refusal (RLS, not a member) versus a broken or missing schema. */
function isRefusal(error: { code?: string } | null): boolean {
	return error?.code === '42501' || error?.code === 'P0001';
}

export function supabaseArmoryBackend(): ArmoryBackend {
	return {
		async userFromAccessToken(token) {
			if (!token) return null;
			const { data, error } = await userClient(token).auth.getUser(token);
			if (error || !data.user?.email) return null;
			return { id: data.user.id, email: data.user.email.trim().toLowerCase() };
		},
		async isMember(token, projectId) {
			const { data, error } = await userClient(token).rpc('armory_is_member', { p_project: projectId });
			if (error) {
				if (isRefusal(error)) return false;
				unavailable(error);
			}
			return data === true;
		},
		async hashInProject(token, projectId, hash) {
			const client = userClient(token);
			for (const table of ['armory_versions', 'armory_side_versions']) {
				const found = await client.from(table).select('file_id').eq('content_sha256', hash).limit(1000);
				if (found.error) unavailable(found.error);
				const fileIds = [...new Set((found.data ?? []).map((r) => r.file_id as string))];
				if (fileIds.length === 0) continue;
				const files = await client.from('armory_files').select('id').eq('project_id', projectId).in('id', fileIds).limit(1);
				if (files.error) unavailable(files.error);
				if ((files.data ?? []).length > 0) return true;
			}
			return false;
		},
		async storeConnectCode(code) {
			const { error } = await serviceClient().from('armory_connect_codes').insert({
				code_hash: code.codeHash,
				user_id: code.userId,
				email: code.email,
				challenge: code.challenge,
				state: code.state,
				device_name: code.deviceName,
				expires_at: new Date(code.expiresAt).toISOString()
			});
			if (error) unavailable(error);
		},
		async findConnectCode(codeHash) {
			const { data, error } = await serviceClient()
				.from('armory_connect_codes')
				.select('code_hash, user_id, email, challenge, state, device_name, expires_at, used')
				.eq('code_hash', codeHash)
				.maybeSingle();
			if (error) unavailable(error);
			if (!data) return null;
			return {
				codeHash: data.code_hash,
				userId: data.user_id,
				email: data.email,
				challenge: data.challenge,
				state: data.state,
				deviceName: data.device_name,
				expiresAt: Date.parse(data.expires_at),
				used: data.used
			};
		},
		async consumeConnectCode(codeHash) {
			const { data, error } = await serviceClient()
				.from('armory_connect_codes')
				.update({ used: true })
				.eq('code_hash', codeHash)
				.eq('used', false)
				.select('code_hash');
			if (error) unavailable(error);
			return (data ?? []).length === 1;
		},
		async mintSession(email) {
			const link = await serviceClient().auth.admin.generateLink({ type: 'magiclink', email });
			const tokenHash = link.data?.properties?.hashed_token;
			if (link.error || !tokenHash) unavailable(link.error);
			const fresh = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
			});
			const verified = await fresh.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
			const session = verified.data?.session;
			if (verified.error || !session) unavailable(verified.error);
			return {
				access_token: session.access_token,
				refresh_token: session.refresh_token,
				expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in
			};
		},
		async registerDevice(accessToken, name, operation) {
			const { data, error } = await userClient(accessToken).rpc('armory_register_device', {
				p_name: name,
				p_operation: operation
			});
			if (error || typeof data !== 'string') unavailable(error);
			return data;
		},
		publicConfig() {
			return { supabaseUrl: PUBLIC_SUPABASE_URL.replace(/\/+$/, ''), anonKey: PUBLIC_SUPABASE_ANON_KEY };
		}
	};
}
