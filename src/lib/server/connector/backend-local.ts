/**
 * THE CONNECTOR'S LOCAL BACKEND: the same `ConnectorBackend` over a plain
 * Postgres that has every migration applied (the embedded cluster the tests
 * use, or the one `tools/connector/local-backend.mjs` boots for an MCP
 * Inspector run). It exists so the whole connector, the MCP route included,
 * can be driven with no Supabase project and no minting.
 *
 * WHO IT ACTS AS. Every user call sets `request.jwt.claims` and `SET ROLE
 * authenticated`, exactly as tests/db/harness.ts does and as PostgREST does per
 * request, so auth.uid(), current_user_email(), is_admin() and every policy see
 * the token's user. The connector_* tables are reached as `service_role`,
 * which is what the migration grants them to. "Minting" a session here is
 * naming the user: there is no auth server to ask, which is the one thing this
 * backend cannot prove and why the real minting is only exercised against
 * Supabase.
 *
 * It is never used in production: `connectorDeps()` loads it only in dev with
 * CONNECTOR_BACKEND=local-pg, and `pg` is a devDependency loaded at runtime.
 */
import type {
	AuditRow,
	ClientRecord,
	Confirmation,
	ConnectorBackend,
	ConnectorUser,
	DbError,
	DbResult,
	NewToken,
	SelectSpec,
	StoredCode,
	TokenRow,
	UserSession
} from './types';
import { auditRowFromDb } from './audit-row';

interface PgClient {
	query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
	release(): void;
}
export interface PgPool {
	connect(): Promise<PgClient>;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
	if (!IDENT.test(name)) throw new Error(`Not an identifier: ${name}`);
	return `"${name}"`;
}

function pgError(e: unknown): DbError {
	const err = e as { code?: string; message?: string; detail?: string; hint?: string };
	return { code: err.code, message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null };
}

const ms = (v: unknown): number | null => (v == null ? null : new Date(v as string).getTime());

function tokenRow(r: Record<string, unknown>): TokenRow {
	return {
		id: r.id as string,
		userId: r.user_id as string,
		email: r.email as string,
		clientId: r.client_id as string,
		label: r.label as string,
		scope: r.scope as string,
		accessExpiresAt: ms(r.access_expires_at) as number,
		refreshExpiresAt: ms(r.refresh_expires_at) as number,
		revokedAt: ms(r.revoked_at),
		lastUsedAt: ms(r.last_used_at)
	};
}

interface ProcShape {
	names: string[];
	types: string[];
	required: number;
	retset: boolean;
	void: boolean;
}

