/**
 * THE ARMORY ENDPOINTS, contract sections 2 and 3 (pina-hash/idea-armory
 * `docs/agent/CONTRACT.md` at b18791d), built to the order of checks the
 * agent's own fake site uses (`tests/Armory.TestSupport/FakeIdeaBosco.cs`), so
 * the answer to a request with two things wrong is the answer the agent was
 * tested against:
 *
 *   blob-url           401, 400, 403 (not a member, then a GET hash outside the
 *                      project), 503, 200
 *   connect/start      401, 429 (per IP, then per user), 400, 303
 *   connect/exchange   429 (per IP), 400, 401 unknown code, 429 (per user of
 *                      the code, which is NOT consumed), 401 used, 410 expired,
 *                      401 wrong verifier (which consumes the code), 200
 *
 * And two the WEBSITE calls, with the browser's own session (0233, Armory
 * v0.3 item 3), at the end of this file:
 *
 *   purge              401, 400, the RPC's refusal in words (404 for a
 *                      non-admin, the same answer as a project that is gone),
 *                      200 the moment the RPC returns, then the sweep
 *   sweep              401, 404 for a non-admin, 200
 *
 * A backend that cannot be reached answers 503, which the agent reads as
 * offline and retries; it is never folded into a refusal.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { armoryNotReady } from '$lib/armory/view';
import { CONNECT_CODE_LIFETIME_MS, loopbackCallbackUrl, validateConnect } from '$lib/armory/connect';
import { ArmoryBackendUnavailable, type ArmoryUser } from './backend';
import type { ArmoryDeps } from './deps';
import { blobExists, MAX_PUT_BYTES, signBlob } from './storage';
import { ArmorySweepRefused, sweepArmoryOrphans, type ArmorySweepDeps } from './sweep';

const NO_STORE = { 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...NO_STORE }
	});
}

function error(status: number, code: string, message?: string): Response {
	return json(status, message === undefined ? { error: code } : { error: code, message });
}

const UNAVAILABLE = () => error(503, 'armory_unavailable', 'Armory is not available right now. Try again in a minute.');
const RATE_LIMITED = () => error(429, 'rate_limited', 'Too many connect attempts. Wait a minute and try again.');

export function base64url(bytes: Buffer): string {
	return bytes.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function sha256Hex(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** RFC 7636 S256 over the ASCII bytes of the verifier string, as the agent computes it. */
export function challengeFor(verifier: string): string {
	return base64url(createHash('sha256').update(Buffer.from(verifier, 'ascii')).digest());
}

