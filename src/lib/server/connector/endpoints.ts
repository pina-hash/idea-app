/**
 * THE SITE'S OWN ROUTES, RUN AS HIM. An endpoint entry in
 * registry/endpoints.yaml with `surface: call` is something a person does by
 * hand that is a route rather than one database function (Delete forever,
 * issuing a signed certification, the Foundry delete that also clears storage).
 * site_call runs that route's handler IN-PROCESS, with `locals.supabase` a
 * client carrying the minted session and `locals.claims` naming him: exactly
 * the request the browser makes, so every gate inside it (is_admin(), the
 * certifier check, the RPC's own refusal) decides as it does on the site. No
 * route gains a caller it did not have and no permission is added.
 *
 * Levels hold here as they do for functions:
 *   read     the handler runs and its answer comes back
 *   confirm  the first call runs the entry's `preview` read (if any) and hands
 *            back a confirm token; nothing runs until a second call carries it
 *   practice (/mcp/practice) a change is never run: the preview only
 *
 * A change writes one audit row "via Claude" around the handler
 * (connector_endpoint_begin / _finish, 0272), with the same repeat protection
 * a function write has: a request key already finished answers its stored
 * result and the handler is not run again.
 */
import { canonical, opaqueToken, sha256Hex } from './crypto';
import type { ToolContext } from './context';
import { CONFIRM_WINDOW_MS, PRACTICE_NOTE, resolveTemplate, type WriteOptions } from './engine';
import { endpointArgs, type EndpointEntry } from './registry';
import { AUTO_ROUTES } from './endpoints.generated';

type Handler = (event: unknown) => Promise<Response> | Response;
type RouteModule = Record<string, unknown>;

/**
 * The handler modules, one literal import each, so a typo is a build error.
 * The hand-written ones are here; a route the generated layer made a tool for
 * (tools/connector/auto.mjs) is in endpoints.generated.ts, merged below.
 */
const HAND_ROUTES: Record<string, () => Promise<RouteModule>> = {
	'/api/armory/purge': () => import('../../../routes/api/armory/purge/+server'),
	'/api/armory/sweep': () => import('../../../routes/api/armory/sweep/+server'),
	'/api/certifications/award': () => import('../../../routes/api/certifications/award/+server'),
	'/api/certifications/correct': () => import('../../../routes/api/certifications/correct/+server'),
	'/api/foundry/delete': () => import('../../../routes/api/foundry/delete/+server'),
	'/api/foundry/source': () => import('../../../routes/api/foundry/source/+server')
};
const ROUTES: Record<string, () => Promise<RouteModule>> = { ...AUTO_ROUTES, ...HAND_ROUTES };

/** For tests: hand a route a stand-in module. */
const overrides = new Map<string, RouteModule>();
export function overrideRouteModule(route: string, mod: RouteModule | null): void {
	if (mod) overrides.set(route, mod);
	else overrides.delete(route);
}

export function routedEndpoints(): string[] {
	return Object.keys(ROUTES).sort();
}

function bodyOf(entry: EndpointEntry, args: Record<string, unknown>, random: ToolContext['random']): Record<string, unknown> {
	// A whole-body template (`$args.body`, a generated route): the object he gave, as it is.
	if (typeof entry.body === 'string') {
		const whole = resolveTemplate(entry.body, { args, result: null, rows: [] });
		return whole && typeof whole === 'object' && !Array.isArray(whole) ? (whole as Record<string, unknown>) : {};
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(entry.body ?? {})) {
		if (v === '$uuid') {
			const b = random(16);
			b[6] = (b[6] & 0x0f) | 0x40;
			b[8] = (b[8] & 0x3f) | 0x80;
			const h = b.toString('hex');
			out[k] = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
			continue;
		}
		const resolved = resolveTemplate(v, { args, result: null, rows: [] });
		if (resolved !== undefined && resolved !== null && resolved !== '') out[k] = resolved;
	}
	return out;
}

/** Calls the route's handler as him and reads its answer. A thrown SvelteKit error is its status. */
async function invoke(ctx: ToolContext, entry: EndpointEntry, body: Record<string, unknown>): Promise<{ status: number; data: unknown }> {
	const load = ROUTES[entry.route];
	const mod = overrides.get(entry.route) ?? (load ? await load() : null);
	const method = entry.method ?? 'POST';
	const handler = mod?.[method] as Handler | undefined;
	if (!handler) return { status: 404, data: { message: 'That action is not available here.' } };
	const origin = 'https://ideabosco.com';
	const url = new URL(entry.route, origin);
	const request = new Request(url, {
		method,
		headers: { 'content-type': 'application/json', origin },
		...(method === 'POST' ? { body: JSON.stringify(body) } : {})
	});
	const event = {
		request,
		url,
		params: {},
		route: { id: entry.route },
		locals: {
			supabase: ctx.backend.routeClient(ctx.session),
			claims: { sub: ctx.session.user.id, email: ctx.session.user.email, role: 'authenticated' }
		},
		fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
		getClientAddress: () => '127.0.0.1',
		cookies: { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {}, serialize: () => '' },
		setHeaders: () => {},
		platform: undefined,
		isDataRequest: false,
		isSubRequest: true
	};
	try {
		const res = await handler(event);
		const text = await res.text();
		let data: unknown = text;
		try {
			data = text ? JSON.parse(text) : null;
		} catch {
			data = text.slice(0, 2000);
		}
		return { status: res.status, data };
	} catch (e) {
		const err = e as { status?: number; body?: { message?: string }; message?: string };
		if (typeof err?.status === 'number') return { status: err.status, data: { message: err.body?.message ?? 'Not found.' } };
		throw e;
	}
}