export function localPgBackend(pool: PgPool): ConnectorBackend {
	const procCache = new Map<string, ProcShape[]>();

	async function as<T>(
		claims: Record<string, unknown> | null,
		role: 'authenticated' | 'service_role' | 'anon',
		fn: (c: PgClient) => Promise<T>
	): Promise<T> {
		const c = await pool.connect();
		try {
			await c.query(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : '']);
			await c.query(`set role ${role}`);
			return await fn(c);
		} finally {
			await c.query('reset role').catch(() => {});
			await c.query(`select set_config('request.jwt.claims', '', false)`).catch(() => {});
			c.release();
		}
	}
	const service = <T>(fn: (c: PgClient) => Promise<T>) => as({ role: 'service_role' }, 'service_role', fn);
	const asUser = <T>(user: ConnectorUser, fn: (c: PgClient) => Promise<T>) =>
		as({ sub: user.id, role: 'authenticated', email: user.email }, 'authenticated', fn);

	async function shapes(fn: string): Promise<ProcShape[]> {
		const cached = procCache.get(fn);
		if (cached) return cached;
		const found = await service(async (c) => {
			const { rows } = await c.query(
				`select p.pronargs, p.pronargdefaults, p.proretset,
				        p.prorettype = 'pg_catalog.void'::regtype as is_void,
				        coalesce((select array_agg(u.nm order by u.ord) from unnest(
				          coalesce(p.proargnames, array_fill(''::text, array[p.pronargs])),
				          coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs]))
				        ) with ordinality as u(nm, md, ord) where u.md in ('i','b','v')), '{}') as names,
				        coalesce((select array_agg(pg_catalog.format_type(t, null) order by o)
				          from unnest(p.proargtypes::oid[]) with ordinality as x(t, o)), '{}') as types
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = $1 and p.prokind = 'f'`,
				[fn]
			);
			return rows.map((r) => ({
				names: r.names as string[],
				types: r.types as string[],
				required: Number(r.pronargs) - Number(r.pronargdefaults),
				retset: r.proretset as boolean,
				void: r.is_void as boolean
			}));
		});
		procCache.set(fn, found);
		return found;
	}

	/** The PostgREST call, rebuilt: pick the overload by argument names, cast each value to its declared type. */
	async function callSql(fn: string, args: Record<string, unknown>): Promise<string> {
		const keys = Object.keys(args);
		const candidates = (await shapes(fn)).filter(
			(s) =>
				keys.every((k) => s.names.includes(k)) && s.names.slice(0, s.required).every((n) => keys.includes(n))
		);
		if (candidates.length !== 1) {
			const e = new Error(
				candidates.length === 0
					? `Could not find the function public.${fn} with those arguments.`
					: `Could not choose the best candidate function between overloads of public.${fn}.`
			) as Error & { code: string };
			e.code = candidates.length === 0 ? 'PGRST202' : 'PGRST203';
			throw e;
		}
		const shape = candidates[0];
		const parts = shape.names
			.map((name, i) => ({ name, type: shape.types[i] }))
			.filter((a) => keys.includes(a.name))
			.map(({ name, type }) => {
				const lit = `'${name.replace(/'/g, "''")}'`;
				if (type === 'jsonb' || type === 'json') return `${ident(name)} => nullif($1::jsonb -> ${lit}, 'null'::jsonb)::${type}`;
				if (type.endsWith('[]')) {
					return `${ident(name)} => (case when jsonb_typeof($1::jsonb -> ${lit}) = 'array' then array(select jsonb_array_elements_text($1::jsonb -> ${lit})) end)::${type}`;
				}
				return `${ident(name)} => ($1::jsonb ->> ${lit})::${type}`;
			});
		const call = `public.${ident(fn)}(${parts.join(', ')})`;
		if (shape.retset) return `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as v from ${call} r`;
		if (shape.void) return `select null::jsonb as v from (select ${call}) x`;
		return `select to_jsonb(${call}) as v`;
	}

	return {
		kind: 'local-pg',

		async enabled() {
			return service(async (c) => {
				const { rows } = await c.query('select enabled from public.connector_settings where id');
				return rows.length ? rows[0].enabled === true : true;
			});
		},
		async findClient(clientId) {
			return service(async (c) => {
				const { rows } = await c.query(
					'select client_id, client_name, redirect_uris from public.connector_clients where client_id = $1',
					[clientId]
				);
				const r = rows[0];
				return r
					? { clientId: r.client_id as string, clientName: r.client_name as string, redirectUris: r.redirect_uris as string[] }
					: null;
			});
		},
		async registerClient(cl: ClientRecord) {
			await service((c) =>
				c.query('insert into public.connector_clients (client_id, client_name, redirect_uris) values ($1, $2, $3)', [
					cl.clientId,
					cl.clientName,
					cl.redirectUris
				])
			);
		},
		async storeCode(code: StoredCode) {
			await service((c) =>
				c.query(
					`insert into public.connector_codes (code_hash, user_id, email, client_id, client_name, redirect_uri, code_challenge, scope, expires_at)
					 values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
					[
						code.codeHash,
						code.userId,
						code.email,
						code.clientId,
						code.clientName,
						code.redirectUri,
						code.codeChallenge,
						code.scope,
						new Date(code.expiresAt).toISOString()
					]
				)
			);
		},
		async takeCode(codeHash, now) {
			return service(async (c) => {
				const { rows } = await c.query(
					`update public.connector_codes set used_at = $2 where code_hash = $1 and used_at is null returning *`,
					[codeHash, new Date(now).toISOString()]
				);
				const r = rows[0];
				if (!r) return null;
				return {
					codeHash: r.code_hash as string,
					userId: r.user_id as string,
					email: r.email as string,
					clientId: r.client_id as string,
					clientName: (r.client_name as string) ?? '',
					redirectUri: r.redirect_uri as string,
					codeChallenge: r.code_challenge as string,
					scope: r.scope as string,
					expiresAt: ms(r.expires_at) as number
				};
			});
		},
		async createToken(t: NewToken) {
			return service(async (c) => {
				const { rows } = await c.query(
					`insert into public.connector_tokens (user_id, email, client_id, label, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
					 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
					[
						t.userId,
						t.email,
						t.clientId,
						t.label,
						t.scope,
						t.accessHash,
						t.refreshHash,
						new Date(t.accessExpiresAt).toISOString(),
						new Date(t.refreshExpiresAt).toISOString()
					]
				);
				return rows[0].id as string;
			});
		},
		async tokenByAccess(accessHash) {
			return service(async (c) => {
				const { rows } = await c.query('select * from public.connector_tokens where access_hash = $1', [accessHash]);
				return rows[0] ? tokenRow(rows[0]) : null;
			});
		},
		async rotate(refreshHash, next, now) {
			return service(async (c) => {
				const { rows } = await c.query(
					`update public.connector_tokens
					    set access_hash = $2, refresh_hash = $3, access_expires_at = $4, refresh_expires_at = $5,
					        last_used_at = $6, rotations = rotations + 1
					  where refresh_hash = $1 and revoked_at is null and refresh_expires_at > $6
					  returning *`,
					[
						refreshHash,
						next.accessHash,
						next.refreshHash,
						new Date(next.accessExpiresAt).toISOString(),
						new Date(next.refreshExpiresAt).toISOString(),
						new Date(now).toISOString()
					]
				);
				return rows[0] ? tokenRow(rows[0]) : null;
			});
		},
		async revokeByHash(hash, by) {
			return service(async (c) => {
				const { rowCount } = await c.query(
					`update public.connector_tokens set revoked_at = now(), revoked_by = $2
					  where (access_hash = $1 or refresh_hash = $1) and revoked_at is null`,
					[hash, by]
				);
				return (rowCount ?? 0) > 0;
			});
		},
		async revokeToken(id, by) {
			await service((c) =>
				c.query('update public.connector_tokens set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null', [
					id,
					by
				])
			);
		},
		async touchToken(id, now) {
			await service((c) =>
				c.query('update public.connector_tokens set last_used_at = $2 where id = $1', [id, new Date(now).toISOString()])
			);
		},
		async storeConfirmation(cf: Confirmation) {
			await service((c) =>
				c.query(
					`insert into public.connector_confirmations (token_hash, user_id, tool, args_hash, preview, expires_at)
					 values ($1, $2, $3, $4, $5, $6)`,
					[cf.tokenHash, cf.userId, cf.tool, cf.argsHash, JSON.stringify(cf.preview ?? null), new Date(cf.expiresAt).toISOString()]
				)
			);
		},
		async takeConfirmation(tokenHash, now) {
			return service(async (c) => {
				const { rows } = await c.query(
					`update public.connector_confirmations set used_at = $2
					  where token_hash = $1 and used_at is null and expires_at > $2 returning *`,
					[tokenHash, new Date(now).toISOString()]
				);
				const r = rows[0];
				if (!r) return null;
				return {
					tokenHash: r.token_hash as string,
					userId: r.user_id as string,
					tool: r.tool as string,
					argsHash: r.args_hash as string,
					preview: r.preview,
					expiresAt: ms(r.expires_at) as number
				};
			});
		},
		async syncRegistry(rows, logTables = []) {
			if (rows.length > 0) {
				await service((c) =>
					c.query(
						`insert into public.connector_registry (function_name, tool, level)
						 select x->>'function_name', x->>'tool', x->>'level' from jsonb_array_elements($1::jsonb) x
						 on conflict (function_name) do update set tool = excluded.tool, level = excluded.level, updated_at = now()`,
						[JSON.stringify(rows)]
					)
				);
			}
			if (logTables.length > 0) {
				await service((c) =>
					c.query(
						`insert into public.connector_log_tables (table_name, note)
						 select t, 'registry' from unnest($1::text[]) t
						 on conflict (table_name) do nothing`,
						[[...logTables]]
					)
				);
			}
		},
		async setAuditUndo(auditId, undo) {
			await service((c) =>
				c.query('update public.connector_audit set undo = $2 where id = $1', [auditId, undo === null ? null : JSON.stringify(undo)])
			);
		},
		async undoCandidates(userId, limit) {
			return service(async (c) => {
				const { rows } = await c.query(
					`select * from public.connector_audit
					  where user_id = $1 and status = 'done' and undone_by is null and undo_of is null
					  order by started_at desc limit $2`,
					[userId, limit]
				);
				return rows.map((r) => auditRowFromDb(r)) as AuditRow[];
			});
		},
		async mintSession(user) {
			return { accessToken: `local:${user.id}`, expiresAt: Date.now() + 3600_000, user };
		},

		routeClient(session: UserSession) {
			// What a route handler reaches through `locals.supabase`: rpc, as this
			// user. There is no storage here, so a handler's storage step finds
			// nothing to call and says so.
			return {
				rpc: async (fn: string, args: Record<string, unknown> = {}) => {
					const r = await this.rpc(session, fn, args);
					return r.error ? { data: null, error: r.error } : { data: r.data, error: null };
				}
			};
		},
		async signStorage(): Promise<DbResult<string>> {
			return { data: null, error: { message: 'There is no file storage on the local backend.' } };
		},
		async rpc<T>(session: UserSession, fn: string, args: Record<string, unknown>): Promise<DbResult<T>> {
			try {
				const sql = await callSql(fn, args);
				const data = await asUser(session.user, async (c) => {
					// A call with no arguments names no parameter, and Postgres refuses a
					// bind that supplies one the statement does not use.
					const { rows } = await c.query(sql, sql.includes('$1') ? [JSON.stringify(args)] : []);
					return rows[0]?.v as T;
				});
				return { data, error: null };
			} catch (e) {
				return { data: null, error: pgError(e) };
			}
		},
		async select<T>(session: UserSession, spec: SelectSpec): Promise<DbResult<T[]>> {
			try {
				const params: unknown[] = [];
				const where: string[] = [];
				const p = (v: unknown) => {
					params.push(v);
					return `$${params.length}`;
				};
				for (const [k, v] of Object.entries(spec.eq ?? {})) where.push(v === null ? `${ident(k)} is null` : `${ident(k)} = ${p(v)}`);
				for (const [k, v] of Object.entries(spec.in ?? {})) where.push(`${ident(k)}::text = any(${p(v.map(String))}::text[])`);
				for (const [k, v] of Object.entries(spec.gte ?? {})) where.push(`${ident(k)} >= ${p(v)}`);
				for (const [k, v] of Object.entries(spec.lte ?? {})) where.push(`${ident(k)} <= ${p(v)}`);
				const order = (spec.order ?? []).map(([k, d]) => `${ident(k)} ${d === 'desc' ? 'desc' : 'asc'}`);
				const sql =
					`select ${spec.columns.map(ident).join(', ')} from public.${ident(spec.table)}` +
					(where.length ? ` where ${where.join(' and ')}` : '') +
					(order.length ? ` order by ${order.join(', ')}` : '') +
					` limit ${Math.max(1, Math.min(spec.limit ?? 1000, 1000))} offset ${Math.max(0, spec.offset ?? 0)}`;
				const rows = await asUser(session.user, async (c) => (await c.query(sql, params)).rows);
				return { data: JSON.parse(JSON.stringify(rows)) as T[], error: null };
			} catch (e) {
				return { data: null, error: pgError(e) };
			}
		}
	};
}

/** The dev-only factory: a pool over CONNECTOR_LOCAL_PG_URL, `pg` loaded at runtime. */
export async function localPgBackendFromUrl(url: string): Promise<ConnectorBackend> {
	const specifier = 'pg';
	const mod = (await import(/* @vite-ignore */ specifier)) as { default: { Pool: new (o: object) => PgPool } };
	return localPgBackend(new mod.default.Pool({ connectionString: url, max: 4 }));
}