function verifierMatches(verifier: string, challenge: string): boolean {
	if (!/^[\x00-\x7f]*$/.test(verifier)) return false;
	const a = Buffer.from(challengeFor(verifier));
	const b = Buffer.from(challenge);
	return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(request: Request): Promise<unknown> {
	try {
		return JSON.parse(await request.text());
	} catch {
		return undefined;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function bearer(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer ([^\s]+)$/.exec(header);
	return match ? match[1] : null;
}

// ---- Contract section 2: POST /api/armory/blob-url ----

export async function handleBlobUrl(request: Request, deps: ArmoryDeps): Promise<Response> {
	try {
		const token = bearer(request);
		const user = token ? await deps.backend.userFromAccessToken(token) : null;
		if (!token || !user) return error(401, 'unauthorized', 'A valid access token is required.');

		const body = await readJson(request);
		if (!isObject(body)) return error(400, 'bad_request', 'The body must be a JSON object.');
		const { projectId, hash, bytes, method } = body;
		if (typeof projectId !== 'string' || !UUID.test(projectId)) return error(400, 'bad_request', 'projectId must be a uuid.');
		if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
			return error(400, 'bad_request', 'hash must be 64 lowercase hex characters.');
		}
		if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) {
			return error(400, 'bad_request', 'bytes must be a non-negative integer.');
		}
		if (method !== 'PUT' && method !== 'GET') return error(400, 'bad_request', 'method must be PUT or GET.');
		if (method === 'PUT' && bytes > MAX_PUT_BYTES) return error(400, 'too_large', 'A PUT is allowed only for at most 2 GiB.');

		const project = projectId.toLowerCase();
		if (!(await deps.backend.isMember(token, project))) {
			return error(403, 'forbidden', 'The caller is not a member of this project.');
		}
		if (method === 'GET' && !(await deps.backend.hashInProject(token, project, hash))) {
			return error(403, 'forbidden', 'That hash is not part of this project.');
		}

		const storage = deps.storage();
		if (!storage) return json(503, { error: 'armory_storage_not_configured' });

		const now = new Date(deps.now());
		const signed = signBlob(storage, hash, method, bytes, now);
		const exists = await blobExists(storage, hash, now, deps.fetch);
		return json(200, { url: signed.url, headers: signed.headers, expiresAt: signed.expiresAt, exists });
	} catch (e) {
		if (e instanceof ArmoryBackendUnavailable) return UNAVAILABLE();
		throw e;
	}
}

// ---- Contract section 3c: POST /api/armory/connect/start ----

async function readConnectBody(request: Request): Promise<Record<string, unknown> | null> {
	const type = request.headers.get('content-type') ?? '';
	if (type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data')) {
		try {
			const form = await request.formData();
			const out: Record<string, unknown> = {};
			for (const name of ['port', 'state', 'challenge', 'device']) {
				const v = form.get(name);
				if (typeof v === 'string') out[name] = v;
			}
			return out;
		} catch {
			return null;
		}
	}
	const body = await readJson(request);
	return isObject(body) ? body : null;
}

export async function handleConnectStart(
	request: Request,
	siteUser: ArmoryUser | null,
	clientIp: string,
	deps: ArmoryDeps
): Promise<Response> {
	try {
		if (!siteUser) return error(401, 'unauthorized', 'Sign in to ideabosco.com first.');
		const now = deps.now();
		if (
			!deps.limiter.take('start-ip:' + clientIp, deps.limits.startPerIp, now) ||
			!deps.limiter.take('start-user:' + siteUser.email, deps.limits.startPerUser, now)
		) {
			return RATE_LIMITED();
		}
		const body = await readConnectBody(request);
		if (!body) return error(400, 'bad_request', 'The body must be a JSON object.');
		const checked = validateConnect(body.port, body.state, body.challenge, body.device);
		if (!checked.ok) return error(400, 'bad_request', checked.problem);
		const { port, state, challenge, device } = checked.request;

		const code = base64url(deps.randomBytes(32));
		const target = loopbackCallbackUrl(port, state, code);
		if (!target) return error(400, 'bad_request', 'port must be an integer from 1024 to 65535.');
		await deps.backend.storeConnectCode({
			codeHash: sha256Hex(code),
			userId: siteUser.id,
			email: siteUser.email,
			challenge,
			state,
			deviceName: device,
			expiresAt: now + CONNECT_CODE_LIFETIME_MS,
			used: false
		});
		return new Response(null, {
			status: 303,
			headers: { location: target, 'referrer-policy': 'no-referrer', ...NO_STORE }
		});
	} catch (e) {
		if (e instanceof ArmoryBackendUnavailable) return UNAVAILABLE();
		throw e;
	}
}

// ---- Contract sections 3d to 3f: POST /api/armory/connect/exchange ----

export async function handleConnectExchange(request: Request, clientIp: string, deps: ArmoryDeps): Promise<Response> {
	try {
		const now = deps.now();
		if (!deps.limiter.take('exchange-ip:' + clientIp, deps.limits.exchangePerIp, now)) return RATE_LIMITED();

		const body = await readJson(request);
		const code = isObject(body) ? body.code : undefined;
		const verifier = isObject(body) ? body.verifier : undefined;
		if (typeof code !== 'string' || code.length === 0 || typeof verifier !== 'string' || verifier.length === 0) {
			return error(400, 'bad_request', 'code and verifier are required non-empty strings.');
		}

		const codeHash = sha256Hex(code);
		const stored = await deps.backend.findConnectCode(codeHash);
		if (!stored) return error(401, 'invalid_code', 'That connect code is not valid.');
		if (!deps.limiter.take('exchange-user:' + stored.email, deps.limits.exchangePerUser, now)) return RATE_LIMITED();
		if (stored.used) return error(401, 'invalid_code', 'That connect code was already used.');
		if (now >= stored.expiresAt) return error(410, 'code_expired', 'That connect code expired. Start again from the app.');
		// A wrong verifier consumes the code too, so it cannot be brute forced.
		if (!(await deps.backend.consumeConnectCode(codeHash))) {
			return error(401, 'invalid_code', 'That connect code was already used.');
		}
		if (!verifierMatches(verifier, stored.challenge)) return error(401, 'invalid_code', 'The verifier does not match.');

		const session = await deps.backend.mintSession(stored.email);
		const deviceId = await deps.backend.registerDevice(session.access_token, stored.deviceName, deps.uuid());
		const config = deps.backend.publicConfig();
		return json(200, {
			access_token: session.access_token,
			refresh_token: session.refresh_token,
			expires_at: session.expires_at,
			email: stored.email,
			device_id: deviceId,
			supabase_url: config.supabaseUrl.replace(/\/+$/, ''),
			anon_key: config.anonKey
		});
	} catch (e) {
		if (e instanceof ArmoryBackendUnavailable) return UNAVAILABLE();
		throw e;
	}
}

// ---- The website's purge and sweep (0233, Armory v0.3 item 3) ----

/** Bodyless, the same for "not yours" and "not there" (CLAUDE.md, "Probing must reveal nothing"). */
const NOT_FOUND = () => new Response(null, { status: 404, headers: NO_STORE });

/**
 * The purge RPC's refusals, in words. Mapped from the SQLSTATE the contract
 * names, never passed through: a raw database message is not a sentence for a
 * person, and its text is the RPC owner's to change.
 */
function purgeRefusalWords(code: string | undefined): string {
	switch (code) {
		case '55000':
			return 'Archive the project first. Delete forever is offered only for an archived project.';
		case '22023':
			return 'The name you typed does not match the project name exactly, so nothing was deleted.';
		default:
			return 'That did not work, and nothing was deleted. Try again in a minute.';
	}
}

/**
 * POST /api/armory/purge `{ projectId, confirmName, operation }`.
 *
 * `armory_purge_project` runs on the CALLER's client (`locals.supabase`), so
 * the database's own `is_admin()` decides, and this route is not the boundary.
 * `ok` IS TRUE THE MOMENT THE RPC RETURNS: the rows are gone, and reporting a
 * completed delete as an error is how somebody presses it again. The storage
 * sweep follows within its budget, and anything it could not finish is a
 * `storageProblem` sentence beside the confirmation, never a failure.
 */
export async function handlePurge(
	request: Request,
	supabase: SupabaseClient,
	signedIn: boolean,
	deps: ArmorySweepDeps
): Promise<Response> {
	if (!signedIn) return error(401, 'unauthorized', 'Sign in first.');
	const body = await readJson(request);
	if (!isObject(body)) return error(400, 'bad_request', 'The body must be a JSON object.');
	const { projectId, confirmName, operation } = body;
	if (typeof projectId !== 'string' || !UUID.test(projectId)) return error(400, 'bad_request', 'projectId must be a uuid.');
	if (typeof operation !== 'string' || !UUID.test(operation)) return error(400, 'bad_request', 'operation must be a uuid.');
	if (typeof confirmName !== 'string' || confirmName.trim() === '' || confirmName.length > 400) {
		return error(400, 'bad_request', 'Type the project name to confirm.');
	}

	const { data, error: refused } = await supabase.rpc('armory_purge_project', {
		p_project: projectId.toLowerCase(),
		p_confirm_name: confirmName.trim().normalize('NFC'),
		p_operation: operation.toLowerCase()
	});
	if (refused) {
		if (refused.code === '42501' || refused.code === 'P0002') return NOT_FOUND();
		if (armoryNotReady(refused)) return json(503, { ok: false, message: 'Delete forever is not switched on yet.' });
		return json(400, { ok: false, message: purgeRefusalWords(refused.code) });
	}

	let storageProblem: string | null = null;
	let swept = 0;
	let left: number | null = null;
	try {
		const sweep = await sweepArmoryOrphans(supabase, deps);
		storageProblem = sweep.problem;
		swept = sweep.swept;
		left = sweep.left;
	} catch (e) {
		deps.log(`armory purge: the storage sweep failed after a purge committed: ${e instanceof Error ? e.message : String(e)}`);
		storageProblem = 'The project is deleted. Removing its stored files did not finish; Storage cleanup on the Armory page finishes it.';
	}
	return json(200, { ok: true, result: isObject(data) ? data : null, swept, left, storageProblem });
}

/** POST /api/armory/sweep: the admin's Finish cleanup. A non-admin gets the bodyless 404. */
export async function handleSweep(supabase: SupabaseClient, signedIn: boolean, deps: ArmorySweepDeps): Promise<Response> {
	if (!signedIn) return error(401, 'unauthorized', 'Sign in first.');
	try {
		const sweep = await sweepArmoryOrphans(supabase, deps);
		return json(200, { ok: true, swept: sweep.swept, left: sweep.left, problem: sweep.problem });
	} catch (e) {
		if (e instanceof ArmorySweepRefused) return NOT_FOUND();
		throw e;
	}
}