function failureWords(status: number, data: unknown): string {
	const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	const said = typeof d.message === 'string' ? d.message : typeof d.error === 'string' ? d.error : typeof d.error_description === 'string' ? d.error_description : null;
	if (said) return said;
	if (status === 404) return 'The site answered not found: either it does not exist, or this account cannot reach it.';
	if (status === 401) return 'The site did not see a signed-in account.';
	return `The site answered ${status}.`;
}

export async function runEndpoint(ctx: ToolContext, entry: EndpointEntry, given: Record<string, unknown>, opts: WriteOptions): Promise<Record<string, unknown>> {
	const tool = entry.tool as string;
	const params = endpointArgs(entry);
	const args: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(given)) {
		if (!params.some((p) => p.name === k)) {
			return { status: 'invalid', message: `"${tool}" takes no argument called "${k}". It takes: ${params.map((p) => p.name).join(', ') || 'nothing'}. Nothing was changed.` };
		}
		args[k] = v;
	}
	const missing = params.filter((p) => p.required && (args[p.name] === undefined || args[p.name] === '')).map((p) => p.name);
	if (missing.length) return { status: 'invalid', message: `"${tool}" also needs: ${missing.join(', ')}. Ask him for it. Nothing was changed.` };

	if (entry.level === 'read') {
		const r = await invoke(ctx, entry, bodyOf(entry, args, ctx.random));
		if (r.status >= 400) return { status: 'refused', message: failureWords(r.status, r.data) };
		return { status: 'ok', result: r.data };
	}

	const argsHash = sha256Hex(canonical({ tool, args }));
	const preview = async () => {
		if (!entry.preview) return { would: `Run ${tool.replace(/_/g, ' ')} with ${JSON.stringify(args)}.` };
		const pargs: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(entry.preview.args)) pargs[k] = resolveTemplate(v, { args, result: null, rows: [] });
		const r = await ctx.backend.rpc(ctx.session, entry.preview.function, pargs);
		if (r.error) return { refused: r.error.message };
		return r.data;
	};

	if (ctx.practice || opts.dryRun) {
		return {
			status: 'preview',
			level: entry.level,
			preview: await preview(),
			...(ctx.practice ? { practice: true, ...(entry.level === 'confirm' ? { confirm_token: 'practice' } : {}) } : {}),
			message: ctx.practice ? PRACTICE_NOTE : 'Preview only: nothing was changed.'
		};
	}

	if (entry.level === 'confirm' && !opts.confirmToken) {
		const shown = await preview();
		const token = opaqueToken(ctx.random);
		const expiresAt = ctx.now() + CONFIRM_WINDOW_MS;
		await ctx.backend.storeConfirmation({
			tokenHash: sha256Hex(token),
			userId: ctx.session.user.id,
			tool,
			argsHash,
			preview: shown,
			expiresAt
		});
		return {
			status: 'preview',
			level: entry.level,
			preview: shown,
			confirm_token: token,
			expires_at: new Date(expiresAt).toISOString(),
			message:
				'Nothing has changed yet. Read this preview to him and ask; if he says yes, call again with the same arguments and this confirm_token within ten minutes.'
		};
	}
	if (entry.level === 'confirm') {
		const c = await ctx.backend.takeConfirmation(sha256Hex(opts.confirmToken ?? ''), ctx.now());
		if (!c || c.userId !== ctx.session.user.id || c.tool !== tool || c.argsHash !== argsHash) {
			return {
				status: 'needs_confirmation',
				level: entry.level,
				message:
					'That confirmation is missing, already used, more than ten minutes old, or was for different arguments. Nothing was changed. Preview it again and ask him.'
			};
		}
	}

	const key = opts.requestId?.trim()
		? `id:${ctx.session.user.id}:${opts.requestId.trim().slice(0, 120)}:${argsHash.slice(0, 24)}`
		: `derived:${sha256Hex(`${ctx.session.user.id}|${tool}|${argsHash}`)}${opts.again ? `:again:${opaqueToken(ctx.random)}` : ''}`;
	const begin = await ctx.backend.rpc<{ audit_id: string; repeated?: boolean; result?: unknown }>(ctx.session, 'connector_endpoint_begin', {
		p_tool: tool,
		p_route: entry.route,
		p_args: args,
		p_request_key: key,
		p_level: entry.level,
		p_meta: { token_id: ctx.token?.id ?? null }
	});
	if (begin.error || !begin.data) return { status: 'refused', message: begin.error?.message ?? 'The change could not be recorded, so it was not made.' };
	if (begin.data.repeated) {
		return {
			status: 'repeated',
			result: begin.data.result ?? null,
			audit_id: begin.data.audit_id,
			message: 'This exact request was already done, so nothing was run again. Pass again: true only if he wants it done a second time.'
		};
	}
	let r: { status: number; data: unknown };
	try {
		r = await invoke(ctx, entry, bodyOf(entry, args, ctx.random));
	} catch (e) {
		r = { status: 500, data: { message: e instanceof Error ? e.message : String(e) } };
	}
	const ok = r.status < 400;
	await ctx.backend
		.rpc(ctx.session, 'connector_endpoint_finish', {
			p_audit_id: begin.data.audit_id,
			p_ok: ok,
			p_result: ok ? r.data : null,
			p_error: ok ? null : failureWords(r.status, r.data)
		})
		.catch(() => undefined);
	if (!ok) return { status: 'refused', audit_id: begin.data.audit_id, message: failureWords(r.status, r.data) };
	return { status: 'done', level: entry.level, result: r.data, audit_id: begin.data.audit_id, undo_available: false, message: 'Done.' };
}
